-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 — lock the database to logged-in users.   (opt-in)
--
-- Run ONLY after the new app is deployed and you have logged in with the new
-- login (admin PIN set via ops_bootstrap_admin). From then on the public API
-- key alone can't read or change anything:
--   • staff sessions (admin / manager / tailor) — full access to production data
--   • client sessions — only their own brand's orders, read-only except placing orders
--   • the accounts app — needs Supabase Auth (email sign-in) or the admin session
-- Plaintext PINs and portal passwords are wiped.
-- Undo: run migration_009_undo.sql.
-- ═══════════════════════════════════════════════════════════════════════════

update access_pins set pin = null where pin is not null;
update brands set portal_password = null where portal_password is not null;

create or replace function public.ops_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ops_role() in ('admin', 'manager', 'tailor'), false) or auth.role() = 'authenticated'
$$;
create or replace function public.ops_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.ops_role() = 'admin', false) or auth.role() = 'authenticated'
$$;
create or replace function public.ops_owns_product(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from products where id = p and brand_id = public.ops_brand())
$$;
grant execute on function public.ops_is_staff(), public.ops_is_admin(), public.ops_owns_product(uuid) to anon, authenticated;

-- drop every existing policy on the operations tables, then add the real ones
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['brands','products','product_photos','product_sizes','employees','work_logs','sample_versions',
                           'access_pins','garments','shipments','ops_settings','stage_history','piece_rates',
                           'material_moves','vendors','job_work'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_all on public.%I for all using (public.ops_is_staff()) with check (public.ops_is_staff())', t);
  end loop;
end $$;

-- Only the admin manages logins, settings and pay.
drop policy if exists staff_all on public.access_pins;
create policy admin_all on public.access_pins for all using (public.ops_is_admin()) with check (public.ops_is_admin());
drop policy if exists staff_all on public.piece_rates;
create policy staff_read on public.piece_rates for select using (public.ops_is_staff());
create policy admin_write on public.piece_rates for all using (public.ops_is_admin()) with check (public.ops_is_admin());
drop policy if exists staff_all on public.ops_settings;
create policy staff_read on public.ops_settings for select using (public.ops_is_staff() or public.ops_role() = 'client');
create policy admin_write on public.ops_settings for all using (public.ops_is_admin()) with check (public.ops_is_admin());

-- Clients: their own brand, and orders they place.
create policy client_brand on public.brands for select using (id = public.ops_brand());
create policy client_read on public.products for select using (brand_id = public.ops_brand());
create policy client_order on public.products for insert with check (brand_id = public.ops_brand());
create policy client_read on public.product_sizes for select using (public.ops_owns_product(product_id));
create policy client_order on public.product_sizes for insert with check (public.ops_owns_product(product_id));
create policy client_read on public.product_photos for select using (public.ops_owns_product(product_id));
create policy client_read on public.shipments for select using (public.ops_owns_product(product_id));
create policy client_read on public.sample_versions for select using (public.ops_owns_product(product_id));
create policy client_read on public.stage_history for select using (public.ops_owns_product(product_id));
create policy client_read on public.garments for select using (brand_id = public.ops_brand());
create policy client_write on public.garments for insert with check (brand_id = public.ops_brand());

-- Accounts schema (if this project also holds the accounts app): admin
-- session or a Supabase Auth user only.
do $$ declare t text; r record; begin
  if exists (select 1 from information_schema.schemata where schema_name = 'accounts_erp') then
    for r in select tablename, policyname from pg_policies where schemaname = 'accounts_erp' loop
      execute format('drop policy if exists %I on accounts_erp.%I', r.policyname, r.tablename);
    end loop;
    for t in select table_name from information_schema.tables where table_schema = 'accounts_erp' and table_type = 'BASE TABLE' loop
      execute format('alter table accounts_erp.%I enable row level security', t);
      execute format('create policy admin_all on accounts_erp.%I for all using (public.ops_is_admin()) with check (public.ops_is_admin())', t);
    end loop;
    -- billing views: apply the caller's permissions, and let a client see its own orders' billing
    execute 'alter view if exists public.order_billing set (security_invoker = true)';
    execute 'alter view if exists public.order_documents set (security_invoker = true)';
    execute $p$create policy client_own_invoices on accounts_erp.invoices for select using (
      public.ops_role() = 'client' and ops_order_key in (
        select accounts_erp.ops_order_key(p.brand_id, p.po_number, p.id) from public.products p where p.brand_id = public.ops_brand()))$p$;
    execute $p$create policy client_own_payments on accounts_erp.payments for select using (
      public.ops_role() = 'client' and invoice_id in (select id from accounts_erp.invoices))$p$;
    execute $p$create policy client_own_challans on accounts_erp.delivery_challans for select using (
      public.ops_role() = 'client' and ops_order_key in (
        select accounts_erp.ops_order_key(p.brand_id, p.po_number, p.id) from public.products p where p.brand_id = public.ops_brand()))$p$;
  end if;
end $$;
