---
title: Plugin Development Guide
description: Guide for developing OpenClaw plugins and extensions
---

# Plugin Development Guide

This guide covers how to create, test, and publish OpenClaw plugins.

## Quick Start

### 1. Create a new extension

```bash
mkdir extensions/my-plugin
cd extensions/my-plugin
```

### 2. Add package.json

```json
{
  "name": "@openclaw/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "openclaw": "*"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

### 3. Add plugin manifest

Create `openclaw.plugin.json`:

```json
{
  "name": "my-plugin",
  "displayName": "My Plugin",
  "description": "Description of what your plugin does",
  "version": "1.0.0",
  "entrypoint": "src/index.ts"
}
```

### 4. Write plugin code

```typescript
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/core";

const plugin: OpenClawPluginDefinition = {
  register(runtime) {
    // Register hooks, channels, tools, etc.
    runtime.hooks.on("agent:before-start", async (ctx) => {
      // Hook logic here
    });
  },
};

export default plugin;
```

## Plugin SDK API

### Runtime Object

The `runtime` object passed to `register()` provides:

| Property          | Description                         |
| ----------------- | ----------------------------------- |
| `runtime.hooks`   | Register lifecycle hooks            |
| `runtime.config`  | Access and modify configuration     |
| `runtime.system`  | System-level operations             |
| `runtime.media`   | Media processing utilities          |
| `runtime.logging` | Structured logging                  |
| `runtime.channel` | Channel registration and management |
| `runtime.tools`   | Register custom agent tools         |

### Available Hooks

| Hook                    | Description                              |
| ----------------------- | ---------------------------------------- |
| `agent:before-start`    | Before an agent run begins               |
| `agent:after-complete`  | After an agent run completes             |
| `message:before-send`   | Before sending a message to a channel    |
| `message:after-receive` | After receiving a message from a channel |
| `gateway:start`         | When gateway starts                      |
| `gateway:stop`          | When gateway stops                       |
| `config:reload`         | When configuration is reloaded           |

### Channel Plugin

To create a messaging channel plugin:

```typescript
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/core";
import type { ChannelMeta } from "openclaw/plugin-sdk";

const channelMeta: ChannelMeta = {
  id: "my-channel",
  name: "My Channel",
  icon: "chat",
};

const plugin: OpenClawPluginDefinition = {
  register(runtime) {
    runtime.channel.register({
      meta: channelMeta,
      setup: async (input) => {
        /* setup logic */
      },
      poll: async (ctx) => {
        /* poll for new messages */
      },
      send: async (ctx) => {
        /* send message */
      },
    });
  },
};

export default plugin;
```

## Testing

Use the test utilities provided by the SDK:

```typescript
import { createPluginRuntimeMock } from "openclaw/plugin-sdk/test-utils";
import { describe, it, expect } from "vitest";

describe("my-plugin", () => {
  it("should register hooks", () => {
    const runtime = createPluginRuntimeMock();
    plugin.register(runtime);
    // Assert hooks were registered
  });
});
```

Run tests:

```bash
pnpm test extensions/my-plugin
```

## Environment Variables for Providers

When integrating with AI providers, use these env vars:

| Provider      | Environment Variable     |
| ------------- | ------------------------ |
| DeepSeek      | `DEEPSEEK_API_KEY`       |
| Zhipu GLM     | `ZHIPU_API_KEY`          |
| Qwen          | `QWEN_PORTAL_API_KEY`    |
| Moonshot/Kimi | `MOONSHOT_API_KEY`       |
| Doubao        | `VOLCANO_ENGINE_API_KEY` |
| OpenAI        | `OPENAI_API_KEY`         |
| Anthropic     | `ANTHROPIC_API_KEY`      |

## Publishing

```bash
cd extensions/my-plugin
npm publish --access public
```
