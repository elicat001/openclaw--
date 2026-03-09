import type { ModelDefinitionConfig } from "../config/types.models.js";

export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export const ZHIPU_DEFAULT_MODEL_ID = "glm-4-plus";

// Pricing per 1M tokens (CNY, converted to USD at ~7.2 rate) — https://open.bigmodel.cn/pricing
const ZHIPU_GLM4_PLUS_COST = {
  input: 0.69,
  output: 0.69,
  cacheRead: 0.07,
  cacheWrite: 0.69,
};

const ZHIPU_GLM4_FLASH_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const ZHIPU_GLM4V_PLUS_COST = {
  input: 1.39,
  output: 1.39,
  cacheRead: 0.14,
  cacheWrite: 1.39,
};

export interface ZhipuModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

export const ZHIPU_MODEL_CATALOG: ZhipuModelEntry[] = [
  {
    id: "glm-4-plus",
    name: "GLM-4 Plus",
    reasoning: false,
    input: ["text"],
    cost: ZHIPU_GLM4_PLUS_COST,
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "glm-4-flash",
    name: "GLM-4 Flash",
    reasoning: false,
    input: ["text"],
    cost: ZHIPU_GLM4_FLASH_COST,
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "glm-4v-plus",
    name: "GLM-4V Plus",
    reasoning: false,
    input: ["text", "image"],
    cost: ZHIPU_GLM4V_PLUS_COST,
    contextWindow: 8192,
    maxTokens: 1024,
  },
  {
    id: "glm-z1-plus",
    name: "GLM-Z1 Plus (Reasoning)",
    reasoning: true,
    input: ["text"],
    cost: ZHIPU_GLM4_PLUS_COST,
    contextWindow: 128000,
    maxTokens: 16384,
  },
];

export function buildZhipuModelDefinition(model: ZhipuModelEntry): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}
