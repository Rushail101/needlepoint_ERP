-- Migration 007: catch-up. The app already uses these tables/columns, but no
-- earlier SQL file created them (they were added straight in Supabase).
-- On your live database this changes nothing; on a fresh project it makes
-- schema.sql + migrations 002–007 match what the app expects. Safe to re-run.

-- Reusable garment catalog (NewOrder → "Save this style to reusable catalog")
create table if not exists garments (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete set null,
  name text not null,
  style_code text,
  cover_photo_url text,
  tech_pack_url text,
  default_price_per_piece numeric,
  created_at timestamptz default now()
);

-- Order fields on products
alter table products add column if not exists po_number text;
alter table products add column if not exists gst_rate numeric default 5;
alter table products add column if not exists total_amount numeric;
alter table products add column if not exists tech_pack_url text;
alter table products add column if not exists garment_id uuid references garments(id) on delete set null;
create index if not exists idx_products_po on products(brand_id, po_number);

-- Partial dispatches per size
create table if not exists shipments (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  size_label text,
  quantity int not null default 0,
  notes text,
  dispatched_at timestamptz default now(),
  created_by text,
  created_at timestamptz default now()
);
create index if not exists idx_shipments_product on shipments(product_id);

-- Brand client-portal login
alter table brands add column if not exists portal_password text;
alter table brands add column if not exists portal_active boolean default false;

alter table garments enable row level security;
alter table shipments enable row level security;
drop policy if exists "allow all garments" on garments;
create policy "allow all garments" on garments for all using (true) with check (true);
drop policy if exists "allow all shipments" on shipments;
create policy "allow all shipments" on shipments for all using (true) with check (true);
