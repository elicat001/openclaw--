import type { CommandHandlerResult } from "../commands-types.js";
import { stopWithText } from "./shared.js";

export async function handleSubagentsFocusAction(_ctx: unknown): Promise<CommandHandlerResult> {
  return stopWithText("⚠️ /focus is not available on this channel.");
}
