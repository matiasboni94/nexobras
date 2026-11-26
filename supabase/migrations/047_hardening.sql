-- 047_hardening.sql (26/11) — Hardening de permisos (SOC 2 CC6/CC7, OWASP A01/A02/A09, CIS 3/6/8, NIST PR.AA/DE.CM)
--
-- Qué arregla (encontrado probando la API de producción con la clave pública, como cualquier visitante):
--  1) CRÍTICO: dos funciones devolvían mails de usuarios a cualquiera, sin cuenta:
--     find_new_category_alert_matches() (alertas por rubro) y
--     get_offer_broadcast_recipients(uuid) (suscriptores de ofertas de una sucursal).
--     Las migraciones 005 y 007 les sacaban el permiso a anon y authenticated, pero no a
--     PUBLIC (el permiso por defecto de Postgres), así que seguían abiertas.
--     Quedan solo para las Edge Functions (service_role).
--  2) Funciones de admin, de proveedor y triggers: sin permiso para anon / PUBLIC
--     (adentro ya validan; esto es la segunda barrera).
--  3) search_path fijo en las funciones que no lo tenían (aviso del linter de Supabase).
--  4) Presupuestos y cómputos compartidos: se sacan las políticas "lectura pública si
--     is_public", que dejaban LISTAR todos los compartidos (con su token) sin conocer el
--     link. El link compartido sigue andando: pasa por get_shared_apu_budget /
--     get_shared_computation (SECURITY DEFINER), que piden el token exacto.
--  5) Storage: los buckets públicos dejaban listar sus archivos. Las imágenes siguen
--     públicas por su URL; listar queda para el dueño y el admin.
--  6) anon y authenticated sin TRUNCATE / REFERENCES / TRIGGER en las tablas (nadie los usa).
--  7) Registro de auditoría: cambios de rol, de aprobación/publicación/dueño de fichas y de
--     estado de precios quedan guardados con quién y cuándo (solo lo lee el admin).
--
-- Idempotente: se puede correr más de una vez. Si algo no existe en tu base, lo saltea
-- y avisa con un NOTICE. Al final hay consultas de verificación.

begin;

-- ---------------------------------------------------------------------------
-- Utilidad: aplica un GRANT/REVOKE a todas las versiones de una función por nombre
-- ---------------------------------------------------------------------------
create or replace function public._hard_permisos(p_nombre text, p_revocar text, p_otorgar text)
returns int language plpgsql set search_path = public, pg_catalog as $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = p_nombre
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if p_revocar is not null then execute format('revoke all on function %s from %s', r.firma, p_revocar); end if;
    if p_otorgar is not null then execute format('grant execute on function %s to %s', r.firma, p_otorgar); end if;
    n := n + 1;
  end loop;
  if n = 0 then raise notice 'hardening: la función % no existe en esta base (se saltea)', p_nombre; end if;
  return n;
end; $$;

-- 1) Solo service_role (Edge Functions y cron)
select public._hard_permisos(f, 'public, anon, authenticated', 'service_role')
  from unnest(array['find_new_category_alert_matches', 'get_offer_broadcast_recipients',
                    'avisos_pendientes', 'avisos_marcar']) f;

-- 2a) Admin: solo cuentas con sesión (adentro validan is_admin())
select public._hard_permisos(p.proname, 'public, anon', 'authenticated, service_role')
  from (select distinct proname from pg_proc
         where pronamespace = 'public'::regnamespace
           and (proname like 'admin\_%' or proname in ('get_admin_dashboard', 'get_top_searches'))) p;

-- 2b) Panel del proveedor: solo con sesión (adentro validan que sea el dueño)
select public._hard_permisos(f, 'public, anon', 'authenticated, service_role')
  from unnest(array['get_provider_dashboard_stats', 'get_provider_monthly_report',
                    'get_provider_broadcast_status', 'perfil_elegir_rol']) f;

-- 2c) Funciones de trigger: nadie las llama por la API (los triggers andan igual)
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
  end loop;
end $$;

