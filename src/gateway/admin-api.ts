/**
 * Admin API endpoint for the admin dashboard.
 *
 * Provides system status data at GET /api/admin/status including
 * channels, plugins, sessions, uptime, memory usage, and
 * Agent Reach internet access platform availability.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { runDoctor } from "../agent-reach/doctor.js";
import type { AgentReachStatus } from "../agent-reach/types.js";
import { loadConfig } from "../config/config.js";
import { safeEqualSecret } from "../security/secret-equal.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { getHealthCache, refreshGatewayHealthSnapshot } from "./server/health-state.js";

export interface AdminChannelStatus {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  lastActivity?: number;
}

export interface AdminPluginStatus {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  hookCount: number;
}

export interface AdminSessionInfo {
  id: string;
  channel: string;
  startedAt: number;
  messageCount: number;
}

export interface AdminDashboardData {
  channels: AdminChannelStatus[];
  plugins: AdminPluginStatus[];
  sessions: AdminSessionInfo[];
  gatewayUptime: number;
  memoryUsageMb: number;
  agentReach: AgentReachStatus | null;
}

function buildAdminDashboardData(): AdminDashboardData {
  const uptimeMs = Math.round(process.uptime() * 1000);
  const memoryUsageMb = process.memoryUsage().heapUsed / (1024 * 1024);

  const cfg = loadConfig();
  const channels: AdminChannelStatus[] = [];
  const plugins: AdminPluginStatus[] = [];
  const sessions: AdminSessionInfo[] = [];

  // Gather channel info from health cache
  const health = getHealthCache();
  if (health?.channels) {
    for (const [chId, ch] of Object.entries(health.channels)) {
      channels.push({
        id: chId,
        name: chId,
        status: ch.connected ? "connected" : ch.probeError ? "error" : "disconnected",
      });
    }
  }

  // Fallback: derive channels from config if health cache is empty
  if (channels.length === 0 && cfg.channels) {
    const configChannels = cfg.channels as Record<string, unknown>;
    for (const [id, value] of Object.entries(configChannels)) {
      if (value && typeof value === "object") {
        const chCfg = value as Record<string, unknown>;
        const enabled = chCfg.enabled !== false;
        channels.push({
          id,
          name: id,
          status: enabled ? "connected" : "disconnected",
        });
      }
    }
  }

  // Gather plugin info from config
  if (cfg.plugins) {
    const pluginsConfig = cfg.plugins as Record<string, unknown>;
    const pluginList = Array.isArray(pluginsConfig) ? pluginsConfig : Object.entries(pluginsConfig);
    for (const entry of pluginList) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const [id, val] = entry;
        const pluginObj = (typeof val === "object" && val !== null ? val : {}) as Record<
          string,
          unknown
        >;
        plugins.push({
          id: String(id),
          name: String(pluginObj.name ?? id),
          version: typeof pluginObj.version === "string" ? pluginObj.version : "0.0.0",
          enabled: pluginObj.enabled !== false,
          hookCount: 0,
        });
      }
    }
  }

  // Session info from health cache
  if (health && typeof health === "object") {
    const healthObj = health as Record<string, unknown>;
    const sessionList = healthObj.sessions ?? healthObj.activeSessions;
    if (Array.isArray(sessionList)) {
      for (const s of sessionList) {
        const sObj = s as Record<string, unknown>;
        sessions.push({
          id:
            typeof sObj.id === "string"
              ? sObj.id
              : typeof sObj.key === "string"
                ? sObj.key
                : "unknown",
          channel:
            typeof sObj.channel === "string"
              ? sObj.channel
              : typeof sObj.channelId === "string"
                ? sObj.channelId
                : "unknown",
          startedAt: typeof sObj.startedAt === "number" ? sObj.startedAt : Date.now(),
          messageCount: typeof sObj.messageCount === "number" ? sObj.messageCount : 0,
        });
      }
    }
  }

  return {
    channels,
    plugins,
    sessions,
    gatewayUptime: uptimeMs,
    memoryUsageMb: Math.round(memoryUsageMb * 10) / 10,
  };
}

// Agent Reach status cache (refreshed at most once per 60s)
let agentReachCache: AgentReachStatus | null = null;
let agentReachCacheAt = 0;
const AGENT_REACH_CACHE_TTL = 60_000;

async function getAgentReachStatus(): Promise<AgentReachStatus | null> {
  const now = Date.now();
  if (agentReachCache && now - agentReachCacheAt < AGENT_REACH_CACHE_TTL) {
    return agentReachCache;
  }
  try {
    agentReachCache = await runDoctor();
    agentReachCacheAt = now;
    return agentReachCache;
  } catch {
    return agentReachCache;
  }
}

const ADMIN_API_PATH = "/api/admin/status";

/** Extract bearer token from Authorization header or query param. */
function extractAdminToken(req: IncomingMessage): string | undefined {
  const auth =
    typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      return token;
    }
  }
  // Fallback: allow token via query param (used by Control UI same-origin requests)
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token") ?? undefined;
}

export function handleAdminApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  auth?: ResolvedGatewayAuth,
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== ADMIN_API_PATH) {
    return false;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  // Authenticate if gateway uses token or password auth
  if (auth && auth.mode !== "none") {
    const requestToken = extractAdminToken(req);
    const expectedSecret =
      auth.mode === "token" ? auth.token : auth.mode === "password" ? auth.password : undefined;
    if (expectedSecret && (!requestToken || !safeEqualSecret(requestToken, expectedSecret))) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return true;
    }
  }

  // Trigger a background health refresh if cache is stale
  void refreshGatewayHealthSnapshot();

  const data = buildAdminDashboardData();

  // Fetch agent-reach status asynchronously (native TS checks)
  void getAgentReachStatus()
    .then((arStatus) => {
      data.agentReach = arStatus;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(data));
    })
    .catch(() => {
      data.agentReach = null;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(data));
    });
  return true;
}
