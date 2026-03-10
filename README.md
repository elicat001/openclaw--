<p align="center">
  <img src="https://openclaw.ai/logo.svg" width="80" alt="OpenClaw" />
</p>

<h1 align="center">OpenClaw CN</h1>

<p align="center">
  基于 <a href="https://github.com/openclaw/openclaw">OpenClaw v2026.3.8</a> 的中国区增强版<br/>
  <strong>16 平台互联网接入 · 国产大模型 · 钉钉/企微渠道 · 反爬引擎</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/upstream-v2026.3.8-blue" alt="upstream" />
  <img src="https://img.shields.io/badge/custom_code-2100_lines-green" alt="custom code" />
  <img src="https://img.shields.io/badge/tests-26_cases-brightgreen" alt="tests" />
  <img src="https://img.shields.io/badge/platforms-16-orange" alt="platforms" />
</p>

---

## 与上游的区别

本 fork 在 OpenClaw 基础上新增 ~2100 行代码，**零侵入**上游架构（全部为新增文件或追加注册），可持续跟进上游更新。

| 能力                                       | 上游 OpenClaw |     本 Fork     |
| ------------------------------------------ | :-----------: | :-------------: |
| 中文互联网平台 (微博/B站/小红书/抖音/微信) |       -       |     16 平台     |
| DeepSeek / 智谱 GLM 模型                   |       -       |    原生支持     |
| 钉钉消息渠道                               |       -       |     多租户      |
| 企业微信消息渠道                           |       -       |     多租户      |
| 反爬抓取 (Cloudflare bypass)               |       -       |     3 模式      |
| Admin Dashboard                            |       -       |  LitElement UI  |
| WebSocket 连接池                           |       -       | 心跳 + 断线重连 |

---

## Agent Reach — 16 平台互联网接入

AI Agent 可搜索、阅读、交互以下平台，按配置难度分三级：

### Tier 0 — 开箱即用

| 平台     | 后端               | 说明                |
| -------- | ------------------ | ------------------- |
| Web 网页 | curl + Jina Reader | 通用网页抓取        |
| YouTube  | yt-dlp             | 视频信息 + 字幕提取 |
| GitHub   | gh CLI             | 仓库/Issue/PR 查询  |
| RSS/Atom | feedparser         | Feed 订阅解析       |
| Exa 搜索 | mcporter           | AI-native 搜索引擎  |

### Tier 1 — 需要登录 / API Key

| 平台           | 后端               | 备注                         |
| -------------- | ------------------ | ---------------------------- |
| Twitter/X      | xreach             | 需 `xreach auth login`       |
| Bilibili / B站 | yt-dlp             | 需代理                       |
| Reddit         | curl               | 服务器 IP 可能被封，可走 Exa |
| 微博           | mcporter           | 需配置 MCP server            |
| 小宇宙播客     | ffmpeg + Whisper   | 音频转文字                   |
| Scrapling      | scrapling (Python) | 反爬抓取引擎                 |

### Tier 2 — 需要额外配置

| 平台       | 后端               | 备注          |
| ---------- | ------------------ | ------------- |
| 小红书     | mcporter + Docker  | 需 Cookie     |
| 抖音       | mcporter           | 需 MCP server |
| 微信公众号 | camoufox + miku_ai | 无头浏览器    |
| LinkedIn   | curl / mcporter    | 基础可用      |
| Boss直聘   | curl / mcporter    | 基础可用      |

运行 `GET /api/admin/status` 查看各平台实时状态，Admin Dashboard 会展示 **Internet Access** 卡片。

---

## Scrapling — 反爬抓取引擎

内置为 OpenClaw 原生工具，三种模式覆盖不同反爬场景：

| 模式        | 实现            | 场景                  |
| ----------- | --------------- | --------------------- |
| **fast**    | HTTP 指纹伪装   | 无反爬站点，速度最快  |
| **stealth** | 真实无头浏览器  | Cloudflare / WAF 保护 |
| **dynamic** | Playwright 渲染 | JS 密集型 SPA         |

支持 CSS 选择器、HTTP 代理、Cloudflare 自动破解。当 `web_fetch` 返回 403/503 时自动降级使用。

安全设计：参数通过 `JSON.stringify` → stdin 传递给 Python，杜绝代码注入。

---

## 国产大模型

### DeepSeek

| 模型        | ID                  | 上下文 | 定价 (USD/1M tokens) |
| ----------- | ------------------- | ------ | -------------------- |
| DeepSeek V3 | `deepseek-chat`     | 64K    | $0.27 入 / $1.10 出  |
| DeepSeek R1 | `deepseek-reasoner` | 64K    | $0.55 入 / $2.19 出  |

### 智谱 AI (Zhipu)

| 模型        | ID            | 上下文 | 特点               |
| ----------- | ------------- | ------ | ------------------ |
| GLM-4 Plus  | `glm-4-plus`  | 128K   | 通用对话           |
| GLM-4 Flash | `glm-4-flash` | 128K   | 免费额度           |
| GLM-4V Plus | `glm-4v-plus` | 8K     | 多模态 (图片理解)  |
| GLM-Z1 Plus | `glm-z1-plus` | 128K   | 推理增强，16K 输出 |

