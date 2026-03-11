import type { HealthSummary } from "../commands/health.js";
import { cleanOldMedia } from "../media/store.js";
import { abortChatRunById, type ChatAbortControllerEntry } from "./chat-abort.js";
import type { ChatRunEntry } from "./server-chat.js";
import {
  ABORTED_RUN_TTL_MS,
  DEDUPE_MAX,
  DEDUPE_TTL_MS,
  HEALTH_REFRESH_INTERVAL_MS,
  MAX_CHAT_RUN_BUFFERS,
  TICK_INTERVAL_MS,
} from "./server-constants.js";
import type { DedupeEntry } from "./server-shared.js";
import { formatError } from "./server-utils.js";
import { setBroadcastHealthUpdate } from "./server/health-state.js";

/**
 * Schedule a recurring task with an initial offset to stagger timers.
 * Returns a cleanup function that clears both the initial timeout and the
 * recurring interval.
 */
function scheduleStaggered(
  fn: () => void,
  intervalMs: number,
  offsetMs: number,
): { clear: () => void; ref: ReturnType<typeof setTimeout> } {
  let interval: ReturnType<typeof setInterval> | null = null;
  const timeout = setTimeout(() => {
    fn();
    interval = setInterval(fn, intervalMs);
  }, offsetMs);
  return {
    ref: timeout,
    clear() {
      clearTimeout(timeout);
      if (interval !== null) {
        clearInterval(interval);
      }
    },
  };
}

