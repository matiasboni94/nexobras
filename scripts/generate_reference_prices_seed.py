"""Genera valores de referencia publicados desde el catálogo legacy data.js."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data.js"
OUTPUT_DIR = ROOT / "supabase" / "migrations"
MATERIALS_PER_FILE = 180
REFERENCE_DATE = "2026-04-01"


def sql_text(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def main() -> None:
    raw = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"const\s+NEXOBRA_DATA\s*=\s*(\[.*?\])\s*;\s*\n\s*const\s+NEXOBRA_METRICS", raw, re.DOTALL)
    if not match:
        raise RuntimeError("No se encontró NEXOBRA_DATA en data.js")
    materials = json.loads(match.group(1))

    for part_number, start in enumerate(range(0, len(materials), MATERIALS_PER_FILE), start=1):
        chunk = materials[start:start + MATERIALS_PER_FILE]
        lines = [
            "-- NEXOBRA · Valores de referencia publicados. No editar manualmente.",
            f"-- Parte {part_number}. Ejecutar después de 003_reference_prices_schema.sql.",
            "begin;",
            "",
        ]
        for item in chunk:
            for price_kind, amount in (("sale", item["precioVenta"]), ("measurement", item["precioComputo"])):
                lines.append(
                    "insert into public.material_reference_prices (material_id, price_kind, amount, reference_date, source_name, is_published) values "
                    f"({sql_text(item['id'])}, {sql_text(price_kind)}, {float(amount)}, {sql_text(REFERENCE_DATE)}, 'Carga inicial NEXOBRA', true) "
                    "on conflict (material_id, price_kind, reference_date) do update set amount = excluded.amount, source_name = excluded.source_name, is_published = excluded.is_published;"
                )
        lines.extend(["", "commit;", ""])
        output = OUTPUT_DIR / f"004_seed_reference_prices_part_{part_number:02}.sql"
        output.write_text("\n".join(lines), encoding="utf-8")
        print(f"Generados {len(chunk)} materiales en {output}")


if __name__ == "__main__":
    main()
