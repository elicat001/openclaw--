import { expect, vi } from "vitest";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import type { CliDeps } from "../cli/deps.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
import { makeCfg, makeJob } from "./isolated-agent.test-harness.js";

export function createCliDeps(): CliDeps {
  return {} as CliDeps;
}

export function mockAgentPayloads(
  payloads: Array<Record<string, unknown>>,
  extra: Partial<Awaited<ReturnType<typeof runEmbeddedPiAgent>>> = {},
): void {
  vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
    payloads,
    meta: {
      durationMs: 5,
      agentMeta: { sessionId: "s", provider: "p", model: "m" },
    },
    ...extra,
  });
}

export function expectDirectWhatsAppDelivery(deps: CliDeps, params: { to: string; text: string }) {
  expect(deps.sendMessageWhatsApp).toHaveBeenCalledTimes(1);
  expect(deps.sendMessageWhatsApp).toHaveBeenCalledWith(
    params.to,
    params.text,
    expect.objectContaining({}),
  );
}

export async function runWhatsAppAnnounceTurn(params: {
  home: string;
  storePath: string;
  deps: CliDeps;
  delivery: {
    mode: "announce";
    channel: string;
    to?: string;
    bestEffort?: boolean;
  };
  deliveryContract?: "cron-owned" | "shared";
}): Promise<Awaited<ReturnType<typeof runCronIsolatedAgentTurn>>> {
  return runCronIsolatedAgentTurn({
    cfg: makeCfg(params.home, params.storePath, {
      channels: { whatsapp: {} },
    }),
    deps: params.deps,
    job: {
      ...makeJob({ kind: "agentTurn", message: "do it" }),
      delivery: params.delivery,
    },
    message: "do it",
    sessionKey: "cron:job-1",
    lane: "cron",
    deliveryContract: params.deliveryContract,
  });
}
