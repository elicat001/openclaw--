// ---------------------------------------------------------------------------
// Channel adapter types and plugin core types
// ---------------------------------------------------------------------------

export { createAccountListHelpers } from "../channels/plugins/account-helpers.js";
export { CHANNEL_MESSAGE_ACTION_NAMES } from "../channels/plugins/message-action-names.js";
export type {
  ChannelAccountSnapshot,
  ChannelAccountState,
  ChannelAgentTool,
  ChannelAgentToolFactory,
  ChannelAuthAdapter,
  ChannelCapabilities,
  ChannelCommandAdapter,
  ChannelConfigAdapter,
  ChannelDirectoryAdapter,
  ChannelDirectoryEntry,
  ChannelDirectoryEntryKind,
  ChannelElevatedAdapter,
  ChannelGatewayAdapter,
  ChannelGatewayContext,
  ChannelGroupAdapter,
  ChannelGroupContext,
  ChannelHeartbeatAdapter,
  ChannelHeartbeatDeps,
  ChannelId,
  ChannelLogSink,
  ChannelLoginWithQrStartResult,
  ChannelLoginWithQrWaitResult,
  ChannelLogoutContext,
  ChannelLogoutResult,
  ChannelMentionAdapter,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMessageActionName,
  ChannelMessagingAdapter,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelOutboundTargetMode,
  ChannelPairingAdapter,
  ChannelPollContext,
  ChannelPollResult,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelResolverAdapter,
  ChannelSecurityAdapter,
  ChannelSecurityContext,
  ChannelSecurityDmPolicy,
  ChannelSetupAdapter,
  ChannelSetupInput,
  ChannelStatusAdapter,
  ChannelStatusIssue,
  ChannelStreamingAdapter,
  ChannelThreadingAdapter,
  ChannelThreadingContext,
  ChannelThreadingToolContext,
  ChannelToolSend,
  BaseProbeResult,
  BaseTokenResolution,
} from "../channels/plugins/types.js";
export type { ChannelConfigSchema, ChannelPlugin } from "../channels/plugins/types.plugin.js";

// ---------------------------------------------------------------------------
// ACP (Agent Client Protocol) runtime
// ---------------------------------------------------------------------------

export type {
  AcpRuntimeCapabilities,
  AcpRuntimeControl,
  AcpRuntimeDoctorReport,
  AcpRuntime,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimePromptMode,
  AcpSessionUpdateTag,
  AcpRuntimeSessionMode,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
} from "../acp/runtime/types.js";
export type { AcpRuntimeBackend } from "../acp/runtime/registry.js";
export {
  getAcpRuntimeBackend,
  registerAcpRuntimeBackend,
  requireAcpRuntimeBackend,
  unregisterAcpRuntimeBackend,
} from "../acp/runtime/registry.js";
export { ACP_ERROR_CODES, AcpRuntimeError } from "../acp/runtime/errors.js";
export type { AcpRuntimeErrorCode } from "../acp/runtime/errors.js";
// ---------------------------------------------------------------------------
// Plugin types, runtime, and HTTP registration
// ---------------------------------------------------------------------------

export type {
  AnyAgentTool,
  OpenClawPluginConfigSchema,
  OpenClawPluginApi,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
  ProviderAuthContext,
  ProviderAuthResult,
} from "../plugins/types.js";
export type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
  RespondFn,
} from "../gateway/server-methods/types.js";
export type {
  PluginRuntime,
  RuntimeLogger,
  SubagentRunParams,
  SubagentRunResult,
  SubagentWaitParams,
  SubagentWaitResult,
  SubagentGetSessionMessagesParams,
  SubagentGetSessionMessagesResult,
  SubagentGetSessionParams,
  SubagentGetSessionResult,
  SubagentDeleteSessionParams,
} from "../plugins/runtime/types.js";
export { normalizePluginHttpPath } from "../plugins/http-path.js";
export { registerPluginHttpRoute } from "../plugins/http-registry.js";
export { emptyPluginConfigSchema } from "../plugins/config-schema.js";
// ---------------------------------------------------------------------------
// Configuration types and schemas
// ---------------------------------------------------------------------------

