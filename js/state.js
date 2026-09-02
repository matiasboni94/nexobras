// NEXOBRA - state.js
// Estado compartido, referencias al DOM y utilidades chicas.

  export const state = {
    currentView: 'home', // 'home' | 'catalog'
    pricingMode: 'venta', // 'venta' | 'computo'
    activeRubro: 'Todos',
    searchQuery: '',
    sortBy: 'relevance',
    viewMode: 'grid', // 'grid' | 'table'
    computoCart: JSON.parse(localStorage.getItem('nexobra_computo') || '[]'),
    excelProcessedRows: [],
    priceMonth: null, // "YYYY-MM-01", mes elegido por el usuario para EXPLORAR precios en el catálogo
    computoMonth: null, // "YYYY-MM-01", mes al que se recalcula TODO "Mi Cómputo" (independiente del anterior)
    compareNearbyProviders: false, // true = mostrar comparación con proveedores cercanos (Fase G2, ya no es un "modo" que reemplaza el precio)
    catalogPage: 1, // Fase G/F3: paginación del catálogo completo
    catalogPageSize: 25
  };

  // Serie de índices IPC cargada desde public.index_values (tabla real, no valores fijos).
  // Se completa en loadIndexSeries(); mientras no haya datos, se usa el factor estático
  // heredado (precioVenta / precioBase) como respaldo para no romper el catálogo.
  export const indexState = {
    seriesCode: 'ipc_materials_reference',
    values: {},   // { "2025-04-01": 8402.26, ... }
    months: [],   // ["2016-12-01", ..., "2026-02-01"] ordenado
    loaded: false
  };

  export const REFERENCE_PRICE_INFO = {
    period: 'sin datos de índice cargados',
    updatedAt: '',
    source: 'Carga manual NEXOBRA',
    materialMethod: 'Precio base actualizado con la serie de IPC (INDEC) mes a mes'
  };

  export function monthLabel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }

  export const NOMBRE_MES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  export function parsePeriodo(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return { year: d.getFullYear(), monthIdx: d.getMonth() };
  }

  /**
   * Arma un par de <select> (año / mes) a partir de una lista de fechas "YYYY-MM-01",
   * mostrando solo los meses que realmente tienen datos cargados. Reutilizable para
   * el catálogo de materiales y para mano de obra.
   */
  export function wireYearMonthPicker(yearSelectEl, monthSelectEl, months, currentValue, onChange) {
    if (!yearSelectEl || !monthSelectEl || !months || months.length === 0) return;
    const parsed = months.map(m => ({ value: m, ...parsePeriodo(m) }));
    const years = [...new Set(parsed.map(p => p.year))].sort((a, b) => b - a);

    function monthsForYear(year) {
      return parsed.filter(p => p.year === year).sort((a, b) => b.monthIdx - a.monthIdx);
    }

    function renderMonths(year, preferredValue) {
      const opts = monthsForYear(year);
      monthSelectEl.innerHTML = opts.map(o => `<option value="${o.value}">${NOMBRE_MES[o.monthIdx]}</option>`).join('');
      const match = opts.find(o => o.value === preferredValue);
      monthSelectEl.value = match ? match.value : (opts[0] ? opts[0].value : '');
    }

    yearSelectEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    const initial = parsed.find(p => p.value === currentValue) || parsed[parsed.length - 1];
    yearSelectEl.value = initial.year;
    renderMonths(initial.year, currentValue);

    yearSelectEl.onchange = () => {
      renderMonths(parseInt(yearSelectEl.value, 10), null);
      onChange(monthSelectEl.value);
    };
    monthSelectEl.onchange = () => onChange(monthSelectEl.value);
  }

  // Meses en los que HAY dato real tanto de IPC como de los 5 roles de UOCRA.
  // Es el único calendario que se le ofrece al usuario: así el presupuesto final
  // (materiales + mano de obra) siempre queda con una sola fecha de referencia.
  export const supabaseSettings = window.NEXOBRA_SUPABASE;
  export const hasSupabaseSettings = Boolean(
    supabaseSettings &&
    supabaseSettings.url &&
    supabaseSettings.publishableKey &&
    !supabaseSettings.url.includes('PEGAR_AQUI') &&
    !supabaseSettings.publishableKey.includes('PEGAR_AQUI') &&
    window.supabase
  );
  export const supabaseClient = hasSupabaseSettings
    ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.publishableKey)
    : null;

  // --- AUTENTICACIÓN (Fase A) ---
  /**
   * Prepara un valor para insertarlo dentro de un atributo onclick='...' de
   * forma segura, sin importar qué caracteres tenga (comillas, apóstrofes,
   * acentos). JSON.stringify solo ya NO alcanza: si el string tiene una
   * comilla, rompe el atributo HTML y tira "Unexpected end of input" en
   * TODA la página, no solo en ese botón (bug real que encontramos: nombres
   * de proveedores con onclick="...${JSON.stringify(x)}..." rompían el parseo
   * de HTML apenas se renderizaba la tarjeta).
   * Uso: onclick='miFuncion(${ST.escAttr(valor)})' -- SIEMPRE con comillas
   * simples afuera del atributo.
   */
  export function escAttr(value) {
    return JSON.stringify(value).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }

  /**
   * Escapa texto para insertarlo como CONTENIDO visible dentro de un innerHTML
   * (a diferencia de escAttr, que es para adentro de un atributo onclick).
   * Hace falta en TODO texto que haya escrito un usuario -- nombre de
   * proveedor, descripción, nombre de un material propuesto, nombre de un
   * presupuesto, datos de obra, motivo de rechazo, etc. -- para que alguien
   * no pueda cargar algo como '<img src=x onerror="...">' como su razón
   * social y que ese código se ejecute en la pantalla de otro usuario que
   * vea esa ficha (XSS). NO hace falta usarla con los datos de NUESTRO
   * catálogo curado (NEXOBRA_DATA), esos son confiables.
   */
  export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  export function formatMoney(amount) {
    if (isNaN(amount)) return '$ 0,00';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  export function normalizeText(text) {
    if (!text) return '';
    return text.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  export function formatFactor(factor) {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(factor);
  }

  /** "abr-25" -> "2025-04-01" (para buscar el índice de mes base de cada material) */
  export function baseLabelToDate(label) {
    const MESES = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, sept:9, oct:10, nov:11, dic:12 };
    const match = /^([a-záéíóú]{3,4})-(\d{2})$/i.exec((label || '').trim());
    if (!match) return null;
    const mes = MESES[match[1].toLowerCase()];
    if (!mes) return null;
    return `20${match[2]}-${String(mes).padStart(2, '0')}-01`;
  }

  /**
   * Calcula el precio actualizado de un material al mes elegido por el usuario
   * (state.priceMonth), usando la serie real de IPC cargada en indexState.
   * Si todavía no hay serie cargada (Supabase sin datos, o carga en curso),
   * cae al factor estático precioVenta/precioBase como respaldo para no romper
   * la vista, pero deja marcado dynamic:false para que la UI lo aclare.
   */
  export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B000" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span></span>
    `;
    // El mensaje se pone con textContent (no innerHTML): así, si en algún
    // lugar del código un toast llega a mostrar un dato que escribió un
    // usuario (nombre de proveedor, etc.), nunca se interpreta como HTML.
    toast.querySelector('span').textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- NAVIGATION VIEW SWITCHER ---
  export function singularize(word) {
    if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  }

  // --- FILTER & SORT LOGIC ---
  export const laborState = { roles: [], months: [], loaded: false };
  export const authState = { user: null, profile: null };
  export const computationState = { currentId: null };
  export const providerState = { provider: null, branch: null, offers: [], excelPending: [] };
  export const DEFAULT_MAP_CENTER = { lat: -27.4864, lng: -55.1199 };
  export const mapState = { map: null, markers: [], center: { ...DEFAULT_MAP_CENTER }, radiusKm: 25, initialized: false, filterMaterialId: null, filterMaterialName: null, offerPickerCartIndex: null };
  export const providerPricesState = { loaded: false, byMaterial: {} };
  export const favoritesState = { ids: new Set(), loaded: false };
  export const alertsState = { byMaterial: {}, loaded: false };
  export const homeView = document.getElementById('home-view');
  export const catalogView = document.getElementById('catalog-view');
  export const laborView = document.getElementById('labor-view');
  export const myComputationsView = document.getElementById('my-computations-view');

  // Nav elements
  export const navBrandLogo = document.getElementById('nav-brand-logo');
  export const navBtnCatalogo = document.getElementById('nav-btn-catalogo');
  export const navBtnManoObra = document.getElementById('nav-btn-manoobra');
  export const btnBackHome = document.getElementById('btn-back-home');

  // Search & Hub elements
  export const rubrosHubGrid = document.getElementById('rubros-hub-grid');
  export const catalogSearchInput = document.getElementById('catalog-search-input');
  export const catalogCurrentRubro = document.getElementById('catalog-current-rubro');
  export const catalogHeaderTitle = document.getElementById('catalog-header-title');
  export const catalogHeaderSubtitle = document.getElementById('catalog-header-subtitle');

  // Catalog Controls
  export const rubrosFilterContainer = document.getElementById('rubros-filter-container');
  export const productsGrid = document.getElementById('products-grid');
  export const productsTableView = document.getElementById('products-table-view');
  export const productsTableBody = document.getElementById('products-table-body');
  export const visibleCount = document.getElementById('visible-count');
  export const activeFilterLabel = document.getElementById('active-filter-label');
  export const sortSelect = document.getElementById('sort-select');

  export const modeVentaBtn = document.getElementById('mode-venta');
  export const modeComputoBtn = document.getElementById('mode-computo');
  export const btnViewGrid = document.getElementById('btn-view-grid');
  export const btnViewTable = document.getElementById('btn-view-table');
  export const sourceReferenceBtn = document.getElementById('source-reference');
  export const referencePriceStatus = document.getElementById('reference-price-status');

  // Drawer Elements
  export const computoDrawer = document.getElementById('computo-drawer');
  export const drawerBackdrop = document.getElementById('drawer-backdrop');
  export const btnOpenDrawer = document.getElementById('btn-open-drawer');
  export const drawerCloseBtn = document.getElementById('drawer-close-btn');
  export const drawerBody = document.getElementById('drawer-body');
  export const drawerTotalItems = document.getElementById('drawer-total-items');
  export const drawerSubtotal = document.getElementById('drawer-subtotal');
  export const drawerTotal = document.getElementById('drawer-total');
  export const headerCartCount = document.getElementById('header-cart-count');
  export const btnPrintComputo = document.getElementById('btn-print-computo');
  export const btnExportPresupuestoReferencia = document.getElementById('btn-export-presupuesto-referencia');
  export const btnExportListaCompra = document.getElementById('btn-export-lista-compra');
  export const btnCopyComputo = document.getElementById('btn-copy-computo');
  export const btnClearComputo = document.getElementById('btn-clear-computo');
  export const toastContainer = document.getElementById('toast-container');

  // Excel Modal Elements
  export const btnOpenExcelModal = document.getElementById('btn-open-excel-modal');
  export const excelModal = document.getElementById('excel-modal');
  export const excelModalBackdrop = document.getElementById('excel-modal-backdrop');
  export const excelModalCloseBtn = document.getElementById('excel-modal-close-btn');
  export const excelDropzone = document.getElementById('excel-dropzone');
  export const excelFileInput = document.getElementById('excel-file-input');
  export const btnBrowseFile = document.getElementById('btn-browse-file');
  export const btnDownloadTemplate = document.getElementById('btn-download-template');
  export const excelTargetDate = document.getElementById('excel-target-date');
  export const customFactorField = document.getElementById('custom-factor-field');
  export const customFactorInput = document.getElementById('custom-factor-input');
  export const excelPricingMode = document.getElementById('excel-pricing-mode');
  export const excelResultsContainer = document.getElementById('excel-results-container');
  export const excelPreviewTbody = document.getElementById('excel-preview-tbody');
  export const excelStatsText = document.getElementById('excel-stats-text');
  export const btnDownloadProcessedExcel = document.getElementById('btn-download-processed-excel');
  export const btnSaveExcelToComputo = document.getElementById('btn-save-excel-to-computo');
  export const btnOpenAuthModal = document.getElementById('btn-open-auth-modal');
  export const authModal = document.getElementById('auth-modal');
  export const authModalBackdrop = document.getElementById('auth-modal-backdrop');
  export const authModalCloseBtn = document.getElementById('auth-modal-close-btn');
  export const authTabLogin = document.getElementById('auth-tab-login');
  export const authTabRegister = document.getElementById('auth-tab-register');
  export const authFormLogin = document.getElementById('auth-form-login');
  export const authFormRegister = document.getElementById('auth-form-register');
  export const authErrorMsg = document.getElementById('auth-error-msg');
  export const authInfoMsg = document.getElementById('auth-info-msg');
  export const btnForgotPassword = document.getElementById('btn-forgot-password');
  export const btnGoogleAuth = document.getElementById('btn-google-auth');
  export const authHeaderLabel = document.getElementById('auth-header-label');
  export const authDropdown = document.getElementById('auth-dropdown');
  export const btnLogout = document.getElementById('btn-logout');
  export const profileModal = document.getElementById('profile-modal');
  export const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
  export const profileModalCloseBtn = document.getElementById('profile-modal-close-btn');
  export const profileForm = document.getElementById('profile-form');
  export const profileErrorMsg = document.getElementById('profile-error-msg');
  export const profileInfoMsg = document.getElementById('profile-info-msg');
  export const btnOpenProfile = document.getElementById('btn-open-profile');
  export const roleModal = document.getElementById('role-modal');
  export const roleModalBackdrop = document.getElementById('role-modal-backdrop');
  export const roleForm = document.getElementById('role-form');
  export const roleErrorMsg = document.getElementById('role-error-msg');
  export const drawerComputationName = document.getElementById('drawer-computation-name');
  export const drawerObraNombre = document.getElementById('drawer-obra-nombre');
  export const drawerObraUbicacion = document.getElementById('drawer-obra-ubicacion');
  export const drawerObraComitente = document.getElementById('drawer-obra-comitente');
  export const drawerObraReferencia = document.getElementById('drawer-obra-referencia');
  export const btnSaveComputation = document.getElementById('btn-save-computation');
  export const btnSaveComputationLabel = document.getElementById('btn-save-computation-label');
  export const btnOpenMyComputations = document.getElementById('btn-open-my-computations');
  export const myComputationsList = document.getElementById('my-computations-list');
  export const btnNewComputation = document.getElementById('btn-new-computation');
  export const btnOpenMyProvider = document.getElementById('btn-open-my-provider');
  export const providerView = document.getElementById('provider-view');
  export const providerProfileForm = document.getElementById('provider-profile-form');
  export const providerProfileStatus = document.getElementById('provider-profile-status');
  export const providerAddSearch = document.getElementById('provider-add-search');
  export const providerAddResults = document.getElementById('provider-add-results');
  export const providerExcelInput = document.getElementById('provider-excel-input');
  export const providerExcelPreview = document.getElementById('provider-excel-preview');
  export const btnConfirmProviderExcel = document.getElementById('btn-confirm-provider-excel');
  export const providerCatalogList = document.getElementById('provider-catalog-list');
  export const providerBulkPercent = document.getElementById('provider-bulk-percent');
  export const btnApplyBulkPercent = document.getElementById('btn-apply-bulk-percent');
  export const mapStatusMsg = document.getElementById('map-status-msg');
  export const mapBranchPanel = document.getElementById('map-branch-panel');
  export const mapRadiusSelect = document.getElementById('map-radius-select');
  export const btnGeolocate = document.getElementById('btn-geolocate');
  export const offerPickerModal = document.getElementById('offer-picker-modal');
  export const offerPickerModalBackdrop = document.getElementById('offer-picker-modal-backdrop');
  export const offerPickerModalCloseBtn = document.getElementById('offer-picker-modal-close-btn');
  export const newMaterialModal = document.getElementById('new-material-modal');
  export const newMaterialModalBackdrop = document.getElementById('new-material-modal-backdrop');
  export const newMaterialModalCloseBtn = document.getElementById('new-material-modal-close-btn');
  export const btnSubmitNewMaterial = document.getElementById('btn-submit-new-material');
  export const btnOpenNewMaterialAdmin = document.getElementById('btn-open-new-material-admin');
  export const offerPickerSubtitle = document.getElementById('offer-picker-subtitle');
  export const offerPickerResults = document.getElementById('offer-picker-results');
