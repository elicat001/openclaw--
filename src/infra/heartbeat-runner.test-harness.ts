import { beforeEach } from "vitest";
import { feishuPlugin } from "../../extensions/feishu/src/channel.js";
import { setFeishuRuntime } from "../../extensions/feishu/src/runtime.js";
import type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createPluginRuntime } from "../plugins/runtime/index.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";

const feishuChannelPlugin = feishuPlugin as unknown as ChannelPlugin;

export function installHeartbeatRunnerTestRuntime(_params?: { includeSlack?: boolean }): void {
  beforeEach(() => {
    const runtime = createPluginRuntime();
    setFeishuRuntime(runtime);
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "feishu", plugin: feishuChannelPlugin, source: "test" }]),
    );
  });
}