```bash
# 设置 API Key
export DEEPSEEK_API_KEY="sk-xxx"
export ZHIPU_API_KEY="xxx.xxx"
```

---

## 国内渠道

### 钉钉 (DingTalk)

支持文本、Markdown、群聊消息。Token 按 `appKey` 自动缓存隔离，支持多租户。

### 企业微信 (WeCom)

支持文本、Markdown 消息。Token 按 `corpId` 隔离，`agentId` 含校验。

两个渠道均配备 10 秒超时保护。

---

## 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/elicat001/openclaw--.git openclaw
cd openclaw
pnpm install
```

### 2. 安装外部工具

```bash
# Tier 0 基础工具
brew install yt-dlp ffmpeg gh
npm install -g mcporter xreach-cli
gh auth login
pip3 install --user feedparser

# Scrapling 反爬
pip3 install --user "scrapling[all]" && scrapling install

# 微信公众号 (Tier 2, 可选)
pip3 install --user 'camoufox[geoip]' markdownify beautifulsoup4 miku_ai
```

### 3. 配置模型

```bash
# 至少配置一个模型 API Key
export DEEPSEEK_API_KEY="sk-xxx"        # DeepSeek
export ZHIPU_API_KEY="xxx.xxx"          # 智谱
export ANTHROPIC_API_KEY="sk-ant-xxx"   # Anthropic (上游默认)
export OPENAI_API_KEY="sk-xxx"          # OpenAI
```

### 4. 构建与运行

```bash
pnpm build
pnpm ui:build
openclaw gateway run
```

### 5. 检查平台状态

```bash
curl http://localhost:18789/api/admin/status | jq .agentReach
```

---

## 使用示例

```
"帮我搜一下推特上关于 AI agent 的讨论"
"这个 YouTube 视频讲了什么？" + URL
"帮我抓取这个网页，它有 Cloudflare 保护"
"搜一下微博热搜"
"帮我读一下这篇微信公众号文章" + URL
"GitHub 上 star 最多的 LLM 框架有哪些？"
"搜一下小红书上的旅行攻略"
```

---

## 项目结构 (二次开发)

```
src/agent-reach/                    # 16 平台互联网接入引擎
  ├── platforms.ts                  #   平台定义 (Tier 0/1/2)
  ├── doctor.ts                     #   可用性并行检测
  ├── extended-path.ts              #   Python PATH 工具
  ├── types.ts / index.ts           #   类型与导出

src/agents/
  ├── tools/scrapling-tool.ts       # Scrapling 反爬工具 (JSON stdin)
  ├── deepseek-models.ts            # DeepSeek 模型定义与定价
  └── zhipu-models.ts               # 智谱模型定义与定价

extensions/dingtalk/                # 钉钉渠道插件
  └── src/channel.ts                #   Token 缓存 + 多租户隔离

extensions/wecom/                   # 企业微信渠道插件
  └── src/channel.ts                #   Token 缓存 + agentId 校验

src/gateway/
  ├── admin-api.ts                  # Admin API + 认证
  └── ws-connection-pool.ts         # WebSocket 连接池

src/media/worker-pool.ts            # 媒体处理线程池
src/plugins/hot-reload.ts           # 插件热重载 (开发模式)
ui/src/ui/admin-dashboard.ts        # Admin Dashboard (LitElement)
skills/agent-reach/SKILL.md         # Agent Reach 技能文档
```

---

## 安全设计

- **Scrapling**: 用户输入通过 `JSON.stringify` → stdin 传递，杜绝代码注入
- **Token 缓存**: DingTalk 按 `appKey`、WeCom 按 `corpId` 隔离，安全支持多租户
- **Admin API**: 复用 gateway 认证 (token/password)，timing-safe 比较
- **Fetch 超时**: 所有外部 HTTP 请求 `AbortSignal.timeout(10s)`

---

## 测试

```bash
pnpm test          # 全部测试 (上游 6600+ 用例 + 26 自定义用例)
pnpm build         # 类型检查 + 构建
pnpm check         # Lint + 格式检查
```

| 模块        | 测试文件                 | 用例 |
| ----------- | ------------------------ | ---- |
| Agent Reach | `doctor.test.ts`         | 4    |
| Scrapling   | `scrapling-tool.test.ts` | 6    |
| DingTalk    | `channel.test.ts`        | 8    |
| WeCom       | `channel.test.ts`        | 8    |

---

## 上游同步

本 fork 定期跟进上游 OpenClaw 更新。当前基于 **v2026.3.8**。

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
git merge upstream/main
```

---

## 相关项目

- [OpenClaw](https://github.com/openclaw/openclaw) — 上游项目
- [DeepSeek API](https://api-docs.deepseek.com/) — DeepSeek 文档
- [智谱 AI](https://open.bigmodel.cn/) — Zhipu GLM 文档
- [Scrapling](https://github.com/D4Vinci/Scrapling) — Python 反爬框架

## License

MIT
