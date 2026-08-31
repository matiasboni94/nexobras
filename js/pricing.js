// NEXOBRA - pricing.js

import * as Catalog from './catalog.js';
import * as Computo from './computo.js';
import * as ST from './state.js';

  export let sharedMonths = [];
  export async function loadIndexSeries() {
    if (!ST.supabaseClient) return;
    const { data, error } = await ST.supabaseClient
      .from('index_values')
      .select('reference_month, value, index_series!inner(code)')
      .eq('index_series.code', ST.indexState.seriesCode)
      .eq('is_published', true)
      .order('reference_month');

    if (error || !data || data.length === 0) {
      console.warn('No se pudo cargar la serie de IPC desde Supabase. Se usa el factor estático de respaldo.', error?.message);
      return;
    }

    ST.indexState.values = {};
    data.forEach(row => { ST.indexState.values[row.reference_month] = Number(row.value); });
    ST.indexState.months = data.map(row => row.reference_month);
    ST.indexState.loaded = true;
  }

  export function populateMonthSelect() {
    ST.wireYearMonthPicker(
      document.getElementById('price-year-select'),
      document.getElementById('price-month-select'),
      sharedMonths,
      ST.state.priceMonth,
      (value) => setPriceMonth(value)
    );
  }

  // --- MANO DE OBRA (UOCRA Zona A) ---
  // Cada rol es una index_series con applies_to = 'labor'. El valor ya está en
  // pesos (no es un índice base-100 como el IPC), así que no hace falta calcular
  // factor: el jornal del mes elegido se busca directo en la serie.
  export async function loadLaborSeries() {
    if (!ST.supabaseClient) return;
    const { data, error } = await ST.supabaseClient
      .from('index_values')
      .select('reference_month, value, index_series!inner(code, name, unit, applies_to)')
      .eq('index_series.applies_to', 'labor')
      .eq('is_published', true)
      .order('reference_month');

    if (error || !data || data.length === 0) {
      console.warn('No se pudo cargar la serie de mano de obra (UOCRA).', error?.message);
      return;
    }

    const porRol = {};
    data.forEach(row => {
      const code = row.index_series.code;
      if (!porRol[code]) {
        porRol[code] = { code, name: row.index_series.name, unit: row.index_series.unit, values: {} };
      }
      porRol[code].values[row.reference_month] = Number(row.value);
    });
    ST.laborState.roles = Object.values(porRol);
    // Solo cuentan los meses en los que TODOS los roles tienen dato (no solo alguno).
    const mesesConTodosLosRoles = [...new Set(data.map(r => r.reference_month))]
      .filter(m => ST.laborState.roles.every(r => r.values[m] !== undefined))
      .sort();
    ST.laborState.months = mesesConTodosLosRoles;
    ST.laborState.loaded = true;
  }

  /**
   * Se llama una vez que IPC y UOCRA terminaron de cargar. Calcula la intersección
   * de meses disponibles en ambas series y fija ahí el único período del presupuesto,
   * para que materiales y mano de obra nunca queden con fechas distintas.
   */
  export function reconcilePriceMonth() {
    if (!ST.indexState.loaded && !ST.laborState.loaded) return;

    if (ST.indexState.loaded && ST.laborState.loaded) {
      const interseccion = ST.indexState.months.filter(m => ST.laborState.months.includes(m));
      sharedMonths = interseccion.length > 0 ? interseccion : ST.indexState.months;
      if (interseccion.length === 0) {
        console.warn('IPC y UOCRA no tienen ningún mes en común todavía; se usa solo la serie de IPC hasta que se actualice UOCRA (o viceversa).');
      }
    } else {
      // Todavía falta que termine de cargar una de las dos series; usamos la que ya está.
      sharedMonths = ST.indexState.loaded ? ST.indexState.months : ST.laborState.months;
    }

    setPriceMonth(sharedMonths[sharedMonths.length - 1], { silent: true });
    if (!ST.state.computoMonth) {
      // Solo la primera vez: "Mi Cómputo" arranca siempre en el mes más actual disponible.
      ST.state.computoMonth = sharedMonths[sharedMonths.length - 1];
    }
    populateMonthSelect();
    populateLaborMonthSelect();
    populateComputoMonthSelect();
    renderIpcChart();
    updateReferenceStatus();
    Catalog.renderProducts();
    Catalog.renderLabor();
    Computo.updateCartUI();
  }

  export function populateComputoMonthSelect() {
    ST.wireYearMonthPicker(
      document.getElementById('computo-year-select'),
      document.getElementById('computo-month-select'),
      sharedMonths,
      ST.state.computoMonth,
      (value) => {
        ST.state.computoMonth = value;
        Computo.updateCartUI();
      }
    );
  }

  export function setPriceMonth(value, { silent = false } = {}) {
    ST.state.priceMonth = value;
    ST.REFERENCE_PRICE_INFO.period = ST.monthLabel(ST.state.priceMonth);
    ST.REFERENCE_PRICE_INFO.updatedAt = new Date(`${ST.state.priceMonth}T00:00:00`).toLocaleDateString('es-AR');
    ST.REFERENCE_PRICE_INFO.source = 'INDEC (IPC) y UOCRA · único período para todo el presupuesto';
    if (silent) return;
    populateMonthSelect();
    populateLaborMonthSelect();
    updateReferenceStatus();
    Catalog.renderProducts();
    Catalog.renderLabor();
    renderIpcChart();
  }

  export function populateLaborMonthSelect() {
    ST.wireYearMonthPicker(
      document.getElementById('labor-year-select'),
      document.getElementById('labor-month-select'),
      sharedMonths,
      ST.state.priceMonth,
      (value) => setPriceMonth(value)
    );
  }

  export let ipcChartInstance = null;

  export function renderIpcChart() {
    const canvas = document.getElementById('ipc-evolution-chart');
    if (!canvas || typeof Chart === 'undefined' || ST.indexState.months.length === 0) return;

    const labels = ST.indexState.months.map(ST.monthLabel);
    const data = ST.indexState.months.map(m => ST.indexState.values[m]);
    const selectedIdx = ST.indexState.months.indexOf(ST.state.priceMonth);

    if (ipcChartInstance) {
      ipcChartInstance.data.labels = labels;
      ipcChartInstance.data.datasets[0].data = data;
      ipcChartInstance.data.datasets[0].pointBackgroundColor = ST.indexState.months.map((_, i) =>
        i === selectedIdx ? '#d97757' : 'rgba(217,119,87,0.25)');
      ipcChartInstance.data.datasets[0].pointRadius = ST.indexState.months.map((_, i) => i === selectedIdx ? 6 : 0);
      ipcChartInstance.resize(); // el canvas pudo haber estado oculto (display:none) cuando se creó
      ipcChartInstance.update();
      return;
    }

    ipcChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Índice IPC (dic-16 = 100)',
          data,
          borderColor: '#d97757',
          backgroundColor: 'rgba(217,119,87,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.15,
          pointRadius: ST.indexState.months.map((_, i) => i === selectedIdx ? 6 : 0),
          pointBackgroundColor: ST.indexState.months.map((_, i) => i === selectedIdx ? '#d97757' : 'rgba(217,119,87,0.25)')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { ticks: { callback: v => v.toLocaleString('es-AR') } }
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const month = ST.indexState.months[idx];
          ST.state.priceMonth = month;
          const select = document.getElementById('price-month-select');
          if (select) select.value = month;
          ST.REFERENCE_PRICE_INFO.period = ST.monthLabel(month);
          ST.REFERENCE_PRICE_INFO.updatedAt = new Date(`${month}T00:00:00`).toLocaleDateString('es-AR');
          updateReferenceStatus();
          Catalog.renderProducts();
          renderIpcChart();
        }
      }
    });
  }

  export function getReferencePrice(item, mode = ST.state.pricingMode, targetMonthOverride = null) {
    const ventaBase = Number(item.precioBase);
    const baseDate = ST.baseLabelToDate(item.mesBase);
    const targetDate = targetMonthOverride || ST.state.priceMonth;
    const indiceBase = baseDate ? ST.indexState.values[baseDate] : undefined;
    const indiceDestino = targetDate ? ST.indexState.values[targetDate] : undefined;

    let factor = 1;
    let dynamic = false;
    if (ST.indexState.loaded && indiceBase && indiceDestino) {
      factor = indiceDestino / indiceBase;
      dynamic = true;
    } else {
      const ventaCurrent = Number(item.precioVenta);
      factor = ventaBase > 0 && ventaCurrent > 0 ? ventaCurrent / ventaBase : 1;
    }

    const basePrice = mode === 'venta' ? ventaBase : ventaBase * (Number(item.precioComputo) / Number(item.precioVenta || 1));
    const currentPrice = basePrice * factor;

    return {
      currentPrice,
      basePrice,
      factor,
      dynamic,
      basePeriod: item.mesBase || 'período base no informado',
      targetPeriod: targetDate ? ST.monthLabel(targetDate) : ST.REFERENCE_PRICE_INFO.period,
      targetMonth: targetDate,
      unit: mode === 'venta' ? item.unidadVenta : item.unidadComputo
    };
  }

  /**
   * Resuelve el precio "en vivo" de un ítem del carrito contra un mes puntual
   * (normalmente ST.state.computoMonth). No depende de nada que se haya guardado
   * al momento de agregar el ítem: siempre vuelve a calcular desde el catálogo
   * base (materiales) o desde la serie de UOCRA (mano de obra). Así, cambiar el
   * mes en "Mi Cómputo" recalcula TODO el presupuesto de una sola vez.
   */
  export function resolveItemPricing(cartItem, targetMonth) {
    if (cartItem.type === 'labor') {
      const role = ST.laborState.roles.find(r => r.code === cartItem.id);
      const valor = role ? role.values[targetMonth] : undefined;
      return {
        unitPrice: valor !== undefined ? valor : 0,
        basePrice: null,
        factor: null,
        basePeriod: null,
        disponible: valor !== undefined
      };
    }

    // Ítem elegido de un proveedor puntual: precio fijo tal cual se cargó al
    // elegirlo, no se recalcula contra ningún mes (no hay un "índice" de un
    // proveedor individual, solo lo que tiene puesto ahora mismo).
    if (cartItem.providerOfferId) {
      return {
        unitPrice: cartItem.providerPrice,
        basePrice: null,
        factor: null,
        basePeriod: null,
        disponible: true,
        isProviderSourced: true
      };
    }

    const material = NEXOBRA_DATA.find(m => m.id === cartItem.id);
    if (!material) {
      return { unitPrice: 0, basePrice: null, factor: null, basePeriod: null, disponible: false };
    }
    const trace = getReferencePrice(material, cartItem.mode || 'venta', targetMonth);
    return {
      unitPrice: trace.currentPrice,
      basePrice: trace.basePrice,
      factor: trace.factor,
      basePeriod: trace.basePeriod,
      disponible: true
    };
  }

  export function renderPriceTrace(item, mode = ST.state.pricingMode) {
    const trace = getReferencePrice(item, mode);
    const metodo = trace.dynamic
      ? `Índice IPC (INDEC): ${trace.basePeriod} → ${trace.targetPeriod}`
      : `Factor de referencia fijo (serie de IPC no disponible)`;
    return `
      <details class="price-trace">
        <summary>Ver cálculo y fuente</summary>
        <div class="price-trace-content">
          <div><span>Base:</span> <strong>${ST.formatMoney(trace.basePrice)} · ${trace.basePeriod}</strong></div>
          <div><span>Factor:</span> <strong>× ${ST.formatFactor(trace.factor)}</strong></div>
          <div><span>Fórmula:</span> ${ST.formatMoney(trace.basePrice)} × ${ST.formatFactor(trace.factor)} = <strong>${ST.formatMoney(trace.currentPrice)}</strong></div>
          <div><span>Método:</span> ${metodo}</div>
          <div><span>Fuente:</span> ${ST.REFERENCE_PRICE_INFO.source}</div>
          <p>Valor orientativo, sin impuestos ni flete incluidos. Confirmá precio final, disponibilidad, entrega y pago con el proveedor.</p>
        </div>
      </details>
    `;
  }

  export function updateReferenceStatus() {
    if (!ST.referencePriceStatus) return;
    ST.referencePriceStatus.innerHTML = `Valores de referencia NEXOBRA · Período: <strong>${ST.REFERENCE_PRICE_INFO.period}</strong> · Fuente: ${ST.REFERENCE_PRICE_INFO.source} · Actualizado: ${ST.REFERENCE_PRICE_INFO.updatedAt}`;
  }

  export function toBaseMonthLabel(value) {
    if (!value) return 'período base no informado';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
  }

  export function newestPrice(prices, kind, dateField) {
    return (prices || [])
      .filter(price => price.price_kind === kind)
      .sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])))[0];
  }

  export function mapRemoteMaterial(row) {
    const baseSale = newestPrice(row.material_price_bases, 'sale', 'base_month');
    const baseMeasurement = newestPrice(row.material_price_bases, 'measurement', 'base_month');
    const referenceSale = newestPrice(row.material_reference_prices, 'sale', 'reference_date');
    const referenceMeasurement = newestPrice(row.material_reference_prices, 'measurement', 'reference_date');

    return {
      id: row.id,
      rubro: row.rubro,
      categoria: row.category || '',
      subcategoria: row.subcategory || '',
      denominacion: row.denomination,
      tags: (row.material_aliases || []).map(alias => alias.alias),
      unidadVenta: row.sale_unit || '',
      unidadComputo: row.measurement_unit || '',
      envase: Number(row.package_quantity) || 1,
      precioBase: Number(baseSale?.amount || referenceSale?.amount || 0),
      precioVenta: Number(referenceSale?.amount || baseSale?.amount || 0),
      precioComputo: Number(referenceMeasurement?.amount || baseMeasurement?.amount || 0),
      mesBase: toBaseMonthLabel(baseSale?.base_month)
    };
  }

  export async function loadCatalogFromSupabase() {
    if (!ST.supabaseClient) return;

    const { data, error } = await ST.supabaseClient
      .from('materials')
      .select(`
        id, rubro, category, subcategory, denomination, sale_unit, measurement_unit, package_quantity,
        material_aliases(alias),
        material_price_bases(amount, price_kind, base_month),
        material_reference_prices(amount, price_kind, reference_date)
      `)
      .eq('active', true)
      .order('id');

    if (error) {
      console.warn('No se pudo cargar el catálogo remoto. Se conserva la copia local.', error.message);
      return;
    }
    if (!data || data.length === 0) return;

    const latestReferenceDate = data
      .flatMap(item => item.material_reference_prices || [])
      .map(item => item.reference_date)
      .filter(Boolean)
      .sort()
      .at(-1);

    // Hasta que existan valores de referencia publicados, conservamos el catálogo local.
    if (!latestReferenceDate) return;

    const remoteMaterials = data.map(mapRemoteMaterial).filter(item => item.precioVenta > 0);
    if (remoteMaterials.length === 0) return;

    NEXOBRA_DATA.splice(0, NEXOBRA_DATA.length, ...remoteMaterials);

    if (latestReferenceDate) {
      const latest = new Date(`${latestReferenceDate}T00:00:00`);
      ST.REFERENCE_PRICE_INFO.period = latest.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      ST.REFERENCE_PRICE_INFO.updatedAt = latest.toLocaleDateString('es-AR');
    }
    ST.REFERENCE_PRICE_INFO.source = 'Base de datos NEXOBRA';

    Catalog.renderHomeSubareas();
    Catalog.renderRubroPills();
    Catalog.renderProducts();
    Catalog.updateCatalogHeader();
    updateReferenceStatus();
    ST.showToast(`✓ Catálogo actualizado desde NEXOBRA (${remoteMaterials.length} materiales)`);
  }
