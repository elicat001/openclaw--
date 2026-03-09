/**
 * Mock channel for local development and testing.
 *
 * Provides a simulated messaging channel that doesn't require real API keys
 * or external service connections. Useful for:
 * - Plugin development without real channel credentials
 * - Testing message routing logic
 * - CI/CD environments
 *
 * Usage in config:
 *   channels:
 *     mock:
 *       enabled: true
 *       echo: true  # Echo messages back (optional)
 */
import { EventEmitter } from "node:events";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("channels/mock");

export interface MockMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  channel: string;
  metadata?: Record<string, unknown>;
}

export interface MockChannelOptions {
  /** Channel identifier. Defaults to "mock". */
  channelId?: string;
  /** Auto-respond to messages with echo. Defaults to false. */
  echo?: boolean;
  /** Simulated latency in ms. Defaults to 0. */
  latencyMs?: number;
  /** Maximum message history to retain. Defaults to 100. */
  maxHistory?: number;
}

export interface MockChannel {
  /** Send a message to the mock channel (simulates incoming message). */
  receive(from: string, text: string, metadata?: Record<string, unknown>): MockMessage;
  /** Send a reply (simulates outgoing message). */
  send(text: string, metadata?: Record<string, unknown>): MockMessage;
  /** Get message history. */
  history(): readonly MockMessage[];
  /** Clear message history. */
  clear(): void;
  /** Listen for events. */
  on(event: string, listener: (msg: MockMessage) => void): void;
  /** Remove listener. */
  off(event: string, listener: (msg: MockMessage) => void): void;
  /** Channel ID. */
  readonly id: string;
}

export function createMockChannel(options?: MockChannelOptions): MockChannel {
  const channelId = options?.channelId ?? "mock";
  const echo = options?.echo ?? false;
  const latencyMs = options?.latencyMs ?? 0;
  const maxHistory = options?.maxHistory ?? 100;
  const messages: MockMessage[] = [];
  const emitter = new EventEmitter();
  let messageCounter = 0;

  function createMessage(
    from: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): MockMessage {
    messageCounter++;
    const msg: MockMessage = {
      id: `mock-${channelId}-${messageCounter}`,
      from,
      text,
      timestamp: Date.now(),
      channel: channelId,
      metadata,
    };
    messages.push(msg);
    if (messages.length > maxHistory) {
      messages.splice(0, messages.length - maxHistory);
    }
    return msg;
  }

  return {
    id: channelId,

    receive(from: string, text: string, metadata?: Record<string, unknown>): MockMessage {
      const msg = createMessage(from, text, metadata);
      log.info(`[${channelId}] Received from ${from}: ${text}`);

      const emit = () => {
        emitter.emit("message", msg);
        if (echo) {
          const reply = createMessage("bot", `Echo: ${text}`);
          emitter.emit("reply", reply);
        }
      };

      if (latencyMs > 0) {
        setTimeout(emit, latencyMs);
      } else {
        emit();
      }
      return msg;
    },

    send(text: string, metadata?: Record<string, unknown>): MockMessage {
      const msg = createMessage("bot", text, metadata);
      log.info(`[${channelId}] Sent: ${text}`);
      emitter.emit("reply", msg);
      return msg;
    },

    history(): readonly MockMessage[] {
      return messages;
    },

    clear(): void {
      messages.length = 0;
      messageCounter = 0;
    },

    on(event: string, listener: (msg: MockMessage) => void): void {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },

    off(event: string, listener: (msg: MockMessage) => void): void {
      emitter.off(event, listener as (...args: unknown[]) => void);
    },
  };
}
