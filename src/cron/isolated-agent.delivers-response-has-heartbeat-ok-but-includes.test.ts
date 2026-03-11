import "./isolated-agent.mocks.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import type { CliDeps } from "../cli/deps.js";
import { callGateway } from "../gateway/call.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
import { makeCfg, makeJob, writeSessionStore } from "./isolated-agent.test-harness.js";
import { setupIsolatedAgentTurnMocks } from "./isolated-agent.test-setup.js";

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "openclaw-cron-heartbeat-suite-" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy WhatsApp delivery test fixture
type LegacyDeps = CliDeps & { sendMessageWhatsApp: any };

async function createWhatsAppDeliveryFixture(home: string): Promise<{
  storePath: string;
  deps: LegacyDeps;
}> {
  const storePath = await writeSessionStore(home, {
    lastProvider: "whatsapp",
    lastChannel: "whatsapp",
    lastTo: "123",
  });
  const deps = {
    sendMessageWhatsApp: vi.fn().mockResolvedValue({
      messageId: "w1",
      to: "123",
    }),
  } as LegacyDeps;
  return { storePath, deps };
}

function mockEmbeddedAgentPayloads(payloads: Array<{ text: string; mediaUrl?: string }>) {
  vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
    payloads,
    meta: {
      durationMs: 5,
      agentMeta: { sessionId: "s", provider: "p", model: "m" },
    },
  });
}

async function runWhatsAppAnnounceTurn(params: {
  home: string;
  storePath: string;
  deps: LegacyDeps;
  cfg?: ReturnType<typeof makeCfg>;
  signal?: AbortSignal;
}) {
  return runCronIsolatedAgentTurn({
    cfg: params.cfg ?? makeCfg(params.home, params.storePath),
    deps: params.deps,
    job: {
      ...makeJob({
        kind: "agentTurn",
        message: "do it",
      }),
      delivery: { mode: "announce", channel: "whatsapp", to: "123" },
    },
    message: "do it",
    sessionKey: "cron:job-1",
    signal: params.signal,
    lane: "cron",
  });
}

describe("runCronIsolatedAgentTurn", () => {
  beforeEach(() => {
    setupIsolatedAgentTurnMocks({ fast: true });
  });

  it("does not fan out whatsapp cron delivery across allowFrom entries", async () => {
    await withTempHome(async (home) => {
      const { storePath, deps } = await createWhatsAppDeliveryFixture(home);
      mockEmbeddedAgentPayloads([
        { text: "HEARTBEAT_OK", mediaUrl: "https://example.com/img.png" },
      ]);

      const cfg = makeCfg(home, storePath, {
        channels: {
          whatsapp: {},
        },
      });

      const res = await runCronIsolatedAgentTurn({
        cfg,
        deps,
        job: {
          ...makeJob({
            kind: "agentTurn",
            message: "deliver once",
          }),
          delivery: { mode: "announce", channel: "whatsapp", to: "123" },
        },
        message: "deliver once",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(true);
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledWith(
        "123",
        "HEARTBEAT_OK",
        expect.objectContaining({ accountId: undefined }),
      );
    });
  });

  it("suppresses announce delivery for multi-payload narration ending in HEARTBEAT_OK", async () => {
    await withTempHome(async (home) => {
      const { storePath, deps } = await createWhatsAppDeliveryFixture(home);
      mockEmbeddedAgentPayloads([
        { text: "Checked inbox and calendar. Nothing actionable yet." },
        { text: "HEARTBEAT_OK" },
      ]);

      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(false);
      expect(deps.sendMessageWhatsApp).not.toHaveBeenCalled();
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
    });
  });

  it("handles media heartbeat delivery and last-target text delivery", async () => {
    await withTempHome(async (home) => {
      const { storePath, deps } = await createWhatsAppDeliveryFixture(home);

      // Media should still be delivered even if text is just HEARTBEAT_OK.
      mockEmbeddedAgentPayloads([
        { text: "HEARTBEAT_OK", mediaUrl: "https://example.com/img.png" },
      ]);

      const mediaRes = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
      });

      expect(mediaRes.status).toBe("ok");
      expect(deps.sendMessageWhatsApp).toHaveBeenCalled();
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();

      vi.mocked(runSubagentAnnounceFlow).mockClear();
      vi.mocked(deps.sendMessageWhatsApp).mockClear();
      mockEmbeddedAgentPayloads([{ text: "HEARTBEAT_OK 🦞" }]);

      const cfg = makeCfg(home, storePath);
      cfg.agents = {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          heartbeat: { ackMaxChars: 0 },
        },
      };

      const keepRes = await runCronIsolatedAgentTurn({
        cfg,
        deps,
        job: {
          ...makeJob({
            kind: "agentTurn",
            message: "do it",
          }),
          delivery: { mode: "announce", channel: "last" },
        },
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(keepRes.status).toBe("ok");
      expect(keepRes.delivered).toBe(true);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledWith(
        "123",
        "HEARTBEAT_OK 🦞",
        expect.objectContaining({ accountId: undefined }),
      );

      vi.mocked(deps.sendMessageWhatsApp).mockClear();
      vi.mocked(runSubagentAnnounceFlow).mockClear();
      vi.mocked(callGateway).mockClear();

      const deleteRes = await runCronIsolatedAgentTurn({
        cfg,
        deps,
        job: {
          ...makeJob({
            kind: "agentTurn",
            message: "do it",
          }),
          deleteAfterRun: true,
          delivery: { mode: "announce", channel: "last" },
        },
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(deleteRes.status).toBe("ok");
      expect(deleteRes.delivered).toBe(true);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledWith(
        "123",
        "HEARTBEAT_OK 🦞",
        expect.objectContaining({ accountId: undefined }),
      );
      expect(callGateway).toHaveBeenCalledTimes(1);
      expect(callGateway).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "sessions.delete",
          params: expect.objectContaining({
            key: "agent:main:cron:job-1",
            deleteTranscript: true,
            emitLifecycleHooks: false,
          }),
        }),
      );
    });
  });

  it("skips structured outbound delivery when timeout abort is already set", async () => {
    await withTempHome(async (home) => {
      const { storePath, deps } = await createWhatsAppDeliveryFixture(home);
      const controller = new AbortController();
      controller.abort("cron: job execution timed out");

      mockEmbeddedAgentPayloads([
        { text: "HEARTBEAT_OK", mediaUrl: "https://example.com/img.png" },
      ]);

      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        signal: controller.signal,
      });

      expect(res.status).toBe("error");
      expect(res.error).toContain("timed out");
      expect(deps.sendMessageWhatsApp).not.toHaveBeenCalled();
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
    });
  });
});
