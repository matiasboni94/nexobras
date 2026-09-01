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
        statusBanner.innerHTML = `✕ Tu perfil fue rechazado${provider.rejection_reason ? ': ' + provider.rejection_reason : ''}. Corregí lo que haga falta y guardá de nuevo para volver a quedar pendiente de revisión.`;
      }
    }

    if (provider) {
      document.getElementById('prov-business-name').value = provider.business_name || '';
      document.getElementById('prov-tax-id').value = provider.tax_id || '';
      document.getElementById('prov-website').value = provider.website_url || '';
      document.getElementById('prov-contact-phone').value = provider.contact_phone || '';
      document.getElementById('prov-contact-email').value = provider.contact_email || '';
      document.getElementById('prov-description').value = provider.description || '';
      updateLogoPreview(provider.logo_url);

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
    }

    await loadProviderCatalog();
    await loadProviderDashboard();
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
        tax_id: document.getElementById('prov-tax-id').value.trim() || null,
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
          <strong>${item.denominacion}</strong><br>
          <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro}</span>
        </div>
        <div class="provider-search-row-controls">
          <input type="text" id="prov-sku-${item.id}" placeholder="Tu SKU (opcional)">
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
    const stock = document.getElementById(`prov-stock-${materialId}`).value;
    const unitMode = document.getElementById(`prov-unit-${materialId}`).value; // 'venta' | 'computo'

    const { error } = await ST.supabaseClient.from('provider_offers').insert({
      branch_id: ST.providerState.branch.id,
      material_id: materialId,
      price_kind: unitMode === 'venta' ? 'sale' : 'measurement',
      amount: price,
      unit: unitMode === 'venta' ? material.unidadVenta : material.unidadComputo,
      provider_sku: sku,
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
      .select('id, amount, unit, provider_sku, stock_status, status, rejection_reason, materials(id, denomination)')
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
          <h5>${offer.materials?.denomination || '(material eliminado)'}</h5>
          <span>${offer.provider_sku ? `SKU propio: ${offer.provider_sku} · ` : ''}${offer.unit}</span>
          ${offer.status === 'pending' ? '<br><span style="font-size:0.7rem; font-weight:700; color:#b45309;">⏳ Pendiente de aprobación</span>' : ''}
          ${offer.status === 'rejected' ? `<br><span style="font-size:0.7rem; font-weight:700; color:#b91c1c;">✕ Rechazado${offer.rejection_reason ? ': ' + offer.rejection_reason : ' — revisá el precio y volvé a intentar'}</span>` : ''}
        </div>
        <div class="provider-catalog-row-controls">
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
  export function handleProviderExcelFile(file) {
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
        ? ` <span title="Escribiste &quot;${row.requestedUnit}&quot; pero no coincide con ninguna unidad válida de este material. Se cargó por unidad de compra (venta) por defecto." style="color:#b45309; font-weight:700; cursor:help;">⚠</span>`
        : '';
      return `
      <div class="excel-preview-row status-${row.status}">
        <div>
          <strong>${row.name || row.sku}</strong>
          ${row.matchedItem ? `→ ${row.matchedItem.denominacion} (${row.matchedItem.id})` : ' → sin coincidencia, no se va a cargar'}
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

  export function generateProviderTemplate() {
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
          <span class="variation-name">${row.denomination}${row.stock_status === 'agotado' ? ' <em>(agotado)</em>' : ''}</span>
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

  // --- FASE E, PARTE 2: Favoritos ---
