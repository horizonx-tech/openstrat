export const runtime = "nodejs";

import { jsonError, jsonOk } from "@/lib/http";
import { getPerpsScreener } from "@/lib/market-analytics";
import { requirePrivyUser } from "@/lib/privy";

export async function GET(request: Request) {
  try {
    await requirePrivyUser(request);
    const snapshot = await getPerpsScreener();
    return jsonOk(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
