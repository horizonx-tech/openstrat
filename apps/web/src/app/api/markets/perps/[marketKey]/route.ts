export const runtime = "nodejs";

import { ApiError, jsonError, jsonOk } from "@/lib/http";
import { getPerpMarketDetail } from "@/lib/market-analytics";
import { requirePrivyUser } from "@/lib/privy";

interface RouteContext {
  params: Promise<{
    marketKey: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requirePrivyUser(request);
    const { marketKey } = await context.params;
    if (!marketKey) {
      throw new ApiError(400, "MARKET_REQUIRED", "Market key is required.");
    }
    const detail = await getPerpMarketDetail({ marketKey });
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}
