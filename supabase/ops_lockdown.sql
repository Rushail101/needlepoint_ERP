-- ═══════════════════════════════════════════════════════════════════════════
-- Lockdown — lock the ops schema (and the accounts tables) to signed-in users.
-- Opt-in. Touches only the `ops` and `accounts_erp` schemas.
--
-- Run ONLY after:
--   • the new operations app is deployed and you've logged in with the admin PIN
--   • the accounts app signs in with your EMAIL (Supabase Auth), not the
--     username/password fallback
--
-- STEP 1 — put the email you sign in to the accounts app with on the line
-- marked ← below (for more than one: array['a@x.in', 'b@x.in']).
-- Only these Supabase Auth users get in. (Your other projects may have their
-- own users in this same Supabase project; they get nothing.)
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create temp table np_owner_emails on commit drop as
select lower(trim(e)) as email from unnest(array['you@example.com']) e;                      -- ← edit this

do $$ begin
  if not exists (select 1 from auth.users where lower(email) in (select email from np_owner_emails))
     and exists (select 1 from information_schema.schemata where schema_name = 'accounts_erp') then
    raise exception 'Lockdown stopped, nothing changed: no Supabase Auth user has the email in STEP 1 of ops_lockdown.sql. Put the email you sign in to the accounts app with and run again.';
  end if;
end $$;

insert into ops.ops_settings (key, value)
select 'owner_user_ids', coalesce(jsonb_agg(id::text), '[]'::jsonb)
from auth.users
where lower(email) in (select email from np_owner_emails)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Plaintext copies of PINs / portal passwords are no longer needed.
update ops.access_pins set pin = null where pin is not null;
update ops.brands set portal_password = null where portal_password is not null;

-- ── Ops tables: drop every policy, then add the real ones ─────────────────
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'ops' loop
    execute format('drop policy if exists %I on ops.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['brands','products','product_photos','product_sizes','employees','work_logs','sample_versions',
                           'access_pins','garments','shipments','ops_settings','stage_history','piece_rates',
                           'material_moves','vendors','job_work'] loop
    execute format('alter table ops.%I enable row level security', t);
    execute format('create policy staff_all on ops.%I for all using (ops.ops_is_staff()) with check (ops.ops_is_staff())', t);
  end loop;
end $$;

-- Only the admin manages logins, settings and pay.
drop policy if exists staff_all on ops.access_pins;
create policy admin_all on ops.access_pins for all using (ops.ops_is_admin()) with check (ops.ops_is_admin());
drop policy if exists staff_all on ops.piece_rates;
create policy staff_read on ops.piece_rates for select using (ops.ops_is_staff());
create policy admin_write on ops.piece_rates for all using (ops.ops_is_admin()) with check (ops.ops_is_admin());
drop policy if exists staff_all on ops.ops_settings;
create policy staff_read on ops.ops_settings for select using ((ops.ops_is_staff() or ops.ops_role() = 'client') and key <> 'owner_user_ids');
create policy admin_write on ops.ops_settings for all using (ops.ops_is_admin()) with check (ops.ops_is_admin());

-- Clients: their own brand, and orders they place.
create policy client_brand on ops.brands for select using (id = ops.ops_brand());
create policy client_read on ops.products for select using (brand_id = ops.ops_brand());
create policy client_order on ops.products for insert with check (brand_id = ops.ops_brand());
create policy client_read on ops.product_sizes for select using (ops.ops_owns_product(product_id));
create policy client_order on ops.product_sizes for insert with check (ops.ops_owns_product(product_id));
create policy client_read on ops.product_photos for select using (ops.ops_owns_product(product_id));
create policy client_read on ops.shipments for select using (ops.ops_owns_product(product_id));
create policy client_read on ops.sample_versions for select using (ops.ops_owns_product(product_id));
create policy client_read on ops.stage_history for select using (ops.ops_owns_product(product_id));
create policy client_read on ops.garments for select using (brand_id = ops.ops_brand());
create policy client_write on ops.garments for insert with check (brand_id = ops.ops_brand());

-- ── Accounts tables ───────────────────────────────────────────────────────
-- Open "allow everyone" policies are removed. Any rule you set yourself
-- (e.g. rls_single_user.sql) is KEPT. Added: you (owner email) and the ops
-- admin session get full access; a brand client sees only its own billing.
do $$ declare t text; r record; begin
  if exists (select 1 from information_schema.schemata where schema_name = 'accounts_erp') then
    for r in select tablename, policyname from pg_policies
             where schemaname = 'accounts_erp'
               and (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true'
                    or policyname in ('owner_all', 'admin_all', 'client_own_invoices', 'client_own_payments', 'client_own_challans')) loop
      execute format('drop policy if exists %I on accounts_erp.%I', r.policyname, r.tablename);
    end loop;
    for t in select table_name from information_schema.tables where table_schema = 'accounts_erp' and table_type = 'BASE TABLE' loop
      execute format('alter table accounts_erp.%I enable row level security', t);
      execute format('create policy owner_all on accounts_erp.%I for all using (ops.ops_is_admin()) with check (ops.ops_is_admin())', t);
    end loop;
    execute 'alter view if exists ops.order_billing set (security_invoker = true)';
    execute 'alter view if exists ops.order_documents set (security_invoker = true)';
    execute $p$create policy client_own_invoices on accounts_erp.invoices for select using (
      ops.ops_role() = 'client' and ops_order_key in (
        select accounts_erp.ops_order_key(p.brand_id, p.po_number, p.id) from ops.products p where p.brand_id = ops.ops_brand()))$p$;
    execute $p$create policy client_own_payments on accounts_erp.payments for select using (
      ops.ops_role() = 'client' and invoice_id in (select id from accounts_erp.invoices))$p$;
    execute $p$create policy client_own_challans on accounts_erp.delivery_challans for select using (
      ops.ops_role() = 'client' and ops_order_key in (
        select accounts_erp.ops_order_key(p.brand_id, p.po_number, p.id) from ops.products p where p.brand_id = ops.ops_brand()))$p$;
  end if;
end $$;

commit;
