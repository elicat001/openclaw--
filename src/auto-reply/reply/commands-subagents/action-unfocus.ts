import type { CommandHandlerResult } from "../commands-types.js";
import { stopWithText } from "./shared.js";

export async function handleSubagentsUnfocusAction(_ctx: unknown): Promise<CommandHandlerResult> {
  return stopWithText("⚠️ /unfocus is not available on this channel.");
}
