import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { bearerAccessToken, normalizePrivyUser, requirePrivyUser } from "./privy";

const privyMocks = vi.hoisted(() => ({
  getByIdentityToken: vi.fn(),
  getUserById: vi.fn(),
  verifyAccessToken: vi.fn()
}));

vi.mock("@privy-io/node", () => ({
  PrivyClient: vi.fn(function PrivyClient() {
    return {
      users: () => ({
        _get: privyMocks.getUserById,
        get: privyMocks.getByIdentityToken
      }),
      utils: () => ({
        auth: () => ({
          verifyAccessToken: privyMocks.verifyAccessToken
        })
      })
    };
  })
}));

vi.mock("./server-env", () => ({
  getServerEnv: () => ({
    privyAppId: "test-app-id",
    privyAppSecret: "test-app-secret",
    supabaseSecretKey: "test-supabase-secret",
    supabaseUrl: "https://example.supabase.co"
  })
}));

describe("Privy web auth boundary", () => {
  it("accepts a Privy bearer access token without requiring an identity token", async () => {
    privyMocks.verifyAccessToken.mockResolvedValue({
      app_id: "test-app-id",
      expiration: 1,
      issued_at: 1,
      issuer: "privy.io",
      session_id: "session",
      user_id: "did:privy:user"
    });
    privyMocks.getUserById.mockResolvedValue({
      id: "did:privy:user",
      linked_accounts: [
        { address: "desk@openstrat.test", type: "email" },
        { address: "0x123", type: "wallet" }
      ]
    });

    const user = await requirePrivyUser(
      new Request("https://openstrat.test/api/session", {
        headers: { authorization: "Bearer access-token" }
      })
    );

    expect(privyMocks.getByIdentityToken).not.toHaveBeenCalled();
    expect(privyMocks.verifyAccessToken).toHaveBeenCalledWith("access-token");
    expect(privyMocks.getUserById).toHaveBeenCalledWith("did:privy:user");
    expect(user).toMatchObject({
      email: "desk@openstrat.test",
      privyDid: "did:privy:user",
      walletAddress: "0x123"
    });
  });

  it("extracts only bearer authorization tokens", () => {
    expect(
      bearerAccessToken(
        new Request("https://openstrat.test", {
          headers: { authorization: "Bearer abc.def" }
        })
      )
    ).toBe("abc.def");
    expect(
      bearerAccessToken(
        new Request("https://openstrat.test", {
          headers: { authorization: "Basic abc.def" }
        })
      )
    ).toBeUndefined();
  });

  it("normalizes linked account fields from Privy user records", () => {
    expect(
      normalizePrivyUser({
        id: "did:privy:user",
        linkedAccounts: [
          { email: "desk@openstrat.test", type: "email" },
          { type: "ethereum_wallet", wallet_address: "0xabc" }
        ]
      })
    ).toMatchObject({
      email: "desk@openstrat.test",
      privyDid: "did:privy:user",
      walletAddress: "0xabc"
    });
  });

  it("fails closed when the Privy user response has no DID", () => {
    expect(() => normalizePrivyUser({ linked_accounts: [] })).toThrow(ApiError);
  });
});
