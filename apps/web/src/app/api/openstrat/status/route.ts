export const runtime = "nodejs";

import { jsonError, jsonOk } from "@/lib/http";
import { getOpenStratWebStatus } from "@/lib/openstrat-status";
import { requirePrivyUser } from "@/lib/privy";

export async function GET(request: Request) {
  try {
    await requirePrivyUser(request);
    return jsonOk(getOpenStratWebStatus());
  } catch (error) {
    return jsonError(error);
  }
}
