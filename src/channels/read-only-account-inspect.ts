import type { OpenClawConfig } from "../config/config.js";
import type { ChannelId } from "./plugins/types.js";

export type ReadOnlyInspectedAccount = Record<string, unknown>;

export function inspectReadOnlyChannelAccount(_params: {
  channelId: ChannelId;
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ReadOnlyInspectedAccount | null {
  return null;
}
