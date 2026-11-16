// Fabrique de bots (voir ai.ts).
import type { Bot, BotContext } from "./types.ts";
import { SkirmishAI } from "./ai.ts";

export function createBot(ctx: BotContext): Bot {
  return new SkirmishAI(ctx);
}
export const PERSONALITIES = ["adaptive", "rush", "turtle", "tech"] as const;
export type { Bot, BotContext, MapInfo } from "./types.ts";
