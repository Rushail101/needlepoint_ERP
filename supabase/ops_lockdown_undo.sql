-- Undo ops_lockdown.sql: ops tables go back to open access.
-- • Logins stay hashed; PINs and portal passwords are NOT restored in plaintext.
-- • Accounts tables are NOT reopened: the lockdown's owner rule (your email +
--   ops admin) stays, and any rule you had set yourself was never removed.
--   Only the brand-client billing rules are taken off.
do $$ declare r record; t text; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'ops' loop
    execute format('drop policy if exists %I on ops.%I', r.policyname, r.tablename);
  end loop;
  for t in select table_name from information_schema.tables where table_schema = 'ops' and table_type = 'BASE TABLE'
           and table_name not in ('ops_secrets', 'ops_sessions', 'ops_login_attempts') loop
    execute format('create policy open_all on ops.%I for all using (true) with check (true)', t);
  end loop;
  if exists (select 1 from information_schema.schemata where schema_name = 'accounts_erp') then
    drop policy if exists client_own_invoices on accounts_erp.invoices;
    drop policy if exists client_own_payments on accounts_erp.payments;
    drop policy if exists client_own_challans on accounts_erp.delivery_challans;
    execute 'alter view if exists ops.order_billing set (security_invoker = false)';
    execute 'alter view if exists ops.order_documents set (security_invoker = false)';
  end if;
end $$;
