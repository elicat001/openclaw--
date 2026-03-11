import { describe, expect, it } from "vitest";
import {
  resolveWhatsAppGroupRequireMention,
  resolveWhatsAppGroupToolPolicy,
} from "./group-mentions.js";

describe("group mentions (whatsapp)", () => {
  it("uses generic channel group policy helpers", () => {
    const whatsappCfg = {
      channels: {
        whatsapp: {
          groups: {
            "120363001234567890@g.us": {
              requireMention: false,
              tools: { deny: ["exec"] },
            },
            "*": {
              requireMention: true,
              tools: { allow: ["message.send"] },
            },
          },
        },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    } as any;

    expect(
      resolveWhatsAppGroupRequireMention({
        cfg: whatsappCfg,
        groupId: "120363001234567890@g.us",
      }),
    ).toBe(false);
    expect(resolveWhatsAppGroupRequireMention({ cfg: whatsappCfg, groupId: "other@g.us" })).toBe(
      true,
    );
    expect(
      resolveWhatsAppGroupToolPolicy({
        cfg: whatsappCfg,
        groupId: "120363001234567890@g.us",
      }),
    ).toEqual({ deny: ["exec"] });
    expect(resolveWhatsAppGroupToolPolicy({ cfg: whatsappCfg, groupId: "other@g.us" })).toEqual({
      allow: ["message.send"],
    });
  });
});
