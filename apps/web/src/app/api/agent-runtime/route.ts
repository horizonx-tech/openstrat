export const runtime = "nodejs";

import { getAgentRuntimeStatus } from "@/lib/agent-runtime";
import { jsonError, jsonOk } from "@/lib/http";
import { requirePrivyUser } from "@/lib/privy";

export async function GET(request: Request) {
  try {
    await requirePrivyUser(request);
    return jsonOk(getAgentRuntimeStatus());
  } catch (error) {
    return jsonError(error);
  }
}
