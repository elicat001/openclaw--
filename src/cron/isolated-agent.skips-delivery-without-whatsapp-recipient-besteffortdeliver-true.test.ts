import "./isolated-agent.mocks.js";
import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import type { CliDeps } from "../cli/deps.js";
import {
  createCliDeps,
  expectDirectWhatsAppDelivery,
  mockAgentPayloads,
  runWhatsAppAnnounceTurn,
} from "./isolated-agent.delivery.test-helpers.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
import {
  makeCfg,
  makeJob,
  withTempCronHome as withTempHome,
  writeSessionStore,
} from "./isolated-agent.test-harness.js";
import { setupIsolatedAgentTurnMocks } from "./isolated-agent.test-setup.js";

const WHATSAPP_TARGET = { mode: "announce", channel: "whatsapp", to: "123" } as const;
async function runExplicitWhatsAppAnnounceTurn(params: {
  home: string;
  storePath: string;
  deps: CliDeps;
  deliveryContract?: "cron-owned" | "shared";
}): Promise<Awaited<ReturnType<typeof runCronIsolatedAgentTurn>>> {
  return runWhatsAppAnnounceTurn({
    ...params,
    delivery: WHATSAPP_TARGET,
  });
}

async function withWhatsAppAnnounceFixture(
  run: (params: { home: string; storePath: string; deps: CliDeps }) => Promise<void>,
  params?: {
    deps?: Partial<CliDeps>;
    sessionStore?: { lastProvider?: string; lastTo?: string };
  },
): Promise<void> {
  await withTempHome(async (home) => {
    const storePath = await writeSessionStore(home, {
      lastProvider: params?.sessionStore?.lastProvider ?? "webchat",
      lastTo: params?.sessionStore?.lastTo ?? "",
    });
    const deps = createCliDeps(params?.deps);
    await run({ home, storePath, deps });
  });
}

function expectDeliveredOk(result: Awaited<ReturnType<typeof runCronIsolatedAgentTurn>>): void {
  expect(result.status).toBe("ok");
  expect(result.delivered).toBe(true);
}

async function expectBestEffortWhatsAppNotDelivered(
  payload: Record<string, unknown>,
): Promise<void> {
  await expectStructuredWhatsAppFailure({
    payload,
    bestEffort: true,
    expectedStatus: "ok",
    expectDeliveryAttempted: true,
  });
}

async function expectStructuredWhatsAppFailure(params: {
  payload: Record<string, unknown>;
  bestEffort: boolean;
  expectedStatus: "ok" | "error";
  expectedErrorFragment?: string;
  expectDeliveryAttempted?: boolean;
}): Promise<void> {
  await withWhatsAppAnnounceFixture(
    async ({ home, storePath, deps }) => {
      mockAgentPayloads([params.payload]);
      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: {
          ...WHATSAPP_TARGET,
          ...(params.bestEffort ? { bestEffort: true } : {}),
        },
      });

      expect(res.status).toBe(params.expectedStatus);
      if (params.expectedStatus === "ok") {
        expect(res.delivered).toBe(false);
      }
      if (params.expectDeliveryAttempted !== undefined) {
        expect(res.deliveryAttempted).toBe(params.expectDeliveryAttempted);
      }
      if (params.expectedErrorFragment) {
        expect(res.error).toContain(params.expectedErrorFragment);
      }
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
    },
    {
      deps: {
        sendMessageWhatsApp: vi.fn().mockRejectedValue(new Error("boom")),
      },
    },
  );
}

async function runWhatsAppDeliveryResult(bestEffort: boolean) {
  let outcome:
    | {
        res: Awaited<ReturnType<typeof runCronIsolatedAgentTurn>>;
        deps: CliDeps;
      }
    | undefined;
  await withWhatsAppAnnounceFixture(async ({ home, storePath, deps }) => {
    mockAgentPayloads([{ text: "hello from cron" }]);
    const res = await runWhatsAppAnnounceTurn({
      home,
      storePath,
      deps,
      delivery: {
        mode: "announce",
        channel: "whatsapp",
        to: "123",
        bestEffort,
      },
    });
    outcome = { res, deps };
  });
  if (!outcome) {
    throw new Error("whatsapp delivery did not produce an outcome");
  }
  return outcome;
}

