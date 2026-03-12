---
name: market-research
description: "电商市场调研工具：爬取产品数据、清洗、生成深度分析报告、跨市场选品机会分析。支持 Amazon US / Amazon BR / Mercado Livre，任意品类关键词。触发：市场调研、竞品分析、选品分析、crawl products、market research、product research、cross-market、选品机会。"
metadata: { "openclaw": { "emoji": "📊", "requires": { "bins": ["python3"] } } }
---

# Market Research

端到端的电商市场调研与选品工具。支持多平台数据爬取、清洗富化、9 维度深度分析、跨市场选品机会挖掘。

## 系统架构

```
crawl.ts (统一入口, --pipeline full 串联全部阶段)
  │
  ├── crawl    → amazon-us.json / amazon-br.json / meli.json
  ├── clean    → cleaned.json (30+ 字段/产品)
  ├── analyze  → report.md (9 维度分析)
  └── opportunity → opportunity-report.md (选品机会)

支撑模块:
  crawlers/  → 平台爬虫 (amazon-us, amazon-br, meli)
  brands/    → 品牌识别库 (drills, generic)
  cost.ts    → 成本估算引擎 (经验公式 + 1688 校准接口)
```

## 支持平台

| 平台 ID     | 市场          | 爬取方式                  | 用途           |
| :---------- | :------------ | :------------------------ | :------------- |
| `amazon-us` | 美国亚马逊    | curl 搜索 + Camoufox 详情 | 北美热卖品对标 |
| `amazon-br` | 巴西亚马逊    | curl 搜索 + Camoufox 详情 | 巴西市场竞品   |
| `meli`      | Mercado Livre | curl 搜索 + curl 详情     | 巴西市场竞品   |

每个爬虫分两阶段：

1. **搜索阶段** — curl 请求搜索结果页，提取产品列表（ASIN、名称、价格、评分、评论数）
2. **详情阶段** — 逐个访问详情页，提取高清图片、SKU 变体、完整规格

Amazon 详情页需 Camoufox 反检测浏览器；MeLi 详情页无反爬，直接 curl。

## 快速开始

### 跨市场选品全流程（推荐）

```bash
pnpm tsx {baseDir}/scripts/crawl.ts \
  --keyword "cordless drill" \
  --platforms amazon-us,amazon-br,meli \
  --pipeline full
```

### 单市场分析

```bash
pnpm tsx {baseDir}/scripts/crawl.ts --keyword "furadeira eletrica" --pipeline full
```

### 分步执行

```bash
# 1. 爬取
pnpm tsx {baseDir}/scripts/crawl.ts --keyword "fone bluetooth" --platforms amazon-br,meli --max 200

# 2. 清洗
pnpm tsx {baseDir}/scripts/clean.ts --input /tmp/market-research-fone-bluetooth/ --brands auto

# 3. 分析
pnpm tsx {baseDir}/scripts/analyze.ts --input /tmp/market-research-fone-bluetooth/cleaned.json --output report.md

# 4. 跨市场选品（需先有 US 数据）
pnpm tsx {baseDir}/scripts/opportunity.ts \
  --us-data /tmp/market-research-cordless-drill/amazon-us.json \
  --br-data /tmp/market-research-fone-bluetooth/ \
  --output opportunity-report.md
```

---

## 模块 1: crawl.ts — 数据爬取

统一入口，协调多平台爬取并串联后续管道。

```bash
pnpm tsx {baseDir}/scripts/crawl.ts --keyword <关键词> [选项]
```

| 参数                  | 说明                 | 默认值                         |
| :-------------------- | :------------------- | :----------------------------- |
| `--keyword <text>`    | 搜索关键词（必填）   | —                              |
| `--platforms <list>`  | 逗号分隔的平台列表   | `amazon-br,meli`               |
| `--max <n>`           | 每个平台最大爬取数量 | `300`                          |
| `--output-dir <path>` | 输出目录             | `/tmp/market-research-<slug>/` |
| `--pipeline <stage>`  | 执行阶段             | `crawl`                        |
| `--country <code>`    | 国家代码             | `br`                           |
| `--proxy <url>`       | 代理地址（可选）     | —                              |

### 管道阶段 (--pipeline)

| 阶段          | 说明                                            | 前置条件          |
| :------------ | :---------------------------------------------- | :---------------- |
| `crawl`       | 仅爬取，输出原始 JSON                           | —                 |
| `clean`       | 仅清洗                                          | 需已有爬取数据    |
| `analyze`     | 仅分析                                          | 需已有清洗数据    |
| `opportunity` | 仅跨市场选品分析                                | 需已有 US+BR 数据 |
| `full`        | 全部串联: crawl → clean → analyze → opportunity | —                 |

爬虫注册机制：`crawlerRegistry` 使用动态导入按需加载。新增平台只需实现 `CrawlerModule` 接口并注册到 registry。

---

## 模块 2: clean.ts — 数据清洗

将多平台原始数据统一清洗、去重、富化为标准化格式。

```bash
pnpm tsx {baseDir}/scripts/clean.ts --input <目录> [--brands <类目>] [--output <文件>]
```

