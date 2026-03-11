import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

export type CliOutboundSendSource = {
  sendMessageWhatsApp: OutboundSendDeps["sendWhatsApp"];
};

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDepsFromCliSource(deps: CliOutboundSendSource): OutboundSendDeps {
  return {
    sendWhatsApp: deps.sendMessageWhatsApp,
  };
}
