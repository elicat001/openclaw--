import "./isolated-agent.mocks.js";
import { beforeEach, describe, expect, it } from "vitest";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import {
  createCliDeps,
  expectDirectWhatsAppDelivery,
  mockAgentPayloads,
  runWhatsAppAnnounceTurn,
} from "./isolated-agent.delivery.test-helpers.js";
import { withTempCronHome, writeSessionStore } from "./isolated-agent.test-harness.js";
import { setupIsolatedAgentTurnMocks } from "./isolated-agent.test-setup.js";

describe("runCronIsolatedAgentTurn whatsapp delivery", () => {
  beforeEach(() => {
    setupIsolatedAgentTurnMocks();
  });

  it("routes whatsapp targets through the correct delivery path", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockAgentPayloads([{ text: "whatsapp message" }]);

      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "whatsapp", to: "123" },
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(true);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expectDirectWhatsAppDelivery(deps, {
        to: "123",
        text: "whatsapp message",
      });
    });
  });
});
