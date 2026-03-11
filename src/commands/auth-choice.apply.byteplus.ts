import { applyApiKeyWithPrimaryModel } from "./auth-choice.apply-helpers.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { setByteplusApiKey } from "./onboard-auth.js";

/** Default model for BytePlus auth onboarding. */
export const BYTEPLUS_DEFAULT_MODEL = "byteplus-plan/ark-code-latest";

export async function applyAuthChoiceBytePlus(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  return await applyApiKeyWithPrimaryModel({
    authParams: params,
    expectedAuthChoice: "byteplus-api-key",
    provider: "byteplus",
    profileId: "byteplus:default",
    expectedProviders: ["byteplus"],
    envLabel: "BYTEPLUS_API_KEY",
    promptMessage: "Enter BytePlus API key",
    token: params.opts?.byteplusApiKey,
    tokenProvider: "byteplus",
    setCredential: async (apiKey, mode) =>
      setByteplusApiKey(apiKey, params.agentDir, { secretInputMode: mode }),
    defaultModel: BYTEPLUS_DEFAULT_MODEL,
  });
}