-- 3) search_path fijo donde falte (no toca las de extensiones como PostGIS)
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    begin
      execute format('alter function %s set search_path = public, extensions, pg_temp', r.firma);
    exception when others then
      raise notice 'hardening: no se pudo fijar search_path en % (%)', r.firma, sqlerrm;
    end;
  end loop;
end $$;

-- 4) Compartidos: sin listado público (solo si el link pasa por su función segura)
do $$ declare r record; v_apu boolean; v_comp boolean; begin
  select coalesce(bool_or(prosecdef), false) into v_apu  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_shared_apu_budget';
  select coalesce(bool_or(prosecdef), false) into v_comp from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_shared_computation';
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and coalesce(qual, '') ilike '%is_public%'
       and coalesce(qual, '') not ilike '%auth.uid()%'
       and ((v_apu and tablename in ('apu_user_budgets', 'apu_user_budget_items', 'apu_user_budget_item_components', 'apu_budget_phases'))
         or (v_comp and tablename in ('computations', 'computation_items')))
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    raise notice 'hardening: política % de % eliminada (listado público de compartidos)', r.policyname, r.tablename;
  end loop;
  if not v_apu then raise notice 'hardening: get_shared_apu_budget no es SECURITY DEFINER o no existe: no se tocan las políticas de presupuestos'; end if;
  if not v_comp then raise notice 'hardening: get_shared_computation no es SECURITY DEFINER o no existe: no se tocan las políticas de cómputos'; end if;
end $$;

-- 5) Storage: listar archivos de los buckets públicos solo dueño / admin
do $$ declare r record; begin
  if to_regclass('storage.objects') is null then raise notice 'hardening: no hay storage.objects (se saltea)'; return; end if;
  for r in
    select policyname
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and cmd = 'SELECT'
       and (roles && array['anon', 'public']::name[])
       and coalesce(qual, '') ~ '(provider-logos|provider-work-photos)'
       and coalesce(qual, '') not ilike '%auth.uid()%'
       and coalesce(qual, '') not ilike '%is_admin%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'hardening: política de storage % eliminada (dejaba listar archivos)', r.policyname;
  end loop;
  execute 'drop policy if exists "hardening: logos, ver los propios" on storage.objects';
  execute $p$create policy "hardening: logos, ver los propios" on storage.objects for select to authenticated
    using (bucket_id = 'provider-logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$p$;
  execute 'drop policy if exists "hardening: fotos de trabajos, ver las propias" on storage.objects';
  execute $p$create policy "hardening: fotos de trabajos, ver las propias" on storage.objects for select to authenticated
    using (bucket_id = 'provider-work-photos' and (public.is_admin() or exists (
      select 1 from public.provider_branches pb join public.providers p on p.id = pb.provider_id
       where pb.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid())))$p$;
end $$;

-- 6) Menos privilegios por defecto en las tablas
do $$ declare r record; begin
  for r in select schemaname, tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('revoke truncate, references, trigger on %I.%I from anon, authenticated', r.schemaname, r.tablename);
    exception when others then raise notice 'hardening: % (%)', r.tablename, sqlerrm; end;
  end loop;
end $$;
do $$ begin
  alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
exception when others then raise notice 'hardening: privilegios por defecto (%): %', current_user, sqlerrm; end $$;

-- 7) Registro de auditoría
create table if not exists public.auditoria_eventos (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,                 -- quién hizo el cambio (null = sistema / SQL Editor)
  actor_rol text,             -- rol de la base: authenticated, service_role, postgres…
  tabla text not null,
  fila_id text,
  accion text not null,       -- INSERT / UPDATE / DELETE
  cambios jsonb not null default '{}'::jsonb  -- {columna: [antes, después]}
);
create index if not exists auditoria_eventos_at on public.auditoria_eventos (at desc);
create index if not exists auditoria_eventos_tabla on public.auditoria_eventos (tabla, fila_id);
alter table public.auditoria_eventos enable row level security;
revoke all on public.auditoria_eventos from anon, authenticated;
grant select on public.auditoria_eventos to authenticated;
drop policy if exists auditoria_solo_admin on public.auditoria_eventos;
create policy auditoria_solo_admin on public.auditoria_eventos for select to authenticated using (public.is_admin());

