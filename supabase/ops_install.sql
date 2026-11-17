-- ═══════════════════════════════════════════════════════════════════════════
-- Needle Point operations app — full install into its own `ops` schema.
--
-- Run once in the Supabase project that already holds your accounts app
-- (and anything else). Touches ONLY the `ops` schema — nothing in `public`
-- or your other schemas. Safe to re-run.
--
-- After running:
--   1. Project Settings → API → Exposed schemas: add  ops
--   2. Set the admin PIN:   select ops.ops_bootstrap_admin('your-pin');
--   3. Moving from the old project? Follow MOVE_GUIDE.md (copy data, then run this file once more)
--   4. Then run the invoice app's INVOICE_ERP_COMPLETE.sql
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions;
create schema if not exists ops;
set search_path = ops, extensions;

-- Supabase's API roles need these on any schema other than public.
grant usage on schema ops to anon, authenticated, service_role;
alter default privileges in schema ops grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema ops grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema ops grant execute on functions to anon, authenticated, service_role;

-- ── Core tables ───────────────────────────────────────────────────────────
create table if not exists ops.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  contact_person text,
  contact_phone text,
  notes text,
  portal_password text,              -- legacy; real passwords live hashed in ops_secrets
  portal_active boolean default false,
  gstin text,
  state text,
  billing_address text,
  email text,
  pan text,
  payment_terms_days int,
  created_at timestamptz default now()
);

create table if not exists ops.garments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references ops.brands(id) on delete set null,
  name text not null,
  style_code text,
  cover_photo_url text,
  tech_pack_url text,
  default_price_per_piece numeric,
  created_at timestamptz default now()
);

create table if not exists ops.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references ops.brands(id) on delete set null,
  garment_id uuid references ops.garments(id) on delete set null,
  name text not null,
  style_code text,
  po_number text,
  cover_photo_url text,
  tech_pack_url text,
  status text default 'in_production',   -- in_production | sampling | completed | on_hold
  stage text default 'cutting',          -- cutting | printing_embroidery | stitching | qc | packed
  price_per_piece numeric,
  gst_rate numeric default 5,
  total_amount numeric,
  planned_work text[] default '{}',
  notes text,
  created_at timestamptz default now()
);

create table if not exists ops.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz default now()
);

create table if not exists ops.product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  size_label text not null,
  quantity int not null default 0,
  created_at timestamptz default now()
);

create table if not exists ops.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  role text,
  photo_url text,
  monthly_salary numeric,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists ops.work_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  employee_id uuid references ops.employees(id) on delete set null,
  work_type text not null,
  quantity int,
  photo_url text,
  notes text,
  logged_at timestamptz default now()
);

create table if not exists ops.sample_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  version_number int not null,
  photo_url text,
  change_description text,
  status text default 'pending',          -- pending | approved | rejected | revising
  created_at timestamptz default now()
);

create table if not exists ops.shipments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  size_label text,
  quantity int not null default 0,
  notes text,
  dispatched_at timestamptz default now(),
  created_by text,
  created_at timestamptz default now()
);

create table if not exists ops.access_pins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text unique,                        -- legacy; real PINs live hashed in ops_secrets
  role text not null default 'worker',    -- floor_manager | worker
  employee_id uuid references ops.employees(id) on delete set null,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_products_brand on ops.products(brand_id);
create index if not exists idx_products_po on ops.products(brand_id, po_number);
create index if not exists idx_product_photos_product on ops.product_photos(product_id);
create index if not exists idx_product_sizes_product on ops.product_sizes(product_id);
create index if not exists idx_work_logs_product on ops.work_logs(product_id);
create index if not exists idx_work_logs_employee on ops.work_logs(employee_id);
create index if not exists idx_sample_versions_product on ops.sample_versions(product_id);
create index if not exists idx_shipments_product on ops.shipments(product_id);

