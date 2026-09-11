// NEXOBRA - provider.js

import * as Auth from './auth.js';
import * as Excel from './excel.js';
import * as Main from './main.js';
import * as ST from './state.js';

  export function isProvider() {
    return ST.authState.profile?.role === 'provider';
  }

  /** Se llama desde Auth.refreshAuthUI(): muestra/oculta el acceso a "Mi Proveedor" según el rol. */
  export function updateProviderNavVisibility() {
    if (ST.btnOpenMyProvider) ST.btnOpenMyProvider.style.display = isProvider() ? 'block' : 'none';
  }

  export async function loadProviderData() {
    if (!ST.supabaseClient || !ST.authState.user) return;

    const { data: provider } = await ST.supabaseClient
      .from('providers')
      .select('*')
      .eq('owner_id', ST.authState.user.id)
      .maybeSingle();

    ST.providerState.provider = provider || null;

    const statusBanner = document.getElementById('provider-verification-banner');
    if (statusBanner) {
      if (!provider || provider.verification_status === 'approved') {
        statusBanner.style.display = 'none';
      } else if (provider.verification_status === 'pending') {
        statusBanner.style.display = 'block';
        statusBanner.className = 'provider-status-banner pending';
        statusBanner.innerHTML = '⏳ Tu perfil está pendiente de aprobación. No vas a aparecer en el mapa hasta que un administrador lo revise.';
      } else if (provider.verification_status === 'rejected') {
        statusBanner.style.display = 'block';
        statusBanner.className = 'provider-status-banner rejected';
        statusBanner.innerHTML = `✕ Tu perfil fue rechazado${provider.rejection_reason ? ': ' + ST.escapeHtml(provider.rejection_reason) : ''}. Corregí lo que haga falta y guardá de nuevo para volver a quedar pendiente de revisión.`;
      }
    }

    await loadProviderCategoryOptions();

    if (provider) {
      document.getElementById('prov-business-name').value = provider.business_name || '';
      document.getElementById('prov-category').value = provider.category_id || '';
      document.getElementById('prov-tax-id').value = provider.tax_id || '';
      document.getElementById('prov-matricula').value = provider.matricula || '';
      document.getElementById('prov-website').value = provider.website_url || '';
      document.getElementById('prov-contact-phone').value = provider.contact_phone || '';
      document.getElementById('prov-contact-email').value = provider.contact_email || '';
      document.getElementById('prov-description').value = provider.description || '';
      updateLogoPreview(provider.logo_url);
      loadOwnRating(provider.id);

      const { data: branch } = await ST.supabaseClient
        .from('provider_branches')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at')
        .limit(1)
        .maybeSingle();

      ST.providerState.branch = branch || null;

      if (branch) {
        document.getElementById('branch-name').value = branch.name || '';
        document.getElementById('branch-locality').value = branch.locality || '';
        document.getElementById('branch-province').value = branch.province || '';
        document.getElementById('branch-address').value = branch.address || '';
        document.getElementById('branch-whatsapp').value = branch.whatsapp_phone || '';
        document.getElementById('branch-delivery-radius').value = branch.delivery_radius_km || '';
        document.getElementById('branch-lat').value = branch.latitude ?? '';
        document.getElementById('branch-lng').value = branch.longitude ?? '';
        document.getElementById('branch-delivery-available').checked = !!branch.delivery_available;
      }
      initBranchLocationMap(branch?.latitude, branch?.longitude);
    }

    await loadProviderCatalog();
    await loadProviderDashboard();
    await loadProviderInteractionStats();
    await loadProviderBroadcastStatus();
    await loadProviderKeywords();
  }

  let branchLocationMap = null;
  let branchLocationMarker = null;

  /**
   * Mapa chico embebido en "Mi Proveedor" para marcar la ubicación exacta
   * de la sucursal -- reemplaza tener que copiar coordenadas a mano desde
   * Google Maps. Usa el mismo Leaflet + OpenStreetMap que el mapa
   * principal del sitio (ya está cargado globalmente, no hace falta
   * agregar nada nuevo).
   */
  function initBranchLocationMap(initialLat, initialLng) {
    const lat = initialLat || -27.4864; // Oberá, Misiones -- punto de partida si todavía no hay nada cargado
    const lng = initialLng || -55.1199;
    const zoom = initialLat ? 15 : 12;

    if (!branchLocationMap) {
      branchLocationMap = L.map('branch-location-map').setView([lat, lng], zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(branchLocationMap);

      branchLocationMarker = L.marker([lat, lng], { draggable: true }).addTo(branchLocationMap);

      branchLocationMarker.on('dragend', () => {
        const pos = branchLocationMarker.getLatLng();
        setBranchLatLng(pos.lat, pos.lng);
      });

      branchLocationMap.on('click', (e) => {
        branchLocationMarker.setLatLng(e.latlng);
        setBranchLatLng(e.latlng.lat, e.latlng.lng);
      });

      // Por si el navegador todavía no terminó de aplicar el display:block
      // del panel en el mismo instante en que Leaflet mide el contenedor.
      setTimeout(() => branchLocationMap.invalidateSize(), 50);
    } else {
      // El panel pudo haber estado oculto (display:none) cuando se creó el
      // mapa por primera vez -- Leaflet necesita que se le avise el tamaño
      // real una vez que ya es visible, si no queda con dimensiones rotas.
      setTimeout(() => branchLocationMap.invalidateSize(), 50);
      branchLocationMap.setView([lat, lng], zoom);
      branchLocationMarker.setLatLng([lat, lng]);
    }

    if (initialLat && initialLng) {
      setBranchLatLng(initialLat, initialLng);
    }
  }

  function setBranchLatLng(lat, lng) {
    document.getElementById('branch-lat').value = lat.toFixed(6);
    document.getElementById('branch-lng').value = lng.toFixed(6);
    document.getElementById('branch-location-status').textContent = 'Ubicación marcada. Arrastrá el pin si no quedó exacta.';
  }

  /**
   * Busca la dirección escrita usando Nominatim (el buscador gratuito de
   * OpenStreetMap) y mueve el pin ahí. Si no encuentra nada, el usuario
   * igual puede marcar el lugar a mano haciendo clic en el mapa.
   */
  export async function geocodeBranchAddress() {
    const address = document.getElementById('branch-address').value.trim();
    const locality = document.getElementById('branch-locality').value.trim();
    const province = document.getElementById('branch-province').value.trim();
    const statusEl = document.getElementById('branch-location-status');

    if (!address && !locality) {
      ST.showToast('Escribí al menos la localidad para poder buscarla.');
      return;
    }

    const query = [address, locality, province, 'Argentina'].filter(Boolean).join(', ');
    statusEl.textContent = 'Buscando...';

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const results = await res.json();
      if (!results || results.length === 0) {
        statusEl.textContent = 'No se encontró esa dirección. Probá con menos detalle, o marcá el lugar directo en el mapa de abajo.';
        return;
      }
      const { lat, lon } = results[0];
      branchLocationMap.setView([lat, lon], 16);
      branchLocationMarker.setLatLng([lat, lon]);
      setBranchLatLng(parseFloat(lat), parseFloat(lon));
    } catch (err) {
      statusEl.textContent = 'No se pudo buscar en este momento. Marcá el lugar directo en el mapa de abajo.';
    }
  }

  let categoryOptionsCache = null;

  async function loadProviderCategoryOptions() {
    const select = document.getElementById('prov-category');
    if (!select) return;
    if (!categoryOptionsCache) {
      const { data } = await ST.supabaseClient
        .from('provider_categories')
        .select('id, name, kind')
        .eq('active', true)
        .order('name');
      categoryOptionsCache = data || [];
    }

    const materiales = categoryOptionsCache.filter(c => c.kind === 'materials');
    const servicios = categoryOptionsCache.filter(c => c.kind === 'services');

    select.innerHTML = `
      <option value="">Elegí tu rubro...</option>
      <optgroup label="Vendo materiales">
        ${materiales.map(c => `<option value="${c.id}">${ST.escapeHtml(c.name)}</option>`).join('')}
      </optgroup>
      <optgroup label="Ofrezco un servicio profesional">
        ${servicios.map(c => `<option value="${c.id}">${ST.escapeHtml(c.name)}</option>`).join('')}
      </optgroup>
    `;
  }

  function updateLogoPreview(url) {
    const img = document.getElementById('provider-logo-img');
    const placeholder = document.getElementById('provider-logo-placeholder');
    if (!img || !placeholder) return;
    if (url) {
      img.src = url;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      placeholder.style.display = 'block';
    }
  }

  async function loadOwnRating(providerId) {
    const el = document.getElementById('provider-own-rating');
    if (!el) return;
    const { data } = await ST.supabaseClient
      .from('provider_ratings_summary')
      .select('avg_rating, review_count')
      .eq('provider_id', providerId)
      .maybeSingle();

    if (!data || !data.review_count) {
      el.innerHTML = '<span class="star-rating-empty">Todavía no tenés reseñas de clientes.</span>';
      return;
    }
    const rounded = Math.round(data.avg_rating);
    const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    el.innerHTML = `<span class="star-rating"><span class="star-rating-stars">${stars}</span> ${data.avg_rating} <span class="star-rating-count">(${data.review_count} reseña${data.review_count === 1 ? '' : 's'})</span></span>`;

    loadOwnReviewsList(providerId);
  }

  /** Lista de comentarios que recibió el proveedor, con el apodo público
   * de quien la dejó (nunca el nombre completo ni otros datos privados). */
  export async function replyToReview(reviewId) {
    const respuesta = prompt('Escribí tu respuesta pública a esta reseña (máx. 300 caracteres):');
    if (!respuesta || !respuesta.trim()) return;
    if (respuesta.length > 300) {
      ST.showToast('La respuesta no puede superar los 300 caracteres.');
      return;
    }

    const { error } = await ST.supabaseClient
      .from('provider_reviews')
      .update({ reply: respuesta.trim(), replied_at: new Date().toISOString() })
      .eq('id', reviewId);

    if (error) {
      ST.showToast('No se pudo publicar la respuesta: ' + error.message);
      return;
    }
    ST.showToast('Respuesta publicada.');
    loadOwnReviewsList(ST.providerState.provider.id);
  }

  async function loadOwnReviewsList(providerId) {
    const container = document.getElementById('provider-own-reviews-list');
    if (!container) return;

    const { data: reviews, error } = await ST.supabaseClient
      .from('provider_reviews')
      .select('id, user_id, rating, comment, created_at, reply')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });

    if (error || !reviews || reviews.length === 0) {
      container.innerHTML = '';
      return;
    }

    const userIds = [...new Set(reviews.map(r => r.user_id))];
    const displayNames = {};
    const { data: names } = await ST.supabaseClient
      .from('public_display_names')
      .select('id, display_name')
      .in('id', userIds);
    (names || []).forEach(n => { displayNames[n.id] = n.display_name; });

    container.innerHTML = reviews.map(r => `
      <div class="review-row">
        <div class="review-row-header">
          <span class="star-rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          <span style="font-size:0.72rem; color:var(--text-subtle);">${ST.escapeHtml(displayNames[r.user_id]) || 'Usuario de NEXOBRA'} · ${new Date(r.created_at).toLocaleDateString('es-AR')}</span>
        </div>
        ${r.comment ? `<p class="review-row-comment">${ST.escapeHtml(r.comment)}</p>` : ''}
        ${r.reply ? `
          <div class="review-reply-box">
            <strong style="font-size:0.75rem;">Tu respuesta:</strong>
            <p style="font-size:0.8rem; margin-top:2px;">${ST.escapeHtml(r.reply)}</p>
          </div>
        ` : `
          <button class="btn-action-drawer btn-copy" style="font-size:0.75rem; margin-top:6px; padding:5px 10px;" onclick="window.nexoBraApp.replyToReview(${ST.escAttr(r.id)})">Responder</button>
        `}
      </div>
    `).join('');
  }

  export async function suggestTechnicalData(materialId) {
    if (!ST.providerState.provider) {
      ST.showToast('No se encontró tu perfil de proveedor.');
      return;
    }
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    const brand = prompt(`Marca de "${material?.denominacion || materialId}" (dejá vacío para saltear):`);
    if (brand === null) return; // canceló todo
    const description = prompt('Descripción técnica breve (opcional):');
    const yieldValue = prompt('Rendimiento -- solo el número (ej: 5). Dejá vacío si no aplica:');
    const yieldUnit = yieldValue ? prompt('Unidad del rendimiento (ej: m²/bolsa):') : null;

    if (!brand && !description && !yieldValue) {
      ST.showToast('No cargaste ningún dato.');
      return;
    }

    const { error } = await ST.supabaseClient.from('material_technical_suggestions').insert({
      material_id: materialId,
      provider_id: ST.providerState.provider.id,
      brand: brand || null,
      technical_description: description || null,
      yield_value: yieldValue ? parseFloat(yieldValue) : null,
      yield_unit: yieldUnit || null
    });

    if (error) {
      ST.showToast('No se pudo enviar la sugerencia: ' + error.message);
      return;
    }
    ST.showToast('¡Gracias! Queda pendiente de aprobación.');
  }

  export async function uploadProviderLogo(file) {
    if (!ST.authState.user) {
      ST.showToast('Iniciá sesión primero.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      ST.showToast('Tiene que ser una imagen (PNG, JPG o WEBP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      ST.showToast('La imagen pesa más de 2 MB. Achicala e intentá de nuevo.');
      return;
    }
    if (!ST.providerState.provider) {
      ST.showToast('Guardá primero tus datos comerciales (razón social), y después subí el logo.');
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${ST.authState.user.id}/logo.${ext}`;

    const { error: uploadError } = await ST.supabaseClient.storage
      .from('provider-logos')
      .upload(path, file, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
      ST.showToast('No se pudo subir el logo: ' + uploadError.message);
      return;
    }

    const { data: publicUrlData } = ST.supabaseClient.storage.from('provider-logos').getPublicUrl(path);
    // Le agregamos un "cache-buster" a la URL guardada para que, si reemplazás
    // el logo despues, no se siga viendo el viejo por el caché del navegador.
    const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await ST.supabaseClient
      .from('providers')
      .update({ logo_url: logoUrl })
      .eq('id', ST.providerState.provider.id);

    if (updateError) {
      ST.showToast('El logo se subió pero no se pudo guardar: ' + updateError.message);
      return;
    }

    ST.providerState.provider.logo_url = logoUrl;
    updateLogoPreview(logoUrl);
    ST.showToast('Logo actualizado.');
  }

  export async function handleProviderProfileSubmit(e) {
    e.preventDefault();
    if (!ST.authState.user) return;
    const btn = document.getElementById('btn-save-provider-profile');
    btn.disabled = true;
    ST.providerProfileStatus.textContent = 'Guardando...';

    try {
      const providerPayload = {
        owner_id: ST.authState.user.id,
        business_name: document.getElementById('prov-business-name').value.trim(),
        category_id: document.getElementById('prov-category').value || null,
        tax_id: document.getElementById('prov-tax-id').value.trim() || null,
        matricula: document.getElementById('prov-matricula').value.trim() || null,
        website_url: document.getElementById('prov-website').value.trim() || null,
        contact_phone: document.getElementById('prov-contact-phone').value.trim() || null,
        contact_email: document.getElementById('prov-contact-email').value.trim() || null,
        description: document.getElementById('prov-description').value.trim() || null,
        active: true
      };

      let provider = ST.providerState.provider;
      if (provider) {
        // Si estaba rechazado, al volver a guardar vuelve a "pending" para que el admin lo revise de nuevo.
        const updatePayload = provider.verification_status === 'rejected'
          ? { ...providerPayload, verification_status: 'pending', rejection_reason: null }
          : providerPayload;
        const { error } = await ST.supabaseClient.from('providers').update(updatePayload).eq('id', provider.id);
        if (error) throw error;
        ST.providerState.provider = { ...provider, ...updatePayload };
      } else {
        // Los proveedores nuevos entran en estado "pending": no aparecen en el
        // mapa ni en las búsquedas públicas hasta que un admin los apruebe.
        const { data, error } = await ST.supabaseClient.from('providers').insert({ ...providerPayload, verification_status: 'pending' }).select('*').single();
        if (error) throw error;
        provider = data;
        ST.providerState.provider = provider;
        ST.showToast('Tu perfil quedó pendiente de aprobación. Te vas a poder ver en el mapa una vez que lo revisemos.');
      }

      const branchPayload = {
        provider_id: provider.id,
        name: document.getElementById('branch-name').value.trim(),
        locality: document.getElementById('branch-locality').value.trim(),
        province: document.getElementById('branch-province').value.trim() || null,
        address: document.getElementById('branch-address').value.trim() || null,
        whatsapp_phone: document.getElementById('branch-whatsapp').value.trim() || null,
        delivery_radius_km: parseFloat(document.getElementById('branch-delivery-radius').value) || null,
        latitude: parseFloat(document.getElementById('branch-lat').value) || null,
        longitude: parseFloat(document.getElementById('branch-lng').value) || null,
        delivery_available: document.getElementById('branch-delivery-available').checked,
        active: true
      };

      let branch = ST.providerState.branch;
      if (branch) {
        const { error } = await ST.supabaseClient.from('provider_branches').update(branchPayload).eq('id', branch.id);
        if (error) throw error;
      } else {
        const { data, error } = await ST.supabaseClient.from('provider_branches').insert(branchPayload).select('*').single();
        if (error) throw error;
        branch = data;
        ST.providerState.branch = branch;
      }

      ST.providerProfileStatus.textContent = '✓ Guardado';
      ST.showToast('Datos comerciales guardados.');
      loadProviderDashboard();
      loadProviderData(); // refresca el banner de estado (pending/rechazado/aprobado)
    } catch (err) {
      ST.providerProfileStatus.textContent = '';
      ST.showToast('No se pudo guardar: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // --- Agregar material individual ---
  /** Búsqueda liviana e independiente del catálogo principal, solo para este panel. */
  export function searchMaterialsSimple(query, limit = 8) {
    const tokens = ST.normalizeText(query).split(' ').filter(Boolean);
    if (tokens.length === 0) return [];
    return NEXOBRA_DATA.filter(item => {
      const haystack = ST.normalizeText([item.denominacion, item.id, item.categoria, item.rubro, ...(item.tags || [])].join(' '));
      return tokens.every(tok => haystack.includes(tok) || haystack.includes(ST.singularize(tok)));
    }).slice(0, limit);
  }

  export function renderProviderAddResults() {
    const query = ST.providerAddSearch.value.trim();
    if (query.length < 2) {
      ST.providerAddResults.innerHTML = '';
      return;
    }
    const results = searchMaterialsSimple(query);
    const proponerBtn = `
      <button class="btn-choose-provider" style="margin-top: 10px;" onclick="window.nexoBraApp.openNewMaterialForm(${ST.escAttr(query)})">
        ➕ ¿No lo encontrás? Proponer "${query}" como material nuevo
      </button>
    `;
    if (results.length === 0) {
      ST.providerAddResults.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">Sin resultados.</p>${proponerBtn}`;
      return;
    }
    ST.providerAddResults.innerHTML = results.map(item => `
      <div class="provider-search-row">
        <div class="provider-search-row-info">
          <strong>${ST.escapeHtml(item.denominacion)}</strong><br>
          <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro}</span>
        </div>
        <div class="provider-search-row-controls">
          <input type="text" id="prov-sku-${item.id}" placeholder="Tu SKU (opcional)">
          <input type="text" id="prov-brand-${item.id}" placeholder="Marca (opcional)" maxlength="40">
          <select id="prov-unit-${item.id}">
            <option value="venta">Por ${item.unidadVenta} (compra)</option>
            <option value="computo">Por ${item.unidadComputo} (cómputo)</option>
          </select>
          <input type="number" id="prov-price-${item.id}" placeholder="Precio" min="0" step="0.01">
          <select id="prov-stock-${item.id}">
            <option value="en_stock">En stock</option>
            <option value="a_pedido">A pedido</option>
            <option value="agotado">Agotado</option>
          </select>
          <button class="btn-computo" style="padding: 6px 12px; font-size: 0.78rem;" onclick="window.nexoBraApp.addOfferFromSearch('${item.id}')">Agregar</button>
        </div>
      </div>
    `).join('') + proponerBtn;
  }

  /**
   * FASE G3: crear un material que no está en el catálogo de NEXOBRA (sin
   * referencia de precio propia todavía). Lo usan tanto proveedores (vía
   * "proponer material nuevo") como el admin (vía el editor de materiales).
   * La creación en sí no necesita aprobación — lo que sí pasa por la cola de
   * revisión de siempre es el PRECIO que se cargue después para ese material.
   */
  export async function createNewMaterial({ denominacion, rubro, categoria, subcategoria, unidadVenta, unidadComputo, envase }) {
    const id = 'NUEVO-' + Date.now().toString(36).toUpperCase();
    const payload = {
      id,
      denomination: denominacion,
      rubro: rubro || 'Otros',
      category: categoria || null,
      subcategory: subcategoria || null,
      sale_unit: unidadVenta || 'un',
      measurement_unit: unidadComputo || unidadVenta || 'un',
      package_quantity: envase || 1,
      active: true
    };
    const { error } = await ST.supabaseClient.from('materials').insert(payload);
    if (error) return { error };

    // Se agrega también al catálogo en memoria del navegador, SIN precio base
    // a propósito: así el catálogo lo muestra como "sin referencia NEXOBRA"
    // hasta que alguien le cargue un precio real (una oferta de proveedor
    // aprobada, o el admin desde el editor de materiales).
    NEXOBRA_DATA.push({
      id,
      rubro: payload.rubro,
      categoria: payload.category || '',
      subcategoria: payload.subcategory || '',
      denominacion,
      tags: [],
      unidadVenta: payload.sale_unit,
      precioVenta: undefined,
      unidadComputo: payload.measurement_unit,
      precioComputo: undefined,
      envase: payload.package_quantity,
      precioBase: undefined,
      mesBase: undefined
    });

    return { id };
  }

  export function openNewMaterialForm(prefillName) {
    document.getElementById('new-material-nombre').value = prefillName || '';
    document.getElementById('new-material-rubro').value = '';
    document.getElementById('new-material-unidad-venta').value = '';
    document.getElementById('new-material-unidad-computo').value = '';
    document.getElementById('new-material-envase').value = 1;
    document.getElementById('new-material-modal').classList.add('open');
    document.getElementById('new-material-modal-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  export function closeNewMaterialForm() {
    document.getElementById('new-material-modal').classList.remove('open');
    document.getElementById('new-material-modal-backdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  export async function submitNewMaterial() {
    const denominacion = document.getElementById('new-material-nombre').value.trim();
    const rubro = document.getElementById('new-material-rubro').value.trim();
    const unidadVenta = document.getElementById('new-material-unidad-venta').value.trim();
    const unidadComputo = document.getElementById('new-material-unidad-computo').value.trim();
    const envase = parseFloat(document.getElementById('new-material-envase').value) || 1;

    if (!denominacion || !rubro || !unidadVenta) {
      ST.showToast('Completá al menos nombre, rubro y unidad de compra.');
      return;
    }

    const { id, error } = await createNewMaterial({ denominacion, rubro, unidadVenta, unidadComputo: unidadComputo || unidadVenta, envase });
    if (error) {
      ST.showToast('No se pudo crear el material: ' + error.message);
      return;
    }

    closeNewMaterialForm();

    if (ST.authState.profile?.role === 'admin') {
      // El admin va directo al editor completo para poder ponerle precio base ya mismo.
      ST.showToast(`"${denominacion}" creado. Completá el precio base en el editor.`);
      window.nexoBraApp.openMaterialEditor(id);
    } else {
      // El proveedor vuelve a la búsqueda, ahora sí encuentra el material recién creado
      // y puede cargarle su propia oferta (que va a quedar pendiente de aprobación).
      ST.showToast(`"${denominacion}" creado. Ahora podés cargarle tu precio.`);
      ST.providerAddSearch.value = denominacion;
      renderProviderAddResults();
    }
  }

  export async function addOfferFromSearch(materialId) {
    if (!ST.providerState.branch) {
      ST.showToast('Primero guardá tus datos comerciales (sucursal) arriba.');
      return;
    }
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    const price = parseFloat(document.getElementById(`prov-price-${materialId}`).value);
    if (!price || price <= 0) {
      ST.showToast('Ingresá un precio válido.');
      return;
    }
    const sku = document.getElementById(`prov-sku-${materialId}`).value.trim() || null;
    const brand = document.getElementById(`prov-brand-${materialId}`).value.trim() || null;
    const stock = document.getElementById(`prov-stock-${materialId}`).value;
    const unitMode = document.getElementById(`prov-unit-${materialId}`).value; // 'venta' | 'computo'

    const { error } = await ST.supabaseClient.from('provider_offers').insert({
      branch_id: ST.providerState.branch.id,
      material_id: materialId,
      price_kind: unitMode === 'venta' ? 'sale' : 'measurement',
      amount: price,
      unit: unitMode === 'venta' ? material.unidadVenta : material.unidadComputo,
      provider_sku: sku,
      brand: brand,
      stock_status: stock,
      status: 'pending', // nuevo precio: queda pendiente de aprobación del admin
      reported_at: new Date().toISOString()
    });

    if (error) {
      ST.showToast('No se pudo agregar: ' + error.message);
      return;
    }
    ST.showToast(`Agregado: ${material.denominacion.substring(0, 30)} (pendiente de aprobación)`);
    ST.providerAddSearch.value = '';
    ST.providerAddResults.innerHTML = '';
    loadProviderCatalog();
  }

  // --- Mi catálogo: listado, edición, borrado, ajuste por porcentaje ---
  export async function loadProviderCatalog() {
    if (!ST.providerState.branch) {
      ST.providerCatalogList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero tus datos comerciales para empezar a cargar tu catálogo.</p>';
      return;
    }
    const { data, error } = await ST.supabaseClient
      .from('provider_offers')
      .select('id, amount, unit, provider_sku, brand, stock_status, status, rejection_reason, materials(id, denomination)')
      .eq('branch_id', ST.providerState.branch.id)
      .order('reported_at', { ascending: false });

    if (error) {
      ST.providerCatalogList.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">Error: ${error.message}</p>`;
      return;
    }
    ST.providerState.offers = data || [];
    renderProviderCatalog();
  }

  export function renderProviderCatalog() {
    if (ST.providerState.offers.length === 0) {
      ST.providerCatalogList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no cargaste materiales. Usá la búsqueda o la carga masiva de arriba.</p>';
      return;
    }
    ST.providerCatalogList.innerHTML = ST.providerState.offers.map(offer => `
      <div class="provider-catalog-row">
        <div class="provider-catalog-row-info">
          <h5>${ST.escapeHtml(offer.materials?.denomination) || '(material eliminado)'}</h5>
          <span>${offer.brand ? `<strong>${ST.escapeHtml(offer.brand)}</strong> · ` : ''}${offer.provider_sku ? `SKU propio: ${ST.escapeHtml(offer.provider_sku)} · ` : ''}${offer.unit}</span>
          ${offer.status === 'pending' ? '<br><span style="font-size:0.7rem; font-weight:700; color:#b45309;">⏳ Pendiente de aprobación</span>' : ''}
          ${offer.status === 'rejected' ? `<br><span style="font-size:0.7rem; font-weight:700; color:#b91c1c;">✕ Rechazado${offer.rejection_reason ? ': ' + ST.escapeHtml(offer.rejection_reason) : ' — revisá el precio y volvé a intentar'}</span>` : ''}
        </div>
        <div class="provider-catalog-row-controls">
          <button class="btn-remove-item" title="Sugerir marca, descripción o rendimiento para este material" onclick="window.nexoBraApp.suggestTechnicalData('${offer.materials?.id}')" style="font-size:0.85rem;">🔧</button>
          <span class="stock-badge ${offer.stock_status}">${offer.stock_status === 'en_stock' ? 'En stock' : offer.stock_status === 'a_pedido' ? 'A pedido' : 'Agotado'}</span>
          <select onchange="window.nexoBraApp.updateOfferStock('${offer.id}', this.value)">
            <option value="en_stock" ${offer.stock_status === 'en_stock' ? 'selected' : ''}>En stock</option>
            <option value="a_pedido" ${offer.stock_status === 'a_pedido' ? 'selected' : ''}>A pedido</option>
            <option value="agotado" ${offer.stock_status === 'agotado' ? 'selected' : ''}>Agotado</option>
          </select>
          <input type="number" value="${offer.amount}" min="0" step="0.01" onchange="window.nexoBraApp.updateOfferPrice('${offer.id}', parseFloat(this.value))">
          <button class="btn-remove-item" onclick="window.nexoBraApp.deleteOffer('${offer.id}')" title="Eliminar">&times;</button>
        </div>
      </div>
    `).join('');
  }

  export async function updateOfferPrice(offerId, newAmount) {
    if (!newAmount || newAmount <= 0) return;
    // Cambiar el precio vuelve a mandar la oferta a revisión del admin (el
    // stock NO hace esto -- eso sigue siendo instantáneo, ver updateOfferStock).
    const { error } = await ST.supabaseClient.from('provider_offers').update({ amount: newAmount, status: 'pending' }).eq('id', offerId);
    if (error) { ST.showToast('No se pudo actualizar: ' + error.message); return; }
    ST.showToast('Precio actualizado — vuelve a quedar pendiente de aprobación.');
    loadProviderCatalog();
  }

  export async function updateOfferStock(offerId, newStatus) {
    const { error } = await ST.supabaseClient.from('provider_offers').update({ stock_status: newStatus }).eq('id', offerId);
    if (error) { ST.showToast('No se pudo actualizar: ' + error.message); return; }
    ST.showToast('Stock actualizado.');
  }

  export async function deleteOffer(offerId) {
    if (!confirm('¿Eliminar este material de tu catálogo?')) return;
    const { error } = await ST.supabaseClient.from('provider_offers').delete().eq('id', offerId);
    if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
    ST.showToast('Eliminado.');
    loadProviderCatalog();
  }

  export async function applyBulkPercent() {
    const pct = parseFloat(ST.providerBulkPercent.value);
    if (!pct || ST.providerState.offers.length === 0) {
      ST.showToast('Ingresá un porcentaje y tené al menos un ítem cargado.');
      return;
    }
    if (!confirm(`¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a los ${ST.providerState.offers.length} ítems de tu catálogo?`)) return;

    ST.btnApplyBulkPercent.disabled = true;
    const updates = ST.providerState.offers.map(offer => {
      const newAmount = Math.round(offer.amount * (1 + pct / 100) * 100) / 100;
      return ST.supabaseClient.from('provider_offers').update({ amount: newAmount }).eq('id', offer.id);
    });
    await Promise.all(updates);
    ST.btnApplyBulkPercent.disabled = false;
    ST.providerBulkPercent.value = '';
    ST.showToast(`Ajuste del ${pct}% aplicado a todo tu catálogo.`);
    loadProviderCatalog();
  }

  // --- Carga masiva por Excel ---
  export async function handleProviderExcelFile(file) {
    try {
      await ST.ensureXlsxLoaded();
    } catch (err) {
      ST.showToast(err.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      processProviderExcelRows(rows);
    };
    reader.readAsArrayBuffer(file);
  }

  export function processProviderExcelRows(rows) {
    if (!rows || rows.length < 2) {
      ST.showToast('El archivo no tiene filas de datos.');
      return;
    }
    const header = rows[0].map(h => ST.normalizeText(h));
    let skuIdx = header.findIndex(h => h.includes('sku') || h.includes('codigo') || h.includes('cod'));
    let nameIdx = header.findIndex(h => h.includes('nombre') || h.includes('descripcion') || h.includes('material') || h.includes('producto'));
    let priceIdx = header.findIndex(h => h.includes('precio'));
    let stockIdx = header.findIndex(h => h.includes('stock') || h.includes('disponib'));
    let unidadIdx = header.findIndex(h => h === 'unidad' || h.includes('unidad'));

    if (nameIdx === -1) nameIdx = 0;
    if (priceIdx === -1) priceIdx = 1;

    const pending = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const sku = skuIdx > -1 && row[skuIdx] ? row[skuIdx].toString().trim() : '';
      const name = nameIdx > -1 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
      const price = priceIdx > -1 && row[priceIdx] ? parseFloat(row[priceIdx]) : 0;
      const requestedUnit = unidadIdx > -1 && row[unidadIdx] ? row[unidadIdx].toString().trim() : '';
      const stockRaw = stockIdx > -1 && row[stockIdx] ? ST.normalizeText(row[stockIdx].toString()) : '';
      let stock = 'en_stock';
      if (stockRaw.includes('pedido')) stock = 'a_pedido';
      if (stockRaw.includes('agot') || stockRaw.includes('sin stock')) stock = 'agotado';

      if (!name && !sku) continue;
      const match = Excel.findBestMaterialMatch(sku, name);
      let mode = 'venta'; // por defecto: precio por unidad de compra (lo mas comun para un proveedor)
      let unitAmbiguous = false;
      if (match.item) {
        const unitMatch = Excel.matchUnit(requestedUnit, match.item.unidadVenta, match.item.unidadComputo);
        if (unitMatch.matched) {
          mode = unitMatch.mode;
        } else if (requestedUnit) {
          unitAmbiguous = true; // escribieron algo pero no coincide con ninguna unidad valida del material
        }
      }
      pending.push({ sku, name, price, stock, requestedUnit, unitAmbiguous, mode, matchedItem: match.item, status: match.status });
    }

    ST.providerState.excelPending = pending;
    renderProviderExcelPreview();
  }

  export function renderProviderExcelPreview() {
    const validCount = ST.providerState.excelPending.filter(r => r.matchedItem).length;
    if (ST.providerState.excelPending.length === 0) {
      ST.providerExcelPreview.innerHTML = '';
      ST.btnConfirmProviderExcel.style.display = 'none';
      return;
    }
    ST.providerExcelPreview.innerHTML = ST.providerState.excelPending.map(row => {
      const unidadResuelta = row.matchedItem
        ? (row.mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo)
        : '-';
      const warn = row.unitAmbiguous
        ? ` <span title="Escribiste &quot;${ST.escapeHtml(row.requestedUnit)}&quot; pero no coincide con ninguna unidad válida de este material. Se cargó por unidad de compra (venta) por defecto." style="color:#b45309; font-weight:700; cursor:help;">⚠</span>`
        : '';
      return `
      <div class="excel-preview-row status-${row.status}">
        <div>
          <strong>${ST.escapeHtml(row.name || row.sku)}</strong>
          ${row.matchedItem ? `→ ${ST.escapeHtml(row.matchedItem.denominacion)} (${row.matchedItem.id})` : ' → sin coincidencia, no se va a cargar'}
        </div>
        <div>$${row.price || 0} / ${unidadResuelta}${warn} · ${row.stock}</div>
      </div>
    `;
    }).join('');
    ST.btnConfirmProviderExcel.style.display = validCount > 0 ? 'inline-flex' : 'none';
    ST.showToast(`${validCount} de ${ST.providerState.excelPending.length} filas emparejadas con el catálogo.`);
  }

  export async function confirmProviderExcelUpload() {
    if (!ST.providerState.branch) {
      ST.showToast('Primero guardá tus datos comerciales (sucursal) arriba.');
      return;
    }
    const rows = ST.providerState.excelPending.filter(r => r.matchedItem && r.price > 0);
    if (rows.length === 0) {
      ST.showToast('No hay filas válidas para cargar.');
      return;
    }
    ST.btnConfirmProviderExcel.disabled = true;

    const inserts = rows.map(row => ({
      branch_id: ST.providerState.branch.id,
      material_id: row.matchedItem.id,
      price_kind: row.mode === 'venta' ? 'sale' : 'measurement',
      amount: row.price,
      unit: row.mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo,
      provider_sku: row.sku || null,
      stock_status: row.stock,
      status: 'pending', // carga masiva: igual que la individual, entra pendiente de aprobación
      reported_at: new Date().toISOString()
    }));

    const { error } = await ST.supabaseClient.from('provider_offers').insert(inserts);
    ST.btnConfirmProviderExcel.disabled = false;

    if (error) {
      ST.showToast('No se pudo cargar el archivo: ' + error.message);
      return;
    }
    ST.showToast(`¡Listo! Se cargaron ${rows.length} materiales, pendientes de aprobación.`);
    ST.providerState.excelPending = [];
    ST.providerExcelPreview.innerHTML = '';
    ST.btnConfirmProviderExcel.style.display = 'none';
    ST.providerExcelInput.value = '';
    loadProviderCatalog();
  }

  export async function generateProviderTemplate() {
    try {
      await ST.ensureXlsxLoaded();
    } catch (err) {
      ST.showToast(err.message);
      return;
    }
    const ws_data = [
      ["SKU (Opcional)", "Nombre", "Precio", "Unidad", "Stock"],
      ["MICOD-001", "Cemento Portland Loma Negra 50kg", 8500, "Bolsa", "En stock"],
      ["MICOD-002", "Hierro torsionado del 8 ADN420", 950, "kg", "En stock"],
      ["MICOD-003", "Ladrillos huecos 12x18x25", 480, "un", "A pedido"],
      ["", "Placa Durlock 12.5mm", 15000, "", "Agotado"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = [{ wch: 16 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mi_Catalogo_NEXOBRA");
    XLSX.writeFile(wb, "Plantilla_Catalogo_Corralon_NEXOBRA.xlsx");
    ST.showToast('Plantilla descargada con éxito');
  }

  export function setupProviderListeners() {
    if (!ST.supabaseClient) return;
    ST.btnOpenMyProvider.addEventListener('click', () => {
      ST.authDropdown.style.display = 'none';
      Main.switchView('provider');
    });
    ST.providerProfileForm.addEventListener('submit', handleProviderProfileSubmit);
    const providerLogoInput = document.getElementById('provider-logo-input');
    if (providerLogoInput) providerLogoInput.addEventListener('change', (e) => {
      if (e.target.files[0]) uploadProviderLogo(e.target.files[0]);
    });
    ST.providerAddSearch.addEventListener('input', renderProviderAddResults);
    ST.providerExcelInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleProviderExcelFile(e.target.files[0]);
    });
    ST.btnConfirmProviderExcel.addEventListener('click', confirmProviderExcelUpload);
    ST.btnApplyBulkPercent.addEventListener('click', applyBulkPercent);
    const btnDownloadProviderTemplate = document.getElementById('btn-download-provider-template');
    if (btnDownloadProviderTemplate) btnDownloadProviderTemplate.addEventListener('click', generateProviderTemplate);
    const btnGeocodeAddress = document.getElementById('btn-geocode-address');
    if (btnGeocodeAddress) btnGeocodeAddress.addEventListener('click', (e) => { e.preventDefault(); geocodeBranchAddress(); });
  }

  export function setupNewMaterialListeners() {
    if (!ST.supabaseClient) return;
    if (ST.newMaterialModalCloseBtn) ST.newMaterialModalCloseBtn.addEventListener('click', closeNewMaterialForm);
    if (ST.newMaterialModalBackdrop) ST.newMaterialModalBackdrop.addEventListener('click', closeNewMaterialForm);
    if (ST.btnSubmitNewMaterial) ST.btnSubmitNewMaterial.addEventListener('click', submitNewMaterial);
    if (ST.btnOpenNewMaterialAdmin) ST.btnOpenNewMaterialAdmin.addEventListener('click', () => openNewMaterialForm(''));
  }

  // --- MAPA DE PROVEEDORES (Fase D) ---
  // Centro por defecto: Oberá, Misiones (zona piloto). Si el usuario comparte
  // su ubicación real, se recentra ahí. El radio y el centro son el único
  // estado; todo lo demás (pines, ficha) se recalcula llamando a las
  // funciones SQL que ya hacen el trabajo pesado (distancia real, mediana).
  export async function loadProviderDashboard() {
    const results = document.getElementById('provider-dashboard-results');
    if (!ST.providerState.branch) {
      results.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero tus datos comerciales (con latitud/longitud) para ver esta comparación.</p>';
      return;
    }
    if (!ST.providerState.branch.latitude || !ST.providerState.branch.longitude) {
      results.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargá la latitud y longitud de tu sucursal (arriba, en Datos comerciales) para poder compararte contra la zona.</p>';
      return;
    }

    results.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Calculando...</p>';
    const radius = parseFloat(document.getElementById('provider-dashboard-radius').value);

    const { data, error } = await ST.supabaseClient.rpc('branch_price_variation', {
      p_branch_id: ST.providerState.branch.id,
      center_lat: ST.providerState.branch.latitude,
      center_lng: ST.providerState.branch.longitude,
      radius_km: radius
    });

    if (error) {
      results.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      results.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no hay otros proveedores cargados en tu zona para comparar, o vos mismo no tenés materiales cargados.</p>';
      return;
    }

    results.innerHTML = data.map(row => {
      const cls = row.variation_pct === null ? 'equal' : row.variation_pct < -1 ? 'below' : row.variation_pct > 1 ? 'above' : 'equal';
      const texto = row.variation_pct === null ? 's/d' : `${row.variation_pct > 0 ? '+' : ''}${row.variation_pct}%`;
      return `
        <div class="variation-row">
          <span class="variation-name">${ST.escapeHtml(row.denomination)}${row.stock_status === 'agotado' ? ' <em>(agotado)</em>' : ''}</span>
          <span style="text-align:right;">
            <strong style="display:block; font-size:0.85rem;">${ST.formatMoney(row.branch_amount)}</strong>
            <span class="variation-badge ${cls}">${texto}</span>
          </span>
        </div>
      `;
    }).join('');
  }

  export function setupProviderDashboardListeners() {
    if (!ST.supabaseClient) return;
    const radiusSelect = document.getElementById('provider-dashboard-radius');
    if (radiusSelect) radiusSelect.addEventListener('change', loadProviderDashboard);
  }

  // --- DASHBOARD DE INTERACCIONES / CONSULTAS ---
  // Nombres de día en el orden en que Postgres los devuelve (extract(dow):
  // 0 = domingo ... 6 = sábado). Se muestran reordenados lunes-a-domingo,
  // que es como la gente arma su semana acá.
  const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const ORDEN_SEMANA_LUN_A_DOM = [1, 2, 3, 4, 5, 6, 0];

  function barRow(label, cantidad, maxCantidad) {
    const pct = maxCantidad > 0 ? Math.max(4, Math.round((cantidad / maxCantidad) * 100)) : 0;
    return `
      <div class="stats-bar-row">
        <span class="stats-bar-label">${ST.escapeHtml(label)}</span>
        <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;"></div></div>
        <span class="stats-bar-value">${cantidad}</span>
      </div>
    `;
  }

  export async function loadProviderInteractionStats() {
    const summaryEl = document.getElementById('provider-stats-summary');
    const bodyEl = document.getElementById('provider-stats-body');
    if (!summaryEl || !bodyEl || !ST.providerState.provider) return;

    summaryEl.innerHTML = '';
    bodyEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Calculando...</p>';

    const { data, error } = await ST.supabaseClient.rpc('get_provider_dashboard_stats', {
      p_provider_id: ST.providerState.provider.id
    });

    if (error) {
      bodyEl.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, 'cargar las estadísticas de consultas')}</p>`;
      return;
    }

    const stats = data || {};
    const rating = stats.rating || {};

    summaryEl.innerHTML = `
      <div class="provider-stats-card">
        <strong>${stats.total_30d ?? 0}</strong>
        <span>Consultas (últimos 30 días)</span>
      </div>
      <div class="provider-stats-card">
        <strong>${stats.total_90d ?? 0}</strong>
        <span>Consultas (últimos 90 días)</span>
      </div>
      <div class="provider-stats-card">
        <strong>${stats.whatsapp_clicks_30d ?? 0}</strong>
        <span>Clicks a WhatsApp (30 días)</span>
      </div>
      <div class="provider-stats-card">
        <strong>${rating.review_count ? rating.avg_rating : 's/d'}</strong>
        <span>Valoración promedio${rating.review_count ? ` (${rating.review_count} reseña${rating.review_count === 1 ? '' : 's'})` : ' (sin reseñas)'}</span>
      </div>
    `;

    if (!stats.total_90d) {
      bodyEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); margin-top:10px;">Todavía no tenés consultas registradas. En cuanto alguien vea tu ficha o te escriba por WhatsApp desde NEXOBRA, va a empezar a aparecer acá.</p>';
      return;
    }

    // Por distancia
    const porDistancia = stats.by_distance_30d || [];
    const ordenDistancia = ['0-5km', '5-15km', '15-30km', '30km+', 'sin_datos'];
    const distanciaOrdenada = ordenDistancia
      .map(rango => porDistancia.find(r => r.rango === rango))
      .filter(Boolean);
    const maxDistancia = Math.max(1, ...distanciaOrdenada.map(r => r.cantidad));
    const distanciaLabels = { '0-5km': '0 a 5 km', '5-15km': '5 a 15 km', '15-30km': '15 a 30 km', '30km+': 'Más de 30 km', 'sin_datos': 'Sin datos de distancia' };

    // Top materiales/servicios
    const topMateriales = stats.top_materials_30d || [];
    const maxMaterial = Math.max(1, ...topMateriales.map(m => m.cantidad));

    // Patrón semanal (últimas 8 semanas)
    const porDia = stats.weekly_pattern_8w || [];
    const diaMap = {};
    porDia.forEach(d => { diaMap[d.dia_semana] = d.cantidad; });
    const maxDia = Math.max(1, ...ORDEN_SEMANA_LUN_A_DOM.map(d => diaMap[d] || 0));

    // Histórico mensual (últimos 12 meses)
    const porMes = stats.monthly_history_12m || [];
    const maxMes = Math.max(1, ...porMes.map(m => m.cantidad));

    bodyEl.innerHTML = `
      <h4 class="provider-subsection-title">Por distancia (últimos 30 días)</h4>
      ${distanciaOrdenada.length ? distanciaOrdenada.map(r => barRow(distanciaLabels[r.rango] || r.rango, r.cantidad, maxDistancia)).join('') : '<p style="font-size:0.8rem; color:var(--text-muted);">Sin datos todavía.</p>'}

      <h4 class="provider-subsection-title">Materiales/servicios más consultados (últimos 30 días)</h4>
      ${topMateriales.length ? topMateriales.map(m => barRow(m.material_name || m.material_id, m.cantidad, maxMaterial)).join('') : '<p style="font-size:0.8rem; color:var(--text-muted);">Todavía no hay consultas ligadas a un material puntual (por ejemplo, las del Directorio de Proveedores no tienen material asociado).</p>'}

      <h4 class="provider-subsection-title">¿Qué día te consultan más? (últimas 8 semanas)</h4>
      ${ORDEN_SEMANA_LUN_A_DOM.map(d => barRow(DIAS_SEMANA[d], diaMap[d] || 0, maxDia)).join('')}

      <h4 class="provider-subsection-title">Histórico mensual (últimos 12 meses)</h4>
      ${porMes.length ? porMes.map(m => barRow(m.mes, m.cantidad, maxMes)).join('') : '<p style="font-size:0.8rem; color:var(--text-muted);">Sin datos todavía.</p>'}
    `;
  }

  // --- OFERTAS POR MAIL A SUSCRIPTORES (broadcast manual del proveedor) ---
  function formatFechaHora(iso) {
    return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  export async function loadProviderBroadcastStatus() {
    const el = document.getElementById('provider-broadcast-status');
    if (!el || !ST.providerState.branch) return;
    el.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

    const { data, error } = await ST.supabaseClient.rpc('get_provider_broadcast_status', {
      p_branch_id: ST.providerState.branch.id
    });

    if (error) {
      el.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, 'cargar el estado de tus suscriptores')}</p>`;
      return;
    }

    const status = data || {};
    const count = status.subscriber_count || 0;
    const lastSent = status.last_sent_at ? new Date(status.last_sent_at) : null;
    const horasDesdeUltimo = lastSent ? (Date.now() - lastSent.getTime()) / 3_600_000 : null;
    const bloqueado = horasDesdeUltimo !== null && horasDesdeUltimo < 24;
    const horasRestantes = bloqueado ? Math.ceil(24 - horasDesdeUltimo) : 0;

    el.innerHTML = `
      <p style="font-size:0.85rem; margin-bottom:10px;">
        <strong>${count}</strong> persona${count === 1 ? '' : 's'} suscripta${count === 1 ? '' : 's'} a tus ofertas
        ${lastSent ? `· último envío: ${formatFechaHora(status.last_sent_at)}` : '· todavía no mandaste ninguna oferta por mail'}
      </p>
      <button class="btn-computo" id="btn-send-offer-broadcast" ${count === 0 || bloqueado ? 'disabled' : ''} onclick="window.nexoBraApp.sendProviderOfferBroadcast()">
        ${bloqueado ? `Podés volver a mandar en ${horasRestantes}hs` : 'Enviar mis ofertas a mis suscriptores'}
      </button>
      ${count === 0 ? '<p style="font-size:0.78rem; color:var(--text-muted); margin-top:8px;">Todavía no tenés suscriptores -- este botón se activa en cuanto alguien se suscriba a tus ofertas desde el mapa.</p>' : ''}
    `;
  }

  export async function sendProviderOfferBroadcast() {
    if (!ST.providerState.branch) return;
    const btn = document.getElementById('btn-send-offer-broadcast');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    const { data, error } = await ST.supabaseClient.functions.invoke('send-provider-offer-broadcast', {
      body: { branch_id: ST.providerState.branch.id }
    });

    // supabase-js no siempre pone el error de la función en `error` cuando la
    // función responde con un status distinto de 2xx -- por eso también se
    // revisa `data.error` (mismo patrón de respuesta que el resto de las
    // Edge Functions de NEXOBRA).
    if (error || data?.error) {
      ST.showToast('No se pudo enviar: ' + (data?.error || error.message));
      loadProviderBroadcastStatus();
      return;
    }

    if (data.recipient_count === 0 && data.message) {
      ST.showToast(data.message);
    } else {
      ST.showToast(`✓ Ofertas enviadas a ${data.recipient_count} suscriptor${data.recipient_count === 1 ? '' : 'es'}.`);
    }
    loadProviderBroadcastStatus();
  }

  // ============================================================
  // Palabras clave / hashtags del proveedor -- para aparecer en más
  // búsquedas del Directorio y del catálogo principal, más allá del rubro
  // formal. Mismo patrón que los tags de materiales (material_aliases).
  // ============================================================

  export async function loadProviderKeywords() {
    const container = document.getElementById('provider-keywords-list');
    if (!container || !ST.providerState.provider) return;

    const { data, error } = await ST.supabaseClient
      .from('provider_keywords')
      .select('id, keyword')
      .eq('provider_id', ST.providerState.provider.id)
      .order('created_at');

    if (error) {
      container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, 'cargar tus palabras clave')}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Todavía no cargaste ninguna.</p>';
      return;
    }

    container.innerHTML = data.map(k => `
      <span class="provider-keyword-chip">
        ${ST.escapeHtml(k.keyword)}
        <button type="button" onclick="window.nexoBraApp.removeProviderKeyword('${k.id}')" title="Quitar">&times;</button>
      </span>
    `).join('');
  }

  export async function addProviderKeyword() {
    if (!ST.providerState.provider) {
      ST.showToast('Primero guardá tus datos comerciales arriba.');
      return;
    }
    const input = document.getElementById('provider-keyword-input');
    const keyword = input.value.trim().toLowerCase();
    if (keyword.length < 2) {
      ST.showToast('La palabra clave tiene que tener al menos 2 letras.');
      return;
    }
    if (keyword.length > 40) {
      ST.showToast('Máximo 40 caracteres por palabra clave.');
      return;
    }

    const { error } = await ST.supabaseClient.from('provider_keywords').insert({
      provider_id: ST.providerState.provider.id,
      keyword
    });

    if (error) {
      // Violación del unique(provider_id, keyword) -- ya la tenía cargada.
      if (error.code === '23505') {
        ST.showToast('Ya tenés esa palabra clave cargada.');
      } else {
        ST.showToast('No se pudo agregar: ' + error.message);
      }
      return;
    }
    input.value = '';
    loadProviderKeywords();
  }

  export async function removeProviderKeyword(keywordId) {
    const { error } = await ST.supabaseClient.from('provider_keywords').delete().eq('id', keywordId);
    if (error) { ST.showToast('No se pudo quitar: ' + error.message); return; }
    loadProviderKeywords();
  }
