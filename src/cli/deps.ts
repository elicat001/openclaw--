import type { sendMessageWhatsApp } from "../channels/web/index.js";
import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import { createOutboundSendDepsFromCliSource } from "./outbound-send-mapping.js";

export type CliDeps = {
  sendMessageWhatsApp: typeof sendMessageWhatsApp;
};

let whatsappSenderRuntimePromise: Promise<typeof import("./deps-send-whatsapp.runtime.js")> | null =
  null;

function loadWhatsAppSenderRuntime() {
  whatsappSenderRuntimePromise ??= import("./deps-send-whatsapp.runtime.js");
  return whatsappSenderRuntimePromise;
}

export function createDefaultDeps(): CliDeps {
  return {
    sendMessageWhatsApp: async (...args) => {
      const { sendMessageWhatsApp } = await loadWhatsAppSenderRuntime();
      return await sendMessageWhatsApp(...args);
    },
  };
}

export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return createOutboundSendDepsFromCliSource(deps);
}

export { logWebSelfId } from "../web/auth-store.js";
