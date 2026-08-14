"""Genera una migración SQL desde el catálogo legacy data.js de NEXOBRA."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data.js"
OUTPUT_DIR = ROOT / "supabase" / "migrations"
MATERIALS_PER_FILE = 90

MONTHS = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def sql_text(value: object) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql_number(value: object) -> str:
    if value is None:
        return "null"
    return str(float(value))


def month_date(value: str) -> str:
    match = re.fullmatch(r"([a-z]{3})-(\d{2})", value.lower())
    if not match or match.group(1) not in MONTHS:
        raise ValueError(f"Mes base inválido: {value}")
    return date(2000 + int(match.group(2)), MONTHS[match.group(1)], 1).isoformat()


def main() -> None:
    raw = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"const\s+NEXOBRA_DATA\s*=\s*(\[.*?\])\s*;\s*\n\s*const\s+NEXOBRA_METRICS", raw, re.DOTALL)
    if not match:
        raise RuntimeError("No se encontró NEXOBRA_DATA en data.js")
    materials = json.loads(match.group(1))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for part_number, start in enumerate(range(0, len(materials), MATERIALS_PER_FILE), start=1):
        chunk = materials[start:start + MATERIALS_PER_FILE]
        lines = [
            "-- NEXOBRA · Semilla generada desde data.js. No editar manualmente.",
            f"-- Parte {part_number}. Ejecutar después de 001_initial_schema.sql.",
            "begin;",
            "",
            "insert into public.index_series (code, name, source_name, applies_to)",
            "values ('ipc_materials_reference', 'Índice de referencia para materiales', 'Carga manual NEXOBRA', 'materials')",
            "on conflict (code) do nothing;",
            "",
        ]

        for item in chunk:
            lines.append(
                "insert into public.materials (id, rubro, category, subcategory, denomination, sale_unit, measurement_unit, package_quantity) values "
                f"({sql_text(item['id'])}, {sql_text(item['rubro'])}, {sql_text(item.get('categoria'))}, "
                f"{sql_text(item.get('subcategoria'))}, {sql_text(item['denominacion'])}, "
                f"{sql_text(item.get('unidadVenta'))}, {sql_text(item.get('unidadComputo'))}, {sql_number(item.get('envase'))}) "
                "on conflict (id) do update set rubro = excluded.rubro, category = excluded.category, "
                "subcategory = excluded.subcategory, denomination = excluded.denomination, sale_unit = excluded.sale_unit, "
                "measurement_unit = excluded.measurement_unit, package_quantity = excluded.package_quantity;"
            )
            for alias in item.get("tags", []):
                lines.append(
                    "insert into public.material_aliases (material_id, alias) values "
                    f"({sql_text(item['id'])}, {sql_text(alias)}) on conflict (material_id, alias) do nothing;"
                )

            sale_base = float(item.get("precioBase") or item.get("precioVenta") or 0)
            sale_current = float(item.get("precioVenta") or sale_base)
            factor = sale_current / sale_base if sale_base else 1
            measurement_base = float(item.get("precioComputo") or 0) / factor
            base_month = month_date(item.get("mesBase", "abr-25"))
            series = "(select id from public.index_series where code = 'ipc_materials_reference')"
            for price_kind, amount in (("sale", sale_base), ("measurement", measurement_base)):
                lines.append(
                    "insert into public.material_price_bases (material_id, price_kind, amount, base_month, index_series_id) values "
                    f"({sql_text(item['id'])}, {sql_text(price_kind)}, {sql_number(amount)}, {sql_text(base_month)}, {series}) "
                    "on conflict (material_id, price_kind, base_month) do update set amount = excluded.amount, index_series_id = excluded.index_series_id;"
                )

        lines.extend(["", "commit;", ""])
        output = OUTPUT_DIR / f"002_seed_materials_part_{part_number:02}.sql"
        output.write_text("\n".join(lines), encoding="utf-8")
        print(f"Generados {len(chunk)} materiales en {output}")


if __name__ == "__main__":
    main()