| 参数                  | 说明               | 默认值                 |
| :-------------------- | :----------------- | :--------------------- |
| `--input <dir>`       | 含原始 JSON 的目录 | 必填                   |
| `--brands <category>` | 品牌库选择         | `auto`                 |
| `--output <file>`     | 输出路径           | `<input>/cleaned.json` |

### 清洗流程

1. **数据加载** — 扫描目录所有 `*.json`，从文件名自动识别来源平台
2. **相关性过滤** — `drills` 按电钻关键词过滤；`auto` 过滤名称过短或 UI 伪影
3. **去重** — 产品名归一化后去重（前 60 字符，去特殊字符，小写化）
4. **品牌识别** — 匹配品牌库模式 → 未命中取首词 → 未知标记 "Unknown"
5. **产品分类** — 提取类型、动力源、电压、功率、卡盘尺寸等结构化字段
6. **价格解析** — 支持 `R$ 1.234,56` / `$123.45` 多格式，标记异常低价和缺失
7. **供应链归类** — 中国品牌/贴牌、疑似中国贴牌、巴西本土、国际品牌、未知来源
8. **重量估算** — 按产品类型 + 配件（工具箱 +1kg、大功率 +1kg）

### 输出字段 (CleanedProduct, 30+ 字段)

```
name, source, brand, type, power_source, voltage, wattage, chuck_size,
is_professional, has_case, price, price_numeric, price_suspect, price_missing,
original_price, discount_pct, rating, rating_numeric, reviews, sold,
images[], image_count, link, skus[], sku_count, supply_chain, weight_estimate_kg
```

---

## 模块 3: analyze.ts — 9 维度深度分析

基于清洗数据生成深度分析报告（Markdown，含 ASCII 图表和表格）。

```bash
pnpm tsx {baseDir}/scripts/analyze.ts --input <文件> [--output <文件>]
```

| 参数              | 说明               | 默认值                        |
| :---------------- | :----------------- | :---------------------------- |
| `--input <file>`  | 清洗后的 JSON 文件 | 必填                          |
| `--output <file>` | 报告输出路径       | `./market-analysis-report.md` |

### 分析维度

| #   | 维度             | 分析内容                                                     |
| --- | :--------------- | :----------------------------------------------------------- |
| 1   | **市场概览**     | 平台对比、价格摘要、产品类型分布、数据质量评估               |
| 2   | **价格分析**     | 分布直方图、动态分层 (p25/p50/p75)、平台价差、折扣分布       |
| 3   | **品牌竞争格局** | 市场份额 Top 15、价格x评分四象限矩阵、SKU 丰富度排名         |
| 4   | **产品特征**     | 电压/功率/卡盘分布、配件对价格影响（自动检测有意义特征字段） |
| 5   | **图片质量**     | 图片数量分布、图片数与评分相关性分析                         |
| 6   | **供应链**       | 中国/国际/本土占比、OEM 模式识别、来源x价格交叉分析          |
| 7   | **FBA 与物流**   | 基于重量的成本估算、自配送 vs FBA 对比、重量区间分布         |
| 8   | **季节性**       | 巴西市场日历、关键促销节点 (Black Friday、圣诞、母亲节)      |
| 9   | **选品矩阵**     | 蓝海机会识别、推荐产品画像、入场建议                         |

智能特征检测：`detectFeatureFields()` 自动扫描数据中哪些字段有足够多样性值得分析，避免通用品类输出无意义维度。

---

## 模块 4: opportunity.ts — 跨市场选品机会分析

核心选品模块，对比北美热卖品与巴西市场现状，挖掘两类机会。

```bash
pnpm tsx {baseDir}/scripts/opportunity.ts --us-data <文件> --br-data <目录> [--output <文件>]
```

| 参数               | 说明                       | 默认值                            |
| :----------------- | :------------------------- | :-------------------------------- |
| `--us-data <file>` | Amazon US 爬取的 JSON 文件 | 必填                              |
| `--br-data <dir>`  | 含 BR 平台 JSON 的目录     | 必填                              |
| `--output <file>`  | 选品报告输出路径           | `<br-data>/opportunity-report.md` |

### 策略 A: 北美爆品 x 巴西空白

产品在北美已被市场验证（高销量 + 高评分），但巴西还没人做或竞争很弱 → 蓝海机会。

**算法**：

1. US 数据筛选热卖品：评论数 > 500 且评分 >= 4.0
2. 对每个热卖品，在 BR 数据中搜索同类竞品：
   - 品牌匹配（不区分大小写）
   - 关键词重叠 > 40%（去停用词后）
3. 按竞争程度分级：

| 等级   | 条件                            | 建议动作   |
| :----- | :------------------------------ | :--------- |
| ⭐⭐⭐ | BR 无同类竞品                   | 立即切入   |
| ⭐⭐   | BR 有 1-5 个竞品，平均评论 < 50 | 差异化切入 |
| ⭐     | BR 竞争充分                     | 转入策略 B |

### 策略 B: 巴西滞销品 x 降价切入

巴西有人卖但卖不动，如果滞销原因是价格太高，降价后可能有利可图。

