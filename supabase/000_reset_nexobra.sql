-- NEXOBRA · Reinicio controlado del esquema inicial.
-- ATENCIÓN: elimina solamente datos y tablas de NEXOBRA en el esquema public.
-- No elimina tu proyecto de Supabase ni las cuentas de auth.users.
-- Ejecutar solo si se quiere empezar de cero.

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.computation_items cascade;
drop table if exists public.computations cascade;
drop table if exists public.provider_offers cascade;
drop table if exists public.provider_branches cascade;
drop table if exists public.providers cascade;
drop table if exists public.material_price_bases cascade;
drop table if exists public.index_values cascade;
drop table if exists public.index_series cascade;
drop table if exists public.material_aliases cascade;
drop table if exists public.materials cascade;
drop table if exists public.profiles cascade;

drop function if exists public.is_admin();
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();

drop type if exists public.offer_status;
drop type if exists public.user_role;

commit;
