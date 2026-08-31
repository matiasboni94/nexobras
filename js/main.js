// NEXOBRA - main.js

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
    if (ST.methodologyView) ST.methodologyView.style.display = viewName === 'methodology' ? 'block' : 'none';
    if (ST.myComputationsView) ST.myComputationsView.style.display = viewName === 'my-computations' ? 'block' : 'none';
    if (ST.providerView) ST.providerView.style.display = viewName === 'provider' ? 'block' : 'none';
    const mapViewEl = document.getElementById('map-view');
    if (mapViewEl) mapViewEl.style.display = viewName === 'map' ? 'block' : 'none';
    const favoritesViewEl = document.getElementById('favorites-view');
    if (favoritesViewEl) favoritesViewEl.style.display = viewName === 'favorites' ? 'block' : 'none';
    const alertsViewEl = document.getElementById('alerts-view');
    if (alertsViewEl) alertsViewEl.style.display = viewName === 'alerts' ? 'block' : 'none';

    ST.navBtnHome.classList.toggle('active', viewName === 'home');
    ST.navBtnCatalogo.classList.toggle('active', viewName === 'catalog');
    if (ST.navBtnManoObra) ST.navBtnManoObra.classList.toggle('active', viewName === 'labor');

    const mHome = document.getElementById('mobile-nav-btn-home');
    const mCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mManoObra = document.getElementById('mobile-nav-btn-manoobra');
    if (mHome) mHome.classList.toggle('active', viewName === 'home');
    if (mCatalogo) mCatalogo.classList.toggle('active', viewName === 'catalog');
    if (mManoObra) mManoObra.classList.toggle('active', viewName === 'labor');

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
    if (viewName === 'methodology') {
      // El canvas estaba oculto hasta ahora; Chart.js necesita redibujar una vez visible.
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
        ST.showToast(!ST.authState.user ? 'Iniciá sesión primero.' : 'Esta sección es solo para cuentas de Corralón.');
        ST.state.currentView = 'home';
        ST.homeView.style.display = 'block';
        if (ST.providerView) ST.providerView.style.display = 'none';
      } else {
        Provider.loadProviderData();
      }
    }
    if (viewName === 'map') {
      // Leaflet necesita el contenedor visible para calcular tamaño correctamente:
      // primero se muestra el div (ya hecho arriba), recién ahí se inicializa/redibuja.
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
    MapModule.setupMapListeners();
    MapModule.setupPricingSourceListeners();
    MapModule.setupOfferPickerListeners();
    Provider.setupProviderDashboardListeners();
    MapModule.setupFavoritesAndAlertsListeners();

    // Nav buttons
    ST.navBrandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    ST.navBtnHome.addEventListener('click', () => switchView('home'));
    ST.navBtnCatalogo.addEventListener('click', () => switchView('catalog', 'Todos', ''));
    if (ST.navBtnManoObra) ST.navBtnManoObra.addEventListener('click', () => switchView('labor'));

    const btnMethodologyHome = document.getElementById('btn-open-methodology-home');
    if (btnMethodologyHome) btnMethodologyHome.addEventListener('click', () => switchView('methodology'));
    const btnMethodologyCatalog = document.getElementById('btn-open-methodology-catalog');
    if (btnMethodologyCatalog) btnMethodologyCatalog.addEventListener('click', () => switchView('methodology'));
    ST.btnBackHome.addEventListener('click', () => switchView('home'));
    ST.btnSeeAllCatalog.addEventListener('click', () => switchView('catalog', 'Todos', ''));

    ST.navBtnRubros.addEventListener('click', () => {
      if (ST.state.currentView !== 'home') {
        switchView('home');
      }
      setTimeout(() => {
        document.getElementById('seccion-rubros').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

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
    const mobileNavBtnRubros = document.getElementById('mobile-nav-btn-rubros');
    const mobileNavBtnCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mobileNavBtnManoObra = document.getElementById('mobile-nav-btn-manoobra');

    if (mobileNavBtnHome) mobileNavBtnHome.addEventListener('click', () => mobileNavAction(() => switchView('home')));
    if (mobileNavBtnCatalogo) mobileNavBtnCatalogo.addEventListener('click', () => mobileNavAction(() => switchView('catalog', 'Todos', '')));
    if (mobileNavBtnManoObra) mobileNavBtnManoObra.addEventListener('click', () => mobileNavAction(() => switchView('labor')));
    if (mobileNavBtnRubros) mobileNavBtnRubros.addEventListener('click', () => mobileNavAction(() => {
      if (ST.state.currentView !== 'home') switchView('home');
      setTimeout(() => {
        document.getElementById('seccion-rubros').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }));

    // Home Search Listeners
    ST.homeSearchSubmit.addEventListener('click', () => {
      const query = ST.homeSearchInput.value.trim();
      if (query) {
        switchView('catalog', 'Todos', query);
      } else {
        switchView('catalog', 'Todos', '');
      }
    });

    ST.homeSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        ST.homeSearchSubmit.click();
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
    ST.catalogSearchInput.addEventListener('input', (e) => {
      ST.state.searchQuery = e.target.value;
      Catalog.renderProducts();
    });

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
    removeAlert: MapModule.removeAlert
  };


document.addEventListener('DOMContentLoaded', init);
