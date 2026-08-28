-- Migration: lets the admin create additional PIN-based logins for floor managers
-- and workers directly from the app, without redeploying or touching env vars.
-- The admin's own PIN stays in the VITE_ADMIN_PIN env var (see .env.example) —
-- that one is not stored here, so there's always a way in even if this table is empty.

create table access_pins (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pin text not null unique,
  role text not null default 'worker', -- floor_manager | worker
  active boolean default true,
  created_at timestamptz default now()
);

alter table access_pins enable row level security;
create policy "allow all access_pins" on access_pins for all using (true) with check (true);
