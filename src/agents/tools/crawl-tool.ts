/**
 * Crawl session management tool.
 *
 * Provides an AI-agent-facing tool for managing crawl sessions with
 * human-like pacing, batch management, and anomaly handling.
 *
 * Actions:
 *   start  — acquire a new crawl session (keyword + sort locked)
 *   stop   — release the current session
 *   status — check session progress and state
 */

import { Type } from "@sinclair/typebox";
import { logDebug } from "../../logger.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  acquireCrawlSession,
  forceReleaseCrawlSession,
  getActiveCrawlSession,
  hasActiveCrawlSession,
} from "./crawl-session.js";

const ACTIONS = ["start", "stop", "status"] as const;
const PROFILES = ["conservative", "balanced", "aggressive"] as const;

const CrawlSessionSchema = Type.Object({
  action: stringEnum(ACTIONS, {
    description:
      'Action to perform: "start" acquires a new session, "stop" releases it, "status" returns current state.',
  }),
  keyword: Type.Optional(
    Type.String({
      description: 'Search keyword for the session (required for "start").',
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: 'Sort order to lock for this session (e.g. "sales", "price", "relevance").',
    }),
  ),
  profile: Type.Optional(
    stringEnum(PROFILES, {
      description:
        'Crawl behavior profile: "conservative" (safest, slow), "balanced" (default), "aggressive" (fast, higher risk).',
      default: "balanced",
    }),
  ),
  site: Type.Optional(
    Type.String({
      description: "Target site domain (e.g. shopee.com.br) for logging.",
    }),
  ),
});

export function createCrawlSessionTool(): AnyAgentTool {
  return {
    label: "Crawl Session",
    name: "crawl_session",
    description:
      "Manage crawl sessions for human-like web scraping. Start a session before sequential page fetching — " +
      "web_fetch will automatically apply pacing delays, batch rests, and anomaly detection while a session is active. " +
      "Only one session can be active at a time.",
    parameters: CrawlSessionSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as
        | "start"
        | "stop"
        | "status";

      switch (action) {
        case "start":
          return jsonResult(handleStart(params));
        case "stop":
          return jsonResult(handleStop());
        case "status":
          return jsonResult(handleStatus());
        default:
          throw new Error(`Unknown action: ${String(action)}`);
      }
    },
  };
}

function handleStart(params: Record<string, unknown>): Record<string, unknown> {
  if (hasActiveCrawlSession()) {
    const session = getActiveCrawlSession()!;
    return {
      success: false,
      error: "session_active",
      message: `A crawl session is already active (keyword: "${session.keyword}", site: ${session.site}). Stop it first.`,
      activeSession: session.summary(),
    };
  }

  const keyword = readStringParam(params, "keyword", { required: false });
  if (!keyword) {
    return {
      success: false,
      error: "missing_keyword",
      message: 'The "keyword" parameter is required to start a crawl session.',
    };
  }

  const sort = readStringParam(params, "sort") || undefined;
  const profile = readStringParam(params, "profile") || "balanced";
  const site = readStringParam(params, "site") || undefined;

  const session = acquireCrawlSession({ keyword, sort, profile, site });
  if (!session) {
    return {
      success: false,
      error: "acquire_failed",
      message: "Failed to acquire crawl session (unexpected).",
    };
  }

  logDebug(`[crawl-tool] Session started: ${session.id}`);

  return {
    success: true,
    sessionId: session.id,
    keyword: session.keyword,
    sort: session.sort,
    site: session.site,
    profile: session.profile.name,
    rules: {
      batchSize: session.profile.batchSize,
      maxItemsPerSession: session.profile.maxItemsPerSession,
      pageReadRange: `${session.profile.pageReadMinSec}-${session.profile.pageReadMaxSec}s`,
      pageTurnRange: `${session.profile.pageTurnMinSec}-${session.profile.pageTurnMaxSec}s`,
      batchRestRange: `${session.profile.batchRestMinSec}-${session.profile.batchRestMaxSec}s`,
      singleKeyword: session.profile.singleKeywordPerSession,
      fixedSort: session.profile.fixedSortPerSession,
    },
    message:
      `Crawl session "${session.id}" started. ` +
      `Profile: ${session.profile.name}. ` +
      `web_fetch will now automatically apply human-like pacing.`,
  };
}

function handleStop(): Record<string, unknown> {
  const session = getActiveCrawlSession();
  if (!session) {
    return {
      success: false,
      error: "no_session",
      message: "No active crawl session to stop.",
    };
  }

  const summary = session.summary();
  forceReleaseCrawlSession();
  logDebug(`[crawl-tool] Session stopped: ${summary.id}`);

  return {
    success: true,
    message: `Crawl session "${summary.id}" stopped.`,
    summary,
  };
}

function handleStatus(): Record<string, unknown> {
  const session = getActiveCrawlSession();
  if (!session) {
    return {
      active: false,
      message: "No active crawl session.",
    };
  }

  const summary = session.summary();
  const pacerState = session.pacer.getState();

  return {
    active: true,
    summary,
    pacerState: {
      itemsFetched: pacerState.itemsFetched,
      batchItemsFetched: pacerState.batchItemsFetched,
      batchNumber: pacerState.batchNumber,
      consecutiveAnomalies: pacerState.consecutiveAnomalies,
      totalAnomalies: pacerState.totalAnomalies,
      refreshCount: pacerState.refreshCount,
      paused: pacerState.paused,
      aborted: pacerState.aborted,
    },
    limits: {
      batchSize: session.profile.batchSize,
      maxItemsPerSession: session.profile.maxItemsPerSession,
      batchProgress: `${pacerState.batchItemsFetched}/${session.profile.batchSize}`,
      sessionProgress: `${pacerState.itemsFetched}/${session.profile.maxItemsPerSession}`,
    },
  };
}
