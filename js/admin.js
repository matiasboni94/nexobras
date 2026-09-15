// NEXOBRA - admin.js
// Panel de administración (Fase F): editor de materiales, aprobación de
// proveedores y agenda de precios pendientes. Todo gated a role='admin' --
// nadie puede autoasignarse ese rol desde la web (ver 001_initial_schema.sql
// y el trigger de registro), solo se activa a mano por SQL.

import * as ST from './state.js';
import * as Provider from './provider.js';

const adminState = {
  materialResults: [],
  editingMaterial: null,
  pendingProviders: [],
  pendingOffers: [],
  reviewingProvider: null,
  manageProviders: [],
  manageSelectedProvider: null,
  manageSelectedBranch: null
};

const materialBrowseState = {
  page: 0,
  pageSize: 50,
  items: [],
  hasMore: true,
  loading: false
};

export function isAdmin() {
  return ST.authState.profile?.role === 'admin';
}

export function updateAdminNavVisibility() {
  const btn = document.getElementById('btn-open-admin');
  if (btn) btn.style.display = isAdmin() ? 'block' : 'none';
  if (isAdmin()) loadPendingCount();
}

/**
 * Insignia roja en "Panel de Admin" con la cantidad de proveedores, ofertas
 * y reseñas reportadas pendientes de revisión -- se ve apenas entrás al
 * sitio logueado como admin, sin tener que abrir el panel para saber si hay
 * algo nuevo.
 */
