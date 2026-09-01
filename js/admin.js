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
  reviewingProvider: null
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
        <strong>${item.denominacion}</strong><br>
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
        <strong>${item.denomination}</strong>${item.active === false ? ' <span style="color:#b91c1c; font-size:0.72rem; font-weight:700;">(inactivo)</span>' : ''}<br>
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
      active: document.getElementById('admin-edit-active').checked
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
          <h4>${p.business_name}</h4>
          <span>${branch ? `${branch.name}, ${branch.locality}` : 'Sin sucursal cargada'} · Cargado el ${formatDateTime(p.created_at)}</span>
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
    <h4 style="margin-bottom:10px;">🏪 ${provider.business_name}</h4>
    <div class="excel-config-grid" style="margin-bottom:14px;">
      <div><strong>CUIT:</strong> ${provider.tax_id || 's/d'}</div>
      <div><strong>Sitio web:</strong> ${provider.website_url ? `<a href="${provider.website_url}" target="_blank">${provider.website_url}</a>` : 's/d'}</div>
      <div><strong>Teléfono:</strong> ${provider.contact_phone || 's/d'}</div>
      <div><strong>Email:</strong> ${provider.contact_email || 's/d'}</div>
      <div style="grid-column: 1 / -1;"><strong>Descripción:</strong> ${provider.description || 's/d'}</div>
    </div>
    ${branch ? `
      <h5 style="margin-bottom:8px;">Sucursal</h5>
      <div class="excel-config-grid" style="margin-bottom:14px;">
        <div><strong>Nombre:</strong> ${branch.name}</div>
        <div><strong>Localidad:</strong> ${branch.locality}, ${branch.province || ''}</div>
        <div><strong>Dirección:</strong> ${branch.address || 's/d'}</div>
        <div><strong>WhatsApp:</strong> ${branch.whatsapp_phone || 's/d'}</div>
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
}

export async function rejectProvider(id) {
  const motivo = prompt('¿Por qué rechazás este proveedor? (se lo va a mostrar a la persona en su panel)');
  if (motivo === null) return; // canceló
  const { error } = await ST.supabaseClient.from('providers').update({ verification_status: 'rejected', rejection_reason: motivo || null }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Proveedor rechazado.');
  closeProviderReview();
  loadPendingProviders();
}

// ============================================================
// F4 — Agenda de precios pendientes (por proveedor)
// ============================================================

export async function loadPendingOffers() {
  const container = document.getElementById('admin-pending-offers');
  container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

  const { data, error } = await ST.supabaseClient
    .from('provider_offers')
    .select('id, amount, unit, provider_sku, stock_status, reported_at, materials(denomination), provider_branches(name, locality, providers(business_name))')
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
          <h4>🏪 ${g.businessName} — ${g.branchName || ''} (${g.locality || ''})</h4>
          <span style="font-size:0.75rem; color:var(--text-muted);">${g.offers.length} pendiente${g.offers.length === 1 ? '' : 's'}</span>
        </div>
        <div class="provider-group-body">
          ${g.offers.map(offer => `
            <div class="provider-catalog-row">
              <div class="provider-catalog-row-info">
                <h5>${offer.materials?.denomination || '(material eliminado)'}</h5>
                <span>${offer.provider_sku ? `SKU: ${offer.provider_sku} · ` : ''}${ST.formatMoney(offer.amount)} / ${offer.unit} · ${offer.stock_status} · cargado ${formatDateTime(offer.reported_at)}</span>
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
}

export async function rejectOffer(id) {
  const motivo = prompt('¿Por qué rechazás este precio? (se lo va a mostrar al proveedor en su catálogo)');
  if (motivo === null) return; // canceló
  const { error } = await ST.supabaseClient.from('provider_offers').update({ status: 'rejected', rejection_reason: motivo || null }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Precio rechazado.');
  loadPendingOffers();
}

// ============================================================
// Índices (IPC y Mano de Obra): cargar valores nuevos sin depender
// de que yo te arme una migración SQL cada vez. Las dos series viven
// en la misma tabla (index_values, ligada a index_series), así que
// una sola sección de admin sirve para ambas.
// ============================================================

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
      { index_series_id: seriesId, reference_month: referenceMonth, value, is_published: true },
      { onConflict: 'index_series_id,reference_month' }
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
    .eq('index_series_id', seriesId)
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
}

export function loadAdminPanel() {
  loadMaterialsBrowse(true);
  loadPendingProviders();
  loadPendingOffers();
  loadIndexSeriesOptions();
}
