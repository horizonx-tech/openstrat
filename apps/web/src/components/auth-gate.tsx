"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";
import type { Profile } from "@/types/openstrat";

interface ApiEnvelope<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  ok: boolean;
}

interface OpenStratApiContextValue {
  profile: Profile | null;
  requestJson<T>(path: string, init?: RequestInit): Promise<T>;
  sessionError: string | null;
}

const OpenStratApiContext = createContext<OpenStratApiContextValue | null>(null);

export function useOpenStratApi(): OpenStratApiContextValue {
  const value = useContext(OpenStratApiContext);
  if (!value) {
    throw new Error("useOpenStratApi must be used inside AuthGate");
  }
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { authenticated, getAccessToken, login, logout, ready, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const requestJson = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers.set("authorization", `Bearer ${accessToken}`);
      }
      if (identityToken) {
        headers.set("x-privy-identity-token", identityToken);
      }
      if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      const response = await fetch(path, { ...init, headers });
      const envelope = (await response.json()) as ApiEnvelope<T>;
      if (!response.ok || !envelope.ok) {
        throw new Error(envelope.error?.message ?? "OpenStrat API request failed");
      }
      return envelope.data as T;
    },
    [getAccessToken, identityToken]
  );

  useEffect(() => {
    let cancelled = false;
    if (!ready || !authenticated) {
      return;
    }

    requestJson<{ profile: Profile }>("/api/session", { method: "POST" })
      .then(({ profile: nextProfile }) => {
        if (!cancelled) {
          setProfile(nextProfile);
          setSessionError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, identityToken, ready, requestJson]);

  const value = useMemo(
    () => ({ profile, requestJson, sessionError }),
    [profile, requestJson, sessionError]
  );

  if (!ready) {
    return <main className="loading-screen">Initializing wallet session</main>;
  }

  if (!authenticated) {
    return <LoginPanel onLogin={login} />;
  }

  return (
    <OpenStratApiContext.Provider value={value}>
      <div className="app-shell">
        <aside className="app-sidebar">
          <a className="brand-lockup" href="/">
            <img className="brand-logo" src="/stratium-logo.svg" alt="Stratium" />
            <span>OpenStrat strategy cockpit</span>
          </a>
          <nav>
            <a
              className={
                pathname === "/" || pathname.startsWith("/markets") ? "active" : ""
              }
              href="/"
            >
              Markets
            </a>
            <a
              className={pathname === "/strategies/new" ? "active" : ""}
              href="/strategies/new"
            >
              Create
            </a>
            <a
              className={pathname.startsWith("/strategies/") ? "active" : ""}
              href="/#strategies"
            >
              My Strategies
            </a>
            <a className={pathname === "/models" ? "active" : ""} href="/models">
              Models
            </a>
          </nav>
          <div className="sidebar-foot">
            <span>
              {user?.wallet?.address ?? user?.email?.address ?? "Privy session"}
            </span>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </aside>
        <section className="app-main">
          {sessionError ? <div className="setup-alert">{sessionError}</div> : null}
          {children}
        </section>
      </div>
    </OpenStratApiContext.Provider>
  );
}

function LoginPanel({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="login-screen">
      <section className="login-copy">
        <div className="brand-chip">
          <img className="brand-chip-logo" src="/stratium-logo.svg" alt="Stratium" />
          <span>OpenStrat / Hyperliquid perps research</span>
        </div>
        <h1>Create account or sign in</h1>
        <p>
          Open a wallet-linked workspace for perps analytics, strategy briefs and
          deployment reports. Trading stays disabled until a strategy is reviewed.
        </p>
        <div className="login-actions">
          <button type="button" onClick={onLogin}>
            Sign up
          </button>
          <span>Wallet login, embedded wallet fallback and email codes</span>
        </div>
      </section>
      <section className="login-signal-tape" aria-label="Market signal preview">
        {["BTC", "ETH", "SOL", "HYPE"].map((symbol, index) => (
          <div className="signal-strip" key={symbol}>
            <span>{symbol}</span>
            <strong>{index % 2 === 0 ? "Long bias" : "Compression"}</strong>
            <small>{index % 2 === 0 ? "+0.8 sigma" : "-0.2 funding"}</small>
          </div>
        ))}
      </section>
    </main>
  );
}
