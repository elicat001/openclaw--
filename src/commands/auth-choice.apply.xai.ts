import { applySimpleApiKeyAuthChoice } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  applyXaiConfig,
  applyXaiProviderConfig,
  setXaiApiKey,
  XAI_DEFAULT_MODEL_REF,
} from "./onboard-auth.js";

export async function applyAuthChoiceXAI(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  return await applySimpleApiKeyAuthChoice({
    authParams: params,
    expectedAuthChoice: "xai-api-key",
    provider: "xai",
    profileId: "xai:default",
    expectedProviders: ["xai"],
    envLabel: "XAI_API_KEY",
    promptMessage: "Enter xAI API key",
    token: params.opts?.xaiApiKey,
    tokenProvider: "xai",
    setCredential: async (apiKey, mode) =>
      setXaiApiKey(apiKey, params.agentDir, { secretInputMode: mode }),
    defaultModel: XAI_DEFAULT_MODEL_REF,
    applyDefaultConfig: applyXaiConfig,
    applyProviderConfig: applyXaiProviderConfig,
  });
}
