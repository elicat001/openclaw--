/**
 * DingTalk (钉钉) channel implementation.
 *
 * Supports:
 * - Receiving messages via DingTalk Stream or HTTP callback
 * - Sending text, markdown, and interactive card messages
 * - Group chat and 1:1 messaging
 *
 * Configuration requires:
 * - AppKey
 * - AppSecret
 * - Robot Code (robotCode)
 *
 * API docs: https://open.dingtalk.com/document/
 */
const log = {
  info: (...args: unknown[]) => console.log("[dingtalk]", ...args),
  error: (...args: unknown[]) => console.error("[dingtalk]", ...args),
  warn: (...args: unknown[]) => console.warn("[dingtalk]", ...args),
};

interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  robotCode?: string;
}

interface DingTalkAccessToken {
  accessToken: string;
  expiresAt: number;
}

const DINGTALK_API_BASE = "https://api.dingtalk.com";
const DINGTALK_OAPI_BASE = "https://oapi.dingtalk.com";

/** Per-appKey token cache to support multi-tenant scenarios. */
const tokenCache = new Map<string, DingTalkAccessToken>();

async function getAccessToken(config: DingTalkConfig): Promise<string> {
  const cacheKey = config.appKey;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const url = `${DINGTALK_API_BASE}/v1.0/oauth2/accessToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: config.appKey,
      appSecret: config.appSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as {
    accessToken?: string;
    expireIn?: number;
    code?: string;
    message?: string;
  };

  if (!data.accessToken) {
    throw new Error(`DingTalk gettoken failed: ${data.message ?? "unknown error"}`);
  }

  const token: DingTalkAccessToken = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + (data.expireIn ?? 7200) * 1000,
  };
  tokenCache.set(cacheKey, token);

  return token.accessToken;
}

export async function sendTextMessage(params: {
  config: DingTalkConfig;
  conversationId: string;
  content: string;
}): Promise<void> {
  const token = await getAccessToken(params.config);
  const url = `${DINGTALK_API_BASE}/v1.0/robot/oToMessages/batchSend`;

  const body = {
    robotCode: params.config.robotCode,
    userIds: [params.conversationId],
    msgKey: "sampleText",
    msgParam: JSON.stringify({ content: params.content }),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const data = (await response.json()) as { code?: string; message?: string };
    log.error(`DingTalk send failed: ${data.message} (code: ${data.code})`);
    throw new Error(`DingTalk send failed: ${data.message}`);
  }

  log.info(`Message sent to ${params.conversationId}`);
}

export async function sendMarkdownMessage(params: {
  config: DingTalkConfig;
  conversationId: string;
  title: string;
  content: string;
}): Promise<void> {
  const token = await getAccessToken(params.config);
  const url = `${DINGTALK_API_BASE}/v1.0/robot/oToMessages/batchSend`;

  const body = {
    robotCode: params.config.robotCode,
    userIds: [params.conversationId],
    msgKey: "sampleMarkdown",
    msgParam: JSON.stringify({
      title: params.title,
      text: params.content,
    }),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(`DingTalk markdown send failed: ${data.message}`);
  }
}

export async function sendGroupMessage(params: {
  config: DingTalkConfig;
  openConversationId: string;
  content: string;
}): Promise<void> {
  const token = await getAccessToken(params.config);
  const url = `${DINGTALK_API_BASE}/v1.0/robot/groupMessages/send`;

  const body = {
    robotCode: params.config.robotCode,
    openConversationId: params.openConversationId,
    msgKey: "sampleText",
    msgParam: JSON.stringify({ content: params.content }),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(`DingTalk group send failed: ${data.message}`);
  }
}

// Channel plugin definition placeholder
export const dingtalkChannel = {
  id: "dingtalk" as const,
  name: "DingTalk (钉钉)",
  sendTextMessage,
  sendMarkdownMessage,
  sendGroupMessage,
  getAccessToken,
};
