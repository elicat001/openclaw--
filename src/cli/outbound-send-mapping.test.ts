import { describe, expect, it, vi } from "vitest";
import {
  createOutboundSendDepsFromCliSource,
  type CliOutboundSendSource,
} from "./outbound-send-mapping.js";

describe("createOutboundSendDepsFromCliSource", () => {
  it("maps CLI send deps to outbound send deps", () => {
    const deps: CliOutboundSendSource = {
      sendMessageWhatsApp: vi.fn() as CliOutboundSendSource["sendMessageWhatsApp"],
    };

    const outbound = createOutboundSendDepsFromCliSource(deps);

    expect(outbound).toEqual({
      sendWhatsApp: deps.sendMessageWhatsApp,
    });
  });
});
