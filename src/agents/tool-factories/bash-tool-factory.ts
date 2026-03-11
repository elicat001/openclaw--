import {
  createExecTool,
  createProcessTool,
  type ExecToolDefaults,
  type ProcessToolDefaults,
} from "../bash-tools.js";
import type { AnyAgentTool } from "../pi-tools.types.js";
import { defaultToolRegistry, type ToolCreationContext } from "../tool-registry.js";

/**
 * Extract exec and process tool creation into a standalone factory.
 *
 * The factory reads pre-computed values from `context.options` to avoid
 * duplicating the config-resolution logic that lives in pi-tools.ts.
 */
function createBashTools(context: ToolCreationContext): AnyAgentTool[] {
  const opts = context.options as {
    exec?: ExecToolDefaults & ProcessToolDefaults;
    sessionKey?: string;
    messageProvider?: string;
    agentAccountId?: string;
    currentChannelId?: string;
    currentThreadTs?: string;
    // Pre-computed values injected by pi-tools.ts before calling the registry.
    _execConfig?: Record<string, unknown>;
    _scopeKey?: string;
    _allowBackground?: boolean;
    _sandbox?: {
      containerName: string;
      workspaceDir: string;
      containerWorkdir?: string;
      docker: { env?: Record<string, string> };
    };
  };

  const execConfig = opts._execConfig ?? ({} as Record<string, unknown>);
  const scopeKey = opts._scopeKey;
  const allowBackground = opts._allowBackground ?? false;
  const sandbox = opts._sandbox;

  const { cleanupMs: cleanupMsOverride, ...execDefaults } = opts.exec ?? {};

  const execTool = createExecTool({
    ...execDefaults,
    host: (opts.exec?.host ?? execConfig.host) as ExecToolDefaults["host"],
    security: (opts.exec?.security ?? execConfig.security) as ExecToolDefaults["security"],
    ask: (opts.exec?.ask ?? execConfig.ask) as ExecToolDefaults["ask"],
    node: (opts.exec?.node ?? execConfig.node) as ExecToolDefaults["node"],
    pathPrepend: (opts.exec?.pathPrepend ??
      execConfig.pathPrepend) as ExecToolDefaults["pathPrepend"],
    safeBins: (opts.exec?.safeBins ?? execConfig.safeBins) as ExecToolDefaults["safeBins"],
    safeBinTrustedDirs: (opts.exec?.safeBinTrustedDirs ??
      execConfig.safeBinTrustedDirs) as ExecToolDefaults["safeBinTrustedDirs"],
    safeBinProfiles: (opts.exec?.safeBinProfiles ??
      execConfig.safeBinProfiles) as ExecToolDefaults["safeBinProfiles"],
    agentId: context.agentId,
    cwd: context.workspaceRoot,
    allowBackground,
    scopeKey,
    sessionKey: opts.sessionKey,
    messageProvider: opts.messageProvider,
    currentChannelId: opts.currentChannelId,
    currentThreadTs: opts.currentThreadTs,
    accountId: opts.agentAccountId,
    backgroundMs: (opts.exec?.backgroundMs ?? execConfig.backgroundMs) as number | undefined,
    timeoutSec: (opts.exec?.timeoutSec ?? execConfig.timeoutSec) as number | undefined,
    approvalRunningNoticeMs: (opts.exec?.approvalRunningNoticeMs ??
      execConfig.approvalRunningNoticeMs) as number | undefined,
    notifyOnExit: (opts.exec?.notifyOnExit ?? execConfig.notifyOnExit) as boolean | undefined,
    notifyOnExitEmptySuccess: (opts.exec?.notifyOnExitEmptySuccess ??
      execConfig.notifyOnExitEmptySuccess) as boolean | undefined,
    sandbox: sandbox
      ? {
          containerName: sandbox.containerName,
          workspaceDir: sandbox.workspaceDir,
          containerWorkdir: sandbox.containerWorkdir ?? sandbox.workspaceDir,
          env: sandbox.docker.env,
        }
      : undefined,
  });

  const processTool = createProcessTool({
    cleanupMs: (cleanupMsOverride ?? execConfig.cleanupMs) as number | undefined,
    scopeKey,
  });

  return [execTool as unknown as AnyAgentTool, processTool as unknown as AnyAgentTool];
}

defaultToolRegistry.register({
  id: "bash-tools",
  priority: 200,
  create: createBashTools,
});