-- Trigger genérico: anota solo las columnas que se le pasan (TG_ARGV) y solo si cambiaron.
create or replace function public.auditoria_registrar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else '{}'::jsonb end;
  v_cambios jsonb := '{}'::jsonb;
  c text;
begin
  foreach c in array tg_argv loop
    if (v_old -> c) is distinct from (v_new -> c) then
      v_cambios := v_cambios || jsonb_build_object(c, jsonb_build_array(v_old -> c, v_new -> c));
    end if;
  end loop;
  if tg_op = 'UPDATE' and v_cambios = '{}'::jsonb then return null; end if;
  insert into public.auditoria_eventos (actor, actor_rol, tabla, fila_id, accion, cambios)
  values (auth.uid(), current_setting('role', true), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id'), tg_op, v_cambios);
  return null;
end; $$;
revoke all on function public.auditoria_registrar() from public, anon, authenticated;

do $$ begin
  -- perfiles: cambios de rol y borrado de cuentas
  if to_regclass('public.profiles') is not null then
    drop trigger if exists auditoria_profiles on public.profiles;
    create trigger auditoria_profiles after update or delete on public.profiles
      for each row execute function public.auditoria_registrar('role', 'perfil');
  end if;
  -- fichas: aprobación, publicación, dueño, activo, CUIT
  if to_regclass('public.providers') is not null then
    drop trigger if exists auditoria_providers on public.providers;
    create trigger auditoria_providers after insert or update or delete on public.providers
      for each row execute function public.auditoria_registrar('verification_status', 'publicado', 'active', 'owner_id', 'tax_id', 'business_name');
  end if;
  -- precios de proveedores: aprobación / rechazo
  if to_regclass('public.provider_offers') is not null then
    drop trigger if exists auditoria_provider_offers on public.provider_offers;
    create trigger auditoria_provider_offers after update or delete on public.provider_offers
      for each row execute function public.auditoria_registrar('status', 'amount');
  end if;
  -- reseñas borradas (moderación)
  if to_regclass('public.provider_reviews') is not null then
    drop trigger if exists auditoria_provider_reviews on public.provider_reviews;
    create trigger auditoria_provider_reviews after delete on public.provider_reviews
      for each row execute function public.auditoria_registrar('rating', 'comment', 'user_id');
  end if;
end $$;

drop function public._hard_permisos(text, text, text);

commit;

-- ---------------------------------------------------------------------------
-- Opcional (aparte): borrar eventos de auditoría de más de un año, todos los meses.
-- select cron.schedule('nexobra-auditoria-retencion', '17 4 1 * *',
--   $c$ delete from public.auditoria_eventos where at < now() - interval '365 days' $c$);
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verificación (correr después; todo debería dar 0 filas salvo donde se indica)
-- ---------------------------------------------------------------------------
-- a) Funciones SECURITY DEFINER que un visitante sin cuenta puede ejecutar. Esperado: solo
--    las públicas a propósito (nearby_*, representative_price_nearby, branch_price_variation,
--    get_shared_apu_budget, get_shared_computation, sec_slug_libre, sec_*_visible, is_admin…).
-- select p.oid::regprocedure from pg_proc p
--  where p.pronamespace = 'public'::regnamespace and p.prosecdef
--    and has_function_privilege('anon', p.oid, 'execute')
--    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--  order by 1;
-- b) Esto tiene que dar 0 filas (mails expuestos):
-- select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
--    and p.proname in ('find_new_category_alert_matches', 'get_offer_broadcast_recipients', 'avisos_pendientes', 'avisos_marcar')
--    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- c) Políticas de listado público que quedan (esperado 0):
-- select tablename, policyname, qual from pg_policies
--  where schemaname = 'public' and qual ilike '%is_public%' and qual not ilike '%auth.uid()%';
-- d) Triggers de auditoría (esperado 4):
-- select tgname, tgrelid::regclass from pg_trigger where tgname like 'auditoria\_%';
