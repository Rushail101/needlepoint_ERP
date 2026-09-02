-- Migration: adds a monthly salary field to employees, used to compute cost-per-piece
-- on the employee summary page. Only ever visible/editable on admin-only screens.
alter table employees add column if not exists monthly_salary numeric;
