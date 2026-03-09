import type { ModelDefinitionConfig } from "../config/types.models.js";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export const DEEPSEEK_DEFAULT_MODEL_ID = "deepseek-chat";

// Pricing per 1M tokens (USD) — https://api-docs.deepseek.com/quick_start/pricing
const DEEPSEEK_CHAT_COST = {
  input: 0.27,
  output: 1.1,
  cacheRead: 0.07,
  cacheWrite: 0.27,
};

const DEEPSEEK_REASONER_COST = {
  input: 0.55,
  output: 2.19,
  cacheRead: 0.14,
  cacheWrite: 0.55,
};

export interface DeepSeekModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

export const DEEPSEEK_MODEL_CATALOG: DeepSeekModelEntry[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    reasoning: false,
    input: ["text"],
    cost: DEEPSEEK_CHAT_COST,
    contextWindow: 65536,
    maxTokens: 8192,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    reasoning: true,
    input: ["text"],
    cost: DEEPSEEK_REASONER_COST,
    contextWindow: 65536,
    maxTokens: 8192,
  },
];

export function buildDeepSeekModelDefinition(model: DeepSeekModelEntry): ModelDefinitionConfig {
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
