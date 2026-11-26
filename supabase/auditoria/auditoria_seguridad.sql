-- auditoria_seguridad.sql (26/11) — SOLO LECTURA. No cambia nada.
-- Correr en el SQL Editor de Supabase (antes y después de la 047) y pegarme el resultado.
-- Devuelve una sola tabla: chequeo · objeto · detalle · estado (OK / REVISAR / CRITICO).
-- No muestra mails ni datos personales: solo nombres de objetos y conteos.

with
fn as (
  select p.oid, p.proname, p.oid::regprocedure::text as firma, p.prosecdef, p.prorettype,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
publicas(nombre) as (values
  ('nearby_offers_for_material'), ('nearby_provider_branches'), ('nearby_providers_directory'),
  ('nearby_representative_prices'), ('representative_price_nearby'), ('branch_price_variation'),
  ('get_shared_apu_budget'), ('get_shared_computation'), ('sec_slug_libre'),
  ('sec_proveedor_visible'), ('sec_sucursal_visible'), ('is_admin')
)
-- 1) Tablas sin RLS
select '01 tabla sin RLS' as chequeo, c.relname::text as objeto, 'cualquiera con la clave pública puede leer/escribir según los grants' as detalle, 'CRITICO' as estado
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
   and c.relname <> 'spatial_ref_sys'
union all
-- 2) Políticas de escritura abiertas (sin condición) para anon / public
select '02 escritura sin condición', tablename || ' · ' || policyname, cmd || ' para ' || array_to_string(roles, ','),
       case when cmd in ('INSERT') then 'REVISAR' else 'CRITICO' end
  from pg_policies
 where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   and (roles && array['anon', 'public']::name[])
   and (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true')
union all
-- 3) Funciones SECURITY DEFINER que un visitante sin cuenta puede ejecutar
select '03 función abierta a anon', f.firma,
       case when f.prorettype = 'trigger'::regtype then 'trigger (no se llama por API, igual conviene cerrarla)' else 'SECURITY DEFINER ejecutable sin cuenta' end,
       case when f.proname in (select nombre from publicas) then 'OK'
            when f.proname in ('find_new_category_alert_matches', 'get_offer_broadcast_recipients', 'avisos_pendientes', 'avisos_marcar') then 'CRITICO'
            else 'REVISAR' end
  from fn f
 where f.prosecdef and has_function_privilege('anon', f.oid, 'execute')
union all
-- 4) Funciones que leen mails (solo deberían ser de service_role)
select '04 función con mails', f.firma,
       'anon=' || has_function_privilege('anon', f.oid, 'execute') || ' authenticated=' || has_function_privilege('authenticated', f.oid, 'execute'),
       case when has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then 'CRITICO' else 'OK' end
  from fn f
 where f.proname in ('find_new_category_alert_matches', 'get_offer_broadcast_recipients', 'avisos_pendientes', 'avisos_marcar')
union all
-- 5) Funciones sin search_path fijo
select '05 sin search_path', f.firma, case when f.prosecdef then 'SECURITY DEFINER' else 'invoker' end,
       case when f.prosecdef then 'CRITICO' else 'REVISAR' end
  from fn f
 where f.cfg not like '%search_path=%' and f.prorettype <> 'trigger'::regtype
union all
-- 6) Listado público de compartidos (sin token)
select '06 listado de compartidos', tablename || ' · ' || policyname, left(qual, 120), 'REVISAR'
  from pg_policies
 where schemaname = 'public' and qual ilike '%is_public%' and qual not ilike '%auth.uid()%'
union all
-- 7) Vistas que corren con permisos del dueño (saltean RLS) y anon puede leer
select '07 vista sin security_invoker', c.relname::text, 'anon puede leer: ' || has_table_privilege('anon', c.oid, 'select'),
       case when has_table_privilege('anon', c.oid, 'select') then 'REVISAR' else 'OK' end
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
   and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false)
union all
-- 8) Storage: buckets
select '08 bucket', b.id, 'público=' || b.public || ' tope=' || coalesce(b.file_size_limit::text, 'sin tope') || ' tipos=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'todos'),
       case when b.file_size_limit is null or b.allowed_mime_types is null then 'REVISAR' else 'OK' end
  from storage.buckets b
union all
-- 9) Storage: políticas de lectura para anon (permiten listar archivos)
select '09 storage listable', policyname, left(coalesce(qual, ''), 120), 'REVISAR'
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
   and (roles && array['anon', 'public']::name[])
union all
-- 10) Tablas con TRUNCATE para anon/authenticated
select '10 truncate para anon', c.relname::text, 'privilegio que la app no usa', 'REVISAR'
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   and (has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'truncate'))
union all
-- 11) Extensiones instaladas en public
select '11 extensión en public', e.extname, 'versión ' || e.extversion, 'REVISAR'
  from pg_extension e where e.extnamespace = 'public'::regnamespace
union all
-- 12) Cuentas admin (solo conteo)
select '12 cuentas admin', 'profiles.role = admin', count(*)::text || ' cuenta(s)',
       case when count(*) <= 2 then 'OK' else 'REVISAR' end
  from public.profiles where role::text = 'admin'
union all
-- 13) Trabajos programados (no muestra el comando, que puede tener el CRON_SECRET)
select '13 cron', j.jobname, j.schedule || case when j.active then '' else ' (inactivo)' end, 'OK'
  from cron.job j
union all
-- 14) Versión de Postgres
select '14 versión', 'postgres', split_part(version(), ' on ', 1), 'REVISAR en el panel si hay actualización'
union all
-- 15) Auditoría (047)
select '15 registro de auditoría', 'auditoria_eventos',
       case when to_regclass('public.auditoria_eventos') is null then 'no existe (falta la 047)' else 'existe' end,
       case when to_regclass('public.auditoria_eventos') is null then 'REVISAR' else 'OK' end
order by 1, 2;
