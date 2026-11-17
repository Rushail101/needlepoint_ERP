-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008 — production upgrades + secure logins.  Safe to re-run.
-- Run after 002–007. The old app keeps working after this runs, so you can
-- run it first and deploy the new app right after.
--
-- AFTER RUNNING: set the admin PIN once (the VITE_ADMIN_PIN env var is no
-- longer read by the app):      select public.ops_bootstrap_admin('your-pin');
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions;

-- ── Settings (editable from the app's Settings screen) ─────────────────────
create table if not exists ops_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
insert into ops_settings (key, value) values
  ('sample_fee', '5000'), ('sample_gst', '18'), ('default_lead_days', '21')
on conflict (key) do nothing;

-- ── Delivery dates + stage history ────────────────────────────────────────
alter table products add column if not exists due_date date;
alter table products add column if not exists completed_at timestamptz;
create index if not exists idx_products_due on products(due_date) where due_date is not null;

create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  stage text not null,
  changed_at timestamptz not null default now(),
  changed_by text
);
create index if not exists idx_stage_history_product on stage_history(product_id, changed_at);

-- Every stage change is recorded by the database itself, whichever screen made it.
-- BEFORE trigger stamps completion; AFTER trigger writes history (an AFTER
-- trigger is needed so a brand-new order already exists when its first row is written).
create or replace function public.trg_stage_stamp() returns trigger
language plpgsql as $$
begin
  if new.stage = 'packed' and (tg_op = 'INSERT' or old.stage is distinct from 'packed') then new.completed_at := now(); end if;
  if new.stage is distinct from 'packed' then new.completed_at := null; end if;
  return new;
end $$;
create or replace function public.trg_record_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    begin who := (select name from ops_sessions where token = public.ops_token()); exception when others then who := null; end;
    insert into stage_history (product_id, stage, changed_by) values (new.id, coalesce(new.stage, 'cutting'), who);
  end if;
  return null;
end $$;

-- ── Work log: sizes, QC, rework ───────────────────────────────────────────
alter table work_logs add column if not exists size_label text;
alter table work_logs add column if not exists rejected_qty int;
alter table work_logs add column if not exists reject_reason text;
alter table work_logs add column if not exists responsible_employee_id uuid references employees(id) on delete set null;
alter table work_logs add column if not exists logged_by text;
create index if not exists idx_work_logs_logged_at on work_logs(logged_at);

-- ── Pay: monthly or per piece ─────────────────────────────────────────────
alter table employees add column if not exists pay_type text default 'monthly';   -- monthly | piece
create table if not exists piece_rates (
  id uuid primary key default gen_random_uuid(),
  work_type text not null,
  product_id uuid references products(id) on delete cascade,   -- null = default rate
  rate numeric not null check (rate >= 0),
  created_at timestamptz default now()
);
create unique index if not exists uidx_piece_rates on piece_rates(work_type, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Fabric & trims ────────────────────────────────────────────────────────
-- One row per movement: 'in' = received from supplier, 'issue' = given to the
-- floor for an order, 'return' = unused material back to store.
create table if not exists material_moves (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'issue', 'return')),
  material text not null,                 -- e.g. "Cotton jersey 180gsm black"
  unit text not null default 'kg',        -- kg | m | pcs | rolls
  quantity numeric not null check (quantity > 0),
  rate numeric,                           -- per unit, on receipts
  supplier text,
  brand_id uuid references brands(id) on delete set null,
  po_number text,
  product_id uuid references products(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,
  photo_url text,
  notes text,
  moved_at date not null default current_date,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists idx_material_moves_po on material_moves(po_number);
create index if not exists idx_material_moves_product on material_moves(product_id);

-- ── Job work (outside printing / embroidery / stitching) ─────────────────
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  services text[] default '{}',
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists job_work (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  work_type text not null,
  qty_sent int not null check (qty_sent > 0),
  sent_at date not null default current_date,
  expected_back date,
  qty_returned int not null default 0,
  qty_rejected int not null default 0,
  returned_at date,
  rate numeric,
  notes text,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists idx_job_work_product on job_work(product_id);

-- ── Secure logins ─────────────────────────────────────────────────────────
-- PINs and portal passwords used to sit in readable columns and were checked
-- in the browser. Now they are bcrypt-hashed in a table the public API key
-- cannot read, and login is a server-side check that returns a session token.
create table if not exists ops_secrets (
  kind text not null,          -- 'admin' | 'pin' | 'portal'
  ref_id uuid not null,        -- access_pins.id / brands.id / zero uuid for admin
  secret_hash text not null,
  updated_at timestamptz default now(),
  primary key (kind, ref_id)
);
create table if not exists ops_sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null,          -- admin | manager | tailor | client
  name text,
  brand_id uuid,
  employee_id uuid,
  access_pin_id uuid,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '30 days',
  revoked boolean default false
);
create table if not exists ops_login_attempts (
  id bigserial primary key,
  ip text,
  kind text,
  ok boolean,
  at timestamptz default now()
);
alter table ops_secrets enable row level security;
alter table ops_sessions enable row level security;
alter table ops_login_attempts enable row level security;
revoke all on ops_secrets, ops_sessions, ops_login_attempts from anon, authenticated;

-- copy existing plaintext PINs / passwords into hashes (plaintext cleared by 009)
insert into ops_secrets (kind, ref_id, secret_hash)
select 'pin', id, extensions.crypt(pin, extensions.gen_salt('bf')) from access_pins where pin is not null and pin <> ''
on conflict (kind, ref_id) do nothing;
insert into ops_secrets (kind, ref_id, secret_hash)
select 'portal', id, extensions.crypt(portal_password, extensions.gen_salt('bf')) from brands where coalesce(portal_password, '') <> ''
on conflict (kind, ref_id) do nothing;
alter table access_pins alter column pin drop not null;

-- Map old role names onto the app's permission roles.
create or replace function public.ops_norm_role(r text) returns text language sql immutable as $$
  select case lower(coalesce(r, '')) when 'floor_manager' then 'manager' when 'worker' then 'tailor' else lower(coalesce(r, '')) end
$$;

create or replace function public.ops_token() returns uuid language plpgsql stable as $$
begin
  return nullif(current_setting('request.headers', true)::json ->> 'x-ops-token', '')::uuid;
exception when others then return null;
end $$;

-- The session behind the current request (null when not logged in).
create or replace function public.ops_current() returns ops_sessions
language sql stable security definer set search_path = public as $$
  select s.* from ops_sessions s where s.token = public.ops_token() and not s.revoked and s.expires_at > now()
$$;
create or replace function public.ops_role() returns text language sql stable security definer set search_path = public as $$
  select (public.ops_current()).role
$$;
create or replace function public.ops_brand() returns uuid language sql stable security definer set search_path = public as $$
  select (public.ops_current()).brand_id
$$;

create or replace function public.ops_client_ip() returns text language plpgsql stable as $$
begin
  return split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'local'), ',', 1);
