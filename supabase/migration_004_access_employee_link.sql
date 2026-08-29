-- Migration: lets an access login be tied to an existing Team member,
-- so the Access page can pick a name from Team instead of retyping it.
alter table access_pins add column if not exists employee_id uuid references employees(id) on delete set null;
