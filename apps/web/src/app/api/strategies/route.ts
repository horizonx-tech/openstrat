export const runtime = "nodejs";

import { ApiError, jsonError, jsonOk } from "@/lib/http";
import { requirePrivyUser } from "@/lib/privy";
import {
  createStrategy,
  listStrategies,
  StrategyCreateInputSchema
} from "@/lib/strategy-store";

export async function GET(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const strategies = await listStrategies(user.privyDid);
    return jsonOk({ strategies });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const body = await request.json();
    const parsed = StrategyCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "BAD_STRATEGY_REQUEST", parsed.error.message);
    }

    const strategy = await createStrategy(user.privyDid, parsed.data);
    return jsonOk({ strategy });
  } catch (error) {
    return jsonError(error);
  }
}
