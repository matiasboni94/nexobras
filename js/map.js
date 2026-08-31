// NEXOBRA - map.js

import * as Auth from './auth.js';
import * as Catalog from './catalog.js';
import * as Computo from './computo.js';
import * as Main from './main.js';
import * as ST from './state.js';

  export function initProviderMap() {
    if (ST.mapState.initialized || typeof L === 'undefined') return;
    ST.mapState.map = L.map('provider-map').setView([ST.mapState.center.lat, ST.mapState.center.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(ST.mapState.map);
    ST.mapState.initialized = true;
  }

  export function clearMapMarkers() {
    ST.mapState.markers.forEach(m => ST.mapState.map.removeLayer(m));
    ST.mapState.markers = [];
  }

  export async function loadNearbyBranchesOnMap() {
    if (!ST.supabaseClient || !ST.mapState.map) return;
    ST.mapStatusMsg.textContent = 'Buscando proveedores cercanos...';

    const { data, error } = await ST.supabaseClient.rpc('nearby_provider_branches', {
      center_lat: ST.mapState.center.lat,
      center_lng: ST.mapState.center.lng,
      radius_km: ST.mapState.radiusKm
    });

    if (error) {
      ST.mapStatusMsg.textContent = 'No se pudo cargar el mapa: ' + error.message;
      return;
    }

    clearMapMarkers();

    const centerMarker = L.circleMarker([ST.mapState.center.lat, ST.mapState.center.lng], {
      radius: 7, color: '#d97757', fillColor: '#d97757', fillOpacity: 0.9
    }).addTo(ST.mapState.map).bindPopup('Tu ubicación');
    ST.mapState.markers.push(centerMarker);

    (data || []).forEach(branch => {
      if (!branch.latitude || !branch.longitude) return;
      const marker = L.marker([branch.latitude, branch.longitude]).addTo(ST.mapState.map);
      marker.bindPopup(`<strong>${branch.business_name}</strong><br>${branch.branch_name} · ${branch.distance_km.toFixed(1)} km<br>${branch.offers_count} material${branch.offers_count === 1 ? '' : 'es'} cargado${branch.offers_count === 1 ? '' : 's'}`);
      marker.on('click', () => showBranchDetail(branch.branch_id, branch));
      ST.mapState.markers.push(marker);
    });

    ST.mapStatusMsg.textContent = data && data.length > 0
      ? `${data.length} proveedor${data.length === 1 ? '' : 'es'} encontrado${data.length === 1 ? '' : 's'} en ${ST.mapState.radiusKm} km a la redonda.`
      : `No hay proveedores cargados en ${ST.mapState.radiusKm} km a la redonda todavía.`;
  }

  export async function showBranchDetail(branchId, branchInfo) {
    ST.mapBranchPanel.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando ficha...</p>';
    ST.mapState.lastSelectedBranch = branchInfo;

    const { data, error } = await ST.supabaseClient.rpc('branch_price_variation', {
      p_branch_id: branchId,
      center_lat: ST.mapState.center.lat,
      center_lng: ST.mapState.center.lng,
      radius_km: ST.mapState.radiusKm
    });

    if (error) {
      ST.mapBranchPanel.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }

    const whatsappLink = branchInfo.whatsapp_phone
      ? `<a class="branch-whatsapp-btn" target="_blank" href="https://wa.me/${branchInfo.whatsapp_phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, te escribo desde NEXOBRA para consultar precios.')}">💬 Contactar por WhatsApp</a>`
      : '';

    const esFavorito = ST.favoritesState.ids.has(branchId);
    const favBtn = `
      <button class="btn-favorite-toggle ${esFavorito ? 'active' : ''}" onclick='window.nexoBraApp.toggleFavorite(${ST.escAttr(branchId)}, ${ST.escAttr(branchInfo.business_name)})'>
        ${esFavorito ? '★ En favoritos' : '☆ Guardar favorito'}
      </button>
    `;

    const filas = (data || []).map(row => {
      const cls = row.variation_pct === null ? 'equal' : row.variation_pct < -1 ? 'below' : row.variation_pct > 1 ? 'above' : 'equal';
      const texto = row.variation_pct === null ? 's/d' : `${row.variation_pct > 0 ? '+' : ''}${row.variation_pct}%`;
      return `
        <div class="variation-row">
          <span class="variation-name">${row.denomination}${row.stock_status === 'agotado' ? ' <em>(agotado)</em>' : ''}</span>
          <span style="text-align:right;">
            <strong style="display:block; font-size:0.85rem;">${ST.formatMoney(row.branch_amount)}</strong>
            <span class="variation-badge ${cls}">${texto}</span>
          </span>
        </div>
      `;
    }).join('');

    ST.mapBranchPanel.innerHTML = `
      <h3>${branchInfo.business_name}</h3>
      <div class="branch-meta">${branchInfo.branch_name} · ${branchInfo.locality} · ${branchInfo.distance_km.toFixed(1)} km de tu ubicación</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">${whatsappLink}${favBtn}</div>
      <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">Variación de precio vs. la mediana de proveedores en ${ST.mapState.radiusKm} km a la redonda:</p>
      ${filas || '<p style="font-size:0.8rem; color:var(--text-muted);">Sin materiales cargados todavía.</p>'}
    `;
  }

  export function requestUserLocation() {
    if (!navigator.geolocation) {
      ST.showToast('Tu navegador no soporta geolocalización.');
      return;
    }
    ST.mapStatusMsg.textContent = 'Buscando tu ubicación...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ST.mapState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        ST.mapState.map.setView([ST.mapState.center.lat, ST.mapState.center.lng], 13);
        loadNearbyBranchesOnMap();
      },
      () => {
        ST.showToast('No se pudo acceder a tu ubicación. Mostrando la zona por defecto.');
        loadNearbyBranchesOnMap();
      },
      { timeout: 8000 }
    );
  }

  export function setupMapListeners() {
    if (!ST.supabaseClient) return;
    const navBtnMapa = document.getElementById('nav-btn-mapa');
    const mobileNavBtnMapa = document.getElementById('mobile-nav-btn-mapa');
    if (navBtnMapa) navBtnMapa.addEventListener('click', () => Main.switchView('map'));
    if (mobileNavBtnMapa) mobileNavBtnMapa.addEventListener('click', () => {
      Main.switchView('map');
      const panel = document.getElementById('mobile-menu-panel');
      const backdrop = document.getElementById('mobile-menu-backdrop');
      if (panel) panel.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      document.body.style.overflow = '';
    });
    ST.btnGeolocate.addEventListener('click', requestUserLocation);
    ST.mapRadiusSelect.addEventListener('change', () => {
      ST.mapState.radiusKm = parseFloat(ST.mapRadiusSelect.value);
      loadNearbyBranchesOnMap();
    });
  }

  // --- OFERTAS DE CORRALONES EN EL CATÁLOGO (toggle "ORIGEN DEL VALOR") ---
  // Reutiliza el mismo centro/radio que el mapa (ST.mapState) para no pedir
  // ubicación dos veces. Si el mapa nunca se abrió en esta sesión, usa el
  // centro por defecto (o pide geolocalización la primera vez que se activa).
  export async function loadNearbyRepresentativePrices() {
    if (!ST.supabaseClient) return;
    const { data, error } = await ST.supabaseClient.rpc('nearby_representative_prices', {
      center_lat: ST.mapState.center.lat,
      center_lng: ST.mapState.center.lng,
      radius_km: ST.mapState.radiusKm
    });
    if (error) {
      ST.showToast('No se pudieron cargar las ofertas de corralones: ' + error.message);
      return;
    }
    ST.providerPricesState.byMaterial = {};
    (data || []).forEach(row => { ST.providerPricesState.byMaterial[row.material_id] = row; });
    ST.providerPricesState.loaded = true;
    updateCatalogProvidersStatus(data ? data.length : 0);
  }

  function updateCatalogProvidersStatus(materialesConOferta) {
    const status = document.getElementById('catalog-providers-status');
    if (!status) return;
    status.textContent = materialesConOferta > 0
      ? `${materialesConOferta} material${materialesConOferta === 1 ? '' : 'es'} con oferta en ${ST.mapState.radiusKm} km a la redonda de tu ubicación.`
      : `Ningún corralón cargó precios dentro de ${ST.mapState.radiusKm} km de tu ubicación. Probá ampliar el radio.`;
  }

  export function setupPricingSourceListeners() {
    const btnSourceReference = document.getElementById('source-reference');
    const btnSourceProviders = document.getElementById('source-providers');
    const providersControls = document.getElementById('catalog-providers-controls');
    const catalogRadiusSelect = document.getElementById('catalog-radius-select');
    if (!btnSourceReference || !btnSourceProviders) return;

    async function refreshProvidersView() {
      const status = document.getElementById('catalog-providers-status');
      if (status) status.textContent = 'Buscando ofertas cerca tuyo...';
      await loadNearbyRepresentativePrices();
      Catalog.renderProducts();
    }

    async function activateProvidersSource() {
      btnSourceReference.classList.remove('active');
      btnSourceProviders.classList.add('active');
      ST.state.pricingSource = 'providers';
      if (providersControls) providersControls.style.display = 'flex';

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            ST.mapState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            await refreshProvidersView();
          },
          async () => { await refreshProvidersView(); },
          { timeout: 8000 }
        );
      } else {
        await refreshProvidersView();
      }
    }

    btnSourceReference.addEventListener('click', () => {
      btnSourceProviders.classList.remove('active');
      btnSourceReference.classList.add('active');
      ST.state.pricingSource = 'reference';
      if (providersControls) providersControls.style.display = 'none';
      Catalog.renderProducts();
    });
    btnSourceProviders.addEventListener('click', activateProvidersSource);

    if (catalogRadiusSelect) {
      catalogRadiusSelect.addEventListener('change', () => {
        ST.mapState.radiusKm = parseFloat(catalogRadiusSelect.value);
        refreshProvidersView();
      });
    }
  }

  // --- ELEGIR UN PROVEEDOR ESPECÍFICO PARA UN MATERIAL ---
  // A diferencia de los materiales "de referencia" (que siempre se recalculan
  // en vivo contra el mes elegido en Mi Cómputo), un ítem elegido de un
  // corralón puntual guarda el precio de ese momento tal cual — no hay "mes"
  // al que llevarlo, es lo que ese corralón tiene cargado ahora. Si el
  // corralón cambia después su precio, hay que sacarlo y volver a elegirlo.
  export async function openOfferPicker(materialId) {
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    if (!material) return;

    ST.offerPickerSubtitle.textContent = material.denominacion;
    ST.offerPickerResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Buscando ofertas...</p>';
    ST.offerPickerModal.classList.add('open');
    ST.offerPickerModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    const { data, error } = await ST.supabaseClient.rpc('nearby_offers_for_material', {
      p_material_id: materialId,
      center_lat: ST.mapState.center.lat,
      center_lng: ST.mapState.center.lng,
      radius_km: ST.mapState.radiusKm
    });

    if (error) {
      ST.offerPickerResults.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      ST.offerPickerResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay ofertas cercanas para este material.</p>';
      return;
    }

    ST.offerPickerResults.innerHTML = data.map((offer, idx) => `
      <div class="offer-picker-row">
        <div class="offer-picker-row-info">
          <h5>${offer.business_name}</h5>
          <span>${offer.branch_name} · ${offer.locality} · ${offer.distance_km.toFixed(1)} km${offer.stock_status === 'agotado' ? ' · <strong style="color:#b91c1c;">Agotado</strong>' : offer.stock_status === 'a_pedido' ? ' · A pedido' : ' · En stock'}</span>
        </div>
        <div class="offer-picker-row-price">
          <strong>${ST.formatMoney(offer.amount)}</strong>
          <span style="font-size:0.72rem; color:var(--text-muted);">/ ${offer.unit}</span>
          <button class="btn-computo" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 4px; display:block;" onclick='window.nexoBraApp.chooseProviderOffer(${ST.escAttr(materialId)}, ${idx})'>
            Elegir
          </button>
        </div>
      </div>
    `).join('');

    // Se guarda temporalmente para que chooseProviderOffer no tenga que repetir la consulta.
    ST.offerPickerResults.dataset.materialId = materialId;
    window.__offerPickerData = data;
  }

  export function closeOfferPicker() {
    ST.offerPickerModal.classList.remove('open');
    ST.offerPickerModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  export function chooseProviderOffer(materialId, offerIndex) {
    const offer = window.__offerPickerData?.[offerIndex];
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    if (!offer || !material) return;

    const qtyInput = document.getElementById(`qty-${materialId}`);
    const qty = qtyInput ? Math.max(1, parseFloat(qtyInput.value) || 1) : 1;

    const existingIndex = ST.state.computoCart.findIndex(i => i.id === materialId && i.type === 'material' && i.providerOfferId === offer.offer_id);
    if (existingIndex > -1) {
      ST.state.computoCart[existingIndex].qty += qty;
    } else {
      ST.state.computoCart.push({
        id: materialId,
        denominacion: material.denominacion,
        rubro: material.rubro,
        unit: offer.unit,
        qty: qty,
        type: 'material',
        mode: ST.state.pricingMode,
        providerOfferId: offer.offer_id,
        providerBranchId: offer.branch_id,
        providerBusinessName: offer.business_name,
        providerBranchName: offer.branch_name,
        providerWhatsapp: offer.whatsapp_phone,
        providerPrice: offer.amount
      });
    }

    Computo.saveCart();
    Computo.updateCartUI();
    closeOfferPicker();
    ST.showToast(`Agregado desde ${offer.business_name}: ${material.denominacion.substring(0, 30)}`);
  }

  export function setupOfferPickerListeners() {
    if (!ST.supabaseClient) return;
    ST.offerPickerModalCloseBtn.addEventListener('click', closeOfferPicker);
    ST.offerPickerModalBackdrop.addEventListener('click', closeOfferPicker);
  }

  // --- FASE E, PARTE 1: Dashboard de competitividad (dentro de "Mi Corralón") ---
  // Reutiliza branch_price_variation(), ya construida en la Fase D para la
  // ficha que ve el USUARIO al tocar un pin. Acá el corralón ve exactamente
  // lo mismo, pero de su propio negocio, sin salir de su panel.
  export async function loadFavoriteIds() {
    if (!ST.supabaseClient || !ST.authState.user) return;
    const { data, error } = await ST.supabaseClient
      .from('provider_favorites')
      .select('branch_id')
      .eq('user_id', ST.authState.user.id);
    if (!error) {
      ST.favoritesState.ids = new Set((data || []).map(r => r.branch_id));
      ST.favoritesState.loaded = true;
    }
  }

  export async function toggleFavorite(branchId, businessName) {
    if (!ST.authState.user) {
      ST.showToast('Iniciá sesión para guardar favoritos.');
      Auth.showAuthTab('login');
      Auth.openAuthModal();
      return;
    }
    const isFav = ST.favoritesState.ids.has(branchId);
    if (isFav) {
      const { error } = await ST.supabaseClient.from('provider_favorites').delete().eq('user_id', ST.authState.user.id).eq('branch_id', branchId);
      if (error) {
        ST.showToast('No se pudo quitar de favoritos: ' + error.message);
        return;
      }
      ST.favoritesState.ids.delete(branchId);
      ST.showToast('Sacado de favoritos.');
    } else {
      const { error } = await ST.supabaseClient.from('provider_favorites').insert({ user_id: ST.authState.user.id, branch_id: branchId });
      if (error) {
        ST.showToast('No se pudo guardar el favorito: ' + error.message);
        return;
      }
      ST.favoritesState.ids.add(branchId);
      ST.showToast(`${businessName} agregado a favoritos.`);
    }
    // Si la ficha del mapa está abierta, refresca el botón para mostrar el nuevo estado.
    if (ST.mapState.lastSelectedBranch && ST.mapState.lastSelectedBranch.branch_id === branchId) {
      showBranchDetail(branchId, ST.mapState.lastSelectedBranch);
    }
  }

  export async function loadFavorites() {
    const list = document.getElementById('favorites-list');
    if (!ST.authState.user) return;
    list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

    const { data, error } = await ST.supabaseClient
      .from('provider_favorites')
      .select('id, branch_id, provider_branches(name, locality, whatsapp_phone, providers(business_name))')
      .eq('user_id', ST.authState.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      list.innerHTML = `
        <div class="computo-empty-ST.state">
          <div class="empty-icon">⭐</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no guardaste ningún corralón</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Desde el mapa, tocá un pin y usá el botón de favorito en su ficha.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = data.map(fav => {
      const branch = fav.provider_branches;
      const whatsappUrl = branch.whatsapp_phone
        ? `https://wa.me/${branch.whatsapp_phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, te escribo desde NEXOBRA.')}`
        : null;
      return `
        <div class="computation-row">
          <div class="computation-row-info">
            <h4>${branch.providers?.business_name || '(proveedor eliminado)'}</h4>
            <span>${branch.name} · ${branch.locality}</span>
          </div>
          <div class="computation-row-actions">
            ${whatsappUrl ? `<a href="${whatsappUrl}" target="_blank" class="btn-computo" style="padding:7px 12px; font-size:0.78rem; text-decoration:none;">💬 WhatsApp</a>` : ''}
            <button class="danger" onclick="window.nexoBraApp.removeFavorite('${fav.branch_id}')">Quitar</button>
          </div>
        </div>
      `;
    }).join('');
  }

  export async function removeFavorite(branchId) {
    await ST.supabaseClient.from('provider_favorites').delete().eq('user_id', ST.authState.user.id).eq('branch_id', branchId);
    ST.favoritesState.ids.delete(branchId);
    ST.showToast('Sacado de favoritos.');
    loadFavorites();
  }

  // --- FASE E, PARTE 3: Alertas de precio ---
  // Importante: modelo "pull", no hay mail/push. El usuario ve la comparación
  // cuando entra a "Mis Alertas" (o desde el catálogo). No hay cron todavía.
  export async function loadAlertIds() {
    if (!ST.supabaseClient || !ST.authState.user) return;
    const { data, error } = await ST.supabaseClient
      .from('price_alerts')
      .select('*')
      .eq('user_id', ST.authState.user.id);
    if (!error) {
      ST.alertsState.byMaterial = {};
      (data || []).forEach(row => { ST.alertsState.byMaterial[row.material_id] = row; });
      ST.alertsState.loaded = true;
    }
  }

  export async function toggleMaterialAlert(materialId, materialName) {
    if (!ST.authState.user) {
      ST.showToast('Iniciá sesión para crear alertas de precio.');
      Auth.showAuthTab('login');
      Auth.openAuthModal();
      return;
    }
    const existing = ST.alertsState.byMaterial[materialId];
    if (existing) {
      await ST.supabaseClient.from('price_alerts').delete().eq('id', existing.id);
      delete ST.alertsState.byMaterial[materialId];
      ST.showToast('Alerta eliminada.');
    } else {
      const oferta = ST.providerPricesState.byMaterial[materialId];
      if (!oferta) {
        ST.showToast('Todavía no hay ofertas de corralones cargadas para este material en tu zona.');
        return;
      }
      const { data, error } = await ST.supabaseClient
        .from('price_alerts')
        .insert({
          user_id: ST.authState.user.id,
          material_id: materialId,
          center_lat: ST.mapState.center.lat,
          center_lng: ST.mapState.center.lng,
          radius_km: ST.mapState.radiusKm,
          reference_price: oferta.median_price
        })
        .select('*')
        .single();
      if (!error) {
        ST.alertsState.byMaterial[materialId] = data;
        ST.showToast(`Te avisamos acá si baja el precio de ${materialName}.`);
      }
    }
    Catalog.renderProducts();
  }

  export async function loadAlerts() {
    const list = document.getElementById('alerts-list');
    if (!ST.authState.user) return;
    list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

    const { data, error } = await ST.supabaseClient
      .from('price_alerts')
      .select('*')
      .eq('user_id', ST.authState.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      list.innerHTML = `
        <div class="computo-empty-ST.state">
          <div class="empty-icon">🔔</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no armaste ninguna alerta</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">En el catálogo, activá "Ofertas de corralones cercanos" y usá el botón de campana en cualquier material.</p>
        </div>
      `;
      return;
    }

    const rows = await Promise.all(data.map(async alert => {
      const material = NEXOBRA_DATA.find(m => m.id === alert.material_id);
      const { data: current } = await ST.supabaseClient.rpc('representative_price_nearby', {
        p_material_id: alert.material_id,
        center_lat: alert.center_lat,
        center_lng: alert.center_lng,
        radius_km: alert.radius_km
      });
      const currentPrice = current?.[0]?.median_price ?? null;
      const bajó = currentPrice !== null && currentPrice < alert.reference_price;
      const pct = currentPrice !== null ? Math.round(((currentPrice - alert.reference_price) / alert.reference_price) * 1000) / 10 : null;
      return { alert, material, currentPrice, bajó, pct };
    }));

    list.innerHTML = rows.map(({ alert, material, currentPrice, bajó, pct }) => `
      <div class="computation-row">
        <div class="computation-row-info">
          <h4>${material ? material.denominacion : alert.material_id}</h4>
          <span>Precio de referencia: ${ST.formatMoney(alert.reference_price)} ${currentPrice !== null ? `· Ahora: ${ST.formatMoney(currentPrice)}` : '· Sin ofertas cercanas actuales'}</span>
        </div>
        <div class="computation-row-actions" style="align-items:center;">
          ${currentPrice !== null
            ? (bajó ? `<span class="price-drop-badge">▼ Bajó ${Math.abs(pct)}%</span>` : `<span class="price-same-badge">Sin bajas</span>`)
            : ''
          }
          <button class="danger" onclick="window.nexoBraApp.removeAlert('${alert.id}', '${alert.material_id}')">Eliminar</button>
        </div>
      </div>
    `).join('');
  }

  export async function removeAlert(alertId, materialId) {
    await ST.supabaseClient.from('price_alerts').delete().eq('id', alertId);
    delete ST.alertsState.byMaterial[materialId];
    ST.showToast('Alerta eliminada.');
    loadAlerts();
  }

  export function setupFavoritesAndAlertsListeners() {
    if (!ST.supabaseClient) return;
    const btnOpenFavorites = document.getElementById('btn-open-favorites');
    const btnOpenAlerts = document.getElementById('btn-open-alerts');
    if (btnOpenFavorites) btnOpenFavorites.addEventListener('click', () => {
      ST.authDropdown.style.display = 'none';
      Main.switchView('favorites');
    });
    if (btnOpenAlerts) btnOpenAlerts.addEventListener('click', () => {
      ST.authDropdown.style.display = 'none';
      Main.switchView('alerts');
    });
  }