**算法**：

1. BR 数据筛选滞销品：评论数 < 20 且价格 > 同平台 p75
2. 诊断滞销原因：
   - 价格过高（> 中位价 x 1.5）
   - 图片不足（< 3 张）
   - 缺少 SKU 变体（sku_count = 0 而同类有多 SKU）
3. 建议定价 = 畅销品（评论 >= 50）中位价 x 0.85
4. 调用 cost.ts 估算建议定价下的成本和利润
5. 按利润空间分级：

| 等级   | 条件                    | 含义       |
| :----- | :---------------------- | :--------- |
| ⭐⭐⭐ | 建议定价 > 总成本 x 2   | 利润丰厚   |
| ⭐⭐   | 建议定价 > 总成本 x 1.5 | 有利可图   |
| ⭐     | 建议定价 < 总成本 x 1.5 | 利润空间小 |

---

## 模块 5: cost.ts — 成本估算引擎

跨境电商全链路成本估算（中国 → 巴西），供 opportunity.ts 调用。

```
总成本 = 出厂价 + 海运物流 + 进口关税 + FBA 配送费
利润 = 售价 - 总成本 - 平台佣金
```

### 成本项

| 成本项       | 计算方式                                                                      |
| :----------- | :---------------------------------------------------------------------------- |
| **出厂价**   | 售价 x 出厂价系数（按供应链来源）                                             |
| **海运物流** | 重量(kg) x R$8/kg                                                             |
| **进口关税** | 出厂价 x 60% (ICMS + II)                                                      |
| **FBA 费用** | 按重量分级: ≤1kg R$15.9, ≤2kg R$19.9, ≤5kg R$25.9, ≤10kg R$35.9, >10kg R$55.9 |
| **平台佣金** | 售价 x 16%                                                                    |

### 出厂价系数

| 供应链来源    | 系数 | 说明              |
| :------------ | :--- | :---------------- |
| 中国品牌/贴牌 | 20%  | 白牌/OEM 成本最低 |
| 疑似中国贴牌  | 25%  | 品牌溢价略高      |
| 巴西本土品牌  | 40%  | 本土制造+品牌溢价 |
| 国际品牌      | 50%  | 品牌授权+全球定价 |
| 未知来源      | 30%  | 保守估算          |

### API

- `estimateCost(product)` — 按当前售价估算全链路成本
- `estimateCostAtPrice(targetPrice, product)` — "如果卖 X 价，利润多少？"
- `formatCostSummary(estimate)` — 格式化为一行可读摘要

**1688 校准接口**：预留 `CostCalibration`，未来接入 1688 爬虫可用实际出厂价替代经验公式，置信度从 medium 升级到 high。

---

## 品牌识别系统

位于 `scripts/brands/`，可插拔设计。

| 品牌库    | 说明                                 | 品牌数 |
| :-------- | :----------------------------------- | :----- |
| `drills`  | 电钻专用: Bosch, DeWalt, Makita 等   | 40+    |
| `generic` | 通用消费品牌: Samsung, Apple, Xiaomi | 48     |

识别流程：品牌库模式匹配 → 首词提取（排除产品词） → Unknown 兜底。

扩展：创建 `scripts/brands/<category>.ts` 导出 `BrandEntry[]`，在 `scripts/brands/index.ts` 注册。

---

## 输出文件

```
<output-dir>/
├── amazon-us.json          # US 原始爬取数据
├── amazon-br.json          # BR Amazon 原始爬取数据
├── meli.json               # Mercado Livre 原始爬取数据
├── cleaned.json            # 清洗后统一格式数据 (30+ 字段/产品)
├── report.md               # 9 维度深度分析报告
└── opportunity-report.md   # 跨市场选品机会报告 (策略 A + B)
```

## 扩展: 添加新平台

1. 创建 `scripts/crawlers/<platform-id>.ts`，实现 `CrawlerModule` 接口
2. 在 `scripts/crawl.ts` 的 `crawlerRegistry` 注册
3. 在 `references/platform-notes.md` 记录技术备注

```typescript
import type { CrawlerModule, CrawlOptions, RawProduct } from "./types.ts";

export const myPlatform: CrawlerModule = {
  name: "my-platform",
  crawl: async (opts: CrawlOptions): Promise<RawProduct[]> => {
    // Phase 1: 搜索页
    // Phase 2: 详情页
    return [];
  },
};
```

## 环境要求

- **Node.js** 22+
- **Python 3** 3.8+ (HTML 解析)
- **Camoufox** — Amazon 详情页反检测浏览器: `pip install camoufox && python -m camoufox fetch`

## 注意事项

- 反爬限速：搜索页 2s，详情页 1s 延迟
- 带宽：300 产品 x 2 平台约 0.5-1 GB（Camoufox 屏蔽图片/字体/样式/跟踪）
- Amazon 详情页按 50 ASIN 为一批处理，避免浏览器长运行
- 代理成本：住宅代理约 $2-4/次
- 成本估算基于经验公式（confidence: medium），接入 1688 后可提升
- MeLi API 返回 403，只能页面爬取
