-- Needle Point ERP — Supabase schema
-- Run this in Supabase SQL editor once, then create a public storage bucket named "photos"
-- (Storage > New bucket > name: photos > Public bucket: ON)

create extension if not exists "uuid-ossp";

-- ============ BRANDS ============
create table brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  logo_url text,
  contact_person text,
  contact_phone text,
  notes text,
  created_at timestamptz default now()
);

-- ============ PRODUCTS (garments) ============
create table products (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete set null,
  name text not null,               -- e.g. "Oversized Hoodie - Navy"
  style_code text,                  -- internal/brand style code
  cover_photo_url text,             -- main photo shown in grids
  status text default 'in_production', -- in_production | sampling | completed | on_hold
  stage text default 'cutting',     -- cutting | printing_embroidery | stitching | qc | packed
  price_per_piece numeric,          -- admin-only; used for order value & cost summaries
  planned_work text[] default '{}', -- e.g. {screen_printing,embroidery} — what work this order needs
  notes text,
  created_at timestamptz default now()
);

-- extra photos per product (front/back/detail shots etc)
create table product_photos (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz default now()
);

-- size / quantity bifurcation
create table product_sizes (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  size_label text not null,   -- S, M, L, XL, XXL, Free Size, custom...
  quantity int not null default 0,
  created_at timestamptz default now()
);

-- ============ EMPLOYEES ============
create table employees (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  role text,                  -- e.g. "Embroidery Operator", "Screen Printer", "Tailor"
  photo_url text,
  monthly_salary numeric,     -- admin-only, used to compute cost-per-piece
  active boolean default true,
  created_at timestamptz default now()
);

-- ============ WORK LOG ============
-- one row per unit of work done: an employee did X type of work on product Y
create table work_logs (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  work_type text not null,    -- screen_printing | embroidery | sampling | sample_change | stitching | other
  quantity int,                -- how many pieces this work log covers
  photo_url text,              -- photo of the actual work done
  notes text,
  logged_at timestamptz default now()
);

-- ============ SAMPLE VERSIONS ============
-- tracks the back-and-forth on a sample: v1, v2, v3 with what changed
create table sample_versions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  version_number int not null,
  photo_url text,
  change_description text,     -- what changed from the previous version
  status text default 'pending', -- pending | approved | rejected | revising
  created_at timestamptz default now()
);

-- Indexes for the lookups the UI does most
create index idx_products_brand on products(brand_id);
create index idx_product_photos_product on product_photos(product_id);
create index idx_product_sizes_product on product_sizes(product_id);
create index idx_work_logs_product on work_logs(product_id);
create index idx_work_logs_employee on work_logs(employee_id);
create index idx_sample_versions_product on sample_versions(product_id);

-- ============ ACCESS PINS (floor manager / worker logins, managed by admin) ============
create table access_pins (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pin text not null unique,
  role text not null default 'worker', -- floor_manager | worker
  employee_id uuid references employees(id) on delete set null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Open RLS for MVP (single shared PIN gate at app level, not DB level).
-- Tighten this later if you add real per-user auth.
alter table brands enable row level security;
alter table products enable row level security;
alter table product_photos enable row level security;
alter table product_sizes enable row level security;
alter table employees enable row level security;
alter table work_logs enable row level security;
alter table sample_versions enable row level security;

create policy "allow all brands" on brands for all using (true) with check (true);
create policy "allow all products" on products for all using (true) with check (true);
create policy "allow all product_photos" on product_photos for all using (true) with check (true);
create policy "allow all product_sizes" on product_sizes for all using (true) with check (true);
create policy "allow all employees" on employees for all using (true) with check (true);
create policy "allow all work_logs" on work_logs for all using (true) with check (true);
create policy "allow all sample_versions" on sample_versions for all using (true) with check (true);

alter table access_pins enable row level security;
create policy "allow all access_pins" on access_pins for all using (true) with check (true);
