-- NEXOBRA · Esquema inicial de datos
-- Ejecutar una única vez desde Supabase: SQL Editor > New query > Run.
-- No incluye precios de ejemplo: el catálogo actual se migra en el próximo paso.

create extension if not exists pgcrypto;

create type public.user_role as enum ('user', 'provider', 'admin');
create type public.offer_status as enum ('draft', 'pending', 'approved', 'rejected', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  locality text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.materials (
  id text primary key,
  rubro text not null,
  category text,
  subcategory text,
  denomination text not null,
  sale_unit text,
  measurement_unit text,
  package_quantity numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.material_aliases (
  id uuid primary key default gen_random_uuid(),
  material_id text not null references public.materials(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (material_id, alias)
);

create table public.index_series (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source_name text not null,
  source_url text,
  applies_to text not null check (applies_to in ('materials', 'labor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.index_values (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.index_series(id) on delete cascade,
  reference_month date not null,
  value numeric(14,6) not null check (value > 0),
  published_at date,
  source_url text,
  notes text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (series_id, reference_month)
);

create table public.material_price_bases (
  id uuid primary key default gen_random_uuid(),
  material_id text not null references public.materials(id) on delete cascade,
  price_kind text not null check (price_kind in ('sale', 'measurement')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  base_month date not null,
  index_series_id uuid references public.index_series(id),
  source_name text not null default 'Carga manual NEXOBRA',
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (material_id, price_kind, base_month)
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  business_name text not null,
  tax_id text,
  description text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_branches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null,
  address text,
  locality text not null,
  province text,
  whatsapp_phone text,
  delivery_available boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_offers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.provider_branches(id) on delete cascade,
  material_id text not null references public.materials(id) on delete cascade,
  price_kind text not null check (price_kind in ('sale', 'measurement')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  unit text not null,
  availability_note text,
  valid_until date,
  status public.offer_status not null default 'draft',
  reported_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.computations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Mi cómputo',
  locality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.computation_items (
  id uuid primary key default gen_random_uuid(),
  computation_id uuid not null references public.computations(id) on delete cascade,
  material_id text references public.materials(id) on delete set null,
  denomination_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  price_snapshot numeric(14,2),
  source_kind text not null default 'reference' check (source_kind in ('reference', 'provider_offer')),
  provider_offer_id uuid references public.provider_offers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index material_aliases_alias_idx on public.material_aliases using gin (to_tsvector('spanish', alias));
create index material_denominations_idx on public.materials using gin (to_tsvector('spanish', denomination));
create index price_bases_material_idx on public.material_price_bases (material_id, price_kind, is_active);
create index provider_offers_lookup_idx on public.provider_offers (material_id, price_kind, status, reported_at desc);
create index computation_items_computation_idx on public.computation_items (computation_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger materials_updated_at before update on public.materials for each row execute procedure public.set_updated_at();
create trigger providers_updated_at before update on public.providers for each row execute procedure public.set_updated_at();
create trigger provider_branches_updated_at before update on public.provider_branches for each row execute procedure public.set_updated_at();
create trigger provider_offers_updated_at before update on public.provider_offers for each row execute procedure public.set_updated_at();
create trigger computations_updated_at before update on public.computations for each row execute procedure public.set_updated_at();
create trigger computation_items_updated_at before update on public.computation_items for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.material_aliases enable row level security;
alter table public.index_series enable row level security;
alter table public.index_values enable row level security;
alter table public.material_price_bases enable row level security;
alter table public.providers enable row level security;
alter table public.provider_branches enable row level security;
alter table public.provider_offers enable row level security;
alter table public.computations enable row level security;
alter table public.computation_items enable row level security;

create policy "profiles: users read own" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: users update own" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "materials: public reads active" on public.materials for select using (active or public.is_admin());
create policy "materials: admins manage" on public.materials for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "aliases: public reads" on public.material_aliases for select using (true);
create policy "aliases: admins manage" on public.material_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "index series: public reads active" on public.index_series for select using (active or public.is_admin());
create policy "index series: admins manage" on public.index_series for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "index values: public reads published" on public.index_values for select using (is_published or public.is_admin());
create policy "index values: admins manage" on public.index_values for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "price bases: public reads active" on public.material_price_bases for select using (is_active or public.is_admin());
create policy "price bases: admins manage" on public.material_price_bases for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "providers: public reads active" on public.providers for select using (active or owner_id = auth.uid() or public.is_admin());
create policy "providers: owners manage" on public.providers for all to authenticated using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy "branches: public reads active" on public.provider_branches for select using (active or public.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));
create policy "branches: owners manage" on public.provider_branches for all to authenticated using (public.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.providers p where p.id = provider_id and p.owner_id = auth.uid()));
create policy "offers: public reads approved" on public.provider_offers for select using (status = 'approved' or public.is_admin() or exists (select 1 from public.provider_branches b join public.providers p on p.id = b.provider_id where b.id = branch_id and p.owner_id = auth.uid()));
create policy "offers: owners manage" on public.provider_offers for all to authenticated using (public.is_admin() or exists (select 1 from public.provider_branches b join public.providers p on p.id = b.provider_id where b.id = branch_id and p.owner_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.provider_branches b join public.providers p on p.id = b.provider_id where b.id = branch_id and p.owner_id = auth.uid()));

create policy "computations: users manage own" on public.computations for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "computation items: users manage own" on public.computation_items for all to authenticated using (public.is_admin() or exists (select 1 from public.computations c where c.id = computation_id and c.user_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.computations c where c.id = computation_id and c.user_id = auth.uid()));