export type { OpenClawConfig } from "../config/config.js";
/** @deprecated Use OpenClawConfig instead */
export type { OpenClawConfig as ClawdbotConfig } from "../config/config.js";
export { isDangerousNameMatchingEnabled } from "../config/dangerous-name-matching.js";

// ---------------------------------------------------------------------------
// File locking and async utilities
// ---------------------------------------------------------------------------

export type { FileLockHandle, FileLockOptions } from "./file-lock.js";
export { acquireFileLock, withFileLock } from "./file-lock.js";
export {
  mapAllowlistResolutionInputs,
  mapBasicAllowlistResolutionEntries,
  type BasicAllowlistResolutionEntry,
} from "./allowlist-resolution.js";
export { resolveRequestUrl } from "./request-url.js";
export type { KeyedAsyncQueueHooks } from "./keyed-async-queue.js";
export { enqueueKeyedTask, KeyedAsyncQueue } from "./keyed-async-queue.js";

// ---------------------------------------------------------------------------
// Webhook infrastructure
// ---------------------------------------------------------------------------

export { normalizeWebhookPath, resolveWebhookPath } from "./webhook-path.js";
export {
  registerWebhookTarget,
  registerWebhookTargetWithPluginRoute,
  rejectNonPostWebhookRequest,
  resolveWebhookTargetWithAuthOrReject,
  resolveWebhookTargetWithAuthOrRejectSync,
  resolveSingleWebhookTarget,
  resolveSingleWebhookTargetAsync,
  resolveWebhookTargets,
  withResolvedWebhookRequestPipeline,
} from "./webhook-targets.js";
export type {
  RegisterWebhookPluginRouteOptions,
  RegisterWebhookTargetOptions,
  WebhookTargetMatchResult,
} from "./webhook-targets.js";
export {
  applyBasicWebhookRequestGuards,
  beginWebhookRequestPipelineOrReject,
  createWebhookInFlightLimiter,
  isJsonContentType,
  readWebhookBodyOrReject,
  readJsonWebhookBodyOrReject,
  WEBHOOK_BODY_READ_DEFAULTS,
  WEBHOOK_IN_FLIGHT_DEFAULTS,
} from "./webhook-request-guards.js";
export type { WebhookBodyReadProfile, WebhookInFlightLimiter } from "./webhook-request-guards.js";

// ---------------------------------------------------------------------------
// Channel lifecycle and status
// ---------------------------------------------------------------------------

export { keepHttpServerTaskAlive, waitUntilAbort } from "./channel-lifecycle.js";
export type { AgentMediaPayload } from "./agent-media-payload.js";
export { buildAgentMediaPayload } from "./agent-media-payload.js";
export {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  buildComputedAccountStatusSnapshot,
  buildProbeChannelStatusSummary,
  buildRuntimeAccountStatusSnapshot,
  buildTokenChannelStatusSummary,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "./status-helpers.js";

// ---------------------------------------------------------------------------
// Channel onboarding and setup
// ---------------------------------------------------------------------------

export {
  promptSingleChannelSecretInput,
  type SingleChannelSecretInputPromptResult,
} from "../channels/plugins/onboarding/helpers.js";
export { buildOauthProviderAuthResult } from "./provider-auth-result.js";
export { formatResolvedUnresolvedNote } from "./resolution-notes.js";
export { buildChannelSendResult } from "./channel-send-result.js";
export type { ChannelSendRawResult } from "./channel-send-result.js";
export { createPluginRuntimeStore } from "./runtime-store.js";
export { createScopedChannelConfigBase } from "./channel-config-helpers.js";

// ---------------------------------------------------------------------------
// Channel config schemas and allowlist matching
// ---------------------------------------------------------------------------

export {
  AllowFromEntrySchema,
  buildCatchallMultiAccountChannelSchema,
} from "../channels/plugins/config-schema.js";
export type { ChannelDock } from "../channels/dock.js";
export { getChatChannelMeta } from "../channels/registry.js";
export { resolveAllowlistMatchByCandidates } from "../channels/allowlist-match.js";
export type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  DmConfig,
  GroupPolicy,
  GroupToolPolicyConfig,
  GroupToolPolicyBySenderConfig,
  MarkdownConfig,
  MarkdownTableMode,
} from "../config/types.js";

