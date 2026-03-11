import type { MsgContext } from "../../auto-reply/templating.js";

export function normalizeExplicitSessionKey(sessionKey: string, _ctx: MsgContext): string {
  return sessionKey.trim().toLowerCase();
}
