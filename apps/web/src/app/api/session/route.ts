export const runtime = "nodejs";

import { jsonError, jsonOk } from "@/lib/http";
import { requirePrivyUser } from "@/lib/privy";
import { upsertProfile } from "@/lib/profile-store";

export async function POST(request: Request) {
  try {
    const user = await requirePrivyUser(request);
    const profile = await upsertProfile(user);
    return jsonOk({ profile });
  } catch (error) {
    return jsonError(error);
  }
}
