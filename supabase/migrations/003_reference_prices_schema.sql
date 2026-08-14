-- NEXOBRA · Valores de referencia publicados.
-- Ejecutar después de 001_initial_schema.sql y de las seis partes 002.

create table if not exists public.material_reference_prices (
  id uuid primary key default gen_random_uuid(),
  material_id text not null references public.materials(id) on delete cascade,
  price_kind text not null check (price_kind in ('sale', 'measurement')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  reference_date date not null,
  source_name text not null default 'Carga manual NEXOBRA',
  source_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, price_kind, reference_date)
);

create index if not exists material_reference_prices_lookup_idx
  on public.material_reference_prices (material_id, price_kind, is_published, reference_date desc);

drop trigger if exists material_reference_prices_updated_at on public.material_reference_prices;
create trigger material_reference_prices_updated_at
  before update on public.material_reference_prices
  for each row execute procedure public.set_updated_at();

alter table public.material_reference_prices enable row level security;

create policy "reference prices: public reads published"
  on public.material_reference_prices for select
  using (is_published or public.is_admin());

create policy "reference prices: admins manage"
  on public.material_reference_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
