import { PrivyClient } from "@privy-io/node";
import { ApiError } from "./http";
import { getServerEnv } from "./server-env";

interface AuthenticatedPrivyUser {
  email?: string;
  linkedAccounts: unknown[];
  privyDid: string;
  walletAddress?: string;
}

let client: PrivyClient | undefined;

function getPrivyClient(): PrivyClient {
  if (!client) {
    const env = getServerEnv();
    client = new PrivyClient({
      appId: env.privyAppId,
      appSecret: env.privyAppSecret
    });
  }
  return client;
}

export async function requirePrivyUser(
  request: Request
): Promise<AuthenticatedPrivyUser> {
  const identityToken = request.headers.get("x-privy-identity-token");
  const accessToken = bearerAccessToken(request);
  const client = getPrivyClient();

  if (identityToken) {
    try {
      const user = await client.users().get({ id_token: identityToken });
      return normalizePrivyUser(user);
    } catch (_error) {
      throw new ApiError(401, "PRIVY_AUTH_INVALID", "Privy authentication failed.");
    }
  }

  if (accessToken) {
    try {
      const { user_id: userId } = await client
        .utils()
        .auth()
        .verifyAccessToken(accessToken);
      const user = await client.users()._get(userId);
      return normalizePrivyUser(user);
    } catch (_error) {
      throw new ApiError(401, "PRIVY_AUTH_INVALID", "Privy authentication failed.");
    }
  }

  throw new ApiError(
    401,
    "PRIVY_AUTH_REQUIRED",
    "Privy access or identity token required."
  );
}

export function bearerAccessToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

export function normalizePrivyUser(user: unknown): AuthenticatedPrivyUser {
  const record = asRecord(user);
  const privyDid = stringValue(record.id) ?? stringValue(record.user_id);
  if (!privyDid) {
    throw new ApiError(401, "PRIVY_USER_MISSING", "Privy user response had no DID.");
  }

  const linkedAccounts = linkedAccountsFromUser(record);
  return {
    email: firstLinkedEmail(linkedAccounts),
    linkedAccounts,
    privyDid,
    walletAddress: firstLinkedWallet(linkedAccounts)
  };
}

function linkedAccountsFromUser(record: Record<string, unknown>): unknown[] {
  const camel = record.linkedAccounts;
  const snake = record.linked_accounts;
  if (Array.isArray(camel)) {
    return camel;
  }
  if (Array.isArray(snake)) {
    return snake;
  }
  return [];
}

function firstLinkedEmail(accounts: unknown[]): string | undefined {
  for (const account of accounts) {
    const record = asRecord(account);
    if (stringValue(record.type) === "email") {
      return stringValue(record.address) ?? stringValue(record.email);
    }
  }
  return undefined;
}

function firstLinkedWallet(accounts: unknown[]): string | undefined {
  for (const account of accounts) {
    const record = asRecord(account);
    const type = stringValue(record.type) ?? "";
    if (type.includes("wallet")) {
      return stringValue(record.address) ?? stringValue(record.wallet_address);
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
