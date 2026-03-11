import * as compatSdk from "openclaw/plugin-sdk/compat";
import { describe, expect, it } from "vitest";

const bundledExtensionSubpathLoaders = [
  { id: "acpx", load: () => import("openclaw/plugin-sdk/acpx") },
  { id: "copilot-proxy", load: () => import("openclaw/plugin-sdk/copilot-proxy") },
  { id: "device-pair", load: () => import("openclaw/plugin-sdk/device-pair") },
  { id: "diagnostics-otel", load: () => import("openclaw/plugin-sdk/diagnostics-otel") },
  { id: "diffs", load: () => import("openclaw/plugin-sdk/diffs") },
  { id: "feishu", load: () => import("openclaw/plugin-sdk/feishu") },
  {
    id: "google-gemini-cli-auth",
    load: () => import("openclaw/plugin-sdk/google-gemini-cli-auth"),
  },
  { id: "llm-task", load: () => import("openclaw/plugin-sdk/llm-task") },
  { id: "lobster", load: () => import("openclaw/plugin-sdk/lobster") },
  { id: "memory-core", load: () => import("openclaw/plugin-sdk/memory-core") },
  { id: "memory-lancedb", load: () => import("openclaw/plugin-sdk/memory-lancedb") },
  {
    id: "minimax-portal-auth",
    load: () => import("openclaw/plugin-sdk/minimax-portal-auth"),
  },
  { id: "open-prose", load: () => import("openclaw/plugin-sdk/open-prose") },
  { id: "qwen-portal-auth", load: () => import("openclaw/plugin-sdk/qwen-portal-auth") },
  { id: "test-utils", load: () => import("openclaw/plugin-sdk/test-utils") },
  { id: "thread-ownership", load: () => import("openclaw/plugin-sdk/thread-ownership") },
] as const;

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
  });

  it("resolves bundled extension subpaths", async () => {
    for (const { id, load } of bundledExtensionSubpathLoaders) {
      const mod = await load();
      expect(typeof mod).toBe("object");
      expect(mod, `subpath ${id} should resolve`).toBeTruthy();
    }
  });
});
