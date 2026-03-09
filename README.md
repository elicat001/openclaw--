# OpenClaw — 二次开发版

基于 [OpenClaw](https://github.com/openclaw/openclaw) 的二次开发版本，新增国内平台支持和互联网访问能力。

## 新增功能

### Agent Reach — 互联网访问模块

内置 15 个平台的互联网访问能力，AI agent 可以直接搜索、阅读、交互：

| 平台           | 后端工具           | 配置难度     |
| -------------- | ------------------ | ------------ |
| Web 网页       | curl + Jina Reader | 开箱即用     |
| YouTube        | yt-dlp             | 开箱即用     |
| GitHub         | gh CLI             | 开箱即用     |
| RSS/Atom       | feedparser         | 开箱即用     |
| Exa 搜索       | mcporter           | 开箱即用     |
| Twitter/X      | xreach             | 需要登录     |
| Bilibili / B站 | yt-dlp             | 需要代理     |
| Reddit         | curl               | 需要代理     |
| 微博           | mcporter           | 需要配置     |
| 小宇宙播客     | ffmpeg + Whisper   | 需要 API key |
| 小红书         | mcporter + Docker  | 需要 Cookie  |
| 抖音           | mcporter           | 需要配置     |
| 微信公众号     | camoufox + miku_ai | 需要配置     |
| LinkedIn       | curl / mcporter    | 基础可用     |
| Boss直聘       | curl / mcporter    | 基础可用     |

### 国内模型支持

- DeepSeek 系列模型
- 智谱 (ZhiPu) 系列模型

### 国内渠道扩展

- 钉钉 (DingTalk) 消息渠道
- 企业微信 (WeCom) 消息渠道

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 安装 Agent Reach 上游工具

```bash
# 基础工具（推荐全部安装）
brew install yt-dlp ffmpeg
npm install -g mcporter xreach-cli

# GitHub CLI
brew install gh && gh auth login

# Exa 搜索配置
mcporter config add exa https://mcp.exa.ai/mcp

# RSS 支持
pip3 install --user --break-system-packages feedparser

# 微信公众号支持
pip3 install --user --break-system-packages 'camoufox[geoip]' markdownify beautifulsoup4 miku_ai
```

### 构建

```bash
pnpm build      # 构建后端
pnpm ui:build   # 构建前端 UI
```

### 运行

```bash
openclaw gateway run
```

### 检查平台状态

启动 gateway 后，访问管理界面的 Admin Dashboard，查看 **Internet Access (Agent Reach)** 卡片，显示各平台可用状态。

API 接口：`GET /api/admin/status` 返回 `agentReach` 字段。

## 使用方式

Agent Reach 作为内置 Skill 集成，agent 运行时自动加载。直接用自然语言对话即可：

- "帮我搜一下推特上关于 AI 的讨论"
- "这个 YouTube 视频讲了什么？" + 链接
- "搜一下小红书上的旅行攻略"
- "看看 B 站这个视频" + 链接
- "搜一下微博热搜"
- "帮我读一下这篇微信文章" + 链接
- "GitHub 上 star 最多的 LLM 框架有哪些？"

## 项目结构（二次开发部分）

```
src/agent-reach/          # Agent Reach 核心模块（纯 TypeScript）
  ├── types.ts            # 类型定义
  ├── platforms.ts        # 15 个平台定义
  ├── doctor.ts           # 平台可用性检测
  └── index.ts            # 模块导出
src/gateway/admin-api.ts  # Admin API（含 Agent Reach 状态）
skills/agent-reach/       # Agent Reach Skill（agent 使用指南）
  └── SKILL.md
extensions/dingtalk/      # 钉钉渠道扩展
extensions/wecom/         # 企业微信渠道扩展
src/agents/deepseek-models.ts   # DeepSeek 模型配置
src/agents/zhipu-models.ts      # 智谱模型配置
ui/src/ui/views/admin.ts  # Admin Dashboard UI
```

## 上游项目

- [OpenClaw](https://github.com/openclaw/openclaw) — 原始项目
- [Agent Reach](https://github.com/Panniantong/Agent-Reach) — 互联网访问模块参考

## License

MIT
