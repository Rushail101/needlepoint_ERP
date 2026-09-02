-- Migration: adds order-intake fields to products — price per piece (for cost/value
-- calculations, admin-only visibility) and planned work (the checklist of what needs
-- to be done on this garment, e.g. screen printing + embroidery).
alter table products add column if not exists price_per_piece numeric;
alter table products add column if not exists planned_work text[] default '{}';