export function startGatewayMaintenanceTimers(params: {
  broadcast: (
    event: string,
    payload: unknown,
    opts?: {
      dropIfSlow?: boolean;
      stateVersion?: { presence?: number; health?: number };
    },
  ) => void;
  nodeSendToAllSubscribed: (event: string, payload: unknown) => void;
  getPresenceVersion: () => number;
  getHealthVersion: () => number;
  refreshGatewayHealthSnapshot: (opts?: { probe?: boolean }) => Promise<HealthSummary>;
  logHealth: { error: (msg: string) => void };
  dedupe: Map<string, DedupeEntry>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  chatRunState: { abortedRuns: Map<string, number> };
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  removeChatRun: (
    sessionId: string,
    clientRunId: string,
    sessionKey?: string,
  ) => ChatRunEntry | undefined;
  agentRunSeq: Map<string, number>;
  nodeSendToSession: (sessionKey: string, event: string, payload: unknown) => void;
  cleanupWizardSessions?: () => void;
  mediaCleanupTtlMs?: number;
}): {
  tickInterval: ReturnType<typeof setInterval>;
  healthInterval: ReturnType<typeof setInterval>;
  dedupeCleanup: ReturnType<typeof setInterval>;
  chatAbortCleanup: { clear: () => void };
  abortedRunsCleanup: { clear: () => void };
  mediaCleanup: ReturnType<typeof setInterval> | null;
} {
  setBroadcastHealthUpdate((snap: HealthSummary) => {
    params.broadcast("health", snap, {
      stateVersion: {
        presence: params.getPresenceVersion(),
        health: params.getHealthVersion(),
      },
    });
    params.nodeSendToAllSubscribed("health", snap);
  });

  // periodic keepalive
  const tickInterval = setInterval(() => {
    const payload = { ts: Date.now() };
    params.broadcast("tick", payload, { dropIfSlow: true });
    params.nodeSendToAllSubscribed("tick", payload);
  }, TICK_INTERVAL_MS);

  // periodic health refresh to keep cached snapshot warm
  const healthInterval = setInterval(() => {
    void params
      .refreshGatewayHealthSnapshot({ probe: true })
      .catch((err) => params.logHealth.error(`refresh failed: ${formatError(err)}`));
  }, HEALTH_REFRESH_INTERVAL_MS);

  // Prime cache so first client gets a snapshot without waiting.
  void params
    .refreshGatewayHealthSnapshot({ probe: true })
    .catch((err) => params.logHealth.error(`initial refresh failed: ${formatError(err)}`));

  // --- Staggered cleanup timers (split to avoid GC spikes) ---

  // dedupe + agentRunSeq cleanup: every 45s (no offset, fires first)
  const dedupeCleanup = setInterval(() => {
    const AGENT_RUN_SEQ_MAX = 10_000;
    const now = Date.now();
    for (const [k, v] of params.dedupe) {
      if (now - v.ts > DEDUPE_TTL_MS) {
        params.dedupe.delete(k);
      }
    }
    if (params.dedupe.size > DEDUPE_MAX) {
      const entries = [...params.dedupe.entries()].toSorted((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < params.dedupe.size - DEDUPE_MAX; i++) {
        params.dedupe.delete(entries[i][0]);
      }
    }

    if (params.agentRunSeq.size > AGENT_RUN_SEQ_MAX) {
      const excess = params.agentRunSeq.size - AGENT_RUN_SEQ_MAX;
      let removed = 0;
      for (const runId of params.agentRunSeq.keys()) {
        params.agentRunSeq.delete(runId);
        removed += 1;
        if (removed >= excess) {
          break;
        }
      }
    }

    // Hard cap: evict oldest entries from chatRunBuffers / chatDeltaSentAt
    if (params.chatRunBuffers.size > MAX_CHAT_RUN_BUFFERS) {
      const excess = params.chatRunBuffers.size - MAX_CHAT_RUN_BUFFERS;
      let removed = 0;
      for (const key of params.chatRunBuffers.keys()) {
        params.chatRunBuffers.delete(key);
        params.chatDeltaSentAt.delete(key);
        removed += 1;
        if (removed >= excess) {
          break;
        }
      }
    }
    if (params.chatDeltaSentAt.size > MAX_CHAT_RUN_BUFFERS) {
      const excess = params.chatDeltaSentAt.size - MAX_CHAT_RUN_BUFFERS;
      let removed = 0;
      for (const key of params.chatDeltaSentAt.keys()) {
        params.chatDeltaSentAt.delete(key);
        removed += 1;
        if (removed >= excess) {
          break;
        }
      }
    }

    // Purge stale wizard sessions
    params.cleanupWizardSessions?.();
  }, 45_000);

  // chatAbortControllers cleanup: every 90s, offset by 15s
  const chatAbortCleanup = scheduleStaggered(
    () => {
      const now = Date.now();
      for (const [runId, entry] of params.chatAbortControllers) {
        if (now <= entry.expiresAtMs) {
          continue;
        }
        abortChatRunById(
          {
            chatAbortControllers: params.chatAbortControllers,
            chatRunBuffers: params.chatRunBuffers,
            chatDeltaSentAt: params.chatDeltaSentAt,
            chatAbortedRuns: params.chatRunState.abortedRuns,
            removeChatRun: params.removeChatRun,
            agentRunSeq: params.agentRunSeq,
            broadcast: params.broadcast,
            nodeSendToSession: params.nodeSendToSession,
          },
          { runId, sessionKey: entry.sessionKey, stopReason: "timeout" },
        );
      }
    },
    90_000,
    15_000,
  );

  // abortedRuns cleanup: every 60s, offset by 30s
  const abortedRunsCleanup = scheduleStaggered(
    () => {
      const now = Date.now();
      for (const [runId, abortedAt] of params.chatRunState.abortedRuns) {
        if (now - abortedAt <= ABORTED_RUN_TTL_MS) {
          continue;
        }
        params.chatRunState.abortedRuns.delete(runId);
        params.chatRunBuffers.delete(runId);
        params.chatDeltaSentAt.delete(runId);
      }
    },
    60_000,
    30_000,
  );

  if (typeof params.mediaCleanupTtlMs !== "number") {
    return {
      tickInterval,
      healthInterval,
      dedupeCleanup,
      chatAbortCleanup,
      abortedRunsCleanup,
      mediaCleanup: null,
    };
  }

  let mediaCleanupInFlight: Promise<void> | null = null;
  const runMediaCleanup = () => {
    if (mediaCleanupInFlight) {
      return mediaCleanupInFlight;
    }
    mediaCleanupInFlight = cleanOldMedia(params.mediaCleanupTtlMs, {
      recursive: true,
      pruneEmptyDirs: true,
    })
      .catch((err) => {
        params.logHealth.error(`media cleanup failed: ${formatError(err)}`);
      })
      .finally(() => {
        mediaCleanupInFlight = null;
      });
    return mediaCleanupInFlight;
  };

  const mediaCleanup = setInterval(() => {
    void runMediaCleanup();
  }, 60 * 60_000);

  void runMediaCleanup();

  return {
    tickInterval,
    healthInterval,
    dedupeCleanup,
    chatAbortCleanup,
    abortedRunsCleanup,
    mediaCleanup,
  };
}
