// NEXOBRA - main.js

import * as Admin from './admin.js';
import * as Auth from './auth.js';
import * as Catalog from './catalog.js';
import * as Computo from './computo.js';
import * as Excel from './excel.js';
import * as MapModule from './map.js';
import * as Pricing from './pricing.js';
import * as Provider from './provider.js';
import * as ST from './state.js';

  export function switchView(viewName, rubroFilter = null, searchString = null) {
    ST.state.currentView = viewName;

    ST.homeView.style.display = viewName === 'home' ? 'block' : 'none';
    ST.catalogView.style.display = viewName === 'catalog' ? 'block' : 'none';
    if (ST.laborView) ST.laborView.style.display = viewName === 'labor' ? 'block' : 'none';
    if (ST.myComputationsView) ST.myComputationsView.style.display = viewName === 'my-computations' ? 'block' : 'none';
    if (ST.providerView) ST.providerView.style.display = viewName === 'provider' ? 'block' : 'none';
    const favoritesViewEl = document.getElementById('favorites-view');
    if (favoritesViewEl) favoritesViewEl.style.display = viewName === 'favorites' ? 'block' : 'none';
    const alertsViewEl = document.getElementById('alerts-view');
    if (alertsViewEl) alertsViewEl.style.display = viewName === 'alerts' ? 'block' : 'none';
    const adminViewEl = document.getElementById('admin-view');
    if (adminViewEl) adminViewEl.style.display = viewName === 'admin' ? 'block' : 'none';
    const aboutViewEl = document.getElementById('about-view');
    if (aboutViewEl) aboutViewEl.style.display = viewName === 'about' ? 'block' : 'none';
    const guideViewEl = document.getElementById('guide-view');
    if (guideViewEl) guideViewEl.style.display = viewName === 'guide' ? 'block' : 'none';
    const contactViewEl = document.getElementById('contact-view');
    if (contactViewEl) contactViewEl.style.display = viewName === 'contact' ? 'block' : 'none';

    ST.navBtnCatalogo.classList.toggle('active', viewName === 'catalog');
    if (ST.navBtnManoObra) ST.navBtnManoObra.classList.toggle('active', viewName === 'labor');
    const navBtnQuienesSomosEl = document.getElementById('nav-btn-quienes-somos');
    if (navBtnQuienesSomosEl) navBtnQuienesSomosEl.classList.toggle('active', viewName === 'about');
    const navBtnGuiaEl = document.getElementById('nav-btn-guia');
    if (navBtnGuiaEl) navBtnGuiaEl.classList.toggle('active', viewName === 'guide');
    const navBtnContactoEl = document.getElementById('nav-btn-contacto');
    if (navBtnContactoEl) navBtnContactoEl.classList.toggle('active', viewName === 'contact');

    const mHome = document.getElementById('mobile-nav-btn-home');
    const mCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mManoObra = document.getElementById('mobile-nav-btn-manoobra');
    const mQuienesSomos = document.getElementById('mobile-nav-btn-quienes-somos');
    const mGuia = document.getElementById('mobile-nav-btn-guia');
    const mContacto = document.getElementById('mobile-nav-btn-contacto');
    if (mHome) mHome.classList.toggle('active', viewName === 'home');
    if (mCatalogo) mCatalogo.classList.toggle('active', viewName === 'catalog');
    if (mManoObra) mManoObra.classList.toggle('active', viewName === 'labor');
    if (mQuienesSomos) mQuienesSomos.classList.toggle('active', viewName === 'about');
    if (mGuia) mGuia.classList.toggle('active', viewName === 'guide');
    if (mContacto) mContacto.classList.toggle('active', viewName === 'contact');

    if (viewName === 'catalog') {
      if (rubroFilter) {
        ST.state.activeRubro = rubroFilter;
      }
      if (searchString !== null) {
        ST.state.searchQuery = searchString;
        ST.catalogSearchInput.value = searchString;
      }

      Catalog.updateCatalogHeader();
      Catalog.renderRubroPills();
      Catalog.renderProducts();
    }
    if (viewName === 'labor' && !ST.laborState.loaded) {
      Pricing.loadLaborSeries().then(Pricing.reconcilePriceMonth);
    }
    if (viewName === 'about') {
      // El canvas del gráfico de IPC estaba oculto hasta ahora; Chart.js necesita redibujar una vez visible.
      Pricing.renderIpcChart();
    }
    if (viewName === 'my-computations') {
      if (!ST.authState.user) {
        Auth.showAuthTab('login');
        Auth.openAuthModal();
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (ST.myComputationsView) ST.myComputationsView.style.display = 'none';
      } else {
        Computo.loadMyComputations();
      }
    }
    if (viewName === 'favorites') {
      if (!ST.authState.user) {
        Auth.showAuthTab('login');
        Auth.openAuthModal();
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (favoritesViewEl) favoritesViewEl.style.display = 'none';
      } else {
        MapModule.loadFavorites();
      }
    }
    if (viewName === 'alerts') {
      if (!ST.authState.user) {
        Auth.showAuthTab('login');
        Auth.openAuthModal();
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (alertsViewEl) alertsViewEl.style.display = 'none';
      } else {
        MapModule.loadAlerts();
      }
    }
    if (viewName === 'provider') {
      if (!ST.authState.user || !Provider.isProvider()) {
        ST.showToast(!ST.authState.user ? 'Iniciá sesión primero.' : 'Esta sección es solo para cuentas de Proveedor.');
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (ST.providerView) ST.providerView.style.display = 'none';
      } else {
        Provider.loadProviderData();
      }
    }
    if (viewName === 'admin') {
      if (!ST.authState.user || !Admin.isAdmin()) {
        ST.showToast('Esta sección es solo para administradores.');
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (adminViewEl) adminViewEl.style.display = 'none';
      } else {
        Admin.loadAdminPanel();
      }
    }
    if (viewName === 'home') {
      // El mapa ahora vive en el home (Fase G5). Leaflet necesita el contenedor
      // visible para calcular tamaño correctamente: se inicializa/redibuja cada
      // vez que se vuelve al home, por si estuvo oculto en otra vista.
      MapModule.initProviderMap();
      setTimeout(() => {
        if (ST.mapState.map) ST.mapState.map.invalidateSize();
        MapModule.loadNearbyBranchesOnMap();
      }, 50);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  export function init() {
    Catalog.renderHomeSubareas();
    Catalog.renderRubroPills();
    Catalog.renderProducts();
    Computo.updateCartUI();
    Pricing.updateReferenceStatus();
    Pricing.loadCatalogFromSupabase();
    Promise.all([Pricing.loadIndexSeries(), Pricing.loadLaborSeries()]).then(Pricing.reconcilePriceMonth);
    Auth.setupAuthListeners();
    Auth.setupProfileListeners();
    Auth.setupRoleListeners();
    Computo.setupComputationListeners();
    Provider.setupProviderListeners();
    Provider.setupNewMaterialListeners();
    Admin.setupAdminListeners();
    MapModule.setupMapListeners();
    MapModule.setupPricingSourceListeners();
    MapModule.setupOfferPickerListeners();
    Provider.setupProviderDashboardListeners();
    MapModule.setupFavoritesAndAlertsListeners();

    // El mapa vive en el home (Fase G5) y el home es la vista por defecto al
    // cargar la página (visible por CSS, sin pasar por switchView('home')) —
    // por eso hay que inicializarlo acá también, no solo dentro de switchView.
    MapModule.initProviderMap();
    setTimeout(() => {
      if (ST.mapState.map) ST.mapState.map.invalidateSize();
      MapModule.loadNearbyBranchesOnMap();
    }, 300);

    // Nav buttons
    ST.navBrandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    ST.navBtnCatalogo.addEventListener('click', () => switchView('catalog', 'Todos', ''));
    if (ST.navBtnManoObra) ST.navBtnManoObra.addEventListener('click', () => switchView('labor'));
    ST.btnBackHome.addEventListener('click', () => switchView('home'));

    const btnMethodologyCatalog = document.getElementById('btn-open-methodology-catalog');
    if (btnMethodologyCatalog) btnMethodologyCatalog.addEventListener('click', () => switchView('about'));
    const navBtnQuienesSomos = document.getElementById('nav-btn-quienes-somos');
    if (navBtnQuienesSomos) navBtnQuienesSomos.addEventListener('click', () => switchView('about'));
    const navBtnGuia = document.getElementById('nav-btn-guia');
    if (navBtnGuia) navBtnGuia.addEventListener('click', () => switchView('guide'));

    // Contacto: lleva al home y hace scroll a la sección de contacto (no abre mailto directo).
    function goToContact() {
      switchView('contact');
    }
    const navBtnContacto = document.getElementById('nav-btn-contacto');
    if (navBtnContacto) navBtnContacto.addEventListener('click', goToContact);

    // --- Menú mobile (hamburguesa) ---
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const mobileMenuPanel = document.getElementById('mobile-menu-panel');
    const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
    const mobileMenuClose = document.getElementById('mobile-menu-close');

    function openMobileMenu() {
      mobileMenuPanel.classList.add('open');
      mobileMenuBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeMobileMenu() {
      mobileMenuPanel.classList.remove('open');
      mobileMenuBackdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
    // Ejecuta la misma acción que su botón gemelo de escritorio, y cierra el panel después.
    function mobileNavAction(action) {
      action();
      closeMobileMenu();
    }

    if (btnMobileMenu) btnMobileMenu.addEventListener('click', openMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
    if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', closeMobileMenu);

    const mobileNavBtnHome = document.getElementById('mobile-nav-btn-home');
    const mobileNavBtnCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mobileNavBtnManoObra = document.getElementById('mobile-nav-btn-manoobra');
    const mobileNavBtnQuienesSomos = document.getElementById('mobile-nav-btn-quienes-somos');
    const mobileNavBtnGuia = document.getElementById('mobile-nav-btn-guia');
    const mobileNavBtnContacto = document.getElementById('mobile-nav-btn-contacto');

    if (mobileNavBtnHome) mobileNavBtnHome.addEventListener('click', () => mobileNavAction(() => switchView('home')));
    if (mobileNavBtnCatalogo) mobileNavBtnCatalogo.addEventListener('click', () => mobileNavAction(() => switchView('catalog', 'Todos', '')));
    if (mobileNavBtnManoObra) mobileNavBtnManoObra.addEventListener('click', () => mobileNavAction(() => switchView('labor')));
    if (mobileNavBtnQuienesSomos) mobileNavBtnQuienesSomos.addEventListener('click', () => mobileNavAction(() => switchView('about')));
    if (mobileNavBtnGuia) mobileNavBtnGuia.addEventListener('click', () => mobileNavAction(() => switchView('guide')));
    if (mobileNavBtnContacto) mobileNavBtnContacto.addEventListener('click', () => mobileNavAction(goToContact));

    // Quick tag pills en el Home: ahora buscan directo en el mapa de proveedores.
    document.querySelectorAll('.quick-tags-wrapper .tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const query = pill.getAttribute('data-search');
        const mapSearchInput = document.getElementById('home-map-material-search');
        if (mapSearchInput) {
          mapSearchInput.value = query;
          MapModule.searchMaterialOnMap();
          mapSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    const btnCatalogFromMap = document.getElementById('btn-catalog-from-map');
    if (btnCatalogFromMap) btnCatalogFromMap.addEventListener('click', () => switchView('catalog', 'Todos', ''));
    const btnMethodologyFromMap = document.getElementById('btn-methodology-from-map');
    if (btnMethodologyFromMap) btnMethodologyFromMap.addEventListener('click', () => switchView('about'));

    // Catalog Search listener
    ST.catalogSearchInput.addEventListener('input', (e) => {
      ST.state.searchQuery = e.target.value;
      Catalog.renderProducts();
    });

    // Paginación del catálogo
    const btnLoadMoreCatalog = document.getElementById('btn-load-more-catalog');
    if (btnLoadMoreCatalog) btnLoadMoreCatalog.addEventListener('click', () => Catalog.loadMoreCatalogItems());
    const catalogPageSizeSelect = document.getElementById('catalog-page-size-select');
    if (catalogPageSizeSelect) catalogPageSizeSelect.addEventListener('change', (e) => Catalog.setCatalogPageSize(e.target.value));

    // Pricing Mode Toggle
    ST.modeVentaBtn.addEventListener('click', () => {
      ST.state.pricingMode = 'venta';
      ST.modeVentaBtn.classList.add('active');
      ST.modeComputoBtn.classList.remove('active');
      Catalog.renderProducts();
      ST.showToast('Visualizando: Precio de Venta Comercial (por bulto)');
    });

    ST.modeComputoBtn.addEventListener('click', () => {
      ST.state.pricingMode = 'computo';
      ST.modeComputoBtn.classList.add('active');
      ST.modeVentaBtn.classList.remove('active');
      Catalog.renderProducts();
      ST.showToast('Visualizando: Precio de Cómputo Métrico (m²/m³/ml)');
    });

    if (ST.sourceReferenceBtn) {
      ST.sourceReferenceBtn.addEventListener('click', () => {
        ST.showToast('Mostrando valores de referencia trazables de NEXOBRA');
      });
    }

    // View toggle (Grid vs Table)
    ST.btnViewGrid.addEventListener('click', () => {
      ST.state.viewMode = 'grid';
      ST.btnViewGrid.classList.add('active');
      ST.btnViewTable.classList.remove('active');
      ST.productsGrid.style.display = 'grid';
      ST.productsTableView.style.display = 'none';
    });

    ST.btnViewTable.addEventListener('click', () => {
      ST.state.viewMode = 'table';
      ST.btnViewTable.classList.add('active');
      ST.btnViewGrid.classList.remove('active');
      ST.productsGrid.style.display = 'none';
      ST.productsTableView.style.display = 'block';
    });

    // Sort select
    ST.sortSelect.addEventListener('change', (e) => {
      ST.state.sortBy = e.target.value;
      Catalog.renderProducts();
    });

    // Drawer triggers
    ST.btnOpenDrawer.addEventListener('click', Computo.openDrawer);
    ST.drawerCloseBtn.addEventListener('click', Computo.closeDrawer);
    ST.drawerBackdrop.addEventListener('click', Computo.closeDrawer);

    // Drawer Actions
    ST.btnPrintComputo.addEventListener('click', Computo.printComputo);
    if (ST.btnExportPresupuestoReferencia) ST.btnExportPresupuestoReferencia.addEventListener('click', Computo.exportPresupuestoReferencia);
    if (ST.btnExportListaCompra) ST.btnExportListaCompra.addEventListener('click', Computo.exportListaDeCompra);
    ST.btnCopyComputo.addEventListener('click', Computo.copyComputoToClipboard);
    ST.btnClearComputo.addEventListener('click', Computo.clearComputoCart);

    // Excel Modal Listeners
    ST.btnOpenExcelModal.addEventListener('click', Excel.openExcelModal);
    ST.excelModalCloseBtn.addEventListener('click', Excel.closeExcelModal);
    ST.excelModalBackdrop.addEventListener('click', Excel.closeExcelModal);

    ST.excelTargetDate.addEventListener('change', (e) => {
      ST.customFactorField.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      if (ST.state.excelProcessedRows.length > 0) {
        Excel.recalculateExcelRows();
      }
    });

    ST.customFactorInput.addEventListener('input', () => {
      if (ST.state.excelProcessedRows.length > 0) {
        Excel.recalculateExcelRows();
      }
    });

    ST.excelPricingMode.addEventListener('change', () => {
      if (ST.state.excelProcessedRows.length > 0) {
        Excel.recalculateExcelRows();
      }
    });

    ST.btnBrowseFile.addEventListener('click', () => ST.excelFileInput.click());
    ST.excelFileInput.addEventListener('change', Excel.handleExcelFileSelect);

    // Dropzone drag & drop
    ST.excelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      ST.excelDropzone.classList.add('dragover');
    });
    ST.excelDropzone.addEventListener('dragleave', () => {
      ST.excelDropzone.classList.remove('dragover');
    });
    ST.excelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      ST.excelDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        Excel.handleExcelFile(e.dataTransfer.files[0]);
      }
    });

    ST.btnDownloadTemplate.addEventListener('click', Excel.generateTemplateExcel);
    ST.btnDownloadProcessedExcel.addEventListener('click', Excel.exportProcessedExcel);
    if (ST.btnSaveExcelToComputo) ST.btnSaveExcelToComputo.addEventListener('click', Excel.saveExcelToComputo);
  }

  // --- RENDER SUBAREAS EN EL HOME ---
  // --- PUBLIC API EXPOSURE ---
  window.nexoBraApp = {
    switchView,
addToComputo: Computo.addToComputo,
changeCardQty: Computo.changeCardQty,
updateItemQtyInCart: Computo.updateItemQtyInCart,
removeCartItem: Computo.removeCartItem,
clearCatalogSearch: Catalog.clearCatalogSearch,
addLaborToComputo: Computo.addLaborToComputo,
changeLaborQty: Catalog.changeLaborQty,
openComputation: Computo.openComputation,
duplicateComputation: Computo.duplicateComputation,
deleteComputation: Computo.deleteComputation,
addOfferFromSearch: Provider.addOfferFromSearch,
updateOfferPrice: Provider.updateOfferPrice,
updateOfferStock: Provider.updateOfferStock,
deleteOffer: Provider.deleteOffer,
openOfferPicker: MapModule.openOfferPicker,
chooseProviderOffer: MapModule.chooseProviderOffer,
toggleFavorite: MapModule.toggleFavorite,
removeFavorite: MapModule.removeFavorite,
toggleMaterialAlert: MapModule.toggleMaterialAlert,
    removeAlert: MapModule.removeAlert,
    openMaterialEditor: Admin.openMaterialEditor,
    approveProvider: Admin.approveProvider,
    rejectProvider: Admin.rejectProvider,
    approveOffer: Admin.approveOffer,
    rejectOffer: Admin.rejectOffer,
    openProviderReview: Admin.openProviderReview,
    closeProviderReview: Admin.closeProviderReview,
    openNewMaterialForm: Provider.openNewMaterialForm,
    selectMaterialOnMap: MapModule.selectMaterialOnMap
  };


document.addEventListener('DOMContentLoaded', init);