-- Open policies until 009_lockdown.sql (the app's login gate controls screens).
do $$ declare t text; begin
  foreach t in array array['brands','garments','products','product_photos','product_sizes','employees',
                           'work_logs','sample_versions','shipments','access_pins'] loop
    execute format('alter table ops.%I enable row level security', t);
    execute format('drop policy if exists "allow all %s" on ops.%I', t, t);
    execute format('create policy "allow all %s" on ops.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- ── Photo storage: its own bucket, so other projects' files stay separate ─
insert into storage.buckets (id, name, public) values ('ops-photos', 'ops-photos', true)
on conflict (id) do update set public = true;
drop policy if exists "ops photos read"   on storage.objects;
drop policy if exists "ops photos upload" on storage.objects;
drop policy if exists "ops photos change" on storage.objects;
drop policy if exists "ops photos delete" on storage.objects;
create policy "ops photos read"   on storage.objects for select using (bucket_id = 'ops-photos');
create policy "ops photos upload" on storage.objects for insert with check (bucket_id = 'ops-photos');
create policy "ops photos change" on storage.objects for update using (bucket_id = 'ops-photos');
create policy "ops photos delete" on storage.objects for delete using (bucket_id = 'ops-photos');

-- ═══════════════════════════════════════════════════════════════════════════
-- Production features + secure logins
-- ═══════════════════════════════════════════════════════════════════════════
-- ── Settings (editable from the app's Settings screen) ─────────────────────
create table if not exists ops.ops_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
insert into ops.ops_settings (key, value) values
  ('sample_fee', '5000'), ('sample_gst', '18'), ('default_lead_days', '21')
on conflict (key) do nothing;

-- ── Delivery dates + stage history ────────────────────────────────────────
alter table ops.products add column if not exists due_date date;
alter table ops.products add column if not exists completed_at timestamptz;
create index if not exists idx_products_due on ops.products(due_date) where due_date is not null;

create table if not exists ops.stage_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references ops.products(id) on delete cascade,
  stage text not null,
  changed_at timestamptz not null default now(),
  changed_by text
);
create index if not exists idx_stage_history_product on ops.stage_history(product_id, changed_at);

-- Every stage change is recorded by the database itself, whichever screen made it.
-- BEFORE trigger stamps completion; AFTER trigger writes history (an AFTER
-- trigger is needed so a brand-new order already exists when its first row is written).
create or replace function ops.trg_stage_stamp() returns trigger
language plpgsql as $$
begin
  if new.stage = 'packed' and (tg_op = 'INSERT' or old.stage is distinct from 'packed') then new.completed_at := now(); end if;
  if new.stage is distinct from 'packed' then new.completed_at := null; end if;
  return new;
end $$;
create or replace function ops.trg_record_stage() returns trigger
language plpgsql security definer set search_path = ops as $$
declare who text;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    begin who := (select name from ops.ops_sessions where token = ops.ops_token()); exception when others then who := null; end;
    insert into ops.stage_history (product_id, stage, changed_by) values (new.id, coalesce(new.stage, 'cutting'), who);
  end if;
  return null;
end $$;

-- ── Work log: sizes, QC, rework ───────────────────────────────────────────
alter table ops.work_logs add column if not exists size_label text;
alter table ops.work_logs add column if not exists rejected_qty int;
alter table ops.work_logs add column if not exists reject_reason text;
alter table ops.work_logs add column if not exists responsible_employee_id uuid references ops.employees(id) on delete set null;
alter table ops.work_logs add column if not exists logged_by text;
create index if not exists idx_work_logs_logged_at on ops.work_logs(logged_at);

-- ── Pay: monthly or per piece ─────────────────────────────────────────────
alter table ops.employees add column if not exists pay_type text default 'monthly';   -- monthly | piece
create table if not exists ops.piece_rates (
  id uuid primary key default gen_random_uuid(),
  work_type text not null,
  product_id uuid references ops.products(id) on delete cascade,   -- null = default rate
  rate numeric not null check (rate >= 0),
  created_at timestamptz default now()
);
create unique index if not exists uidx_piece_rates on ops.piece_rates(work_type, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Fabric & trims ────────────────────────────────────────────────────────
-- One row per movement: 'in' = received from supplier, 'issue' = given to the
-- floor for an order, 'return' = unused material back to store.
create table if not exists ops.material_moves (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'issue', 'return')),
  material text not null,                 -- e.g. "Cotton jersey 180gsm black"
  unit text not null default 'kg',        -- kg | m | pcs | rolls
  quantity numeric not null check (quantity > 0),
  rate numeric,                           -- per unit, on receipts
  supplier text,
  brand_id uuid references ops.brands(id) on delete set null,
  po_number text,
  product_id uuid references ops.products(id) on delete set null,
  employee_id uuid references ops.employees(id) on delete set null,
  photo_url text,
  notes text,
  moved_at date not null default current_date,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists idx_material_moves_po on ops.material_moves(po_number);
create index if not exists idx_material_moves_product on ops.material_moves(product_id);

-- ── Job work (outside printing / embroidery / stitching) ─────────────────
create table if not exists ops.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  services text[] default '{}',
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists ops.job_work (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references ops.products(id) on delete cascade,
  vendor_id uuid references ops.vendors(id) on delete set null,
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
create index if not exists idx_job_work_product on ops.job_work(product_id);

-- ── Secure logins ─────────────────────────────────────────────────────────
-- PINs and portal passwords used to sit in readable columns and were checked
-- in the browser. Now they are bcrypt-hashed in a table the public API key
-- cannot read, and login is a server-side check that returns a session token.
create table if not exists ops.ops_secrets (
  kind text not null,          -- 'admin' | 'pin' | 'portal'
  ref_id uuid not null,        -- access_pins.id / brands.id / zero uuid for admin
  secret_hash text not null,
  updated_at timestamptz default now(),
  primary key (kind, ref_id)
);
create table if not exists ops.ops_sessions (
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
create table if not exists ops.ops_login_attempts (
  id bigserial primary key,
  ip text,
  kind text,
  ok boolean,
  at timestamptz default now()
);
alter table ops.ops_secrets enable row level security;
alter table ops.ops_sessions enable row level security;
alter table ops.ops_login_attempts enable row level security;
revoke all on ops.ops_secrets, ops.ops_sessions, ops.ops_login_attempts from anon, authenticated;

-- copy existing plaintext PINs / passwords into hashes (plaintext cleared by 009)
insert into ops.ops_secrets (kind, ref_id, secret_hash)
select 'pin', id, extensions.crypt(pin, extensions.gen_salt('bf')) from ops.access_pins where pin is not null and pin <> ''
on conflict (kind, ref_id) do nothing;
insert into ops.ops_secrets (kind, ref_id, secret_hash)
select 'portal', id, extensions.crypt(portal_password, extensions.gen_salt('bf')) from ops.brands where coalesce(portal_password, '') <> ''
on conflict (kind, ref_id) do nothing;
alter table ops.access_pins alter column pin drop not null;

-- Map old role names onto the app's permission roles.
create or replace function ops.ops_norm_role(r text) returns text language sql immutable as $$
  select case lower(coalesce(r, '')) when 'floor_manager' then 'manager' when 'worker' then 'tailor' else lower(coalesce(r, '')) end
$$;

create or replace function ops.ops_token() returns uuid language plpgsql stable as $$
begin
  return nullif(current_setting('request.headers', true)::json ->> 'x-ops-token', '')::uuid;
exception when others then return null;
end $$;

-- The session behind the current request (null when not logged in).
create or replace function ops.ops_current() returns ops.ops_sessions
language sql stable security definer set search_path = ops as $$
  select s.* from ops.ops_sessions s where s.token = ops.ops_token() and not s.revoked and s.expires_at > now()
$$;
create or replace function ops.ops_role() returns text language sql stable security definer set search_path = ops as $$
  select (ops.ops_current()).role
$$;
create or replace function ops.ops_brand() returns uuid language sql stable security definer set search_path = ops as $$
  select (ops.ops_current()).brand_id
$$;

create or replace function ops.ops_client_ip() returns text language plpgsql stable as $$
begin
  return split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'local'), ',', 1);
exception when others then return 'local';
end $$;

-- 20 failed tries from one address in 15 minutes locks that address out for a while.
-- Login functions RETURN {error} instead of raising, because raising would roll
-- back the failed-attempt record and the throttle would never trigger.
drop function if exists ops.ops_throttle(text);
create or replace function ops.ops_throttled() returns boolean
language sql stable security definer set search_path = ops as $$
  select (select count(*) from ops.ops_login_attempts where ip = ops.ops_client_ip() and not ok and at > now() - interval '15 minutes') >= 20
$$;

create or replace function ops.ops_new_session(p_role text, p_name text, p_brand uuid, p_emp uuid, p_pin uuid)
returns json language plpgsql security definer set search_path = ops as $$
declare t uuid;
begin
  insert into ops.ops_sessions (role, name, brand_id, employee_id, access_pin_id) values (p_role, p_name, p_brand, p_emp, p_pin) returning token into t;
  return json_build_object('token', t, 'role', p_role, 'name', p_name, 'brandId', p_brand, 'employeeId', p_emp, 'id', coalesce(p_pin, p_brand));
end $$;

create or replace function ops.ops_login_staff(p_pin text) returns json
language plpgsql security definer set search_path = ops, extensions as $$
declare r record; adm text;
begin
  if ops.ops_throttled() then return json_build_object('error', 'Too many wrong attempts. Try again in 15 minutes.'); end if;
  select secret_hash into adm from ops.ops_secrets where kind = 'admin';
  if adm is null and not exists (select 1 from ops.access_pins a join ops.ops_secrets s on s.kind = 'pin' and s.ref_id = a.id where a.active) then
    return json_build_object('error', 'No admin PIN set yet. In the Supabase SQL editor run:  select ops.ops_bootstrap_admin(''your-pin'');');
  end if;
  if adm is not null and adm = extensions.crypt(trim(p_pin), adm) then
    insert into ops.ops_login_attempts (ip, kind, ok) values (ops.ops_client_ip(), 'staff', true);
    return ops.ops_new_session('admin', 'Admin', null, null, null);
  end if;
  for r in select a.id, a.name, a.role, a.employee_id, s.secret_hash from ops.access_pins a join ops.ops_secrets s on s.kind = 'pin' and s.ref_id = a.id where a.active loop
    if r.secret_hash = extensions.crypt(trim(p_pin), r.secret_hash) then
      insert into ops.ops_login_attempts (ip, kind, ok) values (ops.ops_client_ip(), 'staff', true);
      return ops.ops_new_session(ops.ops_norm_role(r.role), r.name, null, r.employee_id, r.id);
    end if;
  end loop;
  insert into ops.ops_login_attempts (ip, kind, ok) values (ops.ops_client_ip(), 'staff', false);
  return json_build_object('error', 'Invalid PIN. Please try again.');
end $$;

create or replace function ops.ops_login_client(p_brand text, p_password text) returns json
language plpgsql security definer set search_path = ops, extensions as $$
declare b record; h text;
begin
  if ops.ops_throttled() then return json_build_object('error', 'Too many wrong attempts. Try again in 15 minutes.'); end if;
  select * into b from ops.brands where lower(trim(name)) = lower(trim(p_brand)) limit 1;
  if b.id is not null then select secret_hash into h from ops.ops_secrets where kind = 'portal' and ref_id = b.id; end if;
  if b.id is null or h is null or b.portal_active = false or h <> extensions.crypt(p_password, h) then
    insert into ops.ops_login_attempts (ip, kind, ok) values (ops.ops_client_ip(), 'client', false);
    -- one message for every failure, so the form can't be used to discover brand names
    return json_build_object('error', 'Brand name or password is incorrect, or portal access is not enabled. Ask Needle Point for access.');
  end if;
  insert into ops.ops_login_attempts (ip, kind, ok) values (ops.ops_client_ip(), 'client', true);
  return ops.ops_new_session('client', b.name, b.id, null, null);
end $$;

-- Re-validates a stored session when the app starts.
create or replace function ops.ops_whoami() returns json
language sql stable security definer set search_path = ops as $$
  select case when s.token is null then null else json_build_object('token', s.token, 'role', s.role, 'name', s.name, 'brandId', s.brand_id, 'employeeId', s.employee_id, 'id', coalesce(s.access_pin_id, s.brand_id)) end
  from (select (ops.ops_current()).*) s
$$;

create or replace function ops.ops_logout() returns void
language sql security definer set search_path = ops as $$
  update ops.ops_sessions set revoked = true where token = ops.ops_token()
$$;

-- Admin: create or change a staff PIN (PINs must be unique).
create or replace function ops.ops_set_pin(p_pin_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = ops, extensions as $$
declare r record;
begin
  if ops.ops_role() is distinct from 'admin' then raise exception 'Only the admin can change PINs' using errcode = 'P0001'; end if;
  if length(trim(p_pin)) < 4 then raise exception 'PIN must be at least 4 digits' using errcode = 'P0001'; end if;
  for r in select ref_id, secret_hash from ops.ops_secrets where kind in ('pin', 'admin') and ref_id <> p_pin_id loop
    if r.secret_hash = extensions.crypt(trim(p_pin), r.secret_hash) then raise exception 'That PIN is already in use — pick another' using errcode = 'P0001'; end if;
  end loop;
  insert into ops.ops_secrets (kind, ref_id, secret_hash) values ('pin', p_pin_id, extensions.crypt(trim(p_pin), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  update ops.access_pins set pin = null where id = p_pin_id;
  update ops.ops_sessions set revoked = true where access_pin_id = p_pin_id;   -- old PIN's sessions end
end $$;

-- Admin sets a brand's portal password; a client may change its own (needs the current one).
create or replace function ops.ops_set_portal_password(p_brand_id uuid, p_password text, p_current text default null) returns void
language plpgsql security definer set search_path = ops, extensions as $$
declare h text;
begin
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters' using errcode = 'P0001'; end if;
  if ops.ops_role() = 'admin' then null;
  elsif ops.ops_role() = 'client' and ops.ops_brand() = p_brand_id then
    select secret_hash into h from ops.ops_secrets where kind = 'portal' and ref_id = p_brand_id;
    if h is null or h <> extensions.crypt(coalesce(p_current, ''), h) then raise exception 'Current password is wrong' using errcode = 'P0001'; end if;
  else raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  insert into ops.ops_secrets (kind, ref_id, secret_hash) values ('portal', p_brand_id, extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  update ops.brands set portal_password = null where id = p_brand_id;
end $$;

create or replace function ops.ops_has_portal_password(p_brand_id uuid) returns boolean
language sql stable security definer set search_path = ops as $$
  select exists (select 1 from ops.ops_secrets where kind = 'portal' and ref_id = p_brand_id)
$$;

create or replace function ops.ops_set_admin_pin(p_new text) returns void
language plpgsql security definer set search_path = ops, extensions as $$
begin
  if ops.ops_role() is distinct from 'admin' then raise exception 'Only the admin can do this' using errcode = 'P0001'; end if;
  if length(trim(p_new)) < 4 then raise exception 'PIN must be at least 4 digits' using errcode = 'P0001'; end if;
  insert into ops.ops_secrets (kind, ref_id, secret_hash) values ('admin', '00000000-0000-0000-0000-000000000000', extensions.crypt(trim(p_new), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
end $$;

-- Owner-only bootstrap (run in the SQL editor; not callable from the app).
create or replace function ops.ops_bootstrap_admin(p_pin text) returns text
language plpgsql security definer set search_path = ops, extensions as $$
begin
  insert into ops.ops_secrets (kind, ref_id, secret_hash) values ('admin', '00000000-0000-0000-0000-000000000000', extensions.crypt(trim(p_pin), extensions.gen_salt('bf')))
  on conflict (kind, ref_id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  return 'Admin PIN set';
end $$;

-- the stage trigger uses ops_token(), so create it after the functions exist
drop trigger if exists trg_products_stage on ops.products;
drop trigger if exists trg_products_stage_stamp on ops.products;
drop trigger if exists trg_products_stage_history on ops.products;
create trigger trg_products_stage_stamp before insert or update of stage on ops.products
  for each row execute function ops.trg_stage_stamp();
create trigger trg_products_stage_history after insert or update of stage on ops.products
  for each row execute function ops.trg_record_stage();
-- history for garments that existed before this migration
insert into ops.stage_history (product_id, stage, changed_at)
select p.id, coalesce(p.stage, 'cutting'), coalesce(p.created_at, now()) from ops.products p
where not exists (select 1 from ops.stage_history h where h.product_id = p.id);

revoke execute on function ops.ops_bootstrap_admin(text) from public, anon, authenticated;
revoke execute on function ops.ops_new_session(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function ops.ops_login_staff(text), ops.ops_login_client(text, text), ops.ops_whoami(), ops.ops_logout(),
  ops.ops_set_pin(uuid, text), ops.ops_set_portal_password(uuid, text, text), ops.ops_has_portal_password(uuid),
  ops.ops_set_admin_pin(text), ops.ops_role(), ops.ops_brand() to anon, authenticated;

-- New tables follow the existing open policy until migration 009 locks things down.
do $$ declare t text; begin
  foreach t in array array['ops_settings', 'stage_history', 'piece_rates', 'material_moves', 'vendors', 'job_work'] loop
    execute format('alter table ops.%I enable row level security', t);
    execute format('drop policy if exists "allow all %s" on ops.%I', t, t);
    execute format('create policy "allow all %s" on ops.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;


-- ── Who is who (used by the lockdown and by the accounts link) ────────────
-- "Owner" = a Supabase Auth user whose id is in ops_settings.owner_user_ids
-- (set by ops_lockdown.sql). "Locked" = the lockdown has been run.
create or replace function ops.ops_locked() returns boolean language sql stable security definer set search_path = ops as $$
  select exists (select 1 from ops.ops_settings where key = 'owner_user_ids')
$$;
create or replace function ops.ops_is_owner() returns boolean language sql stable security definer set search_path = ops as $$
  select auth.uid() is not null and coalesce(
    (select value ? auth.uid()::text from ops.ops_settings where key = 'owner_user_ids'), false)
$$;
create or replace function ops.ops_is_staff() returns boolean language sql stable security definer set search_path = ops as $$
  select coalesce(ops.ops_role() in ('admin', 'manager', 'tailor'), false) or ops.ops_is_owner()
$$;
create or replace function ops.ops_is_admin() returns boolean language sql stable security definer set search_path = ops as $$
  select coalesce(ops.ops_role() = 'admin', false) or ops.ops_is_owner()
$$;
create or replace function ops.ops_owns_product(p uuid) returns boolean language sql stable security definer set search_path = ops as $$
  select exists (select 1 from ops.products where id = p and brand_id = ops.ops_brand())
$$;
grant execute on function ops.ops_locked(), ops.ops_is_owner(), ops.ops_is_staff(), ops.ops_is_admin(), ops.ops_owns_product(uuid) to anon, authenticated;

-- ── Grants (the secret tables stay closed to the API) ────────────────────
grant all on all tables    in schema ops to anon, authenticated, service_role;
grant all on all sequences in schema ops to anon, authenticated, service_role;
revoke all on ops.ops_secrets, ops.ops_sessions, ops.ops_login_attempts from anon, authenticated;
