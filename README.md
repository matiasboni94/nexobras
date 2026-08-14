# NEXOBRA

Comparador técnico de precios y cómputos para la construcción.

## Publicación inicial

Este proyecto es un sitio estático: no requiere servidor propio ni un plan de hosting pago.

1. Creá un repositorio vacío llamado `nexobra` en GitHub.
2. Subí esta carpeta completa al repositorio, incluyendo `supabase-config.js`.
3. En Cloudflare, abrí **Workers & Pages** y creá un proyecto de **Pages** conectado al repositorio.
4. Configuración de build:
   - Framework preset: `None`.
   - Build command: dejar vacío.
   - Build output directory: `/`.
5. Publicá el proyecto y, después, agregá el dominio `nexobra.com.ar` desde **Custom domains**.

## Supabase

`supabase-config.js` incluye solamente la URL pública y la publishable key. Esa clave puede estar expuesta en una aplicación web; las políticas Row Level Security de Supabase controlan qué datos se pueden leer o modificar.

Nunca agregues al proyecto una `sb_secret_...`, una `service_role` ni la contraseña de la base de datos.

## Migraciones realizadas

- `001_initial_schema.sql`: estructura y políticas de seguridad.
- `002_seed_materials_part_*.sql`: catálogo, aliases y precios base.
- `003_reference_prices_schema.sql`: valores de referencia publicados.
- `004_seed_reference_prices_part_*.sql`: valores de referencia iniciales.