async function assertExplicitWhatsAppTargetDelivery(params: {
  home: string;
  storePath: string;
  deps: CliDeps;
  payloads: Array<Record<string, unknown>>;
  expectedText: string;
}): Promise<void> {
  mockAgentPayloads(params.payloads);
  const res = await runExplicitWhatsAppAnnounceTurn({
    home: params.home,
    storePath: params.storePath,
    deps: params.deps,
  });

  expectDeliveredOk(res);
  expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
  expectDirectWhatsAppDelivery(params.deps, {
    to: "123",
    text: params.expectedText,
  });
}

describe("runCronIsolatedAgentTurn", () => {
  beforeEach(() => {
    setupIsolatedAgentTurnMocks();
  });

  it("delivers explicit targets with direct and final-payload text", async () => {
    await withWhatsAppAnnounceFixture(async ({ home, storePath, deps }) => {
      await assertExplicitWhatsAppTargetDelivery({
        home,
        storePath,
        deps,
        payloads: [{ text: "hello from cron" }],
        expectedText: "hello from cron",
      });
      vi.clearAllMocks();
      await assertExplicitWhatsAppTargetDelivery({
        home,
        storePath,
        deps,
        payloads: [{ text: "Working on it..." }, { text: "Final weather summary" }],
        expectedText: "Final weather summary",
      });
    });
  });

  it("delivers explicit targets directly with per-channel-peer session scoping", async () => {
    await withWhatsAppAnnounceFixture(async ({ home, storePath, deps }) => {
      mockAgentPayloads([{ text: "hello from cron" }]);

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath, {
          session: {
            store: storePath,
            mainKey: "main",
            dmScope: "per-channel-peer",
          },
          channels: {
            whatsapp: {},
          },
        }),
        deps,
        job: {
          ...makeJob({ kind: "agentTurn", message: "do it" }),
          delivery: { mode: "announce", channel: "whatsapp", to: "123" },
        },
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expectDeliveredOk(res);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expectDirectWhatsAppDelivery(deps, {
        to: "123",
        text: "hello from cron",
      });
    });
  });

  it("routes threaded announce targets through direct delivery", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            "agent:main:main": {
              sessionId: "main-session",
              updatedAt: Date.now(),
              lastChannel: "whatsapp",
              lastTo: "123",
            },
          },
          null,
          2,
        ),
        "utf-8",
      );
      const deps = createCliDeps();
      mockAgentPayloads([{ text: "Final weather summary" }]);
      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "last" },
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(true);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expectDirectWhatsAppDelivery(deps, {
        to: "123",
        text: "Final weather summary",
      });
    });
  });

  it("skips announce when messaging tool already sent to target", async () => {
    await withWhatsAppAnnounceFixture(async ({ home, storePath, deps }) => {
      mockAgentPayloads([{ text: "sent" }], {
        didSendViaMessagingTool: true,
        messagingToolSentTargets: [{ tool: "message", provider: "whatsapp", to: "123" }],
      });

      const res = await runExplicitWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        deliveryContract: "shared",
      });

      expectDeliveredOk(res);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageWhatsApp).not.toHaveBeenCalled();
    });
  });

  it("reports not-delivered when best-effort structured outbound sends all fail", async () => {
    await expectBestEffortWhatsAppNotDelivered({
      text: "caption",
      mediaUrl: "https://example.com/img.png",
    });
  });

  it("skips announce for heartbeat-only output", async () => {
    await withWhatsAppAnnounceFixture(async ({ home, storePath, deps }) => {
      mockAgentPayloads([{ text: "HEARTBEAT_OK" }]);
      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "whatsapp", to: "123" },
      });

      expect(res.status).toBe("ok");
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageWhatsApp).not.toHaveBeenCalled();
    });
  });

  it("fails when structured direct delivery fails and best-effort is disabled", async () => {
    await expectStructuredWhatsAppFailure({
      payload: { text: "hello from cron", mediaUrl: "https://example.com/img.png" },
      bestEffort: false,
      expectedStatus: "error",
      expectedErrorFragment: "boom",
    });
  });

  it("reports not-delivered when text direct delivery fails and best-effort is enabled", async () => {
    await withWhatsAppAnnounceFixture(
      async ({ home, storePath, deps }) => {
        mockAgentPayloads([{ text: "hello from cron" }]);

        const res = await runWhatsAppAnnounceTurn({
          home,
          storePath,
          deps,
          delivery: {
            mode: "announce",
            channel: "whatsapp",
            to: "123",
            bestEffort: true,
          },
        });

        expect(res.status).toBe("ok");
        expect(res.delivered).toBe(false);
        expect(res.deliveryAttempted).toBe(true);
        expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
        expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
      },
      {
        deps: {
          sendMessageWhatsApp: vi.fn().mockRejectedValue(new Error("boom")),
        },
      },
    );
  });

  it("delivers text directly when best-effort is disabled", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockAgentPayloads([{ text: "hello from cron" }]);

      const res = await runWhatsAppAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: {
          mode: "announce",
          channel: "whatsapp",
          to: "123",
          bestEffort: false,
        },
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(true);
      expect(res.deliveryAttempted).toBe(true);
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expectDirectWhatsAppDelivery(deps, {
        to: "123",
        text: "hello from cron",
      });
    });
  });

  it("returns error when text direct delivery fails and best-effort is disabled", async () => {
    await withWhatsAppAnnounceFixture(
      async ({ home, storePath, deps }) => {
        mockAgentPayloads([{ text: "hello from cron" }]);

        const res = await runWhatsAppAnnounceTurn({
          home,
          storePath,
          deps,
          delivery: {
            mode: "announce",
            channel: "whatsapp",
            to: "123",
            bestEffort: false,
          },
        });

        expect(res.status).toBe("error");
        expect(res.delivered).toBeUndefined();
        expect(res.deliveryAttempted).toBe(true);
        expect(res.error).toContain("boom");
        expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
        expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
      },
      {
        deps: {
          sendMessageWhatsApp: vi.fn().mockRejectedValue(new Error("boom")),
        },
      },
    );
  });

  it("retries transient text direct delivery failures before succeeding", async () => {
    const previousFastMode = process.env.OPENCLAW_TEST_FAST;
    process.env.OPENCLAW_TEST_FAST = "1";
    try {
      await withWhatsAppAnnounceFixture(
        async ({ home, storePath, deps }) => {
          mockAgentPayloads([{ text: "hello from cron" }]);

          const res = await runWhatsAppAnnounceTurn({
            home,
            storePath,
            deps,
            delivery: {
              mode: "announce",
              channel: "whatsapp",
              to: "123",
              bestEffort: false,
            },
          });

          expect(res.status).toBe("ok");
          expect(res.delivered).toBe(true);
          expect(res.deliveryAttempted).toBe(true);
          expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
          expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(2);
          expect(deps.sendMessageWhatsApp).toHaveBeenLastCalledWith(
            "123",
            "hello from cron",
            expect.objectContaining({ cfg: expect.any(Object) }),
          );
        },
        {
          deps: {
            sendMessageWhatsApp: vi
              .fn()
              .mockRejectedValueOnce(new Error("UNAVAILABLE: temporary network error"))
              .mockResolvedValue({ messageId: "w7", to: "123", text: "hello from cron" }),
          },
        },
      );
    } finally {
      if (previousFastMode === undefined) {
        delete process.env.OPENCLAW_TEST_FAST;
      } else {
        process.env.OPENCLAW_TEST_FAST = previousFastMode;
      }
    }
  });

  it("delivers text directly when best-effort is enabled", async () => {
    const { res, deps } = await runWhatsAppDeliveryResult(true);
    expect(res.status).toBe("ok");
    expect(res.delivered).toBe(true);
    expect(res.deliveryAttempted).toBe(true);
    expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
    expectDirectWhatsAppDelivery(deps, {
      to: "123",
      text: "hello from cron",
    });
  });

  it("ignores structured direct delivery failures when best-effort is enabled", async () => {
    await expectBestEffortWhatsAppNotDelivered({
      text: "hello from cron",
      mediaUrl: "https://example.com/img.png",
    });
  });
});
