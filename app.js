/**
 * NEXOBRA - Comparador Técnico de Precios para la Construcción
 * Lógica Frontend Interactiva: Home, Subáreas, Catálogo Dinámico y Procesador Excel
 */

(function() {
  'use strict';

  // Metadata descriptiva e íconos para cada Subárea de la Construcción
  const RUBROS_METADATA = {
    "Básicos": {
      icon: "🧱",
      desc: "Cementos, cales, áridos (arena, piedra, binder), hormigón elaborado y aditivos químicos Sika."
    },
    "Acero de refuerzo": {
      icon: "⛓️",
      desc: "Barras lisas AL220, barras torsionadas/aletadas ADN420 del 6 al 25 y mallas electrosoldadas."
    },
    "Construcción en Seco": {
      icon: "🔲",
      desc: "Placas de yeso Durlock (estándar, RH verde, ignífugas), perfiles montantes, soleras y masillas."
    },
    "Cerramientos Verticales": {
      icon: "🏗️",
      desc: "Ladrillos huecos cerámicos, ladrillos comunes macizos, sistema Retak (HCCA) y bloques U."
    },
    "Cubiertas y Aislaciones": {
      icon: "🏠",
      desc: "Chapas Cincalum acanaladas/trapezoidales, membranas asfálticas, lana de vidrio y tejas."
    },
    "Instalaciones": {
      icon: "🚿",
      desc: "Sanitarios Ferrum, griferías FV, cañerías PVC cloacales, Hidro3 agua, gas termofusión y electricidad."
    },
    "Revestimientos": {
      icon: "🎨",
      desc: "Pisos cerámicos, adhesivos Klaukol, porcelanatos, pisos flotantes, mármoles, granitos y pinturas látex."
    },
    "Aberturas": {
      icon: "🚪",
      desc: "Puertas inyectadas, aluminio, madera/mdf, ventanas corredizas, cortinas roller y cerraduras."
    },
    "Maderas": {
      icon: "🪵",
      desc: "Tablas de encofrado, tirantes de pino, fenólicos de 18mm con film y placas de melamina/MDF."
    },
    "Prefabricados": {
      icon: "📐",
      desc: "Viguetas pretensadas tensolite, casetones de telgopor EPS y losas huecas de hormigón."
    },
    "Metálicos": {
      icon: "🔩",
      desc: "Perfiles C, caños estructurales cuadrados/redondos, perfiles UPN/IPN, planchuelas y metal desplegado."
    },
    "Herramientas y Equipos": {
      icon: "🛠️",
      desc: "Hormigoneras, carretillas Sorrento, andamios, amoladoras DeWalt, soldadoras y herramientas Biassoni."
    },
    "Alquiler": {
      icon: "🚜",
      desc: "Alquiler de contenedores, retroexcavadoras, mini cargadoras Bobcat, baños químicos y camionetas."
    },
    "Seguridad e Higiene": {
      icon: "🦺",
      desc: "Cascos Libus, arneses anticaída, botines Pampero/Ombú con puntera de acero, guantes y conos viales."
    },
    "Cubierta": {
      icon: "📐",
      desc: "Zinguería de chapa galvanizada N°25, canaletas, cenefas, cumbreras, babetas y embudos."
    },
    "Ferretería": {
      icon: "🪛",
      desc: "Alambres recocidos N°16 y N°9, clavos cabeza de plomo, clavos punta parís y concertinas de seguridad."
    }
  };

  // --- APP STATE ---
  const state = {
    currentView: 'home', // 'home' | 'catalog'
    pricingMode: 'venta', // 'venta' | 'computo'
    activeRubro: 'Todos',
    searchQuery: '',
    sortBy: 'relevance',
    viewMode: 'grid', // 'grid' | 'table'
    computoCart: JSON.parse(localStorage.getItem('nexobra_computo') || '[]'),
    excelProcessedRows: []
  };

  // Esta metadata concentra la trazabilidad de los valores de referencia.
  // En la siguiente etapa será reemplazada por registros de la tabla index_values.
  const REFERENCE_PRICE_INFO = {
    period: 'abril de 2026',
    updatedAt: '01/04/2026',
    source: 'Carga manual NEXOBRA',
    materialMethod: 'Factor de referencia aplicado sobre el precio base'
  };

  const supabaseSettings = window.NEXOBRA_SUPABASE;
  const hasSupabaseSettings = Boolean(
    supabaseSettings &&
    supabaseSettings.url &&
    supabaseSettings.publishableKey &&
    !supabaseSettings.url.includes('PEGAR_AQUI') &&
    !supabaseSettings.publishableKey.includes('PEGAR_AQUI') &&
    window.supabase
  );
  const supabaseClient = hasSupabaseSettings
    ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.publishableKey)
    : null;

  // --- DOM ELEMENTS ---
  const homeView = document.getElementById('home-view');
  const catalogView = document.getElementById('catalog-view');

  // Nav elements
  const navBrandLogo = document.getElementById('nav-brand-logo');
  const navBtnHome = document.getElementById('nav-btn-home');
  const navBtnRubros = document.getElementById('nav-btn-rubros');
  const navBtnCatalogo = document.getElementById('nav-btn-catalogo');
  const btnBackHome = document.getElementById('btn-back-home');
  const btnSeeAllCatalog = document.getElementById('btn-see-all-catalog');

  // Search & Hub elements
  const homeSearchInput = document.getElementById('home-search-input');
  const homeSearchSubmit = document.getElementById('home-search-submit');
  const rubrosHubGrid = document.getElementById('rubros-hub-grid');
  const catalogSearchInput = document.getElementById('catalog-search-input');
  const catalogCurrentRubro = document.getElementById('catalog-current-rubro');
  const catalogHeaderTitle = document.getElementById('catalog-header-title');
  const catalogHeaderSubtitle = document.getElementById('catalog-header-subtitle');

  // Catalog Controls
  const rubrosFilterContainer = document.getElementById('rubros-filter-container');
  const productsGrid = document.getElementById('products-grid');
  const productsTableView = document.getElementById('products-table-view');
  const productsTableBody = document.getElementById('products-table-body');
  const visibleCount = document.getElementById('visible-count');
  const activeFilterLabel = document.getElementById('active-filter-label');
  const sortSelect = document.getElementById('sort-select');

  const modeVentaBtn = document.getElementById('mode-venta');
  const modeComputoBtn = document.getElementById('mode-computo');
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewTable = document.getElementById('btn-view-table');
  const sourceReferenceBtn = document.getElementById('source-reference');
  const referencePriceStatus = document.getElementById('reference-price-status');

  // Drawer Elements
  const computoDrawer = document.getElementById('computo-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const btnOpenDrawer = document.getElementById('btn-open-drawer');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerBody = document.getElementById('drawer-body');
  const drawerTotalItems = document.getElementById('drawer-total-items');
  const drawerSubtotal = document.getElementById('drawer-subtotal');
  const drawerTotal = document.getElementById('drawer-total');
  const headerCartCount = document.getElementById('header-cart-count');
  const btnPrintComputo = document.getElementById('btn-print-computo');
  const btnCopyComputo = document.getElementById('btn-copy-computo');
  const btnClearComputo = document.getElementById('btn-clear-computo');
  const toastContainer = document.getElementById('toast-container');

  // Excel Modal Elements
  const btnOpenExcelModal = document.getElementById('btn-open-excel-modal');
  const excelModal = document.getElementById('excel-modal');
  const excelModalBackdrop = document.getElementById('excel-modal-backdrop');
  const excelModalCloseBtn = document.getElementById('excel-modal-close-btn');
  const excelDropzone = document.getElementById('excel-dropzone');
  const excelFileInput = document.getElementById('excel-file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const btnDownloadTemplate = document.getElementById('btn-download-template');
  const excelTargetDate = document.getElementById('excel-target-date');
  const customFactorField = document.getElementById('custom-factor-field');
  const customFactorInput = document.getElementById('custom-factor-input');
  const excelPricingMode = document.getElementById('excel-pricing-mode');
  const excelResultsContainer = document.getElementById('excel-results-container');
  const excelPreviewTbody = document.getElementById('excel-preview-tbody');
  const excelStatsText = document.getElementById('excel-stats-text');
  const btnDownloadProcessedExcel = document.getElementById('btn-download-processed-excel');

  // --- HELPER UTILITIES ---
  
  function formatMoney(amount) {
    if (isNaN(amount)) return '$ 0,00';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function normalizeText(text) {
    if (!text) return '';
    return text.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatFactor(factor) {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(factor);
  }

  /**
   * Los precios de venta actuales del catálogo son el valor de referencia publicado.
   * El factor se obtiene respecto del precio base de cada material y se reutiliza
   * para conservar la equivalencia entre venta comercial y cómputo métrico.
   */
  function getReferencePrice(item, mode = state.pricingMode) {
    const currentPrice = mode === 'venta' ? Number(item.precioVenta) : Number(item.precioComputo);
    const ventaBase = Number(item.precioBase);
    const ventaCurrent = Number(item.precioVenta);
    const factor = ventaBase > 0 && ventaCurrent > 0 ? ventaCurrent / ventaBase : 1;
    const basePrice = mode === 'venta' && ventaBase > 0 ? ventaBase : currentPrice / factor;

    return {
      currentPrice,
      basePrice,
      factor,
      basePeriod: item.mesBase || 'período base no informado',
      unit: mode === 'venta' ? item.unidadVenta : item.unidadComputo
    };
  }

  function renderPriceTrace(item, mode = state.pricingMode) {
    const trace = getReferencePrice(item, mode);
    return `
      <details class="price-trace">
        <summary>Ver cálculo y fuente</summary>
        <div class="price-trace-content">
          <div><span>Base:</span> <strong>${formatMoney(trace.basePrice)} · ${trace.basePeriod}</strong></div>
          <div><span>Factor:</span> <strong>× ${formatFactor(trace.factor)}</strong></div>
          <div><span>Fórmula:</span> ${formatMoney(trace.basePrice)} × ${formatFactor(trace.factor)} = <strong>${formatMoney(trace.currentPrice)}</strong></div>
          <div><span>Fuente:</span> ${REFERENCE_PRICE_INFO.source} · ${REFERENCE_PRICE_INFO.updatedAt}</div>
          <p>Valor orientativo. Confirmá precio final, disponibilidad, entrega y pago con el proveedor.</p>
        </div>
      </details>
    `;
  }

  function updateReferenceStatus() {
    if (!referencePriceStatus) return;
    referencePriceStatus.innerHTML = `Valores de referencia NEXOBRA · Período: <strong>${REFERENCE_PRICE_INFO.period}</strong> · Fuente: ${REFERENCE_PRICE_INFO.source} · Actualizado: ${REFERENCE_PRICE_INFO.updatedAt}`;
  }

  function toBaseMonthLabel(value) {
    if (!value) return 'período base no informado';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
  }

  function newestPrice(prices, kind, dateField) {
    return (prices || [])
      .filter(price => price.price_kind === kind)
      .sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])))[0];
  }

  function mapRemoteMaterial(row) {
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

  async function loadCatalogFromSupabase() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
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
      REFERENCE_PRICE_INFO.period = latest.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      REFERENCE_PRICE_INFO.updatedAt = latest.toLocaleDateString('es-AR');
    }
    REFERENCE_PRICE_INFO.source = 'Base de datos NEXOBRA';

    renderHomeSubareas();
    renderRubroPills();
    renderProducts();
    updateCatalogHeader();
    updateReferenceStatus();
    showToast(`✓ Catálogo actualizado desde NEXOBRA (${remoteMaterials.length} materiales)`);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B000" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- NAVIGATION VIEW SWITCHER ---
  function switchView(viewName, rubroFilter = null, searchString = null) {
    state.currentView = viewName;

    if (viewName === 'home') {
      homeView.style.display = 'block';
      catalogView.style.display = 'none';
      navBtnHome.classList.add('active');
      navBtnCatalogo.classList.remove('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (viewName === 'catalog') {
      homeView.style.display = 'none';
      catalogView.style.display = 'block';
      navBtnHome.classList.remove('active');
      navBtnCatalogo.classList.add('active');

      if (rubroFilter) {
        state.activeRubro = rubroFilter;
      }
      if (searchString !== null) {
        state.searchQuery = searchString;
        catalogSearchInput.value = searchString;
      }

      updateCatalogHeader();
      renderRubroPills();
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function updateCatalogHeader() {
    if (state.activeRubro === 'Todos') {
      catalogCurrentRubro.textContent = 'Catálogo General';
      catalogHeaderTitle.textContent = 'Todos los Materiales de Obra';
      catalogHeaderSubtitle.textContent = 'Base completa de 538 materiales cotizados con dualidad de venta y cómputo';
    } else {
      const meta = RUBROS_METADATA[state.activeRubro] || { icon: "📦", desc: "" };
      catalogCurrentRubro.textContent = state.activeRubro;
      catalogHeaderTitle.textContent = `${meta.icon} ${state.activeRubro}`;
      catalogHeaderSubtitle.textContent = meta.desc || `Materiales y precios de referencia para ${state.activeRubro}`;
    }
  }

  // --- INIT & EVENT LISTENERS ---
  function init() {
    renderHomeSubareas();
    renderRubroPills();
    renderProducts();
    updateCartUI();
    updateReferenceStatus();
    loadCatalogFromSupabase();

    // Nav buttons
    navBrandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    navBtnHome.addEventListener('click', () => switchView('home'));
    navBtnCatalogo.addEventListener('click', () => switchView('catalog', 'Todos', ''));
    btnBackHome.addEventListener('click', () => switchView('home'));
    btnSeeAllCatalog.addEventListener('click', () => switchView('catalog', 'Todos', ''));

    navBtnRubros.addEventListener('click', () => {
      if (state.currentView !== 'home') {
        switchView('home');
      }
      setTimeout(() => {
        document.getElementById('seccion-rubros').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Home Search Listeners
    homeSearchSubmit.addEventListener('click', () => {
      const query = homeSearchInput.value.trim();
      if (query) {
        switchView('catalog', 'Todos', query);
      } else {
        switchView('catalog', 'Todos', '');
      }
    });

    homeSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        homeSearchSubmit.click();
      }
    });

    // Quick tag pills in Home
    document.querySelectorAll('.quick-tags-wrapper .tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const query = pill.getAttribute('data-search');
        switchView('catalog', 'Todos', query);
      });
    });

    // Catalog Search listener
    catalogSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderProducts();
    });

    // Pricing Mode Toggle
    modeVentaBtn.addEventListener('click', () => {
      state.pricingMode = 'venta';
      modeVentaBtn.classList.add('active');
      modeComputoBtn.classList.remove('active');
      renderProducts();
      showToast('Visualizando: Precio de Venta Comercial (por bulto)');
    });

    modeComputoBtn.addEventListener('click', () => {
      state.pricingMode = 'computo';
      modeComputoBtn.classList.add('active');
      modeVentaBtn.classList.remove('active');
      renderProducts();
      showToast('Visualizando: Precio de Cómputo Métrico (m²/m³/ml)');
    });

    if (sourceReferenceBtn) {
      sourceReferenceBtn.addEventListener('click', () => {
        showToast('Mostrando valores de referencia trazables de NEXOBRA');
      });
    }

    // View toggle (Grid vs Table)
    btnViewGrid.addEventListener('click', () => {
      state.viewMode = 'grid';
      btnViewGrid.classList.add('active');
      btnViewTable.classList.remove('active');
      productsGrid.style.display = 'grid';
      productsTableView.style.display = 'none';
    });

    btnViewTable.addEventListener('click', () => {
      state.viewMode = 'table';
      btnViewTable.classList.add('active');
      btnViewGrid.classList.remove('active');
      productsGrid.style.display = 'none';
      productsTableView.style.display = 'block';
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderProducts();
    });

    // Drawer triggers
    btnOpenDrawer.addEventListener('click', openDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    // Drawer Actions
    btnPrintComputo.addEventListener('click', printComputo);
    btnCopyComputo.addEventListener('click', copyComputoToClipboard);
    btnClearComputo.addEventListener('click', clearComputoCart);

    // Excel Modal Listeners
    btnOpenExcelModal.addEventListener('click', openExcelModal);
    excelModalCloseBtn.addEventListener('click', closeExcelModal);
    excelModalBackdrop.addEventListener('click', closeExcelModal);

    excelTargetDate.addEventListener('change', (e) => {
      customFactorField.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    customFactorInput.addEventListener('input', () => {
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    excelPricingMode.addEventListener('change', () => {
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    btnBrowseFile.addEventListener('click', () => excelFileInput.click());
    excelFileInput.addEventListener('change', handleExcelFileSelect);

    // Dropzone drag & drop
    excelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      excelDropzone.classList.add('dragover');
    });
    excelDropzone.addEventListener('dragleave', () => {
      excelDropzone.classList.remove('dragover');
    });
    excelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      excelDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleExcelFile(e.dataTransfer.files[0]);
      }
    });

    btnDownloadTemplate.addEventListener('click', generateTemplateExcel);
    btnDownloadProcessedExcel.addEventListener('click', exportProcessedExcel);
  }

  // --- RENDER SUBAREAS EN EL HOME ---
  function renderHomeSubareas() {
    const rubros = [...new Set(NEXOBRA_DATA.map(i => i.rubro))];
    rubrosHubGrid.innerHTML = '';

    rubros.forEach(rubro => {
      const count = NEXOBRA_DATA.filter(i => i.rubro === rubro).length;
      const meta = RUBROS_METADATA[rubro] || {
        icon: "📦",
        desc: "Materiales técnicos y precios de referencia de la construcción."
      };

      const card = document.createElement('div');
      card.className = 'rubro-hub-card';
      card.innerHTML = `
        <div>
          <div class="rubro-card-top">
            <div class="rubro-card-icon">${meta.icon}</div>
            <span class="rubro-count-pill">${count} materiales</span>
          </div>
          <h3 class="rubro-card-name">${rubro}</h3>
          <p class="rubro-card-desc">${meta.desc}</p>
        </div>
        <div class="rubro-card-footer">
          <span>Ver materiales</span>
          <span class="arrow">&rarr;</span>
        </div>
      `;

      card.addEventListener('click', () => {
        switchView('catalog', rubro, '');
      });

      rubrosHubGrid.appendChild(card);
    });
  }

  // --- RUBRO PILLS RENDER (INSIDE CATALOG) ---
  function renderRubroPills() {
    const rubros = ['Todos', ...new Set(NEXOBRA_DATA.map(i => i.rubro))];
    rubrosFilterContainer.innerHTML = '';

    rubros.forEach(rubro => {
      const count = rubro === 'Todos' 
        ? NEXOBRA_DATA.length 
        : NEXOBRA_DATA.filter(i => i.rubro === rubro).length;

      const btn = document.createElement('button');
      btn.className = `cat-btn ${state.activeRubro === rubro ? 'active' : ''}`;
      btn.innerHTML = `<span>${rubro}</span><span class="count-badge">${count}</span>`;

      btn.addEventListener('click', () => {
        state.activeRubro = rubro;
        updateCatalogHeader();
        renderRubroPills();
        renderProducts();
      });

      rubrosFilterContainer.appendChild(btn);
    });
  }

  // --- FILTER & SORT LOGIC ---
  function getFilteredItems() {
    const query = normalizeText(state.searchQuery);

    let items = NEXOBRA_DATA.filter(item => {
      if (state.activeRubro !== 'Todos' && item.rubro !== state.activeRubro) {
        return false;
      }

      if (query) {
        const titleMatch = normalizeText(item.denominacion).includes(query);
        const codeMatch = normalizeText(item.id).includes(query);
        const catMatch = normalizeText(item.categoria).includes(query);
        const subcatMatch = normalizeText(item.subcategoria).includes(query);
        const tagsMatch = item.tags && item.tags.some(tag => normalizeText(tag).includes(query));

        return titleMatch || codeMatch || catMatch || subcatMatch || tagsMatch;
      }

      return true;
    });

    if (state.sortBy === 'price-asc') {
      items.sort((a, b) => {
        const pA = getReferencePrice(a).currentPrice;
        const pB = getReferencePrice(b).currentPrice;
        return pA - pB;
      });
    } else if (state.sortBy === 'price-desc') {
      items.sort((a, b) => {
        const pA = getReferencePrice(a).currentPrice;
        const pB = getReferencePrice(b).currentPrice;
        return pB - pA;
      });
    } else if (state.sortBy === 'alpha-asc') {
      items.sort((a, b) => a.denominacion.localeCompare(b.denominacion));
    }

    return items;
  }

  // --- RENDER PRODUCTS (GRID & TABLE) ---
  function renderProducts() {
    const filtered = getFilteredItems();

    visibleCount.textContent = filtered.length;
    activeFilterLabel.textContent = state.activeRubro !== 'Todos' ? ` en ${state.activeRubro}` : '';

    if (filtered.length === 0) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-light);">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">🔍</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">No se encontraron materiales</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 1.5rem;">
            Probá buscando por términos coloquiales como "durlock", "cemento", "hierro", "vigueta" o "sika".
          </p>
          <button class="btn-computo" onclick="window.nexoBraApp.clearCatalogSearch();" style="margin: 0 auto;">
            Mostrar todos los materiales
          </button>
        </div>
      `;
      productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No hay materiales para mostrar</td></tr>`;
      return;
    }

    // Grid HTML
    productsGrid.innerHTML = filtered.map(item => {
      const isVentaMode = state.pricingMode === 'venta';
      const mainTrace = getReferencePrice(item, state.pricingMode);
      const secondaryTrace = getReferencePrice(item, isVentaMode ? 'computo' : 'venta');
      const mainPrice = mainTrace.currentPrice;
      const mainUnit = mainTrace.unit;

      const secPrice = secondaryTrace.currentPrice;
      const secUnit = secondaryTrace.unit;
      const secLabel = isVentaMode ? 'Cómputo métrico' : 'Venta x bulto';

      const tagsHtml = item.tags.slice(0, 4).map(t => 
        `<span class="card-tag-item" data-tag="${t}">#${t}</span>`
      ).join('');

      return `
        <article class="product-card" id="card-${item.id}">
          <div>
            <div class="card-top">
              <span class="card-code">${item.id}</span>
              <span class="card-rubro-badge">${item.rubro}</span>
            </div>
            <h3 class="product-title">${item.denominacion}</h3>
            <div class="product-category-tree">${item.categoria} &rsaquo; ${item.subcategoria}</div>
          </div>

          <div>
            <div class="card-price-box">
              <div class="price-main-row">
                <span class="price-main-val">${formatMoney(mainPrice)}</span>
                <span class="price-unit-tag">/ ${mainUnit}</span>
              </div>
              <div class="price-secondary-row">
                <span>${secLabel}:</span>
                <strong>${formatMoney(secPrice)} / ${secUnit}</strong>
              </div>
            </div>

            ${renderPriceTrace(item)}

            <div class="card-tags">
              ${tagsHtml}
            </div>

            <div class="card-actions">
              <div class="qty-control">
                <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', -1)" title="Reducir cantidad">-</button>
                <input type="number" id="qty-${item.id}" class="qty-input" value="1" min="1" max="999">
                <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', 1)" title="Aumentar cantidad">+</button>
              </div>
              <button class="btn-add-computo" id="btn-add-${item.id}" onclick="window.nexoBraApp.addToComputo('${item.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Sumar</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Table HTML
    productsTableBody.innerHTML = filtered.map(item => {
      const ventaTrace = getReferencePrice(item, 'venta');
      const computoTrace = getReferencePrice(item, 'computo');
      return `
        <tr>
          <td><span class="card-code">${item.id}</span></td>
          <td>
            <strong>${item.denominacion}</strong>
            <div style="font-size: 0.76rem; color: var(--text-subtle);">${item.subcategoria}</div>
          </td>
          <td>
            <span class="card-rubro-badge">${item.rubro}</span>
          </td>
          <td>
            <strong>${formatMoney(ventaTrace.currentPrice)}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${ventaTrace.unit}</span>
            <div class="table-price-trace">Base ${formatMoney(ventaTrace.basePrice)} · × ${formatFactor(ventaTrace.factor)}</div>
          </td>
          <td>
            <span style="color: #2563EB; font-weight: 700;">${formatMoney(computoTrace.currentPrice)}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${computoTrace.unit}</span>
            <div class="table-price-trace">Base ${formatMoney(computoTrace.basePrice)} · × ${formatFactor(computoTrace.factor)}</div>
          </td>
          <td style="text-align: right;">
            <button class="btn-add-computo" style="padding: 6px 12px; font-size: 0.78rem; display: inline-flex;" onclick="window.nexoBraApp.addToComputo('${item.id}')">
              + Cómputo
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Clickable tags
    document.querySelectorAll('.card-tag-item').forEach(tagSpan => {
      tagSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = tagSpan.getAttribute('data-tag');
        catalogSearchInput.value = tag;
        state.searchQuery = tag;
        renderProducts();
        catalogSearchInput.focus();
      });
    });
  }

  function clearCatalogSearch() {
    catalogSearchInput.value = '';
    state.searchQuery = '';
    state.activeRubro = 'Todos';
    renderRubroPills();
    renderProducts();
  }

  // --- CÓMPUTO CART MANAGEMENT ---
  function addToComputo(itemId) {
    const item = NEXOBRA_DATA.find(i => i.id === itemId);
    if (!item) return;

    const qtyInput = document.getElementById(`qty-${itemId}`);
    const qty = qtyInput ? Math.max(1, parseFloat(qtyInput.value) || 1) : 1;

    const trace = getReferencePrice(item);
    const unitPrice = trace.currentPrice;
    const unit = trace.unit;

    const existingIndex = state.computoCart.findIndex(i => i.id === itemId && i.unit === unit);

    if (existingIndex > -1) {
      state.computoCart[existingIndex].qty += qty;
    } else {
      state.computoCart.push({
        id: item.id,
        denominacion: item.denominacion,
        rubro: item.rubro,
        unitPrice: unitPrice,
        unit: unit,
        qty: qty,
        mode: state.pricingMode,
        basePrice: trace.basePrice,
        factor: trace.factor,
        basePeriod: trace.basePeriod,
        referenceUpdatedAt: REFERENCE_PRICE_INFO.updatedAt
      });
    }

    saveCart();
    updateCartUI();
    showToast(`+${qty} ${unit} agregado: ${item.denominacion.substring(0, 24)}...`);

    const btn = document.getElementById(`btn-add-${itemId}`);
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = `<span>✓ Agregado</span>`;
      btn.classList.add('added');
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.classList.remove('added');
      }, 1200);
    }
  }

  function changeCardQty(itemId, delta) {
    const input = document.getElementById(`qty-${itemId}`);
    if (input) {
      let val = parseInt(input.value, 10) || 1;
      val = Math.max(1, val + delta);
      input.value = val;
    }
  }

  function updateItemQtyInCart(index, newQty) {
    if (newQty <= 0) {
      state.computoCart.splice(index, 1);
    } else {
      state.computoCart[index].qty = newQty;
    }
    saveCart();
    updateCartUI();
  }

  function removeCartItem(index) {
    state.computoCart.splice(index, 1);
    saveCart();
    updateCartUI();
  }

  function clearComputoCart() {
    if (state.computoCart.length === 0) return;
    if (confirm('¿Deseas vaciar todo tu cómputo de materiales?')) {
      state.computoCart = [];
      saveCart();
      updateCartUI();
      showToast('Cómputo vaciado');
    }
  }

  function saveCart() {
    localStorage.setItem('nexobra_computo', JSON.stringify(state.computoCart));
  }

  function updateCartUI() {
    const totalPrice = state.computoCart.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

    headerCartCount.textContent = state.computoCart.length;
    drawerTotalItems.textContent = state.computoCart.length;
    drawerSubtotal.textContent = formatMoney(totalPrice);
    drawerTotal.textContent = formatMoney(totalPrice);

    if (state.computoCart.length === 0) {
      drawerBody.innerHTML = `
        <div class="computo-empty-state">
          <div class="empty-icon">📋</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Tu cómputo está vacío</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
            Sumá materiales desde el catálogo para calcular los costos de tu obra o presupuesto al instante.
          </p>
          <button class="btn-computo" onclick="document.getElementById('drawer-close-btn').click();">
            Explorar catálogo
          </button>
        </div>
      `;
    } else {
      drawerBody.innerHTML = `
        <div class="computo-list">
          ${state.computoCart.map((item, idx) => {
            const subtotal = item.qty * item.unitPrice;
            return `
              <div class="computo-item">
                <div class="computo-item-head">
                  <div>
                    <span class="card-code" style="font-size: 0.7rem;">${item.id}</span>
                    <h4 class="computo-item-title">${item.denominacion}</h4>
                  </div>
                  <button class="btn-remove-item" onclick="window.nexoBraApp.removeCartItem(${idx})" title="Eliminar ítem">&times;</button>
                </div>
                
                <div class="computo-item-controls">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--text-muted);">Cant:</span>
                    <input 
                      type="number" 
                      style="width: 55px; padding: 4px 6px; border: 1px solid var(--border-light); border-radius: 4px; font-weight: 700;" 
                      value="${item.qty}" 
                      min="1" 
                      onchange="window.nexoBraApp.updateItemQtyInCart(${idx}, parseFloat(this.value) || 1)"
                    >
                    <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">${item.unit}</span>
                  </div>
                    <div style="text-align: right;">
                      <div style="font-size: 0.74rem; color: var(--text-subtle);">${formatMoney(item.unitPrice)}/${item.unit}</div>
                      ${item.basePrice ? `<div class="cart-price-trace">Base ${formatMoney(item.basePrice)} · × ${formatFactor(item.factor || 1)}</div>` : ''}
                      <div class="computo-item-subtotal">${formatMoney(subtotal)}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  // --- PRINT / PDF EXPORT ---
  function printComputo() {
    if (state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const totalPrice = state.computoCart.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const dateStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <title>NEXOBRA - Cómputo y Presupuesto de Obra</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #111; }
          .header-print { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #F5B000; padding-bottom: 15px; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: 900; }
          .logo span { color: #F5B000; }
          .meta { font-size: 13px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #F1F3F7; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #CCC; }
          td { padding: 10px; border-bottom: 1px solid #EEE; font-size: 13px; }
          .total-box { margin-top: 30px; text-align: right; font-size: 18px; font-weight: bold; border-top: 2px solid #111; padding-top: 15px; }
          .disclaimer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px dashed #CCC; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header-print">
          <div>
            <div class="logo">NEXO<span>OBRA</span></div>
            <div style="font-size: 12px; color: #666; font-weight: bold;">COMPARADOR TÉCNICO & CÓMPUTO DE OBRA</div>
          </div>
          <div class="meta" style="text-align: right;">
            <div>Fecha: <strong>${dateStr}</strong></div>
            <div>Referencia: <strong>${REFERENCE_PRICE_INFO.period} · ${REFERENCE_PRICE_INFO.source}</strong></div>
          </div>
        </div>

        <h3 style="margin-bottom: 15px;">Resumen de Cómputo y Cotización de Materiales</h3>

        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Rubro</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Precio Unit. / trazabilidad</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${state.computoCart.map(item => `
              <tr>
                <td><strong>${item.id}</strong></td>
                <td>${item.denominacion}</td>
                <td>${item.rubro}</td>
                <td>${item.qty}</td>
                <td>${item.unit}</td>
                <td>${formatMoney(item.unitPrice)}${item.basePrice ? `<br><small>Base ${formatMoney(item.basePrice)} · × ${formatFactor(item.factor || 1)}</small>` : ''}</td>
                <td style="text-align: right;"><strong>${formatMoney(item.qty * item.unitPrice)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          Total Estimado: ${formatMoney(totalPrice)}
        </div>

        <div class="disclaimer">
          * Este presupuesto es orientativo. Los valores de referencia informan precio base, factor y fecha de actualización. Confirmá precio final, disponibilidad, entrega y pago directamente con el proveedor.
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // --- COPY TEXT FOR WHATSAPP ---
  function copyComputoToClipboard() {
    if (state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para copiar.');
      return;
    }

    const totalPrice = state.computoCart.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    
    let text = `🏗️ *NEXOBRA - Cómputo de Materiales*\n`;
    text += `📅 Fecha: ${new Date().toLocaleDateString('es-AR')}\n\n`;
    
    state.computoCart.forEach((item, index) => {
      text += `${index + 1}. *${item.denominacion}*\n`;
      text += `   Cant: ${item.qty} ${item.unit} | Unit: ${formatMoney(item.unitPrice)} | Subtotal: ${formatMoney(item.qty * item.unitPrice)}\n`;
    });

    text += `\n💰 *TOTAL ESTIMADO: ${formatMoney(totalPrice)}*\n`;
    text += `_Valores de referencia NEXOBRA · ${REFERENCE_PRICE_INFO.period} · ${REFERENCE_PRICE_INFO.updatedAt}. Confirmar disponibilidad y precio final con el proveedor._`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Cómputo copiado al portapapeles (Listo para WhatsApp)');
    }).catch(() => {
      alert('No se pudo copiar automáticamente.');
    });
  }

  // --- DRAWER TOGGLING ---
  function openDrawer() {
    computoDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    computoDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ==========================================================================
  // EXCEL BULK PROCESSOR (ETAPA 3)
  // ==========================================================================

  function openExcelModal() {
    excelModal.classList.add('open');
    excelModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeExcelModal() {
    excelModal.classList.remove('open');
    excelModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function getActiveFactor() {
    const val = excelTargetDate.value;
    if (val === 'custom') {
      return parseFloat(customFactorInput.value) || 1.0;
    }
    return parseFloat(val) || 1.0;
  }

  function getSelectedDateLabel() {
    const opt = excelTargetDate.options[excelTargetDate.selectedIndex];
    if (excelTargetDate.value === 'custom') {
      return `Personalizado (x${getActiveFactor()})`;
    }
    return opt.text.split('(')[0].trim();
  }

  function handleExcelFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleExcelFile(e.target.files[0]);
    }
  }

  function handleExcelFile(file) {
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

  function processRawExcelData(rows) {
    if (!rows || rows.length < 2) {
      alert('El archivo no contiene filas de datos suficientes.');
      return;
    }

    const header = rows[0].map(h => normalizeText(h));
    let descIdx = header.findIndex(h => h.includes('material') || h.includes('denominacion') || h.includes('descripcion') || h.includes('item') || h.includes('nombre') || h.includes('producto'));
    let qtyIdx = header.findIndex(h => h.includes('cant') || h.includes('cantidad') || h.includes('unidades'));
    let codeIdx = header.findIndex(h => h.includes('codigo') || h.includes('id') || h.includes('cod'));

    if (descIdx === -1) descIdx = 0;
    if (qtyIdx === -1) qtyIdx = descIdx === 0 ? 1 : 0;

    const processed = [];
    const factor = getActiveFactor();
    const mode = excelPricingMode.value;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || (!row[descIdx] && !row[codeIdx])) continue;

      const requestedCode = codeIdx > -1 && row[codeIdx] ? row[codeIdx].toString().trim() : '';
      const requestedDesc = row[descIdx] ? row[descIdx].toString().trim() : '';
      let qty = qtyIdx > -1 && row[qtyIdx] ? parseFloat(row[qtyIdx]) || 1 : 1;

      const matchResult = findBestMaterialMatch(requestedCode, requestedDesc);

      let matchedItem = matchResult.item;
      let status = matchResult.status;
      let unitPriceBase = 0;
      let unit = '-';
      let unitPriceUpdated = 0;
      let subtotal = 0;

      if (matchedItem) {
        unitPriceBase = mode === 'venta' ? matchedItem.precioVenta : matchedItem.precioComputo;
        unit = mode === 'venta' ? matchedItem.unidadVenta : matchedItem.unidadComputo;
        unitPriceUpdated = unitPriceBase * factor;
        subtotal = qty * unitPriceUpdated;
      }

      processed.push({
        requestedName: requestedDesc || requestedCode,
        requestedQty: qty,
        matchedItem: matchedItem,
        status: status,
        unit: unit,
        unitPrice: unitPriceUpdated,
        subtotal: subtotal
      });
    }

    state.excelProcessedRows = processed;
    renderExcelPreview();
    showToast(`✓ Se procesaron ${processed.length} materiales del Excel`);
  }

  function findBestMaterialMatch(code, text) {
    if (code) {
      const exactCode = NEXOBRA_DATA.find(i => normalizeText(i.id) === normalizeText(code));
      if (exactCode) return { item: exactCode, status: 'matched' };
    }

    if (!text) return { item: null, status: 'notfound' };

    const normText = normalizeText(text);
    const exactName = NEXOBRA_DATA.find(i => normalizeText(i.denominacion) === normText);
    if (exactName) return { item: exactName, status: 'matched' };

    const searchWords = normText.split(' ').filter(w => w.length > 2);
    let bestMatch = null;
    let highestScore = 0;

    NEXOBRA_DATA.forEach(item => {
      let score = 0;
      const normItemTitle = normalizeText(item.denominacion);
      const normRubro = normalizeText(item.rubro);
      const normCat = normalizeText(item.categoria);
      const allTags = item.tags.map(t => normalizeText(t)).join(' ');

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

  function recalculateExcelRows() {
    const factor = getActiveFactor();
    const mode = excelPricingMode.value;

    state.excelProcessedRows.forEach(row => {
      if (row.matchedItem) {
        const unitPriceBase = mode === 'venta' ? row.matchedItem.precioVenta : row.matchedItem.precioComputo;
        row.unit = mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo;
        row.unitPrice = unitPriceBase * factor;
        row.subtotal = row.requestedQty * row.unitPrice;
      }
    });

    renderExcelPreview();
  }

  function renderExcelPreview() {
    excelResultsContainer.style.display = 'block';
    const totalSum = state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);
    const matchedCount = state.excelProcessedRows.filter(r => r.matchedItem).length;

    excelStatsText.innerHTML = `
      <strong>${matchedCount}</strong> de <strong>${state.excelProcessedRows.length}</strong> ítems cotizados 
      | Total Estimado: <strong style="color: var(--brand-yellow);">${formatMoney(totalSum)}</strong>
    `;

    excelPreviewTbody.innerHTML = state.excelProcessedRows.map(row => {
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
          <td><strong>${row.requestedName}</strong></td>
          <td>
            ${row.matchedItem 
              ? `<span style="font-size: 0.82rem; color: var(--brand-dark); font-weight: 600;">[${row.matchedItem.id}] ${row.matchedItem.denominacion}</span>` 
              : `<span style="color: var(--text-subtle); font-style: italic;">Sin precio de referencia</span>`}
          </td>
          <td>${row.requestedQty} ${row.unit}</td>
          <td>${row.matchedItem ? formatMoney(row.unitPrice) : '-'}</td>
          <td style="text-align: right;"><strong>${row.matchedItem ? formatMoney(row.subtotal) : '-'}</strong></td>
        </tr>
      `;
    }).join('');
  }

  function generateTemplateExcel() {
    const ws_data = [
      ["Código (Opcional)", "Material o Descripción", "Cantidad Requerida"],
      ["BL-003", "Cemento Portland Loma Negra 50kg", 20],
      ["BG-001", "Arena gruesa 6m3", 2],
      ["ARN-002", "Hierro torsionado del 8 ADN420", 35],
      ["CS-001", "Placa Durlock 12.5mm", 15],
      ["CVLH-002", "Ladrillos huecos 12x18x25", 800],
      ["CAH-012", "Membrana asfáltica 35kg", 4],
      ["", "Inodoro blanco Ferrum Bari", 2]
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales_NEXOBRA");
    XLSX.writeFile(wb, "Plantilla_Materiales_NEXOBRA.xlsx");
    showToast('Plantilla descargada con éxito');
  }

  function exportProcessedExcel() {
    if (state.excelProcessedRows.length === 0) {
      alert('No hay datos procesados para exportar.');
      return;
    }

    const dateLabel = getSelectedDateLabel();
    const modeLabel = excelPricingMode.value === 'venta' ? 'Venta Comercial' : 'Cómputo Métrico';
    const totalPrice = state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);

    const exportData = [
      ["NEXOBRA - Cómputo y Cotización Masiva de Materiales"],
      [`Fecha/Mes de Cotización: ${dateLabel}`, `Modalidad: ${modeLabel}`, `Generado: ${new Date().toLocaleDateString('es-AR')}`],
      [],
      ["Código", "Material Solicitado", "Material Asignado (NEXOBRA)", "Rubro", "Cantidad", "Unidad", "Precio Unitario Actualizado (ARS)", "Subtotal (ARS)", "Estado Coincidencia"]
    ];

    state.excelProcessedRows.forEach(row => {
      exportData.push([
        row.matchedItem ? row.matchedItem.id : "S/D",
        row.requestedName,
        row.matchedItem ? row.matchedItem.denominacion : "No encontrado en base",
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
    showToast('✓ Archivo Excel cotizado descargado exitosamente');
  }

  // --- PUBLIC API EXPOSURE ---
  window.nexoBraApp = {
    switchView,
    addToComputo,
    changeCardQty,
    updateItemQtyInCart,
    removeCartItem,
    clearCatalogSearch
  };

  document.addEventListener('DOMContentLoaded', init);

})();
