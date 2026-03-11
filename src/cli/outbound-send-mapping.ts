import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

export type CliOutboundSendSource = Record<string, never>;

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDepsFromCliSource(
  _deps: CliOutboundSendSource,
): OutboundSendDeps {
  return {};
}
