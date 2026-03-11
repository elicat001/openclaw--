import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import { createOutboundSendDepsFromCliSource } from "./outbound-send-mapping.js";

export type CliDeps = Record<string, never>;

export function createDefaultDeps(): CliDeps {
  return {};
}

export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return createOutboundSendDepsFromCliSource(deps);
}
