import {
  resolveChannelGroupRequireMention,
  resolveChannelGroupToolsPolicy,
  resolveToolsBySender,
} from "../../config/group-policy.js";
import type {
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
} from "../../config/types.tools.js";
import type { ChannelGroupContext } from "./types.js";

type GroupMentionParams = ChannelGroupContext;

type ChannelGroupPolicyChannel = "whatsapp" | "googlechat" | "bluebubbles";

type SenderScopedToolsEntry = {
  tools?: GroupToolPolicyConfig;
  toolsBySender?: GroupToolPolicyBySenderConfig;
};

function resolveChannelRequireMention(
  params: GroupMentionParams,
  channel: ChannelGroupPolicyChannel,
  groupId: string | null | undefined = params.groupId,
): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel,
    groupId,
    accountId: params.accountId,
  });
}

function resolveChannelToolPolicyForSender(
  params: GroupMentionParams,
  channel: ChannelGroupPolicyChannel,
  groupId: string | null | undefined = params.groupId,
): GroupToolPolicyConfig | undefined {
  return resolveChannelGroupToolsPolicy({
    cfg: params.cfg,
    channel,
    groupId,
    accountId: params.accountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
}

function _resolveSenderToolsEntry(
  entry: SenderScopedToolsEntry | undefined | null,
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  if (!entry) {
    return undefined;
  }
  const senderPolicy = resolveToolsBySender({
    toolsBySender: entry.toolsBySender,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  if (senderPolicy) {
    return senderPolicy;
  }
  return entry.tools;
}

export function resolveGoogleChatGroupRequireMention(params: GroupMentionParams): boolean {
  return resolveChannelRequireMention(params, "googlechat");
}

export function resolveGoogleChatGroupToolPolicy(
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  return resolveChannelToolPolicyForSender(params, "googlechat");
}

export function resolveWhatsAppGroupRequireMention(params: GroupMentionParams): boolean {
  return resolveChannelRequireMention(params, "whatsapp");
}

export function resolveWhatsAppGroupToolPolicy(
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  return resolveChannelToolPolicyForSender(params, "whatsapp");
}

export function resolveBlueBubblesGroupRequireMention(params: GroupMentionParams): boolean {
  return resolveChannelRequireMention(params, "bluebubbles");
}

export function resolveBlueBubblesGroupToolPolicy(
  params: GroupMentionParams,
): GroupToolPolicyConfig | undefined {
  return resolveChannelToolPolicyForSender(params, "bluebubbles");
}
