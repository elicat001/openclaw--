import type { OpenClawConfig } from "../../config/config.js";
import { listChannelAgentTools } from "../channel-tools.js";
import type { AnyAgentTool } from "../pi-tools.types.js";
import { defaultToolRegistry, type ToolCreationContext } from "../tool-registry.js";

/**
 * Channel docking tools (login, etc.) extracted as a standalone factory.
 */
function createChannelTools(context: ToolCreationContext): AnyAgentTool[] {
  const opts = context.options as { config?: OpenClawConfig };
  return listChannelAgentTools({ cfg: opts.config }) as AnyAgentTool[];
}

defaultToolRegistry.register({
  id: "channel-tools",
  priority: 100,
  create: createChannelTools,
});
