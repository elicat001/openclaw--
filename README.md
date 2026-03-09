# OpenClaw — 二次开发版

基于 [OpenClaw](https://github.com/openclaw/openclaw) 深度定制的中国区增强版本。

**~2,800 行自定义代码 · 28 个文件 · 26 个单元测试 · 全量 lint 通过**

---

## 新增能力一览

| 模块                  | 说明                                | 代码量           |
| --------------------- | ----------------------------------- | ---------------- |
| **Agent Reach**       | 16 平台互联网访问引擎               | 532 行 / 6 文件  |
| **Scrapling**         | 原生反爬工具 (fast/stealth/dynamic) | 163 行           |
| **DingTalk**          | 钉钉消息渠道扩展                    | ~340 行 / 5 文件 |
| **WeCom**             | 企业微信消息渠道扩展                | ~360 行 / 5 文件 |
| **DeepSeek**          | DeepSeek V3 / R1 模型集成           | 63 行            |
| **Zhipu**             | 智谱 GLM-4 / GLM-Z1 模型集成        | 88 行            |
| **Admin Dashboard**   | 管理后台 UI (LitElement)            | 269 行           |
| **WebSocket Pool**    | 连接池 + 心跳 + 断线重连            | 162 行           |
| **Worker Pool**       | 媒体处理线程池                      | 145 行           |
| **Plugin Hot-Reload** | 开发模式热重载                      | 127 行           |

---

## Agent Reach — 16 平台互联网访问

AI agent 可搜索、阅读、交互 16 个平台，按配置难度分三级：

### Tier 0 — 开箱即用

| 平台     | 后端工具            |
| -------- | ------------------- |
| Web 网页 | curl + Jina Reader  |
| YouTube  | yt-dlp              |
| GitHub   | gh CLI              |
| RSS/Atom | feedparser (Python) |
| Exa 搜索 | mcporter            |

### Tier 1 — 需要登录 / API Key

| 平台           | 后端工具           | 备注             |
| -------------- | ------------------ | ---------------- |
| Twitter/X      | xreach             | 需 `xreach auth` |
| Bilibili / B站 | yt-dlp             | 需代理           |
| Reddit         | curl               | 需代理           |
| 微博           | mcporter           | 需配置           |
| 小宇宙播客     | ffmpeg + Whisper   | 需 API key       |
| Scrapling      | scrapling (Python) | 需 `pip install` |

### Tier 2 — 需要额外配置

| 平台       | 后端工具           | 备注      |
| ---------- | ------------------ | --------- |
| 小红书     | mcporter + Docker  | 需 Cookie |
| 抖音       | mcporter           | 需配置    |
| 微信公众号 | camoufox + miku_ai | 需配置    |
| LinkedIn   | curl / mcporter    | 基础可用  |
| Boss直聘   | curl / mcporter    | 基础可用  |

启动 gateway 后通过 `GET /api/admin/status` 的 `agentReach` 字段查看各平台状态，Admin Dashboard 也会展示 **Internet Access** 卡片。

---

## Scrapling — 原生反爬工具

内置为 OpenClaw 原生工具（非 Skill），三种模式覆盖不同反爬场景：

| 模式        | 实现            | 适用场景                   |
| ----------- | --------------- | -------------------------- |
| **fast**    | HTTP 指纹伪装   | 无反爬的普通网站，速度最快 |
| **stealth** | 真实无头浏览器  | Cloudflare / WAF 保护站点  |
| **dynamic** | Playwright 渲染 | JS 密集型 SPA 页面         |

支持 CSS 选择器提取、HTTP 代理、Cloudflare 自动破解。当 `web_fetch` 遇到 403/503 时自动降级使用。

安全设计：参数通过 JSON stdin 传递给 Python 子进程，杜绝代码注入。

---

## 国内模型支持

### DeepSeek

| 模型        | ID                  | 特点                 |
| ----------- | ------------------- | -------------------- |
| DeepSeek V3 | `deepseek-chat`     | 通用对话，64K 上下文 |
| DeepSeek R1 | `deepseek-reasoner` | 推理增强             |

### 智谱 (Zhipu)

| 模型        | ID            | 特点                  |
| ----------- | ------------- | --------------------- |
| GLM-4 Plus  | `glm-4-plus`  | 通用对话，128K 上下文 |
| GLM-4 Flash | `glm-4-flash` | 免费额度              |
| GLM-4V Plus | `glm-4v-plus` | 多模态（图片理解）    |
| GLM-Z1 Plus | `glm-z1-plus` | 推理增强，16K 输出    |

---

## 国内渠道扩展

### 钉钉 (DingTalk)

支持文本、Markdown、群聊消息发送。Token 自动缓存并按 `appKey` 隔离，支持多租户。

配置项：`appKey`、`appSecret`、`robotCode`

### 企业微信 (WeCom)

支持文本、Markdown 消息发送。Token 按 `corpId` 隔离，`agentId` 含 NaN 校验。

配置项：`corpId`、`agentId`、`secret`

两个渠道均配备 `AbortSignal.timeout(10s)` 超时保护。

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 安装上游工具

```bash
# 基础工具（Tier 0）
brew install yt-dlp ffmpeg gh
npm install -g mcporter xreach-cli
gh auth login

# RSS
pip3 install --user feedparser

# Scrapling（反爬工具）
pip3 install --user "scrapling[all]" && scrapling install

# 微信公众号（Tier 2）
pip3 install --user 'camoufox[geoip]' markdownify beautifulsoup4 miku_ai
```

### 3. 构建与运行

```bash
pnpm build        # 构建后端
pnpm ui:build     # 构建前端 UI
openclaw gateway run
```

### 4. 检测平台状态

```bash
# API 接口
curl http://localhost:18789/api/admin/status | jq .agentReach

# 或使用 Admin Dashboard 查看
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

## 项目结构（二次开发部分）

```
src/agent-reach/                    # Agent Reach 核心模块
  ├── types.ts                      #   类型定义
  ├── platforms.ts                  #   16 个平台定义 (Tier 0/1/2)
  ├── doctor.ts                     #   平台可用性并行检测
  ├── doctor.test.ts                #   doctor 测试 (4 cases)
  ├── extended-path.ts              #   共享 Python PATH 工具
  └── index.ts                      #   模块导出

src/agents/
  ├── tools/scrapling-tool.ts       # Scrapling 原生工具 (JSON stdin 安全传参)
  ├── tools/scrapling-tool.test.ts  # Scrapling 测试 (6 cases, 含注入防护)
  ├── deepseek-models.ts            # DeepSeek 模型定义与定价
  └── zhipu-models.ts               # 智谱模型定义与定价

extensions/dingtalk/                # 钉钉渠道扩展
  ├── src/channel.ts                #   API 封装 (token 缓存 + 超时)
  ├── src/channel.test.ts           #   测试 (8 cases)
  ├── openclaw.plugin.json          #   插件元数据
  └── package.json                  #   依赖声明

extensions/wecom/                   # 企业微信渠道扩展
  ├── src/channel.ts                #   API 封装 (token 缓存 + agentId 校验)
  ├── src/channel.test.ts           #   测试 (8 cases)
  ├── openclaw.plugin.json          #   插件元数据
  └── package.json                  #   依赖声明

src/gateway/
  ├── admin-api.ts                  # Admin API (含认证保护)
  └── ws-connection-pool.ts         # WebSocket 连接池

src/media/worker-pool.ts            # 媒体处理线程池
src/plugins/hot-reload.ts           # 插件热重载 (开发模式)
ui/src/ui/admin-dashboard.ts        # Admin Dashboard (LitElement)
skills/agent-reach/SKILL.md         # Agent Reach 使用指南
config/mcporter.json                # MCPorter 平台配置
```

---

## 安全设计

- **Scrapling**: 用户输入通过 `JSON.stringify` → stdin 传递，Python 侧 `json.loads(sys.stdin.read())` 读取，杜绝代码注入
- **Token 缓存**: DingTalk 按 `appKey`、WeCom 按 `corpId` 隔离，支持多租户
- **Admin API**: 复用 gateway 认证（token/password 模式），timing-safe 比较
- **Fetch 超时**: 所有外部 HTTP 请求配备 `AbortSignal.timeout(10s)`
- **agentId 校验**: WeCom `parseInt` 含 NaN 检查，防止无效配置

---

## 测试覆盖

26 个自定义测试用例，覆盖所有二次开发代码：

| 模块               | 测试文件                 | 用例数 |
| ------------------ | ------------------------ | ------ |
| Agent Reach Doctor | `doctor.test.ts`         | 4      |
| Scrapling Tool     | `scrapling-tool.test.ts` | 6      |
| DingTalk Channel   | `channel.test.ts`        | 8      |
| WeCom Channel      | `channel.test.ts`        | 8      |

```bash
pnpm test    # 运行全部测试 (含上游 6600+ 用例)
```

---

## 上游项目

- [OpenClaw](https://github.com/openclaw/openclaw) — 原始项目
- [Scrapling](https://github.com/D4Vinci/Scrapling) — 自适应 Python 爬虫框架
- [DeepSeek](https://api-docs.deepseek.com/) — DeepSeek API
- [智谱 AI](https://open.bigmodel.cn/) — Zhipu GLM API

## License

MIT
