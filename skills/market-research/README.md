# Market Research — 跨境电商市场调研与选品工具

端到端的电商市场调研解决方案：从多平台产品数据爬取，到数据清洗、深度分析，再到跨市场选品机会挖掘。专为巴西市场跨境卖家设计，支持任意品类关键词。

## 目录

- [系统架构](#系统架构)
- [支持平台](#支持平台)
- [快速开始](#快速开始)
- [核心模块详解](#核心模块详解)
  - [1. 数据爬取 (crawl.ts)](#1-数据爬取-crawlts)
  - [2. 数据清洗 (clean.ts)](#2-数据清洗-cleants)
  - [3. 深度分析 (analyze.ts)](#3-深度分析-analylets)
  - [4. 跨市场选品 (opportunity.ts)](#4-跨市场选品-opportunityts)
  - [5. 成本估算 (cost.ts)](#5-成本估算-costts)
- [品牌识别系统](#品牌识别系统)
- [数据流与输出文件](#数据流与输出文件)
- [扩展指南](#扩展指南)
- [环境要求](#环境要求)
- [注意事项](#注意事项)

---

## 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                    crawl.ts (统一入口)                      │
│         --pipeline full 自动串联全部阶段                     │
└───────┬──────────┬──────────┬──────────┬─────────────────┘
        │          │          │          │
        v          v          v          v
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────────┐
   │ 爬取     │ │ 清洗   │ │ 分析   │ │ 选品机会     │
   │ crawl   │ │ clean  │ │analyze │ │ opportunity  │
   └────┬────┘ └───┬────┘ └───┬────┘ └──────┬──────┘
        │          │          │              │
        v          v          v              v
   amazon-us.json  cleaned   report.md   opportunity
   amazon-br.json  .json                 -report.md
   meli.json

   ┌─────────────────────────────────────────────┐
   │  支撑模块                                    │
   │  crawlers/  — 平台爬虫 (amazon-us/br, meli) │
   │  brands/    — 品牌识别库                      │
   │  cost.ts    — 成本估算引擎                    │
   └─────────────────────────────────────────────┘
```

## 支持平台

| 平台 ID     | 市场          | 爬取方式                  | 用途             |
| :---------- | :------------ | :------------------------ | :--------------- |
| `amazon-us` | 美国亚马逊    | curl 搜索 + Camoufox 详情 | 北美热卖品对标   |
| `amazon-br` | 巴西亚马逊    | curl 搜索 + Camoufox 详情 | 目标市场竞品数据 |
| `meli`      | Mercado Livre | curl 搜索 + curl 详情     | 目标市场竞品数据 |

**爬取策略**：每个平台爬虫分两阶段运行：

1. **搜索阶段** — curl 请求搜索结果页，提取产品列表（ASIN/产品ID、名称、价格、评分、评论数）
2. **详情阶段** — 逐个访问产品详情页，提取高清图片、SKU 变体、完整规格

Amazon 详情页有反爬保护，使用 Camoufox（反检测无头浏览器）绕过，并屏蔽图片/字体/跟踪脚本节省 60-70% 带宽。Mercado Livre 详情页无反爬，直接 curl 抓取。

---

## 快速开始

### 一键全流程（推荐）

```bash
# 跨市场选品：爬取美国 + 巴西市场，自动执行 爬取 → 清洗 → 分析 → 选品机会
pnpm tsx scripts/crawl.ts \
  --keyword "cordless drill" \
  --platforms amazon-us,amazon-br,meli \
  --pipeline full
```

### 单市场分析

```bash
# 仅爬取巴西市场并生成分析报告
pnpm tsx scripts/crawl.ts --keyword "furadeira eletrica" --pipeline full
```

### 分步执行

```bash
# 第 1 步：爬取数据
pnpm tsx scripts/crawl.ts --keyword "fone bluetooth" --platforms amazon-br,meli --max 200

# 第 2 步：清洗和富化数据
pnpm tsx scripts/clean.ts --input /tmp/market-research-fone-bluetooth/ --brands auto

# 第 3 步：生成分析报告
pnpm tsx scripts/analyze.ts --input /tmp/market-research-fone-bluetooth/cleaned.json --output report.md

# 第 4 步：跨市场选品机会分析（需要先爬取 US 数据）
pnpm tsx scripts/opportunity.ts \
  --us-data /tmp/market-research-cordless-drill/amazon-us.json \
  --br-data /tmp/market-research-fone-bluetooth/ \
  --output opportunity-report.md
```

---

## 核心模块详解

### 1. 数据爬取 (crawl.ts)

统一入口脚本，协调多平台爬取并串联后续管道。

```bash
pnpm tsx scripts/crawl.ts --keyword <关键词> [选项]
```

| 参数                  | 说明                 | 默认值                         |
| :-------------------- | :------------------- | :----------------------------- |
| `--keyword <text>`    | 搜索关键词（必填）   | —                              |
| `--platforms <list>`  | 逗号分隔的平台列表   | `amazon-br,meli`               |
| `--max <n>`           | 每个平台最大爬取数量 | `300`                          |
| `--output-dir <path>` | 输出目录             | `/tmp/market-research-<slug>/` |
| `--pipeline <stage>`  | 执行阶段             | `crawl`                        |
| `--country <code>`    | 国家代码             | `br`                           |
| `--proxy <url>`       | 代理地址             | —                              |

**管道阶段 (--pipeline)**：

| 阶段          | 说明                                                |
| :------------ | :-------------------------------------------------- |
| `crawl`       | 仅爬取，输出原始 JSON                               |
| `clean`       | 仅清洗（需已有爬取数据）                            |
| `analyze`     | 仅分析（需已有清洗数据）                            |
| `opportunity` | 仅跨市场选品分析（需已有 US + BR 数据）             |
| `full`        | 全部阶段串联：crawl → clean → analyze → opportunity |

**爬虫注册机制**：`crawlerRegistry` 使用动态导入，按需加载平台爬虫模块。新增平台只需实现 `CrawlerModule` 接口并注册。

---

### 2. 数据清洗 (clean.ts)

将多平台原始数据统一清洗、去重、富化为标准化格式。

```bash
pnpm tsx scripts/clean.ts --input <目录> [--brands <类目>] [--output <文件>]
```

| 参数                  | 说明               | 默认值                 |
| :-------------------- | :----------------- | :--------------------- |
| `--input <dir>`       | 含原始 JSON 的目录 | 必填                   |
| `--brands <category>` | 品牌库选择         | `auto`                 |
| `--output <file>`     | 输出路径           | `<input>/cleaned.json` |

**清洗流程**：

1. **数据加载** — 扫描输入目录所有 `*.json` 文件，自动识别数据来源（从文件名推断平台）
2. **相关性过滤** — `drills` 模式按关键词过滤电钻产品；`auto` 模式过滤掉名称过短或 UI 伪影
3. **去重** — 将产品名归一化后去重（取前 60 字符，去除特殊字符，小写化）
4. **品牌识别** — 匹配品牌库模式 → 未命中时取首词作为品牌名
5. **产品分类** — 提取产品类型、动力源、电压、功率、卡盘尺寸等结构化字段
6. **价格解析** — 支持 `R$ 1.234,56` / `$123.45` 多格式，标记异常低价和缺失价格
7. **供应链归类** — 分为中国品牌/贴牌、疑似中国贴牌、巴西本土、国际品牌、未知来源
8. **重量估算** — 按产品类型和配件（附赠工具箱加 1kg、大功率加 1kg）估算重量

**输出字段**（CleanedProduct，30+ 字段）：

```
name, source, brand, type, power_source, voltage, wattage, chuck_size,
is_professional, has_case, price, price_numeric, price_suspect, price_missing,
original_price, discount_pct, rating, rating_numeric, reviews, sold,
images[], image_count, link, skus[], sku_count, supply_chain, weight_estimate_kg
```

---

### 3. 深度分析 (analyze.ts)

基于清洗后数据生成 9 维度深度分析报告（Markdown 格式，含 ASCII 图表和表格）。

```bash
pnpm tsx scripts/analyze.ts --input <文件> [--output <文件>]
```

| 参数              | 说明               | 默认值                        |
| :---------------- | :----------------- | :---------------------------- |
| `--input <file>`  | 清洗后的 JSON 文件 | 必填                          |
| `--output <file>` | 报告输出路径       | `./market-analysis-report.md` |

**9 大分析维度**：

| #   | 维度             | 分析内容                                                       |
| --- | :--------------- | :------------------------------------------------------------- |
| 1   | **市场概览**     | 平台对比、价格摘要、产品类型分布、数据质量评估                 |
| 2   | **价格分析**     | 价格分布直方图、动态分层（p25/p50/p75）、平台价差、折扣分布    |
| 3   | **品牌竞争格局** | 市场份额 Top 15、价格×评分四象限矩阵、SKU 丰富度排名           |
| 4   | **产品特征分析** | 电压/功率/卡盘分布、配件对价格影响（自动检测有意义的特征字段） |
| 5   | **图片质量**     | 图片数量分布、图片数量与评分的相关性分析                       |
| 6   | **供应链分析**   | 中国/国际/本土品牌占比、OEM 模式识别、来源×价格交叉分析        |
| 7   | **FBA 与物流**   | 基于重量的成本估算、自配送 vs FBA 对比、重量区间分布           |
| 8   | **季节性**       | 巴西市场日历、关键促销节点（Black Friday、圣诞、母亲节等）     |
| 9   | **选品矩阵**     | 蓝海机会识别、推荐产品画像、入场建议                           |

**智能特征检测**：`detectFeatureFields()` 自动扫描数据中哪些字段有足够的多样性值得分析，避免对通用品类输出无意义的"电钻专属"维度。

---

### 4. 跨市场选品 (opportunity.ts)

核心选品模块。对比北美热卖品与巴西市场现状，挖掘两类选品机会。

```bash
pnpm tsx scripts/opportunity.ts --us-data <文件> --br-data <目录> [--output <文件>]
```

| 参数               | 说明                       | 默认值                            |
| :----------------- | :------------------------- | :-------------------------------- |
| `--us-data <file>` | Amazon US 爬取的 JSON 文件 | 必填                              |
| `--br-data <dir>`  | 含 BR 平台 JSON 的目录     | 必填                              |
| `--output <file>`  | 选品报告输出路径           | `<br-data>/opportunity-report.md` |

#### 策略 A：北美爆品 × 巴西空白

**逻辑**：如果一个产品在北美已经被市场验证（高销量+高评分），但巴西还没人做或者竞争很弱，那就是蓝海机会。

**算法**：

1. 从 US 数据筛选"热卖品"：评论数 > 500 且评分 >= 4.0
2. 对每个热卖品，在 BR 数据中搜索同类竞品：
   - **品牌匹配** — 品牌名精确匹配（不区分大小写）
   - **关键词重叠** — 提取产品名关键词（去停用词），重叠度 > 40% 视为同类
3. 按匹配结果分三级：

| 等级   | 条件                            | 建议动作   |
| :----- | :------------------------------ | :--------- |
| ⭐⭐⭐ | BR 无同类竞品                   | 立即切入   |
| ⭐⭐   | BR 有 1-5 个竞品，平均评论 < 50 | 差异化切入 |
| ⭐     | BR 竞争充分                     | 转入策略 B |

#### 策略 B：巴西滞销品 × 降价切入

**逻辑**：巴西有人卖但卖不动的产品，如果滞销原因是价格太高，降价后可能有利可图。

**算法**：

1. 从 BR 数据筛选"滞销品"：评论数 < 20 且价格 > 同平台 p75（价格偏高）
2. 诊断滞销原因：
   - **价格过高** — 价格 > 类目中位价 × 1.5
   - **图片不足** — 图片数 < 3
   - **缺少 SKU 变体** — sku_count = 0 而同类竞品有多 SKU
3. 计算建议定价 = 畅销品（评论 >= 50）中位价 × 0.85
4. 调用成本估算模块，评估建议定价下的利润空间
5. 按利润空间分三级：

| 等级   | 条件                    | 含义       |
| :----- | :---------------------- | :--------- |
| ⭐⭐⭐ | 建议定价 > 总成本 × 2   | 利润丰厚   |
| ⭐⭐   | 建议定价 > 总成本 × 1.5 | 有利可图   |
| ⭐     | 建议定价 < 总成本 × 1.5 | 利润空间小 |

**输出报告**包含两个策略的详细表格 + 成本估算说明。

---

### 5. 成本估算 (cost.ts)

跨境电商成本估算引擎（中国 → 巴西链路），供 opportunity.ts 调用。

**成本结构**：

```
总成本 = 出厂价 + 海运物流 + 进口关税 + FBA 配送费
利润 = 售价 - 总成本 - 平台佣金
```

| 成本项       | 计算方式                                                                          |
| :----------- | :-------------------------------------------------------------------------------- |
| **出厂价**   | 售价 × 出厂价系数（按供应链来源不同）                                             |
| **海运物流** | 重量(kg) × R$8/kg（海运均摊）                                                     |
| **进口关税** | 出厂价 × 60%（ICMS + II，电子/工具类）                                            |
| **FBA 费用** | 按重量分级：≤1kg R$15.9 / ≤2kg R$19.9 / ≤5kg R$25.9 / ≤10kg R$35.9 / >10kg R$55.9 |
| **平台佣金** | 售价 × 16%（Amazon BR ~15%, MeLi ~16%）                                           |

**出厂价系数**（占售价比例）：

| 供应链来源    | 系数 | 说明              |
| :------------ | :--- | :---------------- |
| 中国品牌/贴牌 | 20%  | 白牌/OEM 成本最低 |
| 疑似中国贴牌  | 25%  | 品牌溢价略高      |
| 巴西本土品牌  | 40%  | 本土制造+品牌溢价 |
| 国际品牌      | 50%  | 品牌授权+全球定价 |
| 未知来源      | 30%  | 保守估算          |

**1688 校准接口**：预留了 `CostCalibration` 接口，未来接入 1688 爬虫后可用实际出厂价替代经验公式，将置信度从 `medium` 升级到 `high`。

**API**：

- `estimateCost(product)` — 按当前售价估算全链路成本
- `estimateCostAtPrice(targetPrice, product)` — "如果卖 X 价，利润多少？"
- `formatCostSummary(estimate)` — 格式化为一行可读摘要

---

## 品牌识别系统

位于 `scripts/brands/` 目录，采用可插拔设计。

| 品牌库    | 说明                                 | 品牌数 |
| :-------- | :----------------------------------- | :----- |
| `drills`  | 电钻专用：Bosch、DeWalt、Makita 等   | 40+    |
| `generic` | 通用消费品牌：Samsung、Apple、Xiaomi | 48     |

**识别流程**：

1. 用产品名匹配品牌库中的模式（大写化后 `includes` 匹配）
2. 命中 → 返回品牌名 + 来源（global/china/brazil/unknown）
3. 未命中 → 取产品名第一个词作为品牌（排除常见产品词）
4. 均未命中 → 标记为 "Unknown"

**扩展新品类**：创建 `scripts/brands/<category>.ts` 导出 `BrandEntry[]`，在 `scripts/brands/index.ts` 中注册。

---

## 数据流与输出文件

```
<output-dir>/
├── amazon-us.json          # US 原始爬取数据
├── amazon-br.json          # BR Amazon 原始爬取数据
├── meli.json               # Mercado Livre 原始爬取数据
├── cleaned.json            # 清洗后的统一格式数据（30+ 字段/产品）
├── report.md               # 9 维度深度分析报告
└── opportunity-report.md   # 跨市场选品机会报告（策略 A + B）
```

**数据格式**：

- **原始数据 (RawProduct)** — 各平台统一接口：name, price, rating, reviews, sold, images[], link, skus[], source, raw
- **清洗数据 (CleanedProduct)** — 富化后 30+ 字段：品牌、类型、电压、功率、价格数值、折扣率、供应链分类、重量估算等
- **分析报告** — Markdown 格式，含 ASCII 直方图、排名表格、四象限矩阵、选品建议
- **选品报告** — Markdown 格式，含机会等级表格、成本估算、行动建议

---

## 扩展指南

### 添加新平台爬虫

1. 创建 `scripts/crawlers/<platform-id>.ts`
2. 实现 `CrawlerModule` 接口：

```typescript
import type { CrawlerModule, CrawlOptions, RawProduct } from "./types.ts";

export const myPlatform: CrawlerModule = {
  name: "my-platform",
  crawl: async (opts: CrawlOptions): Promise<RawProduct[]> => {
    // Phase 1: 搜索页
    // Phase 2: 详情页（如需）
    // 返回标准化 RawProduct[]
  },
};
```

3. 在 `scripts/crawl.ts` 的 `crawlerRegistry` 中注册：

```typescript
"my-platform": async () => {
  const mod = await import("./crawlers/my-platform.ts");
  return mod.myPlatform;
},
```

4. 在 `references/platform-notes.md` 中记录技术备注

### 添加新品牌库

1. 创建 `scripts/brands/<category>.ts`，导出 `BrandEntry[]`
2. 在 `scripts/brands/index.ts` 的 `loadBrands()` 中添加分支

### 接入 1688 成本校准

`cost.ts` 已预留 `CostCalibration` 接口。未来实现 1688 爬虫后，传入实际出厂价即可：

```typescript
const calibration: CostCalibration = {
  source: "1688",
  factoryCost: 35.0, // 实际 1688 价格
  confidence: "high",
  referenceUrl: "https://detail.1688.com/...",
};
const cost = estimateCost(product, calibration);
```

---

## 环境要求

| 依赖     | 版本 | 用途                      |
| :------- | :--- | :------------------------ |
| Node.js  | 22+  | 运行时                    |
| pnpm     | —    | 包管理                    |
| Python 3 | 3.8+ | HTML 解析脚本             |
| Camoufox | —    | Amazon 详情页反检测浏览器 |

**安装 Camoufox**：

```bash
pip install camoufox
python -m camoufox fetch
```

---

## 注意事项

- **反爬限速**：爬虫内置 1-2 秒延迟，搜索页间隔 2 秒，详情页间隔 1 秒
- **带宽消耗**：每次完整爬取（300 产品 × 2 平台）约 0.5-1 GB（Camoufox 已屏蔽图片/字体/样式/跟踪脚本）
- **代理成本**：如使用住宅代理，预计每次完整爬取 $2-4
- **批次处理**：Amazon 详情页按 50 个 ASIN 为一批处理，避免浏览器长时间运行
- **成本估算**：当前基于经验公式（confidence: medium），接入 1688 实际数据后可提升准确度
- **Mercado Livre API**：官方 API 返回 403 (PA_UNAUTHORIZED_RESULT_FROM_POLICIES)，只能通过页面爬取