// ---------------------------------------------------------------------------
// Group policy and runtime policy resolution
// ---------------------------------------------------------------------------

export {
  GROUP_POLICY_BLOCKED_LABEL,
  resetMissingProviderGroupPolicyFallbackWarningsForTesting,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  resolveOpenProviderRuntimeGroupPolicy,
  resolveRuntimeGroupPolicy,
  type GroupPolicyDefaultsConfig,
  type RuntimeGroupPolicyResolution,
  type RuntimeGroupPolicyParams,
  type ResolveProviderRuntimeGroupPolicyParams,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "../config/runtime-group-policy.js";

// ---------------------------------------------------------------------------
// Zod config schemas (per-channel and core)
// ---------------------------------------------------------------------------

export {
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  MarkdownTableModeSchema,
  normalizeAllowFrom,
  ReplyRuntimeConfigSchemaShape,
  requireOpenAllowFrom,
  SecretInputSchema,
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "../config/zod-schema.core.js";
export {
  assertSecretInputResolved,
  hasConfiguredSecretInput,
  isSecretRef,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "../config/types.secrets.js";
export type { SecretInput, SecretRef } from "../config/types.secrets.js";
export { ToolPolicySchema } from "../config/zod-schema.agent-runtime.js";
// ---------------------------------------------------------------------------
// Runtime environment and routing
// ---------------------------------------------------------------------------

export type { RuntimeEnv } from "../runtime.js";
export type { WizardPrompter } from "../wizard/prompts.js";
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeAgentId,
  resolveThreadSessionKeys,
} from "../routing/session-key.js";

// ---------------------------------------------------------------------------
// Allowlist, access control, and authorization
// ---------------------------------------------------------------------------

export {
  formatAllowFromLowercase,
  formatNormalizedAllowFromEntries,
  isAllowedParsedChatSender,
  isNormalizedSenderAllowed,
} from "./allow-from.js";
export {
  evaluateGroupRouteAccessForPolicy,
  evaluateMatchedGroupAccessForPolicy,
  evaluateSenderGroupAccess,
  evaluateSenderGroupAccessForPolicy,
  resolveSenderScopedGroupPolicy,
  type GroupRouteAccessDecision,
  type GroupRouteAccessReason,
  type MatchedGroupAccessDecision,
  type MatchedGroupAccessReason,
  type SenderGroupAccessDecision,
  type SenderGroupAccessReason,
} from "./group-access.js";
export {
  resolveDirectDmAuthorizationOutcome,
  resolveSenderCommandAuthorization,
  resolveSenderCommandAuthorizationWithRuntime,
} from "./command-auth.js";
export type { CommandAuthorizationRuntime } from "./command-auth.js";
export { createScopedPairingAccess } from "./pairing-access.js";
// ---------------------------------------------------------------------------
// Inbound message processing and reply dispatch
// ---------------------------------------------------------------------------

export {
  createInboundEnvelopeBuilder,
  resolveInboundRouteEnvelopeBuilder,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
} from "./inbound-envelope.js";
export { resolveInboundSessionEnvelopeContext } from "../channels/session-envelope.js";
export {
  listConfiguredAccountIds,
  resolveAccountWithDefaultFallback,
} from "./account-resolution.js";
export { issuePairingChallenge } from "../pairing/pairing-challenge.js";
export { extractToolSend } from "./tool-send.js";

// ---------------------------------------------------------------------------
// Outbound reply and media delivery
// ---------------------------------------------------------------------------

export {
  createNormalizedOutboundDeliverer,
  formatTextWithAttachmentLinks,
  isNumericTargetId,
  normalizeOutboundReplyPayload,
  resolveOutboundMediaUrls,
  sendPayloadWithChunkedTextAndMedia,
  sendMediaWithLeadingCaption,
} from "./reply-payload.js";
export type { OutboundReplyPayload } from "./reply-payload.js";
export {
  buildInboundReplyDispatchBase,
  dispatchInboundReplyWithBase,
  dispatchReplyFromConfigWithSettledDispatcher,
  recordInboundSessionAndDispatchReply,
} from "./inbound-reply-dispatch.js";
export type { OutboundMediaLoadOptions } from "./outbound-media.js";
export { loadOutboundMediaFromUrl } from "./outbound-media.js";
export { resolveChannelAccountConfigBasePath } from "./config-paths.js";
// ---------------------------------------------------------------------------
// Media payload and runtime helpers
// ---------------------------------------------------------------------------

export { buildMediaPayload } from "../channels/plugins/media-payload.js";
export type { MediaPayload, MediaPayloadInput } from "../channels/plugins/media-payload.js";
export {
  createLoggerBackedRuntime,
  resolveRuntimeEnv,
  resolveRuntimeEnvWithUnavailableExit,
} from "./runtime.js";
export { chunkTextForOutbound } from "./text-chunking.js";

// ---------------------------------------------------------------------------
// Utility functions (params, JSON, OAuth, temp files)
// ---------------------------------------------------------------------------

export { readBooleanParam } from "./boolean-param.js";
export { readJsonFileWithFallback, writeJsonFileAtomically } from "./json-store.js";
export { generatePkceVerifierChallenge, toFormUrlEncoded } from "./oauth-utils.js";
export { buildRandomTempFilePath, withTempDownloadPath } from "./temp-path.js";

// ---------------------------------------------------------------------------
// Windows spawn / process helpers
// ---------------------------------------------------------------------------

export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsExecutablePath,
  resolveWindowsSpawnProgramCandidate,
  resolveWindowsSpawnProgram,
} from "./windows-spawn.js";
export type {
  ResolveWindowsSpawnProgramCandidateParams,
  ResolveWindowsSpawnProgramParams,
  WindowsSpawnCandidateResolution,
  WindowsSpawnInvocation,
  WindowsSpawnProgramCandidate,
  WindowsSpawnProgram,
  WindowsSpawnResolution,
} from "./windows-spawn.js";

// ---------------------------------------------------------------------------
// Infrastructure: paths, gateway, tailscale
// ---------------------------------------------------------------------------

export { resolvePreferredOpenClawTmpDir } from "../infra/tmp-openclaw-dir.js";
export {
  runPluginCommandWithTimeout,
  type PluginCommandRunOptions,
  type PluginCommandRunResult,
} from "./run-command.js";
export { resolveGatewayBindUrl } from "../shared/gateway-bind-url.js";
export type { GatewayBindUrlResult } from "../shared/gateway-bind-url.js";
export { resolveTailnetHostWithRunner } from "../shared/tailscale-status.js";
export type {
  TailscaleStatusCommandResult,
  TailscaleStatusCommandRunner,
} from "../shared/tailscale-status.js";
// ---------------------------------------------------------------------------
// Auto-reply, chat types, and reply tokens
// ---------------------------------------------------------------------------

export type { ChatType } from "../channels/chat-type.js";
/** @deprecated Use ChatType instead */
export type { RoutePeerKind } from "../routing/resolve-route.js";
export { resolveAckReaction } from "../agents/identity.js";
export type { ReplyPayload } from "../auto-reply/types.js";
export type { ChunkMode } from "../auto-reply/chunk.js";
export { SILENT_REPLY_TOKEN, isSilentReplyText } from "../auto-reply/tokens.js";
export { formatInboundFromLabel } from "../auto-reply/envelope.js";
export {
  createScopedAccountConfigAccessors,
  formatTrimmedAllowFromEntries,
  mapAllowFromEntries,
  resolveOptionalConfigString,
} from "./channel-config-helpers.js";

// ---------------------------------------------------------------------------
// Device pairing
// ---------------------------------------------------------------------------

export {
  approveDevicePairing,
  listDevicePairing,
  rejectDevicePairing,
} from "../infra/device-pairing.js";

// ---------------------------------------------------------------------------
// Deduplication and caching
// ---------------------------------------------------------------------------

export { createDedupeCache } from "../infra/dedupe.js";
export type { DedupeCache } from "../infra/dedupe.js";
export { createPersistentDedupe } from "./persistent-dedupe.js";
export type {
  PersistentDedupe,
  PersistentDedupeCheckOptions,
  PersistentDedupeOptions,
} from "./persistent-dedupe.js";

// ---------------------------------------------------------------------------
// Error handling, formatting, and time utilities
// ---------------------------------------------------------------------------

export { formatErrorMessage } from "../infra/errors.js";
export {
  formatUtcTimestamp,
  formatZonedTimestamp,
  resolveTimezone,
} from "../infra/format-time/format-datetime.js";

// ---------------------------------------------------------------------------
// HTTP body limits and webhook rate-limiting/anomaly tracking
// ---------------------------------------------------------------------------

export {
  DEFAULT_WEBHOOK_BODY_TIMEOUT_MS,
  DEFAULT_WEBHOOK_MAX_BODY_BYTES,
  RequestBodyLimitError,
  installRequestBodyLimitGuard,
  isRequestBodyLimitError,
  readJsonBodyWithLimit,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../infra/http-body.js";
export {
  WEBHOOK_ANOMALY_COUNTER_DEFAULTS,
  WEBHOOK_ANOMALY_STATUS_CODES,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
  createBoundedCounter,
  createFixedWindowRateLimiter,
  createWebhookAnomalyTracker,
} from "./webhook-memory-guards.js";
export type {
  BoundedCounter,
  FixedWindowRateLimiter,
  WebhookAnomalyTracker,
} from "./webhook-memory-guards.js";

// ---------------------------------------------------------------------------
// Network: SSRF guards, fetch helpers, and WebSocket utilities
// ---------------------------------------------------------------------------

export { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
export {
  SsrFBlockedError,
  isBlockedHostname,
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
} from "../infra/net/ssrf.js";
export type { LookupFn, SsrFPolicy } from "../infra/net/ssrf.js";
export {
  buildHostnameAllowlistPolicyFromSuffixAllowlist,
  isHttpsUrlAllowedByHostnameSuffixAllowlist,
  normalizeHostnameSuffixAllowlist,
} from "./ssrf-policy.js";
export { fetchWithBearerAuthScopeFallback } from "./fetch-auth.js";
export type { ScopeTokenProvider } from "./fetch-auth.js";
export { rawDataToString } from "../infra/ws.js";

// ---------------------------------------------------------------------------
// Platform detection and environment utilities
// ---------------------------------------------------------------------------

export { isWSLSync, isWSL2Sync, isWSLEnv } from "../infra/wsl.js";
export { isTruthyEnvValue } from "../infra/env.js";
export { resolveChannelGroupRequireMention, resolveToolsBySender } from "../config/group-policy.js";
// ---------------------------------------------------------------------------
// Group history and context assembly
// ---------------------------------------------------------------------------

export {
  buildPendingHistoryContextFromMap,
  clearHistoryEntries,
  clearHistoryEntriesIfEnabled,
  DEFAULT_GROUP_HISTORY_LIMIT,
  evictOldHistoryKeys,
  recordPendingHistoryEntry,
  recordPendingHistoryEntryIfEnabled,
} from "../auto-reply/reply/history.js";
export type { HistoryEntry } from "../auto-reply/reply/history.js";

// ---------------------------------------------------------------------------
// Channel messaging: mentions, ack reactions, typing, logging
// ---------------------------------------------------------------------------

export { mergeAllowlist, summarizeMapping } from "../channels/allowlists/resolve-utils.js";
export {
  resolveMentionGating,
  resolveMentionGatingWithBypass,
} from "../channels/mention-gating.js";
export type { AckReactionGateParams, AckReactionScope } from "../channels/ack-reactions.js";
export { removeAckReactionAfterReply, shouldAckReaction } from "../channels/ack-reactions.js";
export { createTypingCallbacks } from "../channels/typing.js";
export { createReplyPrefixContext, createReplyPrefixOptions } from "../channels/reply-prefix.js";
export { logAckFailure, logInboundDrop, logTypingFailure } from "../channels/logging.js";
export { resolveChannelMediaMaxBytes } from "../channels/plugins/media-limits.js";
export type { NormalizedLocation } from "../channels/location.js";
export { formatLocationText, toLocationContext } from "../channels/location.js";
export { resolveControlCommandGate } from "../channels/command-gating.js";

// ---------------------------------------------------------------------------
// Channel session, config matching, and directory listing
// ---------------------------------------------------------------------------

export { recordInboundSession } from "../channels/session.js";
export {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatch,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "../channels/plugins/channel-config.js";
export type { AllowlistMatch } from "../channels/plugins/allowlist-match.js";
export {
  formatAllowlistMatchMeta,
  resolveAllowlistMatchSimple,
} from "../channels/plugins/allowlist-match.js";

// ---------------------------------------------------------------------------
// Agent tools and schema helpers
// ---------------------------------------------------------------------------

export { optionalStringEnum, stringEnum } from "../agents/schema/typebox.js";
export type { PollInput } from "../polls.js";

// ---------------------------------------------------------------------------
// Channel config schema builders and directory helpers
// ---------------------------------------------------------------------------

export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export {
  listDirectoryGroupEntriesFromMapKeys,
  listDirectoryGroupEntriesFromMapKeysAndAllowFrom,
  listDirectoryUserEntriesFromAllowFrom,
  listDirectoryUserEntriesFromAllowFromAndMapKeys,
} from "../channels/plugins/directory-config-helpers.js";
export {
  clearAccountEntryFields,
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.js";
export {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../channels/plugins/setup-helpers.js";

// ---------------------------------------------------------------------------
// Group policy warnings
// ---------------------------------------------------------------------------

export {
  buildOpenGroupPolicyConfigureRouteAllowlistWarning,
  buildOpenGroupPolicyNoRouteAllowlistWarning,
  buildOpenGroupPolicyRestrictSendersWarning,
  buildOpenGroupPolicyWarning,
  collectAllowlistProviderGroupPolicyWarnings,
  collectAllowlistProviderRestrictSendersWarnings,
  collectOpenProviderGroupPolicyWarnings,
  collectOpenGroupPolicyConfiguredRouteWarnings,
  collectOpenGroupPolicyRestrictSendersWarnings,
  collectOpenGroupPolicyRouteAllowlistWarnings,
} from "../channels/plugins/group-policy-warnings.js";

// ---------------------------------------------------------------------------
// Pairing, security, and onboarding helpers
// ---------------------------------------------------------------------------

export {
  buildAccountScopedDmSecurityPolicy,
  formatPairingApproveHint,
} from "../channels/plugins/helpers.js";
export { PAIRING_APPROVED_MESSAGE } from "../channels/plugins/pairing-message.js";

export type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
} from "../channels/plugins/onboarding-types.js";
export {
  addWildcardAllowFrom,
  mergeAllowFromEntries,
  promptAccountId,
  resolveAccountIdForConfigure,
  setTopLevelChannelAllowFrom,
  setTopLevelChannelDmPolicyWithAllowFrom,
  setTopLevelChannelGroupPolicy,
} from "../channels/plugins/onboarding/helpers.js";
export { promptChannelAccessConfig } from "../channels/plugins/onboarding/channel-access.js";

// ---------------------------------------------------------------------------
// Agent tool helpers and DM security policy
// ---------------------------------------------------------------------------

export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "../agents/tools/common.js";
export { formatDocsLink } from "../terminal/links.js";
export {
  DM_GROUP_ACCESS_REASON,
  readStoreAllowFromForDmPolicy,
  resolveDmAllowState,
  resolveDmGroupAccessDecision,
  resolveDmGroupAccessWithCommandGate,
  resolveDmGroupAccessWithLists,
  resolveEffectiveAllowFromLists,
} from "../security/dm-policy-shared.js";
export type { DmGroupAccessReasonCode } from "../security/dm-policy-shared.js";

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export type { HookEntry } from "../hooks/types.js";

// ---------------------------------------------------------------------------
// General-purpose utilities (string, number, parsing, ANSI)
// ---------------------------------------------------------------------------

export { clamp, escapeRegExp, normalizeE164, safeParseJson, sleep } from "../utils.js";
export { stripAnsi } from "../terminal/ansi.js";
export { missingTargetError } from "../infra/outbound/target-errors.js";

// ---------------------------------------------------------------------------
// Logging and diagnostics
// ---------------------------------------------------------------------------

export { registerLogTransport } from "../logging/logger.js";
export type { LogTransport, LogTransportRecord } from "../logging/logger.js";
export {
  emitDiagnosticEvent,
  isDiagnosticsEnabled,
  onDiagnosticEvent,
} from "../infra/diagnostic-events.js";
export type {
  DiagnosticEventPayload,
  DiagnosticHeartbeatEvent,
  DiagnosticLaneDequeueEvent,
  DiagnosticLaneEnqueueEvent,
  DiagnosticMessageProcessedEvent,
  DiagnosticMessageQueuedEvent,
  DiagnosticRunAttemptEvent,
  DiagnosticSessionState,
  DiagnosticSessionStateEvent,
  DiagnosticSessionStuckEvent,
  DiagnosticUsageEvent,
  DiagnosticWebhookErrorEvent,
  DiagnosticWebhookProcessedEvent,
  DiagnosticWebhookReceivedEvent,
} from "../infra/diagnostic-events.js";

// ---------------------------------------------------------------------------
// Media utilities (MIME, filenames, skills)
// ---------------------------------------------------------------------------

export { detectMime, extensionForMime, getFileExtension } from "../media/mime.js";
export { extractOriginalFilename } from "../media/store.js";
export { listSkillCommandsForAgents } from "../auto-reply/skill-commands.js";
export type { SkillCommandSpec } from "../agents/skills.js";

// ---------------------------------------------------------------------------
// Web media utilities
// ---------------------------------------------------------------------------

export { loadWebMedia, type WebMediaResult } from "../web/media.js";

// ---------------------------------------------------------------------------
// Context engine
// ---------------------------------------------------------------------------

export type {
  ContextEngine,
  ContextEngineInfo,
  AssembleResult,
  CompactResult,
  IngestResult,
  IngestBatchResult,
  BootstrapResult,
  SubagentSpawnPreparation,
  SubagentEndReason,
} from "../context-engine/types.js";
export { registerContextEngine } from "../context-engine/registry.js";
export type { ContextEngineFactory } from "../context-engine/registry.js";

// ---------------------------------------------------------------------------
// Model authentication (plugins should prefer runtime.modelAuth)
// ---------------------------------------------------------------------------

export { requireApiKey } from "../agents/model-auth.js";
export type { ResolvedProviderAuth } from "../agents/model-auth.js";

// ---------------------------------------------------------------------------
// Security utilities
// ---------------------------------------------------------------------------

export { redactSensitiveText } from "../logging/redact.js";
