import { createApplyPatchTool } from "../apply-patch.js";
import type { AnyAgentTool } from "../pi-tools.types.js";
import type { SandboxFsBridge } from "../sandbox/fs-bridge.js";
import { defaultToolRegistry, type ToolCreationContext } from "../tool-registry.js";

/**
 * apply_patch tool extracted as a standalone factory.
 *
 * Pre-computed gating flags are passed via `context.options._applyPatch*`
 * to keep config-resolution logic in pi-tools.ts.
 */
function createApplyPatchTools(context: ToolCreationContext): AnyAgentTool[] {
  const opts = context.options as {
    _applyPatchEnabled?: boolean;
    _applyPatchWorkspaceOnly?: boolean;
    _sandboxRoot?: string;
    _sandboxFsBridge?: SandboxFsBridge;
    _allowWorkspaceWrites?: boolean;
  };

  const applyPatchEnabled = opts._applyPatchEnabled ?? false;
  const sandboxRoot = opts._sandboxRoot;
  const sandboxFsBridge = opts._sandboxFsBridge;
  const allowWorkspaceWrites = opts._allowWorkspaceWrites ?? true;
  const applyPatchWorkspaceOnly = opts._applyPatchWorkspaceOnly ?? true;

  if (!applyPatchEnabled || (sandboxRoot && !allowWorkspaceWrites)) {
    return [];
  }

  const tool = createApplyPatchTool({
    cwd: sandboxRoot ?? context.workspaceRoot,
    sandbox:
      sandboxRoot && allowWorkspaceWrites
        ? { root: sandboxRoot, bridge: sandboxFsBridge! }
        : undefined,
    workspaceOnly: applyPatchWorkspaceOnly,
  });

  return [tool as unknown as AnyAgentTool];
}

defaultToolRegistry.register({
  id: "apply-patch-tools",
  // Higher priority than bash-tools to match the original array order
  // (apply_patch appeared before exec/process in the original tools array).
  priority: 300,
  create: createApplyPatchTools,
});
