// NEXOBRA - excel.js

import * as ST from './state.js';
import * as Computo from './computo.js';

  /**
   * Interpreta la columna "Unidad" de un Excel de forma flexible (tolera
   * mayúsculas, acentos y plural simple: "Bolsas" ~ "Bolsa", "KG" ~ "kg"),
   * y la compara contra las dos unidades válidas del material matcheado
   * (venta = unidad de compra, computo = unidad de cómputo/APU).
   * No exige coincidencia exacta: si no matchea ninguna, devuelve matched:false
   * para que quien llama decida un fallback (no bloquea la carga).
   */
  function normalizeUnitToken(u) {
    return ST.normalizeText(u || '').replace(/s$/, '');
  }

  export function matchUnit(requestedUnit, unidadVenta, unidadComputo) {
    if (!requestedUnit) return { mode: null, matched: false };
    const norm = normalizeUnitToken(requestedUnit);
    if (norm && norm === normalizeUnitToken(unidadVenta)) return { mode: 'venta', matched: true };
    if (norm && norm === normalizeUnitToken(unidadComputo)) return { mode: 'computo', matched: true };
    return { mode: null, matched: false };
  }

  export function openExcelModal() {
    ST.excelModal.classList.add('open');
    ST.excelModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  export function closeExcelModal() {
    ST.excelModal.classList.remove('open');
    ST.excelModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  export function getActiveFactor() {
    const val = ST.excelTargetDate.value;
    if (val === 'custom') {
      return parseFloat(ST.customFactorInput.value) || 1.0;
    }
    return parseFloat(val) || 1.0;
  }

  export function getSelectedDateLabel() {
    const opt = ST.excelTargetDate.options[ST.excelTargetDate.selectedIndex];
    if (ST.excelTargetDate.value === 'custom') {
      return `Personalizado (x${getActiveFactor()})`;
    }
    return opt.text.split('(')[0].trim();
  }

  export function handleExcelFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleExcelFile(e.target.files[0]);
    }
  }

  export function handleExcelFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        processRawExcelData(jsonData);
      } catch (err) {
        alert('Error al leer el archivo Excel. Asegurate de que sea un formato .xlsx o .csv válido.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  export function processRawExcelData(rows) {
    if (!rows || rows.length < 2) {
      alert('El archivo no contiene filas de datos suficientes.');
      return;
    }

    const header = rows[0].map(h => ST.normalizeText(h));
    let descIdx = header.findIndex(h => h.includes('material') || h.includes('denominacion') || h.includes('descripcion') || h.includes('item') || h.includes('nombre') || h.includes('producto'));
    let qtyIdx = header.findIndex(h => h.includes('cant') || h.includes('cantidad') || h.includes('unidades'));
    let codeIdx = header.findIndex(h => h.includes('codigo') || h.includes('id') || h.includes('cod'));
    let unidadIdx = header.findIndex(h => h === 'unidad' || h.includes('unidad'));

    if (descIdx === -1) descIdx = 0;
    if (qtyIdx === -1) qtyIdx = descIdx === 0 ? 1 : 0;

    const processed = [];
    const factor = getActiveFactor();
    const globalMode = ST.excelPricingMode.value;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || (!row[descIdx] && !row[codeIdx])) continue;

      const requestedCode = codeIdx > -1 && row[codeIdx] ? row[codeIdx].toString().trim() : '';
      const requestedDesc = row[descIdx] ? row[descIdx].toString().trim() : '';
      const requestedUnit = unidadIdx > -1 && row[unidadIdx] ? row[unidadIdx].toString().trim() : '';
      let qty = qtyIdx > -1 && row[qtyIdx] ? parseFloat(row[qtyIdx]) || 1 : 1;

      const matchResult = findBestMaterialMatch(requestedCode, requestedDesc);

      let matchedItem = matchResult.item;
      let status = matchResult.status;
      let unitPriceBase = 0;
      let unit = '-';
      let unitPriceUpdated = 0;
      let subtotal = 0;
      let unitAmbiguous = false;
      let mode = globalMode;

      if (matchedItem) {
        const unitMatch = matchUnit(requestedUnit, matchedItem.unidadVenta, matchedItem.unidadComputo);
        if (unitMatch.matched) {
          mode = unitMatch.mode;
        } else if (requestedUnit) {
          // Escribieron algo en "Unidad" pero no coincide con ninguna de las dos válidas del material:
          // no bloqueamos la carga, seguimos con el modo global, pero lo marcamos para que se revise.
          unitAmbiguous = true;
        }
        unitPriceBase = mode === 'venta' ? matchedItem.precioVenta : matchedItem.precioComputo;
        unit = mode === 'venta' ? matchedItem.unidadVenta : matchedItem.unidadComputo;
        unitPriceUpdated = unitPriceBase * factor;
        subtotal = qty * unitPriceUpdated;
      }

      processed.push({
        requestedName: requestedDesc || requestedCode,
        requestedQty: qty,
        requestedUnit,
        unitAmbiguous,
        matchedItem: matchedItem,
        status: status,
        unit: unit,
        unitPrice: unitPriceUpdated,
        subtotal: subtotal
      });
    }

    ST.state.excelProcessedRows = processed;
    renderExcelPreview();
    const ambCount = processed.filter(r => r.unitAmbiguous).length;
    ST.showToast(`✓ Se procesaron ${processed.length} materiales del Excel` + (ambCount > 0 ? ` (${ambCount} con unidad no reconocida, revisalos)` : ''));
  }

  export function findBestMaterialMatch(code, text) {
    if (code) {
      const exactCode = NEXOBRA_DATA.find(i => ST.normalizeText(i.id) === ST.normalizeText(code));
      if (exactCode) return { item: exactCode, status: 'matched' };
    }

    if (!text) return { item: null, status: 'notfound' };

    const normText = ST.normalizeText(text);
    const exactName = NEXOBRA_DATA.find(i => ST.normalizeText(i.denominacion) === normText);
    if (exactName) return { item: exactName, status: 'matched' };

    const searchWords = normText.split(' ').filter(w => w.length > 2);
    let bestMatch = null;
    let highestScore = 0;

    NEXOBRA_DATA.forEach(item => {
      let score = 0;
      const normItemTitle = ST.normalizeText(item.denominacion);
      const normRubro = ST.normalizeText(item.rubro);
      const normCat = ST.normalizeText(item.categoria);
      const allTags = item.tags.map(t => ST.normalizeText(t)).join(' ');

      searchWords.forEach(word => {
        if (normItemTitle.includes(word)) score += 3;
        if (allTags.includes(word)) score += 2;
        if (normCat.includes(word) || normRubro.includes(word)) score += 1;
      });

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    });

    if (highestScore >= 4 && bestMatch) {
      return { item: bestMatch, status: 'matched' };
    } else if (highestScore >= 2 && bestMatch) {
      return { item: bestMatch, status: 'suggested' };
    }

    return { item: null, status: 'notfound' };
  }

  export function recalculateExcelRows() {
    const factor = getActiveFactor();
    const globalMode = ST.excelPricingMode.value;

    ST.state.excelProcessedRows.forEach(row => {
      if (row.matchedItem) {
        const unitMatch = matchUnit(row.requestedUnit, row.matchedItem.unidadVenta, row.matchedItem.unidadComputo);
        const mode = unitMatch.matched ? unitMatch.mode : globalMode;
        const unitPriceBase = mode === 'venta' ? row.matchedItem.precioVenta : row.matchedItem.precioComputo;
        row.unit = mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo;
        row.unitPrice = unitPriceBase * factor;
        row.subtotal = row.requestedQty * row.unitPrice;
      }
    });

    renderExcelPreview();
  }

  export function renderExcelPreview() {
    ST.excelResultsContainer.style.display = 'block';
    const totalSum = ST.state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);
    const matchedCount = ST.state.excelProcessedRows.filter(r => r.matchedItem).length;

    ST.excelStatsText.innerHTML = `
      <strong>${matchedCount}</strong> de <strong>${ST.state.excelProcessedRows.length}</strong> ítems cotizados 
      | Total Estimado: <strong style="color: var(--brand-yellow);">${ST.formatMoney(totalSum)}</strong>
    `;

    ST.excelPreviewTbody.innerHTML = ST.state.excelProcessedRows.map(row => {
      let statusHtml = '';
      if (row.status === 'matched') {
        statusHtml = `<span class="match-status-badge status-matched">✓ Coincidencia exacta</span>`;
      } else if (row.status === 'suggested') {
        statusHtml = `<span class="match-status-badge status-suggested">⚠ Sugerido por tag</span>`;
      } else {
        statusHtml = `<span class="match-status-badge status-notfound">✕ No encontrado</span>`;
      }

      return `
        <tr>
          <td>${statusHtml}</td>
          <td><strong>${ST.escapeHtml(row.requestedName)}</strong></td>
          <td>
            ${row.matchedItem 
              ? `<span style="font-size: 0.82rem; color: var(--brand-dark); font-weight: 600;">[${row.matchedItem.id}] ${ST.escapeHtml(row.matchedItem.denominacion)}</span>` 
              : `<span style="color: var(--text-subtle); font-style: italic;">Sin precio de referencia</span>`}
          </td>
          <td>${row.requestedQty} ${row.unit}${row.unitAmbiguous ? ` <span title="Escribiste &quot;${ST.escapeHtml(row.requestedUnit)}&quot; pero no coincide con ninguna unidad válida de este material. Se usó el modo general (${ST.excelPricingMode.value === 'venta' ? 'Venta' : 'Cómputo'}) por las dudas." style="color:#b45309; font-weight:700; cursor:help;">⚠</span>` : ''}</td>
          <td>${row.matchedItem ? ST.formatMoney(row.unitPrice) : '-'}</td>
          <td style="text-align: right;"><strong>${row.matchedItem ? ST.formatMoney(row.subtotal) : '-'}</strong></td>
        </tr>
      `;
    }).join('');
  }

  export function generateTemplateExcel() {
    const ws_data = [
      ["Código (Opcional)", "Material o Descripción", "Cantidad Requerida", "Unidad"],
      ["BL-003", "Cemento Portland Loma Negra 50kg", 20, "Bolsa"],
      ["BG-001", "Arena gruesa 6m3", 2, "m3"],
      ["ARN-002", "Hierro torsionado del 8 ADN420", 420, "kg"],
      ["CS-001", "Placa Durlock 12.5mm", 15, ""],
      ["CVLH-002", "Ladrillos huecos 12x18x25", 800, "un"],
      ["CAH-012", "Membrana asfáltica 35kg", 4, ""],
      ["", "Inodoro blanco Ferrum Bari", 2, "un"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 16 }, { wch: 42 }, { wch: 16 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales_NEXOBRA");
    XLSX.writeFile(wb, "Plantilla_Materiales_NEXOBRA.xlsx");
    ST.showToast('Plantilla descargada con éxito');
  }

  /**
   * Pasa los materiales matcheados del cotizador de Excel a "Mi Cómputo",
   * reutilizando el mismo carrito (state.computoCart) que ya soporta guardar,
   * abrir, editar cantidades y exportar. Así "guardar el Excel en mi cuenta"
   * no es un sistema aparte: es simplemente cargarlo en el cómputo de siempre.
   */
  export function saveExcelToComputo() {
    const matched = ST.state.excelProcessedRows.filter(r => r.matchedItem);
    if (matched.length === 0) {
      ST.showToast('No hay materiales coincidentes para guardar.');
      return;
    }

    matched.forEach(row => {
      const item = row.matchedItem;
      const mode = row.mode || ST.excelPricingMode.value;
      const unit = mode === 'venta' ? item.unidadVenta : item.unidadComputo;
      const existingIndex = ST.state.computoCart.findIndex(
        i => i.id === item.id && i.type === 'material' && i.mode === mode && !i.providerOfferId
      );
      if (existingIndex > -1) {
        ST.state.computoCart[existingIndex].qty += row.requestedQty;
      } else {
        ST.state.computoCart.push({
          id: item.id,
          denominacion: item.denominacion,
          rubro: item.rubro,
          unit: unit,
          qty: row.requestedQty,
          type: 'material',
          mode: mode
        });
      }
    });

    Computo.saveCart();
    Computo.updateCartUI();
    closeExcelModal();
    Computo.openDrawer();
    ST.showToast(`${matched.length} material${matched.length === 1 ? '' : 'es'} agregado${matched.length === 1 ? '' : 's'} a Mi Cómputo. Elegí proveedor en cada ítem para armar tu lista de compra.`);
  }

  export function exportProcessedExcel() {
    if (ST.state.excelProcessedRows.length === 0) {
      alert('No hay datos procesados para exportar.');
      return;
    }

    const dateLabel = getSelectedDateLabel();
    const modeLabel = ST.excelPricingMode.value === 'venta' ? 'Venta Comercial' : 'Cómputo Métrico';
    const totalPrice = ST.state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);

    const exportData = [
      ["NEXOBRA - Cómputo y Cotización Masiva de Materiales"],
      [`Fecha/Mes de Cotización: ${dateLabel}`, `Modalidad: ${modeLabel}`, `Generado: ${new Date().toLocaleDateString('es-AR')}`],
      [],
      ["Código", "Material Solicitado", "Material Asignado (NEXOBRA)", "Rubro", "Cantidad", "Unidad", "Precio Unitario Actualizado (ARS)", "Subtotal (ARS)", "Estado Coincidencia"]
    ];

    ST.state.excelProcessedRows.forEach(row => {
      exportData.push([
        row.matchedItem ? row.matchedItem.id : "S/D",
        ST.sanitizeForExcel(row.requestedName),
        row.matchedItem ? ST.sanitizeForExcel(row.matchedItem.denominacion) : "No encontrado en base",
        row.matchedItem ? row.matchedItem.rubro : "-",
        row.requestedQty,
        row.unit,
        row.matchedItem ? row.unitPrice : 0,
        row.matchedItem ? row.subtotal : 0,
        row.status === 'matched' ? 'Coincidencia exacta' : (row.status === 'suggested' ? 'Sugerido por Tags' : 'No encontrado')
      ]);
    });

    exportData.push([]);
    exportData.push(["", "", "", "", "", "", "TOTAL GENERAL:", totalPrice, "ARS"]);

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 40 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 22 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotizacion_NEXOBRA");
    XLSX.writeFile(wb, `Cotizacion_NEXOBRA_${dateLabel.replace(/\s+/g, '_')}.xlsx`);
    ST.showToast('✓ Archivo Excel cotizado descargado exitosamente');
  }