export async function loadPendingCount() {
  const badge = document.getElementById('admin-pending-badge');
  if (!badge || !ST.supabaseClient) return;

  const [{ count: providersCount }, { count: offersCount }, { count: reportsCount }] = await Promise.all([
    ST.supabaseClient.from('providers').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
    ST.supabaseClient.from('provider_offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ST.supabaseClient.from('review_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  const total = (providersCount || 0) + (offersCount || 0) + (reportsCount || 0);
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ============================================================
// F2, parte A — Búsqueda rápida (como ya existía)
// ============================================================

function renderMaterialSearchResults() {
  const container = document.getElementById('admin-material-results');
  if (!container) return;
  if (adminState.materialResults.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = adminState.materialResults.map(item => `
    <div class="provider-search-row">
      <div class="provider-search-row-info">
        <strong>${ST.escapeHtml(item.denominacion)}</strong><br>
        <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro}</span>
      </div>
      <button class="btn-computo" style="padding: 6px 12px; font-size: 0.78rem;" onclick="window.nexoBraApp.openMaterialEditor(${ST.escAttr(item.id)})">Editar</button>
    </div>
  `).join('');
}

export function searchMaterialsForAdmin() {
  const input = document.getElementById('admin-material-search');
  const query = input.value.trim();
  if (query.length < 2) {
    adminState.materialResults = [];
    renderMaterialSearchResults();
    return;
  }
  adminState.materialResults = Provider.searchMaterialsSimple(query, 12);
  renderMaterialSearchResults();
}

// ============================================================
// F2, parte B — Listado completo, con filtro por fecha de modificación
// ============================================================

function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function loadMaterialsBrowse(reset = true) {
  if (materialBrowseState.loading) return;
  materialBrowseState.loading = true;
  if (reset) {
    materialBrowseState.page = 0;
    materialBrowseState.items = [];
    materialBrowseState.hasMore = true;
  }

  const dateFilter = document.getElementById('admin-material-date-filter').value;
  const sort = document.getElementById('admin-material-sort').value;
  const from = materialBrowseState.page * materialBrowseState.pageSize;
  const to = from + materialBrowseState.pageSize - 1;

  let query = ST.supabaseClient
    .from('materials')
    .select('id, denomination, rubro, category, updated_at, active')
    .range(from, to);

  if (dateFilter) query = query.gte('updated_at', dateFilter);

  if (sort === 'updated_asc') query = query.order('updated_at', { ascending: true });
  else if (sort === 'name_asc') query = query.order('denomination', { ascending: true });
  else query = query.order('updated_at', { ascending: false }); // updated_desc, default

  const { data, error } = await query;
  materialBrowseState.loading = false;

  if (error) {
    document.getElementById('admin-material-list').innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }

  materialBrowseState.items = reset ? (data || []) : [...materialBrowseState.items, ...(data || [])];
  materialBrowseState.hasMore = (data || []).length === materialBrowseState.pageSize;
  materialBrowseState.page++;
  renderMaterialBrowseList();
}

function renderMaterialBrowseList() {
  const container = document.getElementById('admin-material-list');
  const btnLoadMore = document.getElementById('btn-load-more-materials');
  if (!container) return;

  if (materialBrowseState.items.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Sin materiales para ese filtro.</p>';
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    return;
  }

  container.innerHTML = materialBrowseState.items.map(item => `
    <div class="provider-search-row">
      <div class="provider-search-row-info">
        <strong>${ST.escapeHtml(item.denomination)}</strong>${item.active === false ? ' <span style="color:#b91c1c; font-size:0.72rem; font-weight:700;">(inactivo)</span>' : ''}<br>
        <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro} · modificado: ${formatDateTime(item.updated_at)}</span>
      </div>
      <button class="btn-computo" style="padding: 6px 12px; font-size: 0.78rem;" onclick="window.nexoBraApp.openMaterialEditor(${ST.escAttr(item.id)})">Editar</button>
    </div>
  `).join('');

  if (btnLoadMore) btnLoadMore.style.display = materialBrowseState.hasMore ? 'block' : 'none';
}

// ============================================================
// F2, parte C — Editor de un material puntual
// ============================================================

export async function openMaterialEditor(materialId) {
  const { data: material, error: matError } = await ST.supabaseClient
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .single();
  if (matError) {
    ST.showToast('No se pudo cargar el material: ' + matError.message);
    return;
  }

  const { data: bases } = await ST.supabaseClient
    .from('material_price_bases')
    .select('*')
    .eq('material_id', materialId);
  const saleBase = (bases || []).find(b => b.price_kind === 'sale');
  const measurementBase = (bases || []).find(b => b.price_kind === 'measurement');

  const { data: aliases } = await ST.supabaseClient
    .from('material_aliases')
    .select('alias')
    .eq('material_id', materialId);

  adminState.editingMaterial = { material, saleBase, measurementBase };

  document.getElementById('admin-edit-id').textContent = material.id;
  document.getElementById('admin-edit-denominacion').value = material.denomination || '';
  document.getElementById('admin-edit-rubro').value = material.rubro || '';
  document.getElementById('admin-edit-categoria').value = material.category || '';
  document.getElementById('admin-edit-subcategoria').value = material.subcategory || '';
  document.getElementById('admin-edit-unidad-venta').value = material.sale_unit || '';
  document.getElementById('admin-edit-unidad-computo').value = material.measurement_unit || '';
  document.getElementById('admin-edit-envase').value = material.package_quantity ?? 1;
  document.getElementById('admin-edit-precio-venta').value = saleBase ? saleBase.amount : '';
  document.getElementById('admin-edit-precio-computo').value = measurementBase ? measurementBase.amount : '';
  document.getElementById('admin-edit-mes-base').value = (saleBase && saleBase.base_month) || (measurementBase && measurementBase.base_month) || '';
  document.getElementById('admin-edit-tags').value = (aliases || []).map(a => a.alias).join(', ');
  document.getElementById('admin-edit-active').checked = material.active !== false;
  document.getElementById('admin-edit-brand').value = material.brand || '';
  document.getElementById('admin-edit-technical-description').value = material.technical_description || '';
  document.getElementById('admin-edit-yield-value').value = material.yield_value ?? '';
  document.getElementById('admin-edit-yield-unit').value = material.yield_unit || '';

  document.getElementById('admin-material-editor').style.display = 'block';
  document.getElementById('admin-material-editor').scrollIntoView({ behavior: 'smooth' });
}

export function closeMaterialEditor() {
  adminState.editingMaterial = null;
  document.getElementById('admin-material-editor').style.display = 'none';
}

/** Recalcula el precio de cómputo automáticamente: precio de venta ÷ envase. */
export function recalcPrecioComputo() {
  const envase = parseFloat(document.getElementById('admin-edit-envase').value) || 1;
  const precioVenta = parseFloat(document.getElementById('admin-edit-precio-venta').value) || 0;
  document.getElementById('admin-edit-precio-computo').value = Math.round((precioVenta / envase) * 100) / 100;
}

export async function saveMaterialEdit() {
  if (!adminState.editingMaterial) return;
  const materialId = adminState.editingMaterial.material.id;
  const btn = document.getElementById('btn-save-material-edit');
  btn.disabled = true;

  try {
    const materialPayload = {
      denomination: document.getElementById('admin-edit-denominacion').value.trim(),
      rubro: document.getElementById('admin-edit-rubro').value.trim(),
      category: document.getElementById('admin-edit-categoria').value.trim() || null,
      subcategory: document.getElementById('admin-edit-subcategoria').value.trim() || null,
      sale_unit: document.getElementById('admin-edit-unidad-venta').value.trim() || null,
      measurement_unit: document.getElementById('admin-edit-unidad-computo').value.trim() || null,
      package_quantity: parseFloat(document.getElementById('admin-edit-envase').value) || 1,
      active: document.getElementById('admin-edit-active').checked,
      brand: document.getElementById('admin-edit-brand').value.trim() || null,
      technical_description: document.getElementById('admin-edit-technical-description').value.trim() || null,
      yield_value: parseFloat(document.getElementById('admin-edit-yield-value').value) || null,
      yield_unit: document.getElementById('admin-edit-yield-unit').value.trim() || null
    };
    const { error: matErr } = await ST.supabaseClient.from('materials').update(materialPayload).eq('id', materialId);
    if (matErr) throw matErr;

    const mesBase = document.getElementById('admin-edit-mes-base').value.trim();
    const precioVenta = parseFloat(document.getElementById('admin-edit-precio-venta').value);
    const precioComputo = parseFloat(document.getElementById('admin-edit-precio-computo').value);

    if (mesBase && !isNaN(precioVenta)) {
      const { error } = await ST.supabaseClient.from('material_price_bases').upsert({
        material_id: materialId, price_kind: 'sale', amount: precioVenta, base_month: mesBase, is_active: true
      }, { onConflict: 'material_id,price_kind,base_month' });
      if (error) throw error;
    }
    if (mesBase && !isNaN(precioComputo)) {
      const { error } = await ST.supabaseClient.from('material_price_bases').upsert({
        material_id: materialId, price_kind: 'measurement', amount: precioComputo, base_month: mesBase, is_active: true
      }, { onConflict: 'material_id,price_kind,base_month' });
      if (error) throw error;
    }

    // Tags: reemplazo completo (borrar todos, insertar los nuevos) -- más simple y confiable que un diff.
    const tags = document.getElementById('admin-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    await ST.supabaseClient.from('material_aliases').delete().eq('material_id', materialId);
    if (tags.length > 0) {
      await ST.supabaseClient.from('material_aliases').insert(tags.map(alias => ({ material_id: materialId, alias })));
    }

    // Actualiza también el catálogo en memoria (NEXOBRA_DATA) para que se vea el cambio sin recargar.
    const localItem = NEXOBRA_DATA.find(m => m.id === materialId);
    if (localItem) {
      localItem.denominacion = materialPayload.denomination;
      localItem.rubro = materialPayload.rubro;
      localItem.categoria = materialPayload.category;
      localItem.subcategoria = materialPayload.subcategory;
      localItem.unidadVenta = materialPayload.sale_unit;
      localItem.unidadComputo = materialPayload.measurement_unit;
      localItem.envase = materialPayload.package_quantity;
      localItem.tags = tags;
      if (!isNaN(precioVenta)) { localItem.precioBase = precioVenta; localItem.precioVenta = precioVenta; }
      if (!isNaN(precioComputo)) { localItem.precioComputo = precioComputo; }
      if (mesBase) localItem.mesBase = mesBase;
    }

    ST.showToast('Material actualizado.');
    closeMaterialEditor();
    loadMaterialsBrowse(true); // refresca la lista para que se vea la nueva fecha de modificación
  } catch (err) {
    ST.showToast('No se pudo guardar: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// F3 — Aprobación de proveedores (con perfil completo)
// ============================================================

export async function loadPendingProviders() {
  const container = document.getElementById('admin-pending-providers');
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('providers')
    .select('id, business_name, tax_id, contact_phone, contact_email, description, created_at, provider_branches(name, locality, address, whatsapp_phone)')
    .eq('verification_status', 'pending')
    .order('created_at');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  adminState.pendingProviders = data || [];
  renderPendingProviders();
}

function renderPendingProviders() {
  const container = document.getElementById('admin-pending-providers');
  if (adminState.pendingProviders.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay proveedores esperando aprobación.</p>';
    return;
  }
  container.innerHTML = adminState.pendingProviders.map(p => {
    const branch = p.provider_branches?.[0];
    return `
      <div class="computation-row">
        <div class="computation-row-info">
          <h4>${ST.escapeHtml(p.business_name)}</h4>
          <span>${branch ? `${ST.escapeHtml(branch.name)}, ${ST.escapeHtml(branch.locality)}` : 'Sin sucursal cargada'} · Cargado el ${formatDateTime(p.created_at)}</span>
        </div>
        <div class="computation-row-actions">
          <button onclick="window.nexoBraApp.openProviderReview(${ST.escAttr(p.id)})">Ver perfil completo</button>
        </div>
      </div>
    `;
  }).join('');
}

/** Ficha completa del proveedor (todos los campos + su sucursal) para decidir con criterio, no solo con el nombre. */
export async function openProviderReview(providerId) {
  const panel = document.getElementById('admin-provider-review');
  panel.style.display = 'block';
  panel.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando ficha...</p>';
  panel.scrollIntoView({ behavior: 'smooth' });

  const { data: provider, error } = await ST.supabaseClient
    .from('providers')
    .select('*, provider_branches(*)')
    .eq('id', providerId)
    .single();

  if (error) {
    panel.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  adminState.reviewingProvider = provider;
  const branch = provider.provider_branches?.[0];

  panel.innerHTML = `
    <h4 style="margin-bottom:10px; display:flex; align-items:center; gap:10px;">
      ${provider.logo_url ? `<img src="${ST.escapeHtml(provider.logo_url)}" class="provider-logo-mini" alt="">` : '🏪'}
      ${ST.escapeHtml(provider.business_name)}
    </h4>
    <div class="excel-config-grid" style="margin-bottom:14px;">
      <div><strong>CUIT:</strong> ${ST.escapeHtml(provider.tax_id) || 's/d'}</div>
      <div><strong>Sitio web:</strong> ${provider.website_url ? `<a href="${ST.escapeHtml(provider.website_url)}" target="_blank">${ST.escapeHtml(provider.website_url)}</a>` : 's/d'}</div>
      <div><strong>Teléfono:</strong> ${ST.escapeHtml(provider.contact_phone) || 's/d'}</div>
      <div><strong>Email:</strong> ${ST.escapeHtml(provider.contact_email) || 's/d'}</div>
      <div style="grid-column: 1 / -1;"><strong>Descripción:</strong> ${ST.escapeHtml(provider.description) || 's/d'}</div>
    </div>
    ${branch ? `
      <h5 style="margin-bottom:8px;">Sucursal</h5>
      <div class="excel-config-grid" style="margin-bottom:14px;">
        <div><strong>Nombre:</strong> ${ST.escapeHtml(branch.name)}</div>
        <div><strong>Localidad:</strong> ${ST.escapeHtml(branch.locality)}, ${ST.escapeHtml(branch.province) || ''}</div>
        <div><strong>Dirección:</strong> ${ST.escapeHtml(branch.address) || 's/d'}</div>
        <div><strong>WhatsApp:</strong> ${ST.escapeHtml(branch.whatsapp_phone) || 's/d'}</div>
        <div><strong>Coordenadas:</strong> ${branch.latitude && branch.longitude ? `${branch.latitude}, ${branch.longitude}` : 'sin cargar'}</div>
        <div><strong>Radio de entrega:</strong> ${branch.delivery_radius_km ? branch.delivery_radius_km + ' km' : 's/d'}</div>
      </div>
    ` : '<p style="color:#b91c1c; font-size:0.85rem;">Todavía no cargó ninguna sucursal.</p>'}
    <div style="display:flex; gap:8px;">
      <button class="btn-computo" onclick="window.nexoBraApp.approveProvider(${ST.escAttr(provider.id)})">✓ Aprobar proveedor</button>
      <button class="btn-action-drawer" style="color:#b91c1c;" onclick="window.nexoBraApp.rejectProvider(${ST.escAttr(provider.id)})">✕ Rechazar</button>
      <button class="btn-action-drawer" type="button" onclick="window.nexoBraApp.closeProviderReview()">Cerrar</button>
    </div>
  `;
}

export function closeProviderReview() {
  adminState.reviewingProvider = null;
  document.getElementById('admin-provider-review').style.display = 'none';
}

export async function approveProvider(id) {
  const { error } = await ST.supabaseClient.from('providers').update({ verification_status: 'approved', rejection_reason: null }).eq('id', id);
  if (error) { ST.showToast('No se pudo aprobar: ' + error.message); return; }
  ST.showToast('Proveedor aprobado. Ya aparece en el mapa.');
  closeProviderReview();
  loadPendingProviders();
  loadPendingCount();
}

export async function rejectProvider(id) {
  const motivo = prompt('¿Por qué rechazás este proveedor? (se lo va a mostrar a la persona en su panel)');
  if (motivo === null) return; // canceló
  const { error } = await ST.supabaseClient.from('providers').update({ verification_status: 'rejected', rejection_reason: motivo || null }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Proveedor rechazado.');
  closeProviderReview();
  loadPendingProviders();
  loadPendingCount();
}

// ============================================================
// F4 — Agenda de precios pendientes (por proveedor)
// ============================================================

export async function loadPendingOffers() {
  const container = document.getElementById('admin-pending-offers');
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('provider_offers')
    .select('id, amount, unit, provider_sku, brand, stock_status, reported_at, materials(denomination), provider_branches(name, locality, providers(business_name))')
    .eq('status', 'pending')
    .order('reported_at');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  adminState.pendingOffers = data || [];
  renderPendingOffers();
}

function renderPendingOffers() {
  const container = document.getElementById('admin-pending-offers');
  if (adminState.pendingOffers.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay precios esperando aprobación.</p>';
    return;
  }

  // Agrupar por proveedor (agenda por proveedor, como pediste).
  const groups = {};
  const order = [];
  adminState.pendingOffers.forEach(offer => {
    const businessName = offer.provider_branches?.providers?.business_name || '(proveedor eliminado)';
    const key = businessName + '|' + (offer.provider_branches?.name || '');
    if (!groups[key]) { groups[key] = { businessName, branchName: offer.provider_branches?.name, locality: offer.provider_branches?.locality, offers: [] }; order.push(key); }
    groups[key].offers.push(offer);
  });

  container.innerHTML = order.map(key => {
    const g = groups[key];
    return `
      <div class="provider-group">
        <div class="provider-group-header">
          <h4>🏪 ${ST.escapeHtml(g.businessName)} — ${ST.escapeHtml(g.branchName) || ''} (${ST.escapeHtml(g.locality) || ''})</h4>
          <span style="font-size:0.75rem; color:var(--text-muted);">${g.offers.length} pendiente${g.offers.length === 1 ? '' : 's'}</span>
        </div>
        <div class="provider-group-body">
          ${g.offers.map(offer => `
            <div class="provider-catalog-row">
              <div class="provider-catalog-row-info">
                <h5>${ST.escapeHtml(offer.materials?.denomination) || '(material eliminado)'}</h5>
                <span>${offer.brand ? `<strong>${ST.escapeHtml(offer.brand)}</strong> · ` : ''}${offer.provider_sku ? `SKU: ${ST.escapeHtml(offer.provider_sku)} · ` : ''}${ST.formatMoney(offer.amount)} / ${offer.unit} · ${offer.stock_status} · cargado ${formatDateTime(offer.reported_at)}</span>
              </div>
              <div class="provider-catalog-row-controls">
                <button class="btn-computo" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.approveOffer(${ST.escAttr(offer.id)})">✓ Aprobar</button>
                <button class="btn-remove-item" title="Rechazar" onclick="window.nexoBraApp.rejectOffer(${ST.escAttr(offer.id)})">&times;</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

export async function approveOffer(id) {
  const { error } = await ST.supabaseClient.from('provider_offers').update({ status: 'approved', rejection_reason: null }).eq('id', id);
  if (error) { ST.showToast('No se pudo aprobar: ' + error.message); return; }
  ST.showToast('Precio aprobado.');
  loadPendingOffers();
  loadPendingCount();
}

export async function rejectOffer(id) {
  const motivo = prompt('¿Por qué rechazás este precio? (se lo va a mostrar al proveedor en su catálogo)');
  if (motivo === null) return; // canceló
  const { error } = await ST.supabaseClient.from('provider_offers').update({ status: 'rejected', rejection_reason: motivo || null }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Precio rechazado.');
  loadPendingOffers();
  loadPendingCount();
}

// ============================================================
// Índices (IPC y Mano de Obra): cargar valores nuevos sin depender
// de que yo te arme una migración SQL cada vez. Las dos series viven
// en la misma tabla (index_values, ligada a index_series), así que
// una sola sección de admin sirve para ambas.
// ============================================================

// ============================================================
// Analítica de búsquedas: qué se busca y no se encuentra
// ============================================================

// ============================================================
// Carga masiva de precios base desde Excel (revista nueva)
// ============================================================

let bulkPriceRows = [];

export async function handleBulkPriceFile(file) {
  if (!file) return;
  document.getElementById('admin-bulk-price-filename').textContent = file.name;

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
    processBulkPriceRows(rows);
  };
  reader.readAsArrayBuffer(file);
}

function processBulkPriceRows(rawRows) {
  const preview = document.getElementById('admin-bulk-price-preview');
  const dataRows = rawRows.slice(1); // primera fila = encabezados

  bulkPriceRows = dataRows
    .filter(r => r[0]) // tiene que traer al menos el código
    .map(r => ({
      material_id: String(r[0]).trim(),
      sale_amount: r[1] !== undefined && r[1] !== '' ? Number(r[1]) : null,
      measurement_amount: r[2] !== undefined && r[2] !== '' ? Number(r[2]) : null
    }))
    .filter(r => r.sale_amount !== null || r.measurement_amount !== null);

  const matchedIds = new Set(NEXOBRA_DATA.map(m => m.id));
  const matched = bulkPriceRows.filter(r => matchedIds.has(r.material_id)).length;
  const noMatch = bulkPriceRows.length - matched;

  preview.innerHTML = `
    <p style="font-size:0.85rem; margin-bottom:10px;">
      <strong>${bulkPriceRows.length}</strong> filas con precio en el archivo · <strong style="color:#15803d;">${matched}</strong> coinciden con un código de NEXOBRA
      ${noMatch > 0 ? ` · <strong style="color:#b91c1c;">${noMatch}</strong> códigos no encontrados (se van a saltear)` : ''}
    </p>
    <button class="btn-computo" id="btn-confirm-bulk-price">Aplicar los ${matched} precios</button>
  `;
  document.getElementById('btn-confirm-bulk-price').addEventListener('click', confirmBulkPriceUpload);
}

async function confirmBulkPriceUpload() {
  const monthInput = document.getElementById('admin-bulk-base-month').value; // "YYYY-MM"
  if (!monthInput) {
    ST.showToast('Elegí el mes base de estos precios.');
    return;
  }
  const sourceName = document.getElementById('admin-bulk-source-name').value.trim() || null;
  const baseMonth = `${monthInput}-01`;

  if (!confirm(`¿Confirmás actualizar los precios base de ${bulkPriceRows.length} materiales? Los precios anteriores quedan guardados como historial, no se pierden.`)) return;

  ST.showToast('Aplicando... puede tardar un momento con muchos materiales.');

  const { data, error } = await ST.supabaseClient.rpc('admin_bulk_update_price_bases', {
    p_rows: bulkPriceRows,
    p_base_month: baseMonth
  });

  if (error) {
    ST.showToast('No se pudo aplicar la carga: ' + error.message);
    return;
  }

  const result = data?.[0];
  ST.showToast(`Listo: ${result?.updated_count ?? 0} materiales actualizados, ${result?.skipped_count ?? 0} sin coincidencia.`);
  document.getElementById('admin-bulk-price-preview').innerHTML = '';
  bulkPriceRows = [];
}

// ============================================================
// Sugerencias técnicas de proveedores (marca, descripción, rendimiento)
// ============================================================

export async function loadTechSuggestions() {
  const container = document.getElementById('admin-tech-suggestions-list');
  if (!container) return;
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('material_technical_suggestions')
    .select('id, material_id, brand, technical_description, yield_value, yield_unit, created_at, providers(business_name)')
    .eq('status', 'pending')
    .order('created_at');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay sugerencias pendientes.</p>';
    return;
  }

  container.innerHTML = data.map(s => {
    const material = NEXOBRA_DATA.find(m => m.id === s.material_id);
    return `
      <div class="provider-catalog-row">
        <div class="provider-catalog-row-info">
          <h5>${ST.escapeHtml(material?.denominacion) || s.material_id}</h5>
          <span style="display:block;">
            ${s.brand ? `<strong>Marca:</strong> ${ST.escapeHtml(s.brand)}<br>` : ''}
            ${s.technical_description ? `<strong>Descripción:</strong> ${ST.escapeHtml(s.technical_description)}<br>` : ''}
            ${s.yield_value ? `<strong>Rendimiento:</strong> ${s.yield_value} ${ST.escapeHtml(s.yield_unit)}<br>` : ''}
            <span style="color:var(--text-muted); font-size:0.75rem;">Sugerido por ${ST.escapeHtml(s.providers?.business_name) || '(proveedor eliminado)'} · ${formatDateTime(s.created_at)}</span>
          </span>
        </div>
        <div class="provider-catalog-row-controls">
          <button class="btn-computo" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.approveTechSuggestion(${ST.escAttr(s.id)}, ${ST.escAttr(s.material_id)})">✓ Aprobar</button>
          <button class="btn-remove-item" title="Rechazar" onclick="window.nexoBraApp.rejectTechSuggestion(${ST.escAttr(s.id)})">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function approveTechSuggestion(id, materialId) {
  const { data: suggestion, error: fetchError } = await ST.supabaseClient
    .from('material_technical_suggestions')
    .select('brand, technical_description, yield_value, yield_unit')
    .eq('id', id)
    .single();
  if (fetchError) { ST.showToast('No se pudo leer la sugerencia: ' + fetchError.message); return; }

  const updates = {};
  if (suggestion.brand) updates.brand = suggestion.brand;
  if (suggestion.technical_description) updates.technical_description = suggestion.technical_description;
  if (suggestion.yield_value) { updates.yield_value = suggestion.yield_value; updates.yield_unit = suggestion.yield_unit; }

  const { error: updateError } = await ST.supabaseClient.from('materials').update(updates).eq('id', materialId);
  if (updateError) { ST.showToast('No se pudo aplicar al material: ' + updateError.message); return; }

  await ST.supabaseClient.from('material_technical_suggestions').update({ status: 'approved' }).eq('id', id);
  ST.showToast('Aplicado al material.');
  loadTechSuggestions();
}

export async function rejectTechSuggestion(id) {
  const motivo = prompt('¿Por qué la rechazás? (opcional, se lo muestra al proveedor)');
  const { error } = await ST.supabaseClient.from('material_technical_suggestions').update({ status: 'rejected', rejection_reason: motivo || null }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Sugerencia rechazada.');
  loadTechSuggestions();
}

export async function loadSearchAnalytics(zeroResultsOnly) {
  const container = document.getElementById('admin-analytics-results');
  if (!container) return;
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient.rpc('get_top_searches', {
    p_zero_results_only: zeroResultsOnly,
    p_limit: 25
  });

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no hay suficientes búsquedas registradas.</p>';
    return;
  }

  container.innerHTML = data.map(row => `
    <div class="provider-search-row">
      <div class="provider-search-row-info">
        <strong>${ST.escapeHtml(row.query)}</strong>
        <span style="color:var(--text-muted); font-size:0.75rem;">buscado ${row.search_count} vez${row.search_count === 1 ? '' : 'es'} · promedio ${row.avg_results} resultado${row.avg_results === 1 ? '' : 's'} · última vez ${formatDateTime(row.last_searched_at)}</span>
      </div>
    </div>
  `).join('');
}

export async function loadIndexSeriesOptions() {
  const select = document.getElementById('admin-index-series-select');
  if (!select) return;
  const { data, error } = await ST.supabaseClient
    .from('index_series')
    .select('id, code, name, applies_to')
    .order('applies_to')
    .order('name');
  if (error) {
    select.innerHTML = `<option value="">Error: ${error.message}</option>`;
    return;
  }
  select.innerHTML = (data || []).map(s =>
    `<option value="${s.id}">${s.applies_to === 'labor' ? '👷 UOCRA' : '📈 IPC'} — ${s.name}</option>`
  ).join('');
  if ((data || []).length > 0) loadRecentIndexValues();
}

export async function saveIndexValue() {
  const seriesId = document.getElementById('admin-index-series-select').value;
  const month = document.getElementById('admin-index-month').value; // "YYYY-MM" del <input type="month">
  const valueInput = document.getElementById('admin-index-value').value;

  if (!seriesId || !month || valueInput === '') {
    ST.showToast('Completá serie, mes y valor.');
    return;
  }

  const referenceMonth = `${month}-01`;
  const value = parseFloat(valueInput);

  const { error } = await ST.supabaseClient
    .from('index_values')
    .upsert(
      { series_id: seriesId, reference_month: referenceMonth, value, is_published: true },
      { onConflict: 'series_id,reference_month' }
    );

  if (error) {
    ST.showToast('No se pudo guardar: ' + error.message);
    return;
  }
  ST.showToast(`Valor guardado para ${ST.monthLabel(referenceMonth)}.`);
  document.getElementById('admin-index-value').value = '';
  loadRecentIndexValues();
}

export async function loadRecentIndexValues() {
  const seriesId = document.getElementById('admin-index-series-select').value;
  const container = document.getElementById('admin-index-recent-values');
  if (!seriesId || !container) return;
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('index_values')
    .select('id, reference_month, value')
    .eq('series_id', seriesId)
    .order('reference_month', { ascending: false })
    .limit(12);

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no hay valores cargados para esta serie.</p>';
    return;
  }
  container.innerHTML = data.map(row => `
    <div class="provider-search-row">
      <div class="provider-search-row-info">
        <strong>${ST.monthLabel(row.reference_month)}</strong>
        <span style="color:var(--text-muted); font-size:0.85rem; margin-left:10px;">${row.value}</span>
      </div>
      <button class="btn-remove-item" title="Eliminar" onclick="window.nexoBraApp.deleteIndexValue(${ST.escAttr(row.id)})">&times;</button>
    </div>
  `).join('');
}

export async function deleteIndexValue(id) {
  if (!confirm('¿Eliminar este valor? Si algún presupuesto ya se calculó con este dato, sus números no cambian retroactivamente, pero el mes va a quedar sin valor hacia adelante.')) return;
  const { error } = await ST.supabaseClient.from('index_values').delete().eq('id', id);
  if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
  ST.showToast('Valor eliminado.');
  loadRecentIndexValues();
}

// ============================================================
// Setup
// ============================================================

export function setupAdminListeners() {
  if (!ST.supabaseClient) return;
  const btnOpenAdmin = document.getElementById('btn-open-admin');
  const materialSearch = document.getElementById('admin-material-search');
  const btnCloseEditor = document.getElementById('btn-close-material-editor');
  const btnSaveEdit = document.getElementById('btn-save-material-edit');
  const btnRecalc = document.getElementById('btn-recalc-precio-computo');
  const dateFilter = document.getElementById('admin-material-date-filter');
  const sortSelect = document.getElementById('admin-material-sort');
  const btnLoadMore = document.getElementById('btn-load-more-materials');

  if (btnOpenAdmin) btnOpenAdmin.addEventListener('click', () => {
    ST.authDropdown.style.display = 'none';
    window.nexoBraApp.switchView('admin');
  });
  if (materialSearch) materialSearch.addEventListener('input', searchMaterialsForAdmin);
  if (btnCloseEditor) btnCloseEditor.addEventListener('click', closeMaterialEditor);
  if (btnSaveEdit) btnSaveEdit.addEventListener('click', (e) => { e.preventDefault(); saveMaterialEdit(); });
  if (btnRecalc) btnRecalc.addEventListener('click', recalcPrecioComputo);
  if (dateFilter) dateFilter.addEventListener('change', () => loadMaterialsBrowse(true));
  if (sortSelect) sortSelect.addEventListener('change', () => loadMaterialsBrowse(true));
  if (btnLoadMore) btnLoadMore.addEventListener('click', () => loadMaterialsBrowse(false));

  const indexSeriesSelect = document.getElementById('admin-index-series-select');
  const btnSaveIndexValue = document.getElementById('btn-save-index-value');
  if (indexSeriesSelect) indexSeriesSelect.addEventListener('change', () => loadRecentIndexValues());
  if (btnSaveIndexValue) btnSaveIndexValue.addEventListener('click', (e) => { e.preventDefault(); saveIndexValue(); });

  const btnAnalyticsZeroResults = document.getElementById('btn-analytics-zero-results');
  const btnAnalyticsTopSearches = document.getElementById('btn-analytics-top-searches');
  if (btnAnalyticsZeroResults) btnAnalyticsZeroResults.addEventListener('click', () => loadSearchAnalytics(true));
  if (btnAnalyticsTopSearches) btnAnalyticsTopSearches.addEventListener('click', () => loadSearchAnalytics(false));

  const bulkPriceFileInput = document.getElementById('admin-bulk-price-file');
  if (bulkPriceFileInput) bulkPriceFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleBulkPriceFile(e.target.files[0]);
  });

  // --- Gestionar proveedores ---
  const provManageSearch = document.getElementById('admin-prov-manage-search');
  const btnProvNew = document.getElementById('btn-admin-prov-new');
  const btnProvBack = document.getElementById('btn-admin-prov-back');
  const provManageForm = document.getElementById('admin-prov-manage-form');
  const btnGeocodeAdmin = document.getElementById('btn-admin-geocode-address');
  const btnProvTransfer = document.getElementById('btn-admin-prov-transfer');
  const provAddSearch = document.getElementById('admin-prov-add-search');
  const btnAddProvKeyword = document.getElementById('btn-admin-add-prov-keyword');

  if (provManageSearch) provManageSearch.addEventListener('input', () => renderAdminProviderList());
  if (btnProvNew) btnProvNew.addEventListener('click', () => openAdminProviderEditor(null));
  if (btnProvBack) btnProvBack.addEventListener('click', closeAdminProviderEditor);
  if (provManageForm) provManageForm.addEventListener('submit', handleAdminProviderProfileSubmit);
  if (btnGeocodeAdmin) btnGeocodeAdmin.addEventListener('click', (e) => { e.preventDefault(); geocodeAdminBranchAddress(); });
  if (btnProvTransfer) btnProvTransfer.addEventListener('click', transferAdminProvider);
  if (provAddSearch) provAddSearch.addEventListener('input', renderAdminProviderAddResults);
  if (btnAddProvKeyword) btnAddProvKeyword.addEventListener('click', addAdminProviderKeyword);

  const btnAddProvAnnouncement = document.getElementById('btn-admin-add-prov-announcement');
  if (btnAddProvAnnouncement) btnAddProvAnnouncement.addEventListener('click', addAdminProviderAnnouncement);
}

export function loadAdminPanel() {
  loadMaterialsBrowse(true);
  loadAdminProviderList();
  loadPendingProviders();
  loadPendingOffers();
  loadIndexSeriesOptions();
  loadTechSuggestions();
  loadReportedReviews();
}

// ============================================================
// Reseñas reportadas
// ============================================================

export async function loadReportedReviews() {
  const container = document.getElementById('admin-reported-reviews-list');
  if (!container) return;
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('review_reports')
    .select('id, reason, created_at, provider_reviews(id, rating, comment, provider_id, providers(business_name))')
    .eq('status', 'pending')
    .order('created_at');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay reportes pendientes.</p>';
    return;
  }

  container.innerHTML = data.map(r => {
    const review = r.provider_reviews;
    if (!review) return ''; // la reseña ya fue borrada por otro medio
    return `
      <div class="provider-catalog-row">
        <div class="provider-catalog-row-info">
          <h5>${ST.escapeHtml(review.providers?.business_name) || '(proveedor eliminado)'}</h5>
          <span style="display:block;">
            <strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
            ${review.comment ? `<br>"${ST.escapeHtml(review.comment)}"` : ''}
            <br><span style="color:var(--text-muted); font-size:0.75rem;">Reportada ${formatDateTime(r.created_at)}${r.reason ? ` · Motivo: ${ST.escapeHtml(r.reason)}` : ''}</span>
          </span>
        </div>
        <div class="provider-catalog-row-controls">
          <button class="btn-remove-item" title="Eliminar la reseña" onclick="window.nexoBraApp.deleteReportedReview(${ST.escAttr(review.id)}, ${ST.escAttr(r.id)})">🗑️ Eliminar reseña</button>
          <button class="btn-action-drawer btn-copy" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.dismissReviewReport(${ST.escAttr(r.id)})">Descartar reporte</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function deleteReportedReview(reviewId, reportId) {
  if (!confirm('¿Eliminar esta reseña? No se puede deshacer.')) return;
  const { error } = await ST.supabaseClient.from('provider_reviews').delete().eq('id', reviewId);
  if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
  await ST.supabaseClient.from('review_reports').update({ status: 'reviewed' }).eq('id', reportId);
  ST.showToast('Reseña eliminada.');
  loadReportedReviews();
  loadPendingCount();
}

export async function dismissReviewReport(reportId) {
  const { error } = await ST.supabaseClient.from('review_reports').update({ status: 'reviewed' }).eq('id', reportId);
  if (error) { ST.showToast('No se pudo descartar: ' + error.message); return; }
  ST.showToast('Reporte descartado.');
  loadReportedReviews();
  loadPendingCount();
}

// ============================================================
// GESTIONAR PROVEEDORES -- el admin puede crear un proveedor "de arriendo"
// desde cero (datos, sucursal con mapa, precios), administrar el catálogo
// de cualquier proveedor existente, y transferirlo a un dueño real por
// email. Todo lo que carga el admin acá entra directo como 'approved' (no
// tiene sentido que el admin se autoapruebe en la cola de F3/F4) -- eso es
// justamente lo que lo diferencia de la carga de autoservicio en provider.js
// (que ahí sí, intencionalmente, queda 'pending').
//
// Nota de diseño: guardar el formulario de esta sección SIEMPRE deja al
// proveedor en verification_status='approved' (crear o editar), porque el
// admin está gestionando la ficha a mano. Si querés revisar highlighted
// proveedores de autoservicio (los que se dieron de alta ellos mismos),
// esa cola sigue siendo la sección "Proveedores pendientes de aprobación"
// de más abajo -- esta sección es para las fichas que EL ADMIN maneja.
// ============================================================

export async function loadAdminProviderList() {
  const container = document.getElementById('admin-prov-manage-list');
  if (!container) return;
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('providers')
    .select('id, business_name, verification_status, owner_id, created_at, provider_branches(name, locality)')
    .order('business_name');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  adminState.manageProviders = data || [];
  renderAdminProviderList();
}

function renderAdminProviderList() {
  const container = document.getElementById('admin-prov-manage-list');
  if (!container) return;
  const searchEl = document.getElementById('admin-prov-manage-search');
  const query = ST.normalizeText((searchEl?.value || '').trim());

  const filtered = query
    ? adminState.manageProviders.filter(p => ST.normalizeText(p.business_name).includes(query))
    : adminState.manageProviders;

  if (filtered.length === 0) {
    container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">${adminState.manageProviders.length === 0 ? 'Todavía no hay proveedores cargados.' : 'Sin resultados para esa búsqueda.'}</p>`;
    return;
  }

  const statusLabel = { approved: '✓ Aprobado', pending: '⏳ Pendiente', rejected: '✕ Rechazado' };

  container.innerHTML = filtered.map(p => {
    const branch = p.provider_branches?.[0];
    return `
      <div class="computation-row">
        <div class="computation-row-info">
          <h4>${ST.escapeHtml(p.business_name)}</h4>
          <span>${branch ? `${ST.escapeHtml(branch.name)}, ${ST.escapeHtml(branch.locality)}` : 'Sin sucursal cargada'} · ${statusLabel[p.verification_status] || p.verification_status} · ${p.owner_id ? 'Con dueño propio' : 'Sin dueño (lo administrás vos)'}</span>
        </div>
        <div class="computation-row-actions">
          <button onclick="window.nexoBraApp.openAdminProviderEditor(${ST.escAttr(p.id)})">Administrar</button>
        </div>
      </div>
    `;
  }).join('');
}

let adminBranchLocationMap = null;
let adminBranchLocationMarker = null;

/** Mismo patrón que initBranchLocationMap() en provider.js, pero con ids
 * propios (admin-branch-location-map) para no chocar con el mapa de "Mi
 * Proveedor" -- los dos formularios conviven en el mismo documento. */
function initAdminBranchLocationMap(initialLat, initialLng) {
  const lat = initialLat || -27.4864; // Oberá, Misiones -- punto de partida
  const lng = initialLng || -55.1199;
  const zoom = initialLat ? 15 : 12;

  if (!adminBranchLocationMap) {
    adminBranchLocationMap = L.map('admin-branch-location-map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(adminBranchLocationMap);

    adminBranchLocationMarker = L.marker([lat, lng], { draggable: true }).addTo(adminBranchLocationMap);

    adminBranchLocationMarker.on('dragend', () => {
      const pos = adminBranchLocationMarker.getLatLng();
      setAdminBranchLatLng(pos.lat, pos.lng);
    });

    adminBranchLocationMap.on('click', (e) => {
      adminBranchLocationMarker.setLatLng(e.latlng);
      setAdminBranchLatLng(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => adminBranchLocationMap.invalidateSize(), 50);
  } else {
    setTimeout(() => adminBranchLocationMap.invalidateSize(), 50);
    adminBranchLocationMap.setView([lat, lng], zoom);
    adminBranchLocationMarker.setLatLng([lat, lng]);
  }

  if (initialLat && initialLng) {
    setAdminBranchLatLng(initialLat, initialLng);
  }
}

function setAdminBranchLatLng(lat, lng) {
  document.getElementById('admin-branch-lat').value = lat.toFixed(6);
  document.getElementById('admin-branch-lng').value = lng.toFixed(6);
  const statusEl = document.getElementById('admin-branch-location-status');
  if (statusEl) statusEl.textContent = 'Ubicación marcada. Arrastrá el pin si no quedó exacta.';
}

export async function geocodeAdminBranchAddress() {
  const address = document.getElementById('admin-branch-address').value.trim();
  const locality = document.getElementById('admin-branch-locality').value.trim();
  const province = document.getElementById('admin-branch-province').value.trim();
  const statusEl = document.getElementById('admin-branch-location-status');

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
    adminBranchLocationMap.setView([lat, lon], 16);
    adminBranchLocationMarker.setLatLng([lat, lon]);
    setAdminBranchLatLng(parseFloat(lat), parseFloat(lon));
  } catch (err) {
    statusEl.textContent = 'No se pudo buscar en este momento. Marcá el lugar directo en el mapa de abajo.';
  }
}

let adminCategoryOptionsCache = null;

async function loadAdminProviderCategoryOptions() {
  const select = document.getElementById('admin-prov-category');
  if (!select) return;
  if (!adminCategoryOptionsCache) {
    const { data } = await ST.supabaseClient
      .from('provider_categories')
      .select('id, name, kind')
      .eq('active', true)
      .order('name');
    adminCategoryOptionsCache = data || [];
  }

  const materiales = adminCategoryOptionsCache.filter(c => c.kind === 'materials');
  const servicios = adminCategoryOptionsCache.filter(c => c.kind === 'services');

  select.innerHTML = `
    <option value="">Elegí el rubro...</option>
    <optgroup label="Vende materiales">
      ${materiales.map(c => `<option value="${c.id}">${ST.escapeHtml(c.name)}</option>`).join('')}
    </optgroup>
    <optgroup label="Ofrece un servicio profesional">
      ${servicios.map(c => `<option value="${c.id}">${ST.escapeHtml(c.name)}</option>`).join('')}
    </optgroup>
  `;
}

/** Abre el editor para un proveedor existente (providerId) o, si es null,
 * lo deja en blanco para cargar uno nuevo desde cero. */
export async function openAdminProviderEditor(providerId) {
  document.getElementById('admin-prov-manage-picker').style.display = 'none';
  const editor = document.getElementById('admin-prov-manage-editor');
  editor.style.display = 'block';
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await loadAdminProviderCategoryOptions();

  const form = document.getElementById('admin-prov-manage-form');
  form.reset();
  document.getElementById('admin-branch-lat').value = '';
  document.getElementById('admin-branch-lng').value = '';
  document.getElementById('admin-prov-profile-status').textContent = '';
  document.getElementById('admin-prov-manage-status-banner').style.display = 'none';

  if (!providerId) {
    adminState.manageSelectedProvider = null;
    adminState.manageSelectedBranch = null;
    document.getElementById('admin-prov-owner-info').textContent = 'Guardá primero los datos comerciales -- una vez creado el proveedor vas a poder transferirlo, cargarle palabras clave y precios.';
    document.getElementById('admin-prov-transfer-email').closest('div').style.display = 'none';
    document.getElementById('admin-prov-keywords-list').innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
    document.getElementById('admin-prov-catalog-list').innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
    document.getElementById('admin-prov-announcements-list').innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
    document.getElementById('admin-prov-announcement-message').value = '';
    document.getElementById('admin-prov-announcement-expires').value = '';
    document.getElementById('admin-prov-add-results').innerHTML = '';
    document.getElementById('admin-prov-add-search').value = '';
    initAdminBranchLocationMap(null, null);
    return;
  }

  const { data: provider, error } = await ST.supabaseClient
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .single();

  if (error) {
    ST.showToast('No se pudo cargar el proveedor: ' + error.message);
    closeAdminProviderEditor();
    return;
  }

  adminState.manageSelectedProvider = provider;

  document.getElementById('admin-prov-business-name').value = provider.business_name || '';
  document.getElementById('admin-prov-category').value = provider.category_id || '';
  document.getElementById('admin-prov-tax-id').value = provider.tax_id || '';
  document.getElementById('admin-prov-matricula').value = provider.matricula || '';
  document.getElementById('admin-prov-website').value = provider.website_url || '';
  document.getElementById('admin-prov-contact-phone').value = provider.contact_phone || '';
  document.getElementById('admin-prov-contact-email').value = provider.contact_email || '';
  document.getElementById('admin-prov-description').value = provider.description || '';

  document.getElementById('admin-prov-transfer-email').closest('div').style.display = 'flex';
  document.getElementById('admin-prov-owner-info').textContent = provider.owner_id
    ? 'Este proveedor ya tiene un dueño propio con su propia cuenta.'
    : 'Sin dueño propio todavía -- lo estás administrando vos desde acá.';

  const { data: branch } = await ST.supabaseClient
    .from('provider_branches')
    .select('*')
    .eq('provider_id', provider.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  adminState.manageSelectedBranch = branch || null;

  if (branch) {
    document.getElementById('admin-branch-name').value = branch.name || '';
    document.getElementById('admin-branch-locality').value = branch.locality || '';
    document.getElementById('admin-branch-province').value = branch.province || '';
    document.getElementById('admin-branch-address').value = branch.address || '';
    document.getElementById('admin-branch-whatsapp').value = branch.whatsapp_phone || '';
    document.getElementById('admin-branch-delivery-radius').value = branch.delivery_radius_km || '';
    document.getElementById('admin-branch-lat').value = branch.latitude ?? '';
    document.getElementById('admin-branch-lng').value = branch.longitude ?? '';
    document.getElementById('admin-branch-delivery-available').checked = !!branch.delivery_available;
  }
  initAdminBranchLocationMap(branch?.latitude, branch?.longitude);

  document.getElementById('admin-prov-add-search').value = '';
  document.getElementById('admin-prov-add-results').innerHTML = '';
  await loadAdminProviderKeywords();
  await loadAdminProviderCatalog();
  await loadAdminProviderAnnouncements();
}

export function closeAdminProviderEditor() {
  document.getElementById('admin-prov-manage-editor').style.display = 'none';
  document.getElementById('admin-prov-manage-picker').style.display = 'block';
  adminState.manageSelectedProvider = null;
  adminState.manageSelectedBranch = null;
  loadAdminProviderList();
}

export async function handleAdminProviderProfileSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-admin-save-prov-profile');
  const statusEl = document.getElementById('admin-prov-profile-status');
  btn.disabled = true;
  statusEl.textContent = 'Guardando...';

  try {
    const providerPayload = {
      business_name: document.getElementById('admin-prov-business-name').value.trim(),
      category_id: document.getElementById('admin-prov-category').value || null,
      tax_id: document.getElementById('admin-prov-tax-id').value.trim() || null,
      matricula: document.getElementById('admin-prov-matricula').value.trim() || null,
      website_url: document.getElementById('admin-prov-website').value.trim() || null,
      contact_phone: document.getElementById('admin-prov-contact-phone').value.trim() || null,
      contact_email: document.getElementById('admin-prov-contact-email').value.trim() || null,
      description: document.getElementById('admin-prov-description').value.trim() || null,
      active: true,
      // El admin gestiona esta ficha a mano -- entra/queda aprobada directo,
      // sin pasar por la cola de F3 (esa es para las altas de autoservicio).
      verification_status: 'approved',
      rejection_reason: null
    };

    let provider = adminState.manageSelectedProvider;
    if (provider) {
      const { error } = await ST.supabaseClient.from('providers').update(providerPayload).eq('id', provider.id);
      if (error) throw error;
      provider = { ...provider, ...providerPayload };
    } else {
      // owner_id null a propósito: es un proveedor "de arriendo", todavía sin
      // dueño real -- se le asigna uno más adelante con "Transferir proveedor".
      const { data, error } = await ST.supabaseClient.from('providers').insert({ ...providerPayload, owner_id: null }).select('*').single();
      if (error) throw error;
      provider = data;
      ST.showToast('Proveedor creado y aprobado. Ya podés cargarle precios.');
    }
    adminState.manageSelectedProvider = provider;

    const branchPayload = {
      provider_id: provider.id,
      name: document.getElementById('admin-branch-name').value.trim(),
      locality: document.getElementById('admin-branch-locality').value.trim(),
      province: document.getElementById('admin-branch-province').value.trim() || null,
      address: document.getElementById('admin-branch-address').value.trim() || null,
      whatsapp_phone: document.getElementById('admin-branch-whatsapp').value.trim() || null,
      delivery_radius_km: parseFloat(document.getElementById('admin-branch-delivery-radius').value) || null,
      latitude: parseFloat(document.getElementById('admin-branch-lat').value) || null,
      longitude: parseFloat(document.getElementById('admin-branch-lng').value) || null,
      delivery_available: document.getElementById('admin-branch-delivery-available').checked,
      active: true
    };

    let branch = adminState.manageSelectedBranch;
    if (branch) {
      const { error } = await ST.supabaseClient.from('provider_branches').update(branchPayload).eq('id', branch.id);
      if (error) throw error;
      branch = { ...branch, ...branchPayload };
    } else {
      const { data, error } = await ST.supabaseClient.from('provider_branches').insert(branchPayload).select('*').single();
      if (error) throw error;
      branch = data;
    }
    adminState.manageSelectedBranch = branch;

    statusEl.textContent = '✓ Guardado';
    ST.showToast('Datos comerciales guardados.');

    document.getElementById('admin-prov-transfer-email').closest('div').style.display = 'flex';
    document.getElementById('admin-prov-owner-info').textContent = provider.owner_id
      ? 'Este proveedor ya tiene un dueño propio con su propia cuenta.'
      : 'Sin dueño propio todavía -- lo estás administrando vos desde acá.';

    loadAdminProviderKeywords();
    loadAdminProviderCatalog();
    loadPendingCount();
  } catch (err) {
    statusEl.textContent = '';
    ST.showToast('No se pudo guardar: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

export async function transferAdminProvider() {
  const provider = adminState.manageSelectedProvider;
  if (!provider) return;
  const emailInput = document.getElementById('admin-prov-transfer-email');
  const email = emailInput.value.trim();
  if (!email) {
    ST.showToast('Escribí el email con el que se registró (o se va a registrar) el dueño real.');
    return;
  }
  if (!confirm(`¿Transferir "${provider.business_name}" a la cuenta de ${email}? Esa persona pasa a administrar el proveedor con el catálogo ya cargado.`)) return;

  const { error } = await ST.supabaseClient.rpc('admin_transfer_provider_ownership', {
    p_provider_id: provider.id,
    p_email: email
  });

  if (error) {
    ST.showToast(error.message);
    return;
  }
  ST.showToast(`Proveedor transferido a ${email}.`);
  emailInput.value = '';
  openAdminProviderEditor(provider.id);
}

// --- Catálogo del proveedor seleccionado ---

export function renderAdminProviderAddResults() {
  const searchInput = document.getElementById('admin-prov-add-search');
  const resultsEl = document.getElementById('admin-prov-add-results');
  const query = searchInput.value.trim();
  if (query.length < 2) {
    resultsEl.innerHTML = '';
    return;
  }
  const results = Provider.searchMaterialsSimple(query);
  const proponerBtn = `
    <button class="btn-choose-provider" style="margin-top: 10px;" onclick="window.nexoBraApp.openNewMaterialForm(${ST.escAttr(query)})">
      ➕ ¿No lo encontrás? Proponer "${query}" como material nuevo
    </button>
  `;
  if (results.length === 0) {
    resultsEl.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">Sin resultados.</p>${proponerBtn}`;
    return;
  }
  resultsEl.innerHTML = results.map(item => `
    <div class="provider-search-row">
      <div class="provider-search-row-info">
        <strong>${ST.escapeHtml(item.denominacion)}</strong><br>
        <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro}</span>
      </div>
      <div class="provider-search-row-controls">
        <input type="text" id="admin-prov-sku-${item.id}" placeholder="SKU (opcional)">
        <input type="text" id="admin-prov-brand-${item.id}" placeholder="Marca (opcional)" maxlength="40">
        <select id="admin-prov-unit-${item.id}">
          <option value="venta">Por ${item.unidadVenta} (compra)</option>
          <option value="computo">Por ${item.unidadComputo} (cómputo)</option>
        </select>
        <input type="number" id="admin-prov-price-${item.id}" placeholder="Precio" min="0" step="0.01">
        <select id="admin-prov-stock-${item.id}">
          <option value="en_stock">En stock</option>
          <option value="a_pedido">A pedido</option>
          <option value="agotado">Agotado</option>
        </select>
        <button class="btn-computo" style="padding: 6px 12px; font-size: 0.78rem;" onclick="window.nexoBraApp.addAdminOfferFromSearch('${item.id}')">Agregar</button>
      </div>
    </div>
  `).join('') + proponerBtn;
}

export async function addAdminOfferFromSearch(materialId) {
  const branch = adminState.manageSelectedBranch;
  if (!branch) {
    ST.showToast('Primero guardá los datos comerciales (sucursal) arriba.');
    return;
  }
  const material = NEXOBRA_DATA.find(m => m.id === materialId);
  const price = parseFloat(document.getElementById(`admin-prov-price-${materialId}`).value);
  if (!price || price <= 0) {
    ST.showToast('Ingresá un precio válido.');
    return;
  }
  const sku = document.getElementById(`admin-prov-sku-${materialId}`).value.trim() || null;
  const brand = document.getElementById(`admin-prov-brand-${materialId}`).value.trim() || null;
  const stock = document.getElementById(`admin-prov-stock-${materialId}`).value;
  const unitMode = document.getElementById(`admin-prov-unit-${materialId}`).value;

  const { error } = await ST.supabaseClient.from('provider_offers').insert({
    branch_id: branch.id,
    material_id: materialId,
    price_kind: unitMode === 'venta' ? 'sale' : 'measurement',
    amount: price,
    unit: unitMode === 'venta' ? material.unidadVenta : material.unidadComputo,
    provider_sku: sku,
    brand: brand,
    stock_status: stock,
    // Carga hecha por el admin -- entra aprobada directo, no pendiente.
    status: 'approved',
    approved_at: new Date().toISOString(),
    reported_at: new Date().toISOString()
  });

  if (error) {
    ST.showToast('No se pudo agregar: ' + error.message);
    return;
  }
  ST.showToast(`Agregado: ${material.denominacion.substring(0, 30)}`);
  document.getElementById('admin-prov-add-search').value = '';
  document.getElementById('admin-prov-add-results').innerHTML = '';
  loadAdminProviderCatalog();
}

export async function loadAdminProviderCatalog() {
  const container = document.getElementById('admin-prov-catalog-list');
  const branch = adminState.manageSelectedBranch;
  if (!branch) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero los datos comerciales para empezar a cargar el catálogo.</p>';
    return;
  }
  const { data, error } = await ST.supabaseClient
    .from('provider_offers')
    .select('id, amount, unit, provider_sku, brand, stock_status, status, rejection_reason, materials(id, denomination)')
    .eq('branch_id', branch.id)
    .order('reported_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">Error: ${error.message}</p>`;
    return;
  }
  renderAdminProviderCatalog(data || []);
}

function renderAdminProviderCatalog(offers) {
  const container = document.getElementById('admin-prov-catalog-list');
  if (offers.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no se cargó ningún material.</p>';
    return;
  }
  container.innerHTML = offers.map(offer => `
    <div class="provider-catalog-row">
      <div class="provider-catalog-row-info">
        <h5>${ST.escapeHtml(offer.materials?.denomination) || '(material eliminado)'}</h5>
        <span>${offer.brand ? `<strong>${ST.escapeHtml(offer.brand)}</strong> · ` : ''}${offer.provider_sku ? `SKU: ${ST.escapeHtml(offer.provider_sku)} · ` : ''}${offer.unit}</span>
        ${offer.status === 'pending' ? '<br><span style="font-size:0.7rem; font-weight:700; color:#b45309;">⏳ Pendiente de aprobación</span>' : ''}
        ${offer.status === 'rejected' ? `<br><span style="font-size:0.7rem; font-weight:700; color:#b91c1c;">✕ Rechazado${offer.rejection_reason ? ': ' + ST.escapeHtml(offer.rejection_reason) : ''}</span>` : ''}
      </div>
      <div class="provider-catalog-row-controls">
        <span class="stock-badge ${offer.stock_status}">${offer.stock_status === 'en_stock' ? 'En stock' : offer.stock_status === 'a_pedido' ? 'A pedido' : 'Agotado'}</span>
        <select onchange="window.nexoBraApp.updateAdminOfferStock('${offer.id}', this.value)">
          <option value="en_stock" ${offer.stock_status === 'en_stock' ? 'selected' : ''}>En stock</option>
          <option value="a_pedido" ${offer.stock_status === 'a_pedido' ? 'selected' : ''}>A pedido</option>
          <option value="agotado" ${offer.stock_status === 'agotado' ? 'selected' : ''}>Agotado</option>
        </select>
        <input type="number" value="${offer.amount}" min="0" step="0.01" onchange="window.nexoBraApp.updateAdminOfferPrice('${offer.id}', parseFloat(this.value))">
        <button class="btn-remove-item" onclick="window.nexoBraApp.deleteAdminOffer('${offer.id}')" title="Eliminar">&times;</button>
      </div>
    </div>
  `).join('');
}

export async function updateAdminOfferPrice(offerId, newAmount) {
  if (!newAmount || newAmount <= 0) return;
  // A diferencia de updateOfferPrice() en provider.js, esto NO vuelve a
  // 'pending' -- es el admin editando su propia carga, ya queda aprobado.
  const { error } = await ST.supabaseClient.from('provider_offers').update({ amount: newAmount, status: 'approved' }).eq('id', offerId);
  if (error) { ST.showToast('No se pudo actualizar: ' + error.message); return; }
  ST.showToast('Precio actualizado.');
  loadAdminProviderCatalog();
}

export async function updateAdminOfferStock(offerId, newStatus) {
  const { error } = await ST.supabaseClient.from('provider_offers').update({ stock_status: newStatus }).eq('id', offerId);
  if (error) { ST.showToast('No se pudo actualizar: ' + error.message); return; }
  ST.showToast('Stock actualizado.');
}

export async function deleteAdminOffer(offerId) {
  if (!confirm('¿Eliminar este material del catálogo?')) return;
  const { error } = await ST.supabaseClient.from('provider_offers').delete().eq('id', offerId);
  if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
  ST.showToast('Eliminado.');
  loadAdminProviderCatalog();
}

// --- Palabras clave del proveedor seleccionado ---

export async function loadAdminProviderKeywords() {
  const container = document.getElementById('admin-prov-keywords-list');
  const provider = adminState.manageSelectedProvider;
  if (!container || !provider) return;

  const { data, error } = await ST.supabaseClient
    .from('provider_keywords')
    .select('id, keyword')
    .eq('provider_id', provider.id)
    .order('created_at');

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Todavía no se cargó ninguna.</p>';
    return;
  }
  container.innerHTML = data.map(k => `
    <span class="provider-keyword-chip">
      ${ST.escapeHtml(k.keyword)}
      <button type="button" onclick="window.nexoBraApp.removeAdminProviderKeyword('${k.id}')" title="Quitar">&times;</button>
    </span>
  `).join('');
}

export async function addAdminProviderKeyword() {
  const provider = adminState.manageSelectedProvider;
  if (!provider) {
    ST.showToast('Primero guardá los datos comerciales arriba.');
    return;
  }
  const input = document.getElementById('admin-prov-keyword-input');
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
    provider_id: provider.id,
    keyword
  });

  if (error) {
    if (error.code === '23505') {
      ST.showToast('Ya está cargada esa palabra clave.');
    } else {
      ST.showToast('No se pudo agregar: ' + error.message);
    }
    return;
  }
  input.value = '';
  loadAdminProviderKeywords();
}

export async function removeAdminProviderKeyword(keywordId) {
  const { error } = await ST.supabaseClient.from('provider_keywords').delete().eq('id', keywordId);
  if (error) { ST.showToast('No se pudo quitar: ' + error.message); return; }
  loadAdminProviderKeywords();
}

// --- Anuncios / promos del proveedor seleccionado ---
// Mismo mecanismo que provider.js (loadProviderAnnouncements/etc.), pero
// apuntando a la sucursal que eligió el admin en vez de la del usuario
// logueado -- ver comentario general al principio de esta sección sobre
// por qué se escribe en paralelo en vez de reusar directo.

export async function loadAdminProviderAnnouncements() {
  const container = document.getElementById('admin-prov-announcements-list');
  const branch = adminState.manageSelectedBranch;
  if (!container) return;
  if (!branch) {
    container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
    return;
  }
  const dateInput = document.getElementById('admin-prov-announcement-expires');
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  const { data, error } = await ST.supabaseClient
    .from('provider_announcements')
    .select('id, message, expires_at, created_at')
    .eq('branch_id', branch.id)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
    return;
  }
  renderAdminProviderAnnouncements(data || []);
}

function renderAdminProviderAnnouncements(list) {
  const container = document.getElementById('admin-prov-announcements-list');
  if (list.length === 0) {
    container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Todavía no se publicó ningún anuncio.</p>';
    return;
  }
  const now = Date.now();
  container.innerHTML = list.map(a => {
    const vencido = new Date(a.expires_at).getTime() <= now;
    const diasRestantes = Math.ceil((new Date(a.expires_at).getTime() - now) / 86400000);
    return `
      <div class="provider-catalog-row">
        <div class="provider-catalog-row-info">
          <h5>📢 ${ST.escapeHtml(a.message)}</h5>
          <span>${vencido ? '<span style="color:var(--text-subtle);">Venció el ' + new Date(a.expires_at).toLocaleDateString('es-AR') + '</span>' : `Visible hasta el ${new Date(a.expires_at).toLocaleDateString('es-AR')} (${diasRestantes} día${diasRestantes === 1 ? '' : 's'})`}</span>
        </div>
        <div class="provider-catalog-row-controls">
          <button class="btn-remove-item" onclick="window.nexoBraApp.deleteAdminProviderAnnouncement('${a.id}')" title="Eliminar">&times;</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function addAdminProviderAnnouncement() {
  const branch = adminState.manageSelectedBranch;
  if (!branch) {
    ST.showToast('Primero guardá los datos comerciales arriba.');
    return;
  }
  const messageInput = document.getElementById('admin-prov-announcement-message');
  const dateInput = document.getElementById('admin-prov-announcement-expires');
  const message = messageInput.value.trim();
  const dateValue = dateInput.value;

  if (message.length < 3 || message.length > 140) {
    ST.showToast('El anuncio tiene que tener entre 3 y 140 caracteres.');
    return;
  }
  if (!dateValue) {
    ST.showToast('Elegí hasta cuándo querés que se vea el anuncio.');
    return;
  }
  const expiresAt = new Date(dateValue + 'T23:59:59');
  if (expiresAt.getTime() <= Date.now()) {
    ST.showToast('La fecha tiene que ser futura.');
    return;
  }

  const { error } = await ST.supabaseClient.from('provider_announcements').insert({
    branch_id: branch.id,
    message,
    expires_at: expiresAt.toISOString()
  });

  if (error) {
    ST.showToast('No se pudo publicar: ' + error.message);
    return;
  }
  ST.showToast('Anuncio publicado.');
  messageInput.value = '';
  dateInput.value = '';
  loadAdminProviderAnnouncements();
}

export async function deleteAdminProviderAnnouncement(id) {
  if (!confirm('¿Eliminar este anuncio?')) return;
  const { error } = await ST.supabaseClient.from('provider_announcements').delete().eq('id', id);
  if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
  loadAdminProviderAnnouncements();
}
