-- Undo migration 009: back to open access (the pre-lockdown behaviour).
-- Logins stay hashed; PINs and portal passwords are NOT restored in plaintext.
do $$ declare r record; t text; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'accounts_erp') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
           and table_name not in ('ops_secrets', 'ops_sessions', 'ops_login_attempts') loop
    execute format('create policy open_all on public.%I for all using (true) with check (true)', t);
  end loop;
  if exists (select 1 from information_schema.schemata where schema_name = 'accounts_erp') then
    for t in select table_name from information_schema.tables where table_schema = 'accounts_erp' and table_type = 'BASE TABLE' loop
      execute format('create policy open_all on accounts_erp.%I for all using (true) with check (true)', t);
    end loop;
    execute 'alter view if exists public.order_billing set (security_invoker = false)';
    execute 'alter view if exists public.order_documents set (security_invoker = false)';
  end if;
end $$;
