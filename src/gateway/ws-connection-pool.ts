/**
 * WebSocket connection pool with automatic reconnection and health monitoring.
 *
 * Manages WebSocket connections with:
 * - Automatic reconnection with exponential backoff
 * - Connection health heartbeats
 * - Connection limit enforcement
 * - Graceful shutdown
 */
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/ws-pool");

export interface WsConnectionEntry {
  id: string;
  ws: unknown; // WebSocket instance (type-erased to avoid coupling)
  connectedAt: number;
  lastPingAt: number;
  lastPongAt: number;
  reconnectAttempts: number;
  metadata?: Record<string, unknown>;
  /** Timestamp (ms) of the most recent successful authentication. */
  lastAuthAt?: number;
}

export interface WsConnectionPoolOptions {
  maxConnections?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  reconnectMaxAttempts?: number;
  /** Maximum session age (ms) before requiring re-authentication. Default: 30 minutes. */
  sessionMaxAgeMs?: number;
}

/** Default session max age: 30 minutes. */
const DEFAULT_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const DEFAULT_OPTIONS: Required<WsConnectionPoolOptions> = {
  maxConnections: 100,
  heartbeatIntervalMs: 30_000,
  heartbeatTimeoutMs: 10_000,
  reconnectBaseMs: 1_000,
  reconnectMaxMs: 60_000,
  reconnectMaxAttempts: 10,
  sessionMaxAgeMs: DEFAULT_SESSION_MAX_AGE_MS,
};

export interface WsConnectionPool {
  add(id: string, ws: unknown, metadata?: Record<string, unknown>): boolean;
  remove(id: string): boolean;
  get(id: string): WsConnectionEntry | undefined;
  has(id: string): boolean;
  size(): number;
  list(): WsConnectionEntry[];
  recordPong(id: string): void;
  /** Record a successful authentication timestamp for the given connection. */
  recordAuth(id: string): void;
  getStaleConnections(): WsConnectionEntry[];
  /** Return connections whose session has exceeded `sessionMaxAgeMs` since last auth. */
  getSessionExpiredConnections(): WsConnectionEntry[];
  startHeartbeat(pingFn: (entry: WsConnectionEntry) => void): void;
  stopHeartbeat(): void;
  close(): void;
  readonly options: Required<WsConnectionPoolOptions>;
}

export function createWsConnectionPool(opts?: WsConnectionPoolOptions): WsConnectionPool {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const connections = new Map<string, WsConnectionEntry>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  return {
    options,

    add(id: string, ws: unknown, metadata?: Record<string, unknown>): boolean {
      if (connections.size >= options.maxConnections && !connections.has(id)) {
        log.warn(`Connection pool full (${options.maxConnections}), rejecting: ${id}`);
        return false;
      }
      const now = Date.now();
      connections.set(id, {
        id,
        ws,
        connectedAt: now,
        lastPingAt: now,
        lastPongAt: now,
        lastAuthAt: now,
        reconnectAttempts: 0,
        metadata,
      });
      return true;
    },

    remove(id: string): boolean {
      return connections.delete(id);
    },

    get(id: string): WsConnectionEntry | undefined {
      return connections.get(id);
    },

    has(id: string): boolean {
      return connections.has(id);
    },

    size(): number {
      return connections.size;
    },

    list(): WsConnectionEntry[] {
      return Array.from(connections.values());
    },

    recordPong(id: string): void {
      const entry = connections.get(id);
      if (entry) {
        entry.lastPongAt = Date.now();
      }
    },

    recordAuth(id: string): void {
      const entry = connections.get(id);
      if (entry) {
        entry.lastAuthAt = Date.now();
      }
    },

    getStaleConnections(): WsConnectionEntry[] {
      const now = Date.now();
      const stale: WsConnectionEntry[] = [];
      for (const entry of connections.values()) {
        if (now - entry.lastPongAt > options.heartbeatTimeoutMs + options.heartbeatIntervalMs) {
          stale.push(entry);
        }
      }
      return stale;
    },

    getSessionExpiredConnections(): WsConnectionEntry[] {
      const now = Date.now();
      const expired: WsConnectionEntry[] = [];
      for (const entry of connections.values()) {
        const authTs = entry.lastAuthAt ?? entry.connectedAt;
        if (now - authTs > options.sessionMaxAgeMs) {
          expired.push(entry);
        }
      }
      return expired;
    },

    startHeartbeat(pingFn: (entry: WsConnectionEntry) => void): void {
      if (heartbeatTimer) {
        return;
      }
      heartbeatTimer = setInterval(() => {
        const now = Date.now();
        for (const entry of connections.values()) {
          entry.lastPingAt = now;
          try {
            pingFn(entry);
          } catch (err) {
            log.warn(`Heartbeat ping failed for ${entry.id}: ${(err as Error).message}`);
          }
        }
      }, options.heartbeatIntervalMs);
    },

    stopHeartbeat(): void {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    },

    close(): void {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      connections.clear();
    },
  };
}

/**
 * Calculates reconnection delay with exponential backoff and jitter.
 */
export function getReconnectDelay(attempt: number, baseMs = 1_000, maxMs = 60_000): number {
  const delay = baseMs * 2 ** Math.min(attempt, 10);
  const jitter = delay * 0.25 * Math.random();
  return Math.min(delay + jitter, maxMs);
}
