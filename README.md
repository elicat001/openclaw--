# OpenClaw — 二次开发版

基于 [OpenClaw](https://github.com/openclaw/openclaw) 的二次开发版本，增强互联网访问能力、国内平台支持和反爬能力。

## 核心能力

### Agent Reach — 16 平台互联网访问

AI agent 可直接搜索、阅读、交互 16 个平台：

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
| Scrapling      | scrapling (Python) | 需要安装     |
| 小红书         | mcporter + Docker  | 需要 Cookie  |
| 抖音           | mcporter           | 需要配置     |
| 微信公众号     | camoufox + miku_ai | 需要配置     |
| LinkedIn       | curl / mcporter    | 基础可用     |
| Boss直聘       | curl / mcporter    | 基础可用     |

### Scrapling — 原生反爬工具

内置 Scrapling 作为原生工具（非 Skill），提供三种模式：

- **fast** — HTTP 指纹伪装，无需真实浏览器，速度最快
- **stealth** — 真实无头浏览器，可绕过 Cloudflare/WAF
- **dynamic** — Playwright 渲染，支持 JS 密集型 SPA 页面

支持 CSS 选择器提取、代理、Cloudflare 自动破解。当 `web_fetch` 遇到 403/503 反爬时自动降级使用。

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

### 安装上游工具

```bash
# 基础工具
brew install yt-dlp ffmpeg
npm install -g mcporter xreach-cli

# GitHub CLI
brew install gh && gh auth login

# Exa 搜索
mcporter config add exa https://mcp.exa.ai/mcp

# RSS
pip3 install --user --break-system-packages feedparser

# Scrapling（反爬工具）
pip3 install --user --break-system-packages "scrapling[all]" && scrapling install

# 微信公众号
pip3 install --user --break-system-packages 'camoufox[geoip]' markdownify beautifulsoup4 miku_ai
```

### 构建与运行

```bash
pnpm build      # 构建后端
pnpm ui:build   # 构建前端 UI
openclaw gateway run
```

### 检查平台状态

启动 gateway 后，Admin Dashboard 显示 **Internet Access (Agent Reach)** 卡片，展示 16 个平台的可用状态。

API：`GET /api/admin/status` → `agentReach` 字段。

## 使用方式

直接用自然语言对话：

- "帮我搜一下推特上关于 AI 的讨论"
- "这个 YouTube 视频讲了什么？" + 链接
- "搜一下小红书上的旅行攻略"
- "帮我抓取这个网页，它有 Cloudflare 保护"
- "搜一下微博热搜"
- "帮我读一下这篇微信文章" + 链接
- "GitHub 上 star 最多的 LLM 框架有哪些？"

## 项目结构（二次开发部分）

```
src/agent-reach/                # Agent Reach 核心模块
  ├── types.ts                  # 类型定义
  ├── platforms.ts              # 16 个平台定义
  ├── doctor.ts                 # 平台可用性检测
  └── index.ts                  # 模块导出
src/agents/tools/scrapling-tool.ts  # Scrapling 原生工具
src/agents/openclaw-tools.ts    # 工具注册
src/agents/tool-catalog.ts      # 工具目录
src/gateway/admin-api.ts        # Admin API
skills/agent-reach/SKILL.md     # Agent Reach 使用指南
extensions/dingtalk/            # 钉钉渠道扩展
extensions/wecom/               # 企业微信渠道扩展
src/agents/deepseek-models.ts   # DeepSeek 模型配置
src/agents/zhipu-models.ts      # 智谱模型配置
```

## 上游项目

- [OpenClaw](https://github.com/openclaw/openclaw) — 原始项目
- [Scrapling](https://github.com/D4Vinci/Scrapling) — 自适应 Python 爬虫框架

## License

MIT