exception when others then return 'local';
end $$;

-- 20 failed tries from one address in 15 minutes locks that address out for a while.
-- Login functions RETURN {error} instead of raising, because raising would roll
-- back the failed-attempt record and the throttle would never trigger.
drop function if exists public.ops_throttle(text);
create or replace function public.ops_throttled() returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from ops_login_attempts where ip = public.ops_client_ip() and not ok and at > now() - interval '15 minutes') >= 20
$$;

create or replace function public.ops_new_session(p_role text, p_name text, p_brand uuid, p_emp uuid, p_pin uuid)
returns json language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  insert into ops_sessions (role, name, brand_id, employee_id, access_pin_id) values (p_role, p_name, p_brand, p_emp, p_pin) returning token into t;
  return json_build_object('token', t, 'role', p_role, 'name', p_name, 'brandId', p_brand, 'employeeId', p_emp, 'id', coalesce(p_pin, p_brand));
end $$;

create or replace function public.ops_login_staff(p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare r record; adm text;
begin
  if public.ops_throttled() then return json_build_object('error', 'Too many wrong attempts. Try again in 15 minutes.'); end if;
  select secret_hash into adm from ops_secrets where kind = 'admin';
  if adm is null and not exists (select 1 from access_pins a join ops_secrets s on s.kind = 'pin' and s.ref_id = a.id where a.active) then
    return json_build_object('error', 'No admin PIN set yet. In the Supabase SQL editor run:  select public.ops_bootstrap_admin(''your-pin'');');
  end if;
  if adm is not null and adm = extensions.crypt(trim(p_pin), adm) then
    insert into ops_login_attempts (ip, kind, ok) values (public.ops_client_ip(), 'staff', true);
    return public.ops_new_session('admin', 'Admin', null, null, null);
  end if;
  for r in select a.id, a.name, a.role, a.employee_id, s.secret_hash from access_pins a join ops_secrets s on s.kind = 'pin' and s.ref_id = a.id where a.active loop
    if r.secret_hash = extensions.crypt(trim(p_pin), r.secret_hash) then
      insert into ops_login_attempts (ip, kind, ok) values (public.ops_client_ip(), 'staff', true);
      return public.ops_new_session(public.ops_norm_role(r.role), r.name, null, r.employee_id, r.id);
    end if;
  end loop;
  insert into ops_login_attempts (ip, kind, ok) values (public.ops_client_ip(), 'staff', false);
  return json_build_object('error', 'Invalid PIN. Please try again.');
end $$;

create or replace function public.ops_login_client(p_brand text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare b record; h text;
begin
  if public.ops_throttled() then return json_build_object('error', 'Too many wrong attempts. Try again in 15 minutes.'); end if;
  select * into b from brands where lower(trim(name)) = lower(trim(p_brand)) limit 1;
  if b.id is not null then select secret_hash into h from ops_secrets where kind = 'portal' and ref_id = b.id; end if;
  if b.id is null or h is null or b.portal_active = false or h <> extensions.crypt(p_password, h) then
    insert into ops_login_attempts (ip, kind, ok) values (public.ops_client_ip(), 'client', false);
    -- one message for every failure, so the form can't be used to discover brand names
    return json_build_object('error', 'Brand name or password is incorrect, or portal access is not enabled. Ask Needle Point for access.');
  end if;
  insert into ops_login_attempts (ip, kind, ok) values (public.ops_client_ip(), 'client', true);
  return public.ops_new_session('client', b.name, b.id, null, null);
end $$;

-- Re-validates a stored session when the app starts.
create or replace function public.ops_whoami() returns json
language sql stable security definer set search_path = public as $$
  select case when s.token is null then null else json_build_object('token', s.token, 'role', s.role, 'name', s.name, 'brandId', s.brand_id, 'employeeId', s.employee_id, 'id', coalesce(s.access_pin_id, s.brand_id)) end
  from (select (public.ops_current()).*) s
$$;

create or replace function public.ops_logout() returns void
language sql security definer set search_path = public as $$
  update ops_sessions set revoked = true where token = public.ops_token()
$$;

-- Admin: create or change a staff PIN (PINs must be unique).
create or replace function public.ops_set_pin(p_pin_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if public.ops_role() is distinct from 'admin' then raise exception 'Only the admin can change PINs' using errcode = 'P0001'; end if;
  if length(trim(p_pin)) < 4 then raise exception 'PIN must be at least 4 digits' using errcode = 'P0001'; end if;
  for r in select ref_id, secret_hash from ops_secrets where kind in ('pin', 'admin') and ref_id <> p_pin_id loop
    if r.secret_hash = extensions.crypt(trim(p_pin), r.secret_hash) then raise exception 'That PIN is already in use — pick another' using errcode = 'P0001'; end if;
  end loop;
  insert into ops_secrets (kind, ref_id, secret_hash) values ('pin', p_pin_id, extensions.crypt(trim(p_pin), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  update access_pins set pin = null where id = p_pin_id;
  update ops_sessions set revoked = true where access_pin_id = p_pin_id;   -- old PIN's sessions end
end $$;

-- Admin sets a brand's portal password; a client may change its own (needs the current one).
create or replace function public.ops_set_portal_password(p_brand_id uuid, p_password text, p_current text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters' using errcode = 'P0001'; end if;
  if public.ops_role() = 'admin' then null;
  elsif public.ops_role() = 'client' and public.ops_brand() = p_brand_id then
    select secret_hash into h from ops_secrets where kind = 'portal' and ref_id = p_brand_id;
    if h is null or h <> extensions.crypt(coalesce(p_current, ''), h) then raise exception 'Current password is wrong' using errcode = 'P0001'; end if;
  else raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  insert into ops_secrets (kind, ref_id, secret_hash) values ('portal', p_brand_id, extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  update brands set portal_password = null where id = p_brand_id;
end $$;

create or replace function public.ops_has_portal_password(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ops_secrets where kind = 'portal' and ref_id = p_brand_id)
$$;

create or replace function public.ops_set_admin_pin(p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.ops_role() is distinct from 'admin' then raise exception 'Only the admin can do this' using errcode = 'P0001'; end if;
  if length(trim(p_new)) < 4 then raise exception 'PIN must be at least 4 digits' using errcode = 'P0001'; end if;
  insert into ops_secrets (kind, ref_id, secret_hash) values ('admin', '00000000-0000-0000-0000-000000000000', extensions.crypt(trim(p_new), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
end $$;

-- Owner-only bootstrap (run in the SQL editor; not callable from the app).
create or replace function public.ops_bootstrap_admin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into ops_secrets (kind, ref_id, secret_hash) values ('admin', '00000000-0000-0000-0000-000000000000', extensions.crypt(trim(p_pin), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  return 'Admin PIN set';
end $$;

-- the stage trigger uses ops_token(), so create it after the functions exist
drop trigger if exists trg_products_stage on products;
drop trigger if exists trg_products_stage_stamp on products;
drop trigger if exists trg_products_stage_history on products;
create trigger trg_products_stage_stamp before insert or update of stage on products
  for each row execute function public.trg_stage_stamp();
create trigger trg_products_stage_history after insert or update of stage on products
  for each row execute function public.trg_record_stage();
-- history for garments that existed before this migration
insert into stage_history (product_id, stage, changed_at)
select p.id, coalesce(p.stage, 'cutting'), coalesce(p.created_at, now()) from products p
where not exists (select 1 from stage_history h where h.product_id = p.id);

revoke execute on function public.ops_bootstrap_admin(text) from public, anon, authenticated;
revoke execute on function public.ops_new_session(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ops_login_staff(text), public.ops_login_client(text, text), public.ops_whoami(), public.ops_logout(),
  public.ops_set_pin(uuid, text), public.ops_set_portal_password(uuid, text, text), public.ops_has_portal_password(uuid),
  public.ops_set_admin_pin(text), public.ops_role(), public.ops_brand() to anon, authenticated;

-- New tables follow the existing open policy until migration 009 locks things down.
do $$ declare t text; begin
  foreach t in array array['ops_settings', 'stage_history', 'piece_rates', 'material_moves', 'vendors', 'job_work'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('create policy "allow all %s" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;
