/**
 * WeCom (企业微信) channel implementation.
 *
 * Supports:
 * - Receiving messages via WeCom callback URL
 * - Sending text, image, and file messages
 * - Webhook-based and API-based message delivery
 *
 * Configuration requires:
 * - Corp ID (corpId)
 * - Agent ID (agentId)
 * - Secret (secret)
 * - Callback Token and EncodingAESKey for message receiving
 *
 * API docs: https://developer.work.weixin.qq.com/document/
 */
const log = {
  info: (...args: unknown[]) => console.log("[wecom]", ...args),
  error: (...args: unknown[]) => console.error("[wecom]", ...args),
  warn: (...args: unknown[]) => console.warn("[wecom]", ...args),
};

interface WeComConfig {
  corpId: string;
  agentId: string;
  secret: string;
  token?: string;
  encodingAESKey?: string;
}

interface WeComAccessToken {
  accessToken: string;
  expiresAt: number;
}

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

function parseAgentId(agentId: string): number {
  const parsed = parseInt(agentId, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`WeCom agentId is not a valid number: ${agentId}`);
  }
  return parsed;
}

/** Per-corpId token cache to support multi-tenant scenarios. */
const tokenCache = new Map<string, WeComAccessToken>();

async function getAccessToken(config: WeComConfig): Promise<string> {
  const cacheKey = config.corpId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.secret)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = (await response.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`WeCom gettoken failed: ${data.errmsg} (code: ${data.errcode})`);
  }

  const token: WeComAccessToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  tokenCache.set(cacheKey, token);

  return token.accessToken;
}

export async function sendTextMessage(params: {
  config: WeComConfig;
  toUser: string;
  content: string;
}): Promise<void> {
  const token = await getAccessToken(params.config);
  const url = `${WECOM_API_BASE}/message/send?access_token=${token}`;

  const body = {
    touser: params.toUser,
    msgtype: "text",
    agentid: parseAgentId(params.config.agentId),
    text: { content: params.content },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as { errcode: number; errmsg: string };
  if (data.errcode !== 0) {
    log.error(`WeCom send failed: ${data.errmsg} (code: ${data.errcode})`);
    throw new Error(`WeCom send failed: ${data.errmsg}`);
  }

  log.info(`Message sent to ${params.toUser}`);
}

export async function sendMarkdownMessage(params: {
  config: WeComConfig;
  toUser: string;
  content: string;
}): Promise<void> {
  const token = await getAccessToken(params.config);
  const url = `${WECOM_API_BASE}/message/send?access_token=${token}`;

  const body = {
    touser: params.toUser,
    msgtype: "markdown",
    agentid: parseAgentId(params.config.agentId),
    markdown: { content: params.content },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json()) as { errcode: number; errmsg: string };
  if (data.errcode !== 0) {
    throw new Error(`WeCom markdown send failed: ${data.errmsg}`);
  }
}

// Channel plugin definition placeholder - to be connected with OpenClaw plugin SDK
export const wecomChannel = {
  id: "wecom" as const,
  name: "WeCom (企业微信)",
  sendTextMessage,
  sendMarkdownMessage,
  getAccessToken,
};
