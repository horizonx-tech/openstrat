export const runtime = "nodejs";

import { jsonError, jsonOk } from "@/lib/http";
import { requirePrivyUser } from "@/lib/privy";
import { getStrategy } from "@/lib/strategy-store";

interface RouteContext {
  params: Promise<{ strategyId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requirePrivyUser(request);
    const { strategyId } = await context.params;
    const strategy = await getStrategy(user.privyDid, strategyId);
    return jsonOk({ strategy });
  } catch (error) {
    return jsonError(error);
  }
}
