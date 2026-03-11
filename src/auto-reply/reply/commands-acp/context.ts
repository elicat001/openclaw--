import type { HandleCommandsParams } from "../commands-types.js";

function normalizeString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return `${value}`.trim();
  }
  return "";
}

export function resolveAcpCommandChannel(params: HandleCommandsParams): string {
  const raw =
    params.ctx.OriginatingChannel ??
    params.command.channel ??
    params.ctx.Surface ??
    params.ctx.Provider;
  return normalizeString(raw).toLowerCase();
}

export function resolveAcpCommandAccountId(params: HandleCommandsParams): string {
  const accountId = normalizeString(params.ctx.AccountId);
  return accountId || "default";
}

export function resolveAcpCommandThreadId(params: HandleCommandsParams): string | undefined {
  const threadId =
    params.ctx.MessageThreadId != null ? normalizeString(String(params.ctx.MessageThreadId)) : "";
  return threadId || undefined;
}

export function resolveAcpCommandConversationId(params: HandleCommandsParams): string | undefined {
  const threadId = resolveAcpCommandThreadId(params);
  if (threadId) {
    return threadId;
  }
  const targets = [params.ctx.OriginatingTo, params.command.to, params.ctx.To];
  for (const target of targets) {
    const value = normalizeString(target);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveAcpCommandParentConversationId(
  _params: HandleCommandsParams,
): string | undefined {
  return undefined;
}

export function isAcpCommandDiscordChannel(_params: HandleCommandsParams): boolean {
  return false;
}

export function resolveAcpCommandBindingContext(params: HandleCommandsParams): {
  channel: string;
  accountId: string;
  threadId?: string;
  conversationId?: string;
  parentConversationId?: string;
} {
  const parentConversationId = resolveAcpCommandParentConversationId(params);
  return {
    channel: resolveAcpCommandChannel(params),
    accountId: resolveAcpCommandAccountId(params),
    threadId: resolveAcpCommandThreadId(params),
    conversationId: resolveAcpCommandConversationId(params),
    ...(parentConversationId ? { parentConversationId } : {}),
  };
}
