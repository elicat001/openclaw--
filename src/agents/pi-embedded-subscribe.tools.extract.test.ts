import { beforeEach, describe, expect, it } from "vitest";
import { feishuPlugin } from "../../extensions/feishu/src/channel.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import { extractMessagingToolSend } from "./pi-embedded-subscribe.tools.js";

describe("extractMessagingToolSend", () => {
  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "feishu", plugin: feishuPlugin, source: "test" }]),
    );
  });

  it("uses channel as provider for message tool", () => {
    const result = extractMessagingToolSend("message", {
      action: "send",
      channel: "feishu",
      to: "123",
    });

    expect(result?.tool).toBe("message");
    expect(result?.provider).toBe("feishu");
    expect(result?.to).toBe("feishu:123");
  });

  it("prefers provider when both provider and channel are set", () => {
    const result = extractMessagingToolSend("message", {
      action: "send",
      provider: "feishu",
      channel: "feishu",
      to: "group:G1",
    });

    expect(result?.tool).toBe("message");
    expect(result?.provider).toBe("feishu");
    expect(result?.to).toBe("group:G1");
  });

  it("accepts target alias when to is omitted", () => {
    const result = extractMessagingToolSend("message", {
      action: "send",
      channel: "feishu",
      target: "123",
    });

    expect(result?.tool).toBe("message");
    expect(result?.provider).toBe("feishu");
    expect(result?.to).toBe("feishu:123");
  });
});
