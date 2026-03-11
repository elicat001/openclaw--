import { applyApiKeyWithPrimaryModel } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { setVolcengineApiKey } from "./onboard-auth.js";

/** Default model for Volcano Engine auth onboarding. */
export const VOLCENGINE_DEFAULT_MODEL = "volcengine-plan/ark-code-latest";

export async function applyAuthChoiceVolcengine(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  return await applyApiKeyWithPrimaryModel({
    authParams: params,
    expectedAuthChoice: "volcengine-api-key",
    provider: "volcengine",
    profileId: "volcengine:default",
    expectedProviders: ["volcengine"],
    envLabel: "VOLCANO_ENGINE_API_KEY",
    promptMessage: "Enter Volcano Engine API key",
    token: params.opts?.volcengineApiKey,
    tokenProvider: "volcengine",
    setCredential: async (apiKey, mode) =>
      setVolcengineApiKey(apiKey, params.agentDir, { secretInputMode: mode }),
    defaultModel: VOLCENGINE_DEFAULT_MODEL,
  });
}
