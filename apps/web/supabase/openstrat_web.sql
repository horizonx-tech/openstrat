-- OpenStrat web shell schema.
-- Review before applying in the Supabase SQL editor or through the Supabase MCP.
-- This app uses Privy as the identity provider and Supabase as the server-side
-- application store. Browser access should not read or write these tables.

create extension if not exists pgcrypto;

create table if not exists public.openstrat_profiles (
  id uuid primary key default gen_random_uuid(),
  privy_did text not null unique,
  email text,
  wallet_address text,
  linked_accounts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.openstrat_strategies (
  id uuid primary key default gen_random_uuid(),
  owner_privy_did text not null references public.openstrat_profiles(privy_did) on delete cascade,
  title text not null,
  prompt text not null,
  market text not null,
  timeframe text not null,
  leverage integer,
  risk_profile text not null,
  scan_cadence text not null default 'Every 15 minutes',
  schedule text not null default 'Paper review only',
  status text not null default 'queued'
    check (status in ('draft', 'queued', 'research', 'backtest', 'ready')),
  deployment_status text not null default 'not_configured',
  factors text[] not null default array[]::text[],
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists openstrat_strategies_owner_created_idx
  on public.openstrat_strategies(owner_privy_did, created_at desc);

alter table public.openstrat_profiles enable row level security;
alter table public.openstrat_strategies enable row level security;

revoke all on public.openstrat_profiles from anon, authenticated;
revoke all on public.openstrat_strategies from anon, authenticated;

-- Supabase's server-side elevated role is still named service_role even when
-- the dashboard key is the new sb_secret_... key. The app never exposes that
-- key to the browser.
grant select, insert, update, delete on public.openstrat_profiles to service_role;
grant select, insert, update, delete on public.openstrat_strategies to service_role;
