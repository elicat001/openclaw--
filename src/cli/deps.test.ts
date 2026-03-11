import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDeps } from "./deps.js";

const moduleLoads = vi.hoisted(() => ({
  whatsapp: vi.fn(),
}));

const sendFns = vi.hoisted(() => ({
  whatsapp: vi.fn(async () => ({ messageId: "w1", toJid: "whatsapp:1" })),
}));

vi.mock("../channels/web/index.js", () => {
  moduleLoads.whatsapp();
  return { sendMessageWhatsApp: sendFns.whatsapp };
});

describe("createDefaultDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not load provider modules until a dependency is used", async () => {
    const deps = createDefaultDeps();

    expect(moduleLoads.whatsapp).not.toHaveBeenCalled();

    const sendWhatsApp = deps.sendMessageWhatsApp as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await sendWhatsApp("chat", "hello", { verbose: false });

    expect(moduleLoads.whatsapp).toHaveBeenCalledTimes(1);
    expect(sendFns.whatsapp).toHaveBeenCalledTimes(1);
  });

  it("reuses module cache after first dynamic import", async () => {
    const deps = createDefaultDeps();
    const sendWhatsApp = deps.sendMessageWhatsApp as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await sendWhatsApp("chat", "first", { verbose: false });
    await sendWhatsApp("chat", "second", { verbose: false });

    expect(moduleLoads.whatsapp).toHaveBeenCalledTimes(1);
    expect(sendFns.whatsapp).toHaveBeenCalledTimes(2);
  });
});
