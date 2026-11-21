// NEXOBRA - admin.js
// Panel de administración (Fase F): editor de materiales, aprobación de
// proveedores y agenda de precios pendientes. Todo gated a role='admin' --
// nadie puede autoasignarse ese rol desde la web (ver 001_initial_schema.sql
// y el trigger de registro), solo se activa a mano por SQL.

import * as ST from './state.js';
import * as Provider from './provider.js';
import * as Apu from './apu.js';

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
 ${provider.logo_url ? `<img src="${ST.escapeHtml(provider.logo_url)}" class="provider-logo-mini" alt="">` : ''}
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
 <h4> ${ST.escapeHtml(g.businessName)} — ${ST.escapeHtml(g.branchName) || ''} (${ST.escapeHtml(g.locality) || ''})</h4>
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
 sale_amount: r[1] !== undefined && r[1] !== '' ? ST.parseLocaleNumber(r[1]) : null,
 measurement_amount: r[2] !== undefined && r[2] !== '' ? ST.parseLocaleNumber(r[2]) : null
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
 `<option value="${s.id}">${s.applies_to === 'labor' ? ' UOCRA' : ' IPC'} — ${s.name}</option>`
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
 document.querySelectorAll('[data-admin-go]').forEach(btn => btn.addEventListener('click', () => goToAdminPage(btn.dataset.adminGo)));
 if (!ST.supabaseClient) return;
 setupAdminDashboardListeners();
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
 const btnSurveyCopy = document.getElementById('btn-admin-survey-copy');
 if (btnSurveyCopy) btnSurveyCopy.addEventListener('click', copySurveyRequest);
 const btnSurveyXlsx = document.getElementById('btn-admin-survey-xlsx');
 if (btnSurveyXlsx) btnSurveyXlsx.addEventListener('click', downloadSurveyXlsx);
 const btnSurveyRefresh = document.getElementById('btn-admin-survey-refresh');
 if (btnSurveyRefresh) btnSurveyRefresh.addEventListener('click', loadAdminSurvey);
 const surveySearch = document.getElementById('admin-survey-search');
 if (surveySearch) surveySearch.addEventListener('input', renderSurveySearch);
 const btnSurveyLoad = document.getElementById('btn-admin-survey-load');
 if (btnSurveyLoad) btnSurveyLoad.addEventListener('click', loadSurveyEntry);
 const btnSurveySave = document.getElementById('btn-admin-survey-save');
 if (btnSurveySave) btnSurveySave.addEventListener('click', saveSurveyEntry);
 const surveyDate = document.getElementById('admin-survey-date');
 if (surveyDate && !surveyDate.value) surveyDate.value = new Date().toISOString().slice(0, 10);
 const btnAdminDiagnostics = document.getElementById('btn-admin-diagnostics');
 if (btnAdminDiagnostics) btnAdminDiagnostics.addEventListener('click', runAdminDiagnostics);
 const adminProvExcelInput = document.getElementById('admin-prov-excel-input');
 if (adminProvExcelInput) adminProvExcelInput.addEventListener('change', (e) => { if (e.target.files[0]) handleAdminProvExcelFile(e.target.files[0]); });
 const btnAdminProvExcelConfirm = document.getElementById('btn-admin-prov-excel-confirm');
 if (btnAdminProvExcelConfirm) btnAdminProvExcelConfirm.addEventListener('click', confirmAdminProvExcel);
 const btnAdminProvExcelTemplate = document.getElementById('btn-admin-prov-excel-template');
 if (btnAdminProvExcelTemplate) btnAdminProvExcelTemplate.addEventListener('click', () => Provider.generateProviderTemplate());
 if (btnProvNew) btnProvNew.addEventListener('click', () => openAdminProviderEditor(null));
 if (btnProvBack) btnProvBack.addEventListener('click', closeAdminProviderEditor);
 if (provManageForm) provManageForm.addEventListener('submit', handleAdminProviderProfileSubmit);
 if (btnGeocodeAdmin) btnGeocodeAdmin.addEventListener('click', (e) => { e.preventDefault(); geocodeAdminBranchAddress(); });
 if (btnProvTransfer) btnProvTransfer.addEventListener('click', transferAdminProvider);
 if (provAddSearch) provAddSearch.addEventListener('input', renderAdminProviderAddResults);
 if (btnAddProvKeyword) btnAddProvKeyword.addEventListener('click', addAdminProviderKeyword);

 const btnAddProvAnnouncement = document.getElementById('btn-admin-add-prov-announcement');
 if (btnAddProvAnnouncement) btnAddProvAnnouncement.addEventListener('click', addAdminProviderAnnouncement);

 const btnAddProvPhoto = document.getElementById('btn-admin-add-prov-photo');
 const provPhotoInput = document.getElementById('admin-prov-photo-input');
 if (btnAddProvPhoto && provPhotoInput) {
 btnAddProvPhoto.addEventListener('click', () => provPhotoInput.click());
 provPhotoInput.addEventListener('change', handleAdminProviderPhotoFileChange);
 }

 const provLogoInput = document.getElementById('admin-prov-logo-input');
 if (provLogoInput) provLogoInput.addEventListener('change', (e) => {
 if (e.target.files[0]) uploadAdminProviderLogo(e.target.files[0]);
 });

 const btnCopyAdminProviderLink = document.getElementById('btn-admin-copy-provider-link');
 if (btnCopyAdminProviderLink) btnCopyAdminProviderLink.addEventListener('click', () => {
 const text = document.getElementById('admin-prov-public-link-text').textContent;
 navigator.clipboard.writeText(`https://${text}`).then(
 () =>ST.showToast('Link copiado.'),
 () =>ST.showToast('No se pudo copiar — copialo a mano: ' + text)
 );
 });
 // (22/09) Mismo botón "Compartir" que "Mi Proveedor" -- acá el admin lo usa para pasarle el link ya armado al proveedor por el medio que sea.
 const btnShareAdminProviderLink = document.getElementById('btn-admin-share-provider-link');
 if (btnShareAdminProviderLink) btnShareAdminProviderLink.addEventListener('click', () => {
 const text = document.getElementById('admin-prov-public-link-text').textContent;
 const businessName = document.getElementById('admin-prov-business-name')?.value.trim();
 ST.shareOrCopyLink(`https://${text}`, businessName ? `${businessName} | NEXOBRA` : 'NEXOBRA', 'Mirá esta ficha y su lista de precios en NEXOBRA:');
 });

 // --- Catálogo de APUs ---
 const adminApuSearch = document.getElementById('admin-apu-search');
 const btnOpenAdminApuTask = document.getElementById('btn-open-admin-apu-task');
 const adminApuTaskCloseBtn = document.getElementById('admin-apu-task-close-btn');
 const adminApuTaskBackdrop = document.getElementById('admin-apu-task-backdrop');
 const adminApuMaterialSearch = document.getElementById('admin-apu-material-search');
 const btnAdminApuAddLabor = document.getElementById('btn-admin-apu-add-labor');
 const btnAdminApuAddEquipment = document.getElementById('btn-admin-apu-add-equipment');
 const btnAdminApuSave = document.getElementById('btn-admin-apu-save');

 if (adminApuSearch) adminApuSearch.addEventListener('input', () => renderAdminApuList());
 ['admin-apu-filter-rubro', 'admin-apu-filter-estado'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.addEventListener('change', () => renderAdminApuList());
 });
 const btnRenameRubro = document.getElementById('btn-admin-apu-rename-rubro');
 if (btnRenameRubro) btnRenameRubro.addEventListener('click', () => {
 const box = document.getElementById('admin-apu-rename-box');
 if (box) box.style.display = box.style.display === 'none' ? '' : 'none';
 });
 const btnRenameConfirm = document.getElementById('btn-admin-apu-rename-confirm');
 if (btnRenameConfirm) btnRenameConfirm.addEventListener('click', renameAdminApuRubro);
 const apuImageInput = document.getElementById('admin-apu-image-input');
 if (apuImageInput) apuImageInput.addEventListener('change', handleAdminApuImageChange);
 const apuImageRemove = document.getElementById('btn-admin-apu-image-remove');
 if (apuImageRemove) apuImageRemove.addEventListener('click', removeAdminApuImage);
 ['admin-apu-desperdicio', 'admin-apu-herramientas', 'admin-apu-unidad'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.addEventListener('input', renderAdminApuPreview);
 });
 if (btnOpenAdminApuTask) btnOpenAdminApuTask.addEventListener('click', openAdminApuTaskModal);
 if (adminApuTaskCloseBtn) adminApuTaskCloseBtn.addEventListener('click', closeAdminApuTaskModal);
 if (adminApuTaskBackdrop) adminApuTaskBackdrop.addEventListener('click', closeAdminApuTaskModal);
 if (adminApuMaterialSearch) adminApuMaterialSearch.addEventListener('input', renderAdminApuMaterialResults);
 if (btnAdminApuAddLabor) btnAdminApuAddLabor.addEventListener('click', addAdminApuLaborDraft);
 if (btnAdminApuAddEquipment) btnAdminApuAddEquipment.addEventListener('click', addAdminApuEquipmentDraft);
 if (btnAdminApuSave) btnAdminApuSave.addEventListener('click', (e) => { e.preventDefault(); saveAdminApuTask(); });
}

// ============================================================
// (18/11, pedido del usuario) El panel es un menú: cada tarjeta abre una
// página con solo sus secciones (data-admin-page en index.html). La página
// va en el "#" de la dirección (/admin#tablero), así el botón "atrás" del
// navegador vuelve al menú. Cada página carga sus datos la primera vez que
// se abre (antes se cargaba todo junto al entrar al panel).
// ============================================================

const ADMIN_PAGES = {
 tablero: { title: 'Tablero del sitio', subtitle: 'Visitas, recorrido, campañas, búsquedas y diagnóstico del sitio.', load: () => { loadAdminDashboard(); } },
 pendientes: { title: 'Pendientes', subtitle: 'Lo que espera tu revisión.', load: () => { loadAdminProviderClaims(); loadPendingProviders(); loadPendingOffers(); loadReportedReviews(); } },
 indices: { title: 'Índices y precios base', subtitle: 'IPC y UOCRA del mes, y actualización de precios base.', load: () => { loadIndexSeriesOptions(); } },
 materiales: { title: 'Materiales', subtitle: 'Editor del catálogo y sugerencias técnicas.', load: () => { loadMaterialsBrowse(true); loadTechSuggestions(); } },
 proveedores: { title: 'Proveedores', subtitle: 'Fichas, precios, importación y transferencias.', load: () => { loadAdminProviderList(); loadAdminSurvey(); } },
 relevamiento: { title: 'Relevamiento de precios', subtitle: 'Canasta para corralones y precios de la zona.', load: () => { loadAdminSurvey(); } },
 apus: { title: 'APUs de la Calculadora', subtitle: 'Revisar, describir y habilitar tareas.', load: () => { loadAdminApuTasks(); } },
};
const adminPagesLoaded = new Set();

export function showAdminPage(page) {
 const key = ADMIN_PAGES[page] ? page : '';
 const menu = document.getElementById('admin-menu');
 const bar = document.getElementById('admin-page-bar');
 const subtitle = document.getElementById('admin-page-subtitle');
 if (menu) menu.hidden = !!key;
 if (bar) bar.hidden = !key;
 document.querySelectorAll('#admin-view [data-admin-page]').forEach(sec => {
 const on = sec.dataset.adminPage === key;
 sec.hidden = !on;
 if (on) sec.open = true;
 });
 if (key) {
 const def = ADMIN_PAGES[key];
 document.getElementById('admin-page-title').textContent = def.title;
 if (subtitle) subtitle.textContent = def.subtitle;
 document.title = `${def.title} | Administración | NEXOBRA`;
 if (!adminPagesLoaded.has(key)) { adminPagesLoaded.add(key); def.load(); }
 } else {
 if (subtitle) subtitle.textContent = 'Elegí qué querés hacer.';
 document.title = 'Administración | NEXOBRA';
 loadAdminMenuBadges();
 }
}

/** Pendientes en las tarjetas del menú (misma idea que la insignia roja del menú de cuenta). */
async function loadAdminMenuBadges() {
 if (!ST.supabaseClient) return;
 const count = (q) => q.then(r => (r && r.count) || 0, () => 0);
 const [prov, offers, reports, claims, sugg] = await Promise.all([
 count(ST.supabaseClient.from('providers').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending')),
 count(ST.supabaseClient.from('provider_offers').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
 count(ST.supabaseClient.from('review_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
 count(ST.supabaseClient.from('provider_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
 count(ST.supabaseClient.from('material_technical_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'))
 ]);
 const set = (id, n) => {
 const el = document.getElementById(id);
 if (!el) return;
 el.hidden = !(n > 0);
 el.textContent = n > 99 ? '99+' : String(n);
 };
 set('admin-menu-badge-pendientes', prov + offers + reports + claims);
 set('admin-menu-badge-materiales', sugg);
}

function currentAdminHashPage() {
 return decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
}

export function loadAdminPanel() {
 showAdminPage(currentAdminHashPage());
}

/** Abre una página del panel (o el menú, con ''): cambia el "#" de la dirección (para el botón atrás) y muestra la página. */
export function goToAdminPage(page) {
 const target = page ? '#' + page : '';
 if ((window.location.hash || '') !== target) {
 if (target) history.pushState(history.state, '', window.location.pathname + window.location.search + target);
 else history.pushState(history.state, '', window.location.pathname + window.location.search);
 }
 showAdminPage(page);
 window.scrollTo({ top: 0 });
}

// ============================================================
// (18/11) Relevamiento de precios en corralones (canasta, migración 037)
// ============================================================

let surveyState = { items: [], loaded: false, offers: [] };

function surveyMaterial(id) {
 return (typeof NEXOBRA_DATA !== 'undefined' ? NEXOBRA_DATA : []).find(m => m.id === id) || null;
}

/** Precio de una oferta llevado a unidad de compra del material (si estaba por unidad de cómputo, × envase). */
function offerPerSaleUnit(offer, material) {
 const amount = Number(offer.amount);
 if (!material) return amount;
 const envase = Number(material.envase) || 1;
 if (offer.unit === material.unidadVenta || material.unidadVenta === material.unidadComputo) return amount;
 if (offer.unit === material.unidadComputo) return amount * envase;
 return amount;
}

function median(values) {
 const v = [...values].sort((a, b) => a - b);
 if (!v.length) return null;
 const mid = Math.floor(v.length / 2);
 return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export async function loadAdminSurvey() {
 const summary = document.getElementById('admin-survey-summary');
 if (!summary) return;
 summary.innerHTML = '<p class="admin-dash-empty">Cargando...</p>';
 const { data, error } = await ST.supabaseClient.from('price_survey_items').select('material_id, sort_order, active').eq('active', true).order('sort_order');
 if (error) {
 summary.innerHTML = /price_survey_items|does not exist|schema cache/i.test(error.message || '')
 ? '<p class="admin-dash-empty">Falta correr la migración 037 en Supabase.</p>'
 : `<p class="admin-dash-empty">${ST.escapeHtml(error.message)}</p>`;
 return;
 }
 surveyState.items = data || [];
 surveyState.loaded = true;
 const ids = surveyState.items.map(i => i.material_id);
 let offers = [];
 if (ids.length) {
 const since = new Date(Date.now() - 60 * 86400000).toISOString();
 const { data: off } = await ST.supabaseClient.from('provider_offers')
 .select('material_id, amount, unit, reported_at, branch_id, provider_branches(name, providers(business_name))')
 .in('material_id', ids).eq('status', 'approved').gte('reported_at', since);
 offers = off || [];
 }
 surveyState.offers = offers;
 renderAdminSurveySummary();
}

function renderAdminSurveySummary() {
 const summary = document.getElementById('admin-survey-summary');
 if (!summary) return;
 if (!surveyState.items.length) { summary.innerHTML = '<p class="admin-dash-empty">La canasta está vacía. Sumá materiales en "Editar la canasta".</p>'; return; }
 const proveedores = new Set(surveyState.offers.map(o => o.branch_id));
 const rows = surveyState.items.map(it => {
 const m = surveyMaterial(it.material_id);
 const precios = surveyState.offers.filter(o => o.material_id === it.material_id).map(o => offerPerSaleUnit(o, m));
 return { it, m, precios, n: new Set(surveyState.offers.filter(o => o.material_id === it.material_id).map(o => o.branch_id)).size };
 });
 summary.innerHTML = `
 <p class="admin-dash-note"><strong>${surveyState.items.length}</strong> materiales en la canasta · <strong>${proveedores.size}</strong> corralón${proveedores.size === 1 ? '' : 'es'} con precios de los últimos 60 días.</p>
 <div class="table-view-container">
 <table class="materials-table admin-survey-table">
 <thead><tr><th>Material</th><th>Unidad</th><th>Corralones</th><th style="text-align:right;">Mínimo</th><th style="text-align:right;">Típico</th><th style="text-align:right;">Máximo</th><th></th></tr></thead>
 <tbody>
 ${rows.map(({ it, m, precios, n }) => `
 <tr>
 <td>${m ? ST.escapeHtml(m.denominacion) : `<em>${ST.escapeHtml(it.material_id)} (no está en el catálogo)</em>`}</td>
 <td>${m ? ST.escapeHtml(m.unidadVenta || '') : ''}</td>
 <td>${n || '<span class="admin-dash-empty">0</span>'}</td>
 <td style="text-align:right;">${precios.length ? ST.formatMoney(Math.min(...precios)) : '—'}</td>
 <td style="text-align:right;">${precios.length ? ST.formatMoney(median(precios)) : '—'}</td>
 <td style="text-align:right;">${precios.length ? ST.formatMoney(Math.max(...precios)) : '—'}</td>
 <td><button type="button" class="admin-apu-delete" title="Sacar de la canasta" onclick="window.nexoBraApp.removeSurveyItem('${ST.escapeHtml(it.material_id)}')">Sacar</button></td>
 </tr>`).join('')}
 </tbody>
 </table>
 </div>`;
}

function surveyRequestText() {
 let text = 'Hola! Te escribo de NEXOBRA (nexoobra.com.ar). Estamos armando una comparación de precios de materiales en Oberá. ¿Me pasarías tu precio de contado de estos materiales?\n\n';
 surveyState.items.forEach(it => {
 const m = surveyMaterial(it.material_id);
 if (m) text += `• ${m.denominacion} — por ${m.unidadVenta}\n`;
 });
 text += '\nCon tus precios armamos gratis la página de tu negocio en NEXOBRA, para que te lleguen pedidos por WhatsApp. ¡Gracias!';
 return text;
}

async function copySurveyRequest() {
 if (!surveyState.loaded) await loadAdminSurvey();
 const text = surveyRequestText();
 try {
 await navigator.clipboard.writeText(text);
 ST.showToast('Pedido copiado: pegalo en el WhatsApp del corralón.');
 } catch (err) {
 ST.showToast('No se pudo copiar automáticamente.');
 }
}

async function downloadSurveyXlsx() {
 if (!surveyState.loaded) await loadAdminSurvey();
 try { await ST.ensureXlsxLoaded(); } catch (err) { ST.showToast(err.message); return; }
 // Mismas columnas que entiende la importación por Excel (Gestionar proveedores y Mi Proveedor).
 const rows = [['SKU', 'Nombre', 'Unidad', 'Precio', 'Stock']];
 surveyState.items.forEach(it => {
 const m = surveyMaterial(it.material_id);
 if (m) rows.push([m.id, m.denominacion, m.unidadVenta, '', 'En stock']);
 });
 const ws = XLSX.utils.aoa_to_sheet(rows);
 ws['!cols'] = [{ wch: 12 }, { wch: 52 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws, 'Precios');
 XLSX.writeFile(wb, 'Relevamiento_precios_NEXOBRA.xlsx');
}

export async function removeSurveyItem(materialId) {
 const m = surveyMaterial(materialId);
 if (!confirm(`¿Sacar "${m ? m.denominacion : materialId}" de la canasta?`)) return;
 const { error } = await ST.supabaseClient.from('price_survey_items').delete().eq('material_id', materialId);
 if (error) { ST.showToast('No se pudo: ' + error.message); return; }
 await loadAdminSurvey();
}

export async function addSurveyItem(materialId) {
 const maxOrder = surveyState.items.reduce((mx, i) => Math.max(mx, i.sort_order || 0), 0);
 const { error } = await ST.supabaseClient.from('price_survey_items').upsert({ material_id: materialId, sort_order: maxOrder + 10, active: true });
 if (error) { ST.showToast('No se pudo: ' + error.message); return; }
 document.getElementById('admin-survey-search').value = '';
 document.getElementById('admin-survey-search-results').innerHTML = '';
 ST.showToast('Sumado a la canasta.');
 await loadAdminSurvey();
}

function renderSurveySearch() {
 const q = document.getElementById('admin-survey-search').value.trim();
 const el = document.getElementById('admin-survey-search-results');
 if (q.length < 2) { el.innerHTML = ''; return; }
 const inBasket = new Set(surveyState.items.map(i => i.material_id));
 const results = Provider.searchMaterialsSimple(q).filter(m => !inBasket.has(m.id)).slice(0, 12);
 el.innerHTML = results.length ? results.map(m => `
 <div class="provider-search-row">
 <div class="provider-search-row-info"><strong>${ST.escapeHtml(m.denominacion)}</strong><br><span style="color:var(--text-muted); font-size:0.75rem;">${m.id} · por ${ST.escapeHtml(m.unidadVenta || '')}</span></div>
 <div class="provider-search-row-controls"><button type="button" class="btn-action-drawer" onclick="window.nexoBraApp.addSurveyItem('${ST.escapeHtml(m.id)}')">Sumar</button></div>
 </div>`).join('') : '<p class="admin-dash-empty">Sin resultados (o ya están en la canasta).</p>';
}

// --- Carga de precios del relevamiento para el proveedor abierto en "Gestionar proveedores" ---
async function loadSurveyEntry() {
 const branch = adminState.manageSelectedBranch;
 const container = document.getElementById('admin-survey-entry');
 const btn = document.getElementById('btn-admin-survey-save');
 if (!container) return;
 if (!branch) { container.innerHTML = '<p class="admin-dash-empty">Guardá primero los datos comerciales (sucursal) arriba.</p>'; return; }
 if (!surveyState.loaded) await loadAdminSurvey();
 const { data: existentes } = await ST.supabaseClient.from('provider_offers').select('id, material_id, amount, unit, stock_status, price_kind').eq('branch_id', branch.id).in('material_id', surveyState.items.map(i => i.material_id));
 const byMat = new Map((existentes || []).filter(o => o.price_kind === 'sale').map(o => [o.material_id, o]));
 container.innerHTML = surveyState.items.map(it => {
 const m = surveyMaterial(it.material_id);
 if (!m) return '';
 const ex = byMat.get(m.id);
 return `
 <div class="admin-survey-row" data-material="${ST.escapeHtml(m.id)}">
 <span class="admin-survey-name">${ST.escapeHtml(m.denominacion)}</span>
 <label class="admin-survey-price">$ <input type="text" inputmode="decimal" class="form-select" placeholder="${ex ? '' : 'sin precio'}" value="${ex ? String(ex.amount).replace('.', ',') : ''}" aria-label="Precio de ${ST.escapeHtml(m.denominacion)}"> <small>/ ${ST.escapeHtml(m.unidadVenta || '')}</small></label>
 <select class="form-select admin-survey-stock" aria-label="Stock">
 <option value="en_stock" ${!ex || ex.stock_status === 'en_stock' ? 'selected' : ''}>En stock</option>
 <option value="a_pedido" ${ex && ex.stock_status === 'a_pedido' ? 'selected' : ''}>A pedido</option>
 <option value="agotado" ${ex && ex.stock_status === 'agotado' ? 'selected' : ''}>Agotado</option>
 </select>
 </div>`;
 }).join('');
 if (btn) btn.style.display = '';
}

async function saveSurveyEntry() {
 const branch = adminState.manageSelectedBranch;
 if (!branch) return;
 const dateVal = document.getElementById('admin-survey-date').value;
 const reportedAt = dateVal ? new Date(dateVal + 'T12:00:00').toISOString() : new Date().toISOString();
 const rows = [...document.querySelectorAll('#admin-survey-entry .admin-survey-row')].map(r => ({
 material_id: r.dataset.material,
 price: ST.parseLocaleNumber(r.querySelector('input').value),
 stock: r.querySelector('select').value
 })).filter(r => r.price > 0);
 if (!rows.length) { ST.showToast('No cargaste ningún precio.'); return; }
 const btn = document.getElementById('btn-admin-survey-save');
 if (btn) btn.disabled = true;
 try {
 const { data: existentes, error: exErr } = await ST.supabaseClient.from('provider_offers').select('id, material_id, price_kind').eq('branch_id', branch.id).in('material_id', rows.map(r => r.material_id));
 if (exErr) throw exErr;
 const byMat = new Map((existentes || []).filter(o => o.price_kind === 'sale').map(o => [o.material_id, o.id]));
 const now = new Date().toISOString();
 const inserts = [];
 let actualizados = 0;
 for (const r of rows) {
 const m = surveyMaterial(r.material_id);
 const fields = { amount: r.price, unit: m ? m.unidadVenta : null, stock_status: r.stock, status: 'approved', approved_at: now, reported_at: reportedAt };
 if (byMat.has(r.material_id)) {
 const { error } = await ST.supabaseClient.from('provider_offers').update(fields).eq('id', byMat.get(r.material_id));
 if (!error) actualizados++;
 } else {
 inserts.push({ branch_id: branch.id, material_id: r.material_id, price_kind: 'sale', ...fields });
 }
 }
 if (inserts.length) {
 const { error } = await ST.supabaseClient.from('provider_offers').insert(inserts);
 if (error) throw error;
 }
 ST.showToast(`Relevamiento guardado: ${inserts.length} precios nuevos y ${actualizados} actualizados.`);
 loadAdminProviderCatalog();
 loadAdminSurvey();
 } catch (err) {
 ST.showToast('No se pudo guardar: ' + err.message);
 } finally {
 if (btn) btn.disabled = false;
 }
}

function resetSurveyEntry() {
 const container = document.getElementById('admin-survey-entry');
 const btn = document.getElementById('btn-admin-survey-save');
 if (container) container.innerHTML = '';
 if (btn) btn.style.display = 'none';
 const date = document.getElementById('admin-survey-date');
 if (date) date.value = new Date().toISOString().slice(0, 10);
}

// ============================================================
// (18/11) Reclamos de fichas ("Reclamá tu negocio", migración 036)
// ============================================================

export async function loadAdminProviderClaims() {
 const container = document.getElementById('admin-provider-claims');
 if (!container) return;
 container.innerHTML = '<p class="admin-dash-empty">Cargando...</p>';
 const { data, error } = await ST.supabaseClient.rpc('admin_list_provider_claims', { p_status: 'pending' });
 if (error) {
 container.innerHTML = /admin_list_provider_claims|does not exist|schema cache/i.test(error.message || '')
 ? '<p class="admin-dash-empty">Falta correr la migración 036 en Supabase.</p>'
 : `<p class="admin-dash-empty">${ST.escapeHtml(error.message)}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 container.innerHTML = '<p class="admin-dash-empty">No hay reclamos pendientes.</p>';
 return;
 }
 container.innerHTML = data.map(c => `
 <div class="computation-row">
 <div class="computation-row-info">
 <h4>${ST.escapeHtml(c.business_name)}${c.branch_name ? ' · ' + ST.escapeHtml(c.branch_name) : ''}</h4>
 <span>${ST.escapeHtml(c.contact_name)} (${ST.escapeHtml(c.role_in_business || 'sin rol')}) · <a href="tel:${ST.escapeHtml((c.contact_phone || '').replace(/[^\d+]/g, ''))}">${ST.escapeHtml(c.contact_phone)}</a> · cuenta ${ST.escapeHtml(c.user_email || '')}</span>
 <span>Pedido el ${new Date(c.created_at).toLocaleDateString('es-AR')}${c.branch_slug ? ` · <a href="/proveedor/${ST.escapeHtml(c.branch_slug)}" target="_blank" rel="noopener">ver ficha</a>` : ''}${c.provider_owner_id ? ' · <strong>la ficha ya tiene dueño</strong>' : ''}</span>
 ${c.message ? `<span style="font-style:italic;">"${ST.escapeHtml(c.message)}"</span>` : ''}
 </div>
 <div class="computation-row-actions">
 <button onclick="window.nexoBraApp.resolveProviderClaim('${c.id}', true)" ${c.provider_owner_id ? 'disabled' : ''}>Aprobar</button>
 <button class="danger" onclick="window.nexoBraApp.resolveProviderClaim('${c.id}', false)">Rechazar</button>
 </div>
 </div>`).join('');
}

export async function resolveProviderClaim(claimId, approve) {
 if (!confirm(approve
 ? '¿Aprobar el reclamo? La ficha pasa a esa cuenta, con todos sus precios, y se convierte en proveedor. ¿Ya confirmaste por teléfono que es del negocio?'
 : '¿Rechazar este reclamo?')) return;
 const { error } = await ST.supabaseClient.rpc('admin_resolve_provider_claim', { p_claim_id: claimId, p_approve: approve });
 if (error) { ST.showToast('No se pudo: ' + error.message); return; }
 ST.showToast(approve ? 'Reclamo aprobado: la ficha ya es de esa cuenta.' : 'Reclamo rechazado.');
 loadAdminProviderClaims();
 loadAdminProviderList();
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
 <button class="btn-remove-item" title="Eliminar la reseña" onclick="window.nexoBraApp.deleteReportedReview(${ST.escAttr(review.id)}, ${ST.escAttr(r.id)})">Eliminar reseña</button>
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
 ? adminState.manageProviders.filter(p =>ST.normalizeText(p.business_name).includes(query))
 : adminState.manageProviders;

 if (filtered.length === 0) {
 container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">${adminState.manageProviders.length === 0 ? 'Todavía no hay proveedores cargados.' : 'Sin resultados para esa búsqueda.'}</p>`;
 return;
 }

 const statusLabel = { approved: '✓ Aprobado', pending: 'Pendiente', rejected: '✕ Rechazado' };

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
 updateAdminLogoPreview(null);
 updateAdminProviderPublicLinkBox(null);
 document.getElementById('admin-prov-owner-info').textContent = 'Guardá primero los datos comerciales -- una vez creado el proveedor vas a poder transferirlo, cargarle palabras clave y precios.';
 document.getElementById('admin-prov-transfer-email').closest('div').style.display = 'none';
 document.getElementById('admin-prov-keywords-list').innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
 document.getElementById('admin-prov-catalog-list').innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
 document.getElementById('admin-prov-announcements-list').innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
 document.getElementById('admin-prov-announcement-message').value = '';
 document.getElementById('admin-prov-announcement-expires').value = '';
 document.getElementById('admin-prov-add-results').innerHTML = '';
 document.getElementById('admin-prov-add-search').value = '';
 resetAdminProvExcel();
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
 updateAdminLogoPreview(provider.logo_url);

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
 document.getElementById('admin-branch-hours').value = branch.business_hours || '';
 document.getElementById('admin-branch-delivery-radius').value = branch.delivery_radius_km || '';
 document.getElementById('admin-branch-lat').value = branch.latitude ?? '';
 document.getElementById('admin-branch-lng').value = branch.longitude ?? '';
 document.getElementById('admin-branch-delivery-available').checked = !!branch.delivery_available;
 }
 initAdminBranchLocationMap(branch?.latitude, branch?.longitude);
 updateAdminProviderPublicLinkBox(branch);

 document.getElementById('admin-prov-add-search').value = '';
 document.getElementById('admin-prov-add-results').innerHTML = '';
 resetAdminProvExcel();
 await loadAdminProviderKeywords();
 await loadAdminProviderCatalog();
 await loadAdminProviderAnnouncements();
 await loadAdminProviderBranchPhotos();
}

function updateAdminLogoPreview(url) {
 const img = document.getElementById('admin-prov-logo-img');
 const placeholder = document.getElementById('admin-prov-logo-placeholder');
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

/** Igual que updateProviderPublicLinkBox() en provider.js, pero para la sucursal que el admin tiene seleccionada. */
function updateAdminProviderPublicLinkBox(branch) {
 const box = document.getElementById('admin-prov-public-link-box');
 const textEl = document.getElementById('admin-prov-public-link-text');
 if (!box || !textEl) return;
 if (branch && branch.slug) {
 textEl.textContent = `nexoobra.com.ar/proveedor/${branch.slug}`;
 box.style.display = 'block';
 } else {
 box.style.display = 'none';
 }
}

/**
 * Mismo mecanismo que uploadProviderLogo() en provider.js (mismo bucket
 * 'provider-logos', mismo límite de 2MB, misma validación de tipo), pero con
 * una diferencia importante: el autoservicio guarda el archivo en
 * `${auth.uid()}/logo.ext` porque cada usuario tiene un solo proveedor. Acá
 * el admin puede estar administrando VARIOS proveedores con su misma cuenta,
 * así que el nombre de archivo tiene que incluir el id del proveedor
 * (`${auth.uid()}/logo-${provider.id}.ext`) -- si no, el logo del segundo
 * proveedor que cargues pisaría el del primero.
 */
export async function uploadAdminProviderLogo(file) {
 const provider = adminState.manageSelectedProvider;
 if (!provider) {
 ST.showToast('Guardá primero los datos comerciales, y después subí el logo.');
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

 const ext = file.name.split('.').pop().toLowerCase();
 const path = `${ST.authState.user.id}/logo-${provider.id}.${ext}`;

 const { error: uploadError } = await ST.supabaseClient.storage
 .from('provider-logos')
 .upload(path, file, { upsert: true, cacheControl: '3600' });

 if (uploadError) {
 ST.showToast('No se pudo subir el logo: ' + uploadError.message);
 return;
 }

 const { data: publicUrlData } = ST.supabaseClient.storage.from('provider-logos').getPublicUrl(path);
 const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

 const { error: updateError } = await ST.supabaseClient
 .from('providers')
 .update({ logo_url: logoUrl })
 .eq('id', provider.id);

 if (updateError) {
 ST.showToast('El logo se subió pero no se pudo guardar: ' + updateError.message);
 return;
 }

 adminState.manageSelectedProvider.logo_url = logoUrl;
 updateAdminLogoPreview(logoUrl);
 ST.showToast('Logo actualizado.');
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
 business_hours: document.getElementById('admin-branch-hours').value.trim() || null,
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
 // Mismo criterio que en el autoservicio (provider.js): el slug de la
 // página pública se genera una sola vez, al crear la sucursal.
 branchPayload.slug = await ST.generateUniqueBranchSlug(providerPayload.business_name);
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
 updateAdminProviderPublicLinkBox(branch);

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
 + ¿No lo encontrás? Proponer "${query}" como material nuevo
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

// --- (16/11) Diagnóstico del sitio ---
// Prueba automática "liviana": pide al sitio publicado lo mismo que pediría
// un visitante o un buscador y compara con lo esperado. No cambia nada.
async function runAdminDiagnostics() {
 const out = document.getElementById('admin-diagnostics-result');
 const btn = document.getElementById('btn-admin-diagnostics');
 if (!out) return;
 if (btn) btn.disabled = true;
 out.innerHTML = '<p class="admin-dash-empty">Revisando...</p>';
 const results = [];
 const check = async (name, fn) => {
 try {
 const r = await fn();
 results.push({ name, ok: r === true || (r && r.ok !== false), detail: r && r.detail ? r.detail : '' });
 } catch (err) {
 results.push({ name, ok: false, detail: err.message });
 }
 };
 const get = (path) => fetch(path, { cache: 'no-store', redirect: 'manual' });
 const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';

 await check('Inicio responde', async () => {
 const r = await get('/');
 const html = await r.text();
 return { ok: r.status === 200 && html.includes('og:image'), detail: `status ${r.status}` + (html.includes('og:image') ? ', con vista previa (og:image)' : ', SIN og:image') };
 });
 await check('Cada página tiene su propio título', async () => {
 const r = await get('/catalogo');
 const t = titleOf(await r.text());
 return { ok: r.status === 200 && /Catálogo/.test(t), detail: `/catalogo → "${t}"` };
 });
 await check('Una URL inventada devuelve 404', async () => {
 const r = await get('/esta-pagina-no-existe-' + Date.now());
 return { ok: r.status === 404, detail: `status ${r.status}` };
 });
 await check('robots.txt', async () => {
 const r = await get('/robots.txt');
 const txt = await r.text();
 return { ok: r.status === 200 && /Sitemap:/i.test(txt) && !/<html/i.test(txt), detail: `status ${r.status}` };
 });
 await check('sitemap.xml', async () => {
 const r = await get('/sitemap.xml');
 const xml = await r.text();
 const urls = (xml.match(/<loc>/g) || []).length;
 const materiales = (xml.match(/\/material\//g) || []).length;
 const proveedores = (xml.match(/\/proveedor\//g) || []).length;
 return { ok: r.status === 200 && urls > 5, detail: `${urls} páginas (${materiales} materiales, ${proveedores} proveedores)` };
 });
 await check('Página de un material', async () => {
 const m = (typeof NEXOBRA_DATA !== 'undefined' ? NEXOBRA_DATA : [])[0];
 if (!m) return { ok: false, detail: 'catálogo vacío' };
 const r = await get(ST.materialPath(m.id, m.denominacion));
 const t = titleOf(await r.text());
 return { ok: r.status === 200 && t.includes(m.denominacion.slice(0, 15)), detail: `${m.id} → "${t}"` };
 });
 await check('Archivos internos ocultos', async () => {
 const paths = ['/README.md', '/supabase/migrations/001_initial_schema.sql', '/.gitignore', '/worker.js', '/wrangler.jsonc'];
 const visibles = [];
 for (const p of paths) {
 const r = await get(p);
 if (r.status === 200) visibles.push(p);
 }
 return { ok: visibles.length === 0, detail: visibles.length ? 'Se ven: ' + visibles.join(', ') : 'ninguno visible' };
 });
 await check('Conexión con la base (Supabase)', async () => {
 const { error, count } = await ST.supabaseClient.from('materials').select('id', { count: 'exact', head: true }).eq('active', true);
 if (error) throw error;
 return { ok: count > 0, detail: `${count} materiales activos` };
 });
 await check('Calculadora de Obra', async () => {
 await refreshApuCatalogCache();
 const tasks = ST.apuCatalogState.tasks || [];
 const hab = tasks.filter(t => t.habilitada === true).length;
 if (tasks.length && tasks.every(t => t.habilitada === undefined)) return { ok: false, detail: 'falta correr la migración 033' };
 return { ok: tasks.length > 0, detail: `${hab} de ${tasks.length} tareas habilitadas para el público` + (hab === 0 ? ' (la Calculadora se ve vacía)' : '') };
 });
 await check('Versión instalada (service worker)', async () => {
 const r = await get('/sw.js');
 const v = ((await r.text()).match(/SW_VERSION\s*=\s*'([^']+)'/) || [])[1];
 return { ok: !!v, detail: v ? `publicada: ${v}` : 'no se pudo leer' };
 });

 const fallas = results.filter(r => !r.ok).length;
 out.innerHTML = `<p class="admin-dash-note"><strong>${fallas ? `${fallas} con problemas` : 'Todo en orden'}</strong> · ${new Date().toLocaleString('es-AR')}</p>`
 + results.map(r => `<div class="admin-diag-row ${r.ok ? 'ok' : 'bad'}"><span class="admin-diag-icon">${r.ok ? '✓' : '✗'}</span><strong>${ST.escapeHtml(r.name)}</strong><span>${ST.escapeHtml(r.detail)}</span></div>`).join('');
 if (btn) btn.disabled = false;
}

// --- (16/11) Importar una lista Excel EN NOMBRE del proveedor ---
// Misma lectura y emparejamiento que la carga masiva de "Mi Proveedor"
// (Provider.parseProviderExcelRows), pero sobre la sucursal elegida por el
// admin, aprobada directo, y actualizando el precio de los materiales que
// la sucursal ya tenía cargados (en vez de duplicarlos).
let adminProvExcelPending = [];

function resetAdminProvExcel() {
 resetSurveyEntry();
 adminProvExcelPending = [];
 const preview = document.getElementById('admin-prov-excel-preview');
 const input = document.getElementById('admin-prov-excel-input');
 const btn = document.getElementById('btn-admin-prov-excel-confirm');
 if (preview) preview.innerHTML = '';
 if (input) input.value = '';
 if (btn) btn.style.display = 'none';
}

async function handleAdminProvExcelFile(file) {
 if (!adminState.manageSelectedBranch) { ST.showToast('Primero guardá los datos comerciales (sucursal) arriba.'); return; }
 try {
 const rows = await Provider.readExcelFileRows(file);
 adminProvExcelPending = Provider.parseProviderExcelRows(rows);
 } catch (err) {
 ST.showToast('No se pudo leer el archivo: ' + err.message);
 return;
 }
 renderAdminProvExcelPreview();
}

function renderAdminProvExcelPreview() {
 const preview = document.getElementById('admin-prov-excel-preview');
 const btn = document.getElementById('btn-admin-prov-excel-confirm');
 if (!preview || !btn) return;
 if (adminProvExcelPending.length === 0) {
 preview.innerHTML = '<p class="admin-dash-empty">El archivo no tiene filas de datos.</p>';
 btn.style.display = 'none';
 return;
 }
 const validas = adminProvExcelPending.filter(r => r.matchedItem && r.price > 0);
 preview.innerHTML = `<p class="admin-dash-note"><strong>${validas.length}</strong> de ${adminProvExcelPending.length} filas se van a cargar (emparejadas con un material y con precio). Las demás se ignoran.</p>`
 + adminProvExcelPending.map(row => {
 const unidad = row.matchedItem ? (row.mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo) : '';
 const ok = row.matchedItem && row.price > 0;
 return `<div class="excel-preview-row status-${ok ? row.status : 'none'}">
 <div><strong>${ST.escapeHtml(row.name || row.sku)}</strong> ${row.matchedItem ? `→ ${ST.escapeHtml(row.matchedItem.denominacion)} (${ST.escapeHtml(row.matchedItem.id)})` : '→ sin coincidencia, no se carga'}</div>
 <div>${row.price > 0 ? ST.formatMoney(row.price) : 'sin precio'}${unidad ? ' / ' + ST.escapeHtml(unidad) : ''}${row.unitAmbiguous ? ` (la unidad "${ST.escapeHtml(row.requestedUnit)}" no coincide: se toma por unidad de compra)` : ''} · ${row.stock.replace('_', ' ')}</div>
 </div>`;
 }).join('');
 btn.style.display = validas.length ? '' : 'none';
 btn.textContent = `Cargar ${validas.length} material${validas.length === 1 ? '' : 'es'} al catálogo del proveedor`;
}

async function confirmAdminProvExcel() {
 const branch = adminState.manageSelectedBranch;
 if (!branch) { ST.showToast('Primero guardá los datos comerciales (sucursal) arriba.'); return; }
 const rows = adminProvExcelPending.filter(r => r.matchedItem && r.price > 0);
 if (rows.length === 0) return;
 const providerName = adminState.manageSelectedProvider ? adminState.manageSelectedProvider.business_name : 'este proveedor';
 if (!confirm(`¿Cargar ${rows.length} materiales al catálogo de ${providerName}? Entran aprobados y se ven en el sitio enseguida.`)) return;
 const btn = document.getElementById('btn-admin-prov-excel-confirm');
 if (btn) btn.disabled = true;
 try {
 const { data: existentes, error: exErr } = await ST.supabaseClient
 .from('provider_offers').select('id, material_id, price_kind').eq('branch_id', branch.id);
 if (exErr) throw exErr;
 const byKey = new Map((existentes || []).map(o => [`${o.material_id}|${o.price_kind}`, o.id]));
 const now = new Date().toISOString();
 const inserts = [];
 const updates = [];
 // Si la lista trae dos veces el mismo material, vale la última fila.
 const vistos = new Map();
 rows.forEach(row => vistos.set(`${row.matchedItem.id}|${row.mode === 'venta' ? 'sale' : 'measurement'}`, row));
 vistos.forEach((row, key) => {
 const fields = {
 amount: row.price,
 unit: row.mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo,
 provider_sku: row.sku || null,
 stock_status: row.stock,
 status: 'approved',
 approved_at: now,
 reported_at: now
 };
 if (byKey.has(key)) updates.push({ id: byKey.get(key), fields });
 else inserts.push({ branch_id: branch.id, material_id: row.matchedItem.id, price_kind: key.endsWith('|sale') ? 'sale' : 'measurement', ...fields });
 });
 if (inserts.length) {
 const { error } = await ST.supabaseClient.from('provider_offers').insert(inserts);
 if (error) throw error;
 }
 let fallidas = 0;
 for (let i = 0; i < updates.length; i += 20) {
 const results = await Promise.all(updates.slice(i, i + 20).map(u => ST.supabaseClient.from('provider_offers').update(u.fields).eq('id', u.id)));
 fallidas += results.filter(r => r.error).length;
 }
 ST.showToast(`Listo: ${inserts.length} nuevos y ${updates.length - fallidas} actualizados${fallidas ? ` (${fallidas} no se pudieron actualizar)` : ''}.`);
 adminProvExcelPending = [];
 document.getElementById('admin-prov-excel-preview').innerHTML = '';
 document.getElementById('admin-prov-excel-input').value = '';
 if (btn) btn.style.display = 'none';
 loadAdminProviderCatalog();
 } catch (err) {
 ST.showToast('No se pudo cargar la lista: ' + err.message);
 } finally {
 if (btn) btn.disabled = false;
 }
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
 ${offer.status === 'pending' ? '<br><span style="font-size:0.7rem; font-weight:700; color:#b45309;">Pendiente de aprobación</span>' : ''}
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
 <h5> ${ST.escapeHtml(a.message)}</h5>
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

// --- Fotos de trabajos realizados del proveedor seleccionado (06/11) ---
// Mismo mecanismo que provider.js, apuntando a adminState.manageSelectedBranch
// en vez de a la sucursal del usuario logueado -- la subida en sí (achicado +
// Storage + insert) se reusa de Provider.uploadProviderBranchPhoto() en vez de
// duplicarla, pasándole la sucursal del admin y este callback de refresco.

export async function loadAdminProviderBranchPhotos() {
 const container = document.getElementById('admin-prov-photos-grid');
 const branch = adminState.manageSelectedBranch;
 if (!container) return;
 if (!branch) {
 container.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Guardá primero los datos comerciales.</p>';
 return;
 }
 const { data, error } = await ST.supabaseClient
 .from('provider_branch_photos')
 .select('id, photo_url, storage_path')
 .eq('branch_id', branch.id)
 .order('sort_order');
 if (error) {
 container.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
 return;
 }
 renderAdminProviderBranchPhotos(data || []);
}

function renderAdminProviderBranchPhotos(list) {
 const container = document.getElementById('admin-prov-photos-grid');
 if (!container) return;
 container.innerHTML = list.length === 0
 ? '<p style="font-size:0.82rem; color:var(--text-muted);">Todavía no se subió ninguna foto.</p>'
 : list.map(p => `
 <div class="provider-photo-card">
 <img src="${ST.escapeHtml(p.photo_url)}" alt="Foto de trabajo realizado" loading="lazy">
 <button type="button" onclick="window.nexoBraApp.deleteAdminProviderBranchPhoto(${ST.escAttr(p.id)}, ${ST.escAttr(p.storage_path)})" title="Eliminar">&times;</button>
 </div>
 `).join('');
 const btn = document.getElementById('btn-add-admin-provider-photo');
 if (btn) btn.style.display = list.length >= 3 ? 'none' : 'inline-flex';
}

export async function handleAdminProviderPhotoFileChange(e) {
 const file = e.target.files && e.target.files[0];
 e.target.value = '';
 if (!file) return;
 await Provider.uploadProviderBranchPhoto(file, adminState.manageSelectedBranch, loadAdminProviderBranchPhotos);
}

export async function deleteAdminProviderBranchPhoto(id, storagePath) {
 if (!confirm('¿Eliminar esta foto?')) return;
 const { error: removeError } = await ST.supabaseClient.storage.from('provider-work-photos').remove([storagePath]);
 if (removeError) console.warn('[NEXOBRA] No se pudo borrar el archivo de Storage (se borra igual el registro):', removeError);
 const { error } = await ST.supabaseClient.from('provider_branch_photos').delete().eq('id', id);
 if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
 loadAdminProviderBranchPhotos();
}

// ============================================================
// Catálogo de APUs (análisis de precios unitarios) -- 04/11.
// Permite al admin agregar tareas de referencia nuevas al mismo catálogo
// que usa la Calculadora de Obra (ver js/apu.js: apu_tasks/apu_task_components,
// migración 018 + RLS de admin agregada en 022). Reutiliza el catálogo en
// memoria de ese módulo (ST.apuCatalogState) en vez de pedirlo de nuevo --
// Apu.loadApuCatalog() es idempotente, así que entrar al panel de admin sin
// haber visitado antes la Calculadora de Obra también funciona.
// ============================================================

const adminApuState = {
 draft: null, // { components: [] } mientras el modal "Agregar un APU al catálogo" está abierto
 editingTaskId: null, // id del apu_tasks que se está editando, o null si el modal está en modo "agregar nuevo"
 // (16/11) Imagen de referencia: se elige en el modal pero se sube recién
 // al guardar (una tarea nueva todavía no tiene id para armar la ruta).
 pendingImage: null, // Blob ya achicado, o null
 pendingImageUrl: null, // URL local para la vista previa
 removeImage: false // true si tocó "Quitar imagen" sobre una que ya estaba guardada
};

let adminApuLocalSeq = 0;
function adminApuLocalId(prefix) {
 adminApuLocalSeq += 1;
 return `${prefix}-${adminApuLocalSeq}-${Date.now()}`;
}

export async function refreshApuCatalogCache() {
 ST.apuCatalogState.loaded = false;
 await Apu.loadApuCatalog();
}

export async function loadAdminApuTasks() {
 // Siempre se recarga: si el catálogo se cargó antes de iniciar sesión como
 // administrador, solo trae las tareas habilitadas (es lo que ve el público).
 await refreshApuCatalogCache();
 populateAdminApuRubroFilters();
 renderAdminApuList();
}

function adminApuRubros() {
 return [...new Set((ST.apuCatalogState.tasks || []).map(t => t.rubro || 'Sin rubro'))].sort((a, b) => a.localeCompare(b));
}

function populateAdminApuRubroFilters() {
 const rubros = adminApuRubros();
 const filter = document.getElementById('admin-apu-filter-rubro');
 if (filter) {
 const current = filter.value;
 filter.innerHTML = '<option value="">Todos los rubros</option>' + rubros.map(r => `<option value="${ST.escapeHtml(r)}">${ST.escapeHtml(r)}</option>`).join('');
 if (rubros.includes(current)) filter.value = current;
 }
 const renameFrom = document.getElementById('admin-apu-rename-from');
 if (renameFrom) renameFrom.innerHTML = rubros.map(r => `<option value="${ST.escapeHtml(r)}">${ST.escapeHtml(r)}</option>`).join('');
 const datalist = document.getElementById('admin-apu-rubros-list');
 if (datalist) datalist.innerHTML = rubros.filter(r => r !== 'Sin rubro').map(r => `<option value="${ST.escapeHtml(r)}"></option>`).join('');
}

/** Costo de UNA unidad de la tarea con los precios del mes, igual que lo calcula la Calculadora para el público. */
function adminApuUnitCost(task) {
 try {
 const breakdown = Apu.calcItemBreakdown(Apu.buildBudgetItem(task.id, 1));
 const faltantes = breakdown.lineas.filter(l => !l.disponible).length + (breakdown.herramientas && !breakdown.herramientas.disponible && breakdown.herramientas.cantidadNecesaria > 0 ? 1 : 0);
 return { total: breakdown.total, faltantes };
 } catch (err) {
 return { total: 0, faltantes: 0 };
 }
}

export function renderAdminApuList() {
 const container = document.getElementById('admin-apu-list');
 if (!container) return;
 const q = ST.normalizeText(document.getElementById('admin-apu-search')?.value || '');
 const rubroFiltro = document.getElementById('admin-apu-filter-rubro')?.value || '';
 const estado = document.getElementById('admin-apu-filter-estado')?.value || '';
 const all = (ST.apuCatalogState.tasks || []).map(t => ({ t, cost: adminApuUnitCost(t) }));

 // Resumen arriba de la lista: cuánto falta revisar.
 const habilitadas = all.filter(x => x.t.habilitada === true).length;
 const conFaltantes = all.filter(x => x.cost.faltantes > 0).length;
 const sinDescripcion = all.filter(x => !x.t.descripcion).length;
 const conImagen = all.filter(x => x.t.imagen_url).length;
 const summary = document.getElementById('admin-apu-summary');
 if (summary) {
 const sinColumna = all.length > 0 && all.every(x => x.t.habilitada === undefined);
 summary.innerHTML = sinColumna
 ? '<p class="auth-error" style="display:block;">Falta correr la migración 033 en Supabase: sin ella no se puede habilitar ni deshabilitar tareas, y la Calculadora muestra todas.</p>'
 : `<div class="admin-apu-summary-item"><strong>${habilitadas}</strong><span>de ${all.length} habilitadas</span></div>
 <div class="admin-apu-summary-item"><strong>${conFaltantes}</strong><span>con componentes sin precio</span></div>
 <div class="admin-apu-summary-item"><strong>${sinDescripcion}</strong><span>sin descripción</span></div>
 <div class="admin-apu-summary-item"><strong>${conImagen}</strong><span>con imagen</span></div>`;
 }

 const rows = all.filter(({ t, cost }) => {
 if (q && !ST.normalizeText(t.nombre).includes(q) && !ST.normalizeText(t.rubro || '').includes(q)) return false;
 if (rubroFiltro && (t.rubro || 'Sin rubro') !== rubroFiltro) return false;
 if (estado === 'habilitadas' && t.habilitada !== true) return false;
 if (estado === 'pendientes' && t.habilitada === true) return false;
 if (estado === 'faltantes' && cost.faltantes === 0) return false;
 if (estado === 'sin-descripcion' && t.descripcion) return false;
 if (estado === 'revisar' && !t.necesita_revision) return false;
 return true;
 });

 if (rows.length === 0) {
 container.innerHTML = '<p class="admin-dash-empty">Ninguna tarea coincide con estos filtros.</p>';
 return;
 }
 container.innerHTML = rows.map(({ t, cost }) => {
 const compCount = (ST.apuCatalogState.componentsByTask[t.id] || []).length;
 const on = t.habilitada === true;
 const badges = [
 cost.faltantes ? `<span class="admin-apu-badge warn">${cost.faltantes} sin precio</span>` : '',
 !t.descripcion ? '<span class="admin-apu-badge">Sin descripción</span>' : '',
 t.necesita_revision ? '<span class="admin-apu-badge warn">Para revisar</span>' : '',
 t.imagen_url ? '<span class="admin-apu-badge ok">Con imagen</span>' : '',
 compCount === 0 ? '<span class="admin-apu-badge warn">Sin componentes</span>' : ''
 ].join('');
 return `
 <div class="admin-apu-row ${on ? 'is-on' : ''}">
 ${t.imagen_url ? `<img class="admin-apu-thumb" src="${ST.escapeHtml(t.imagen_url)}" alt="" loading="lazy">` : '<div class="admin-apu-thumb admin-apu-thumb-empty" aria-hidden="true"></div>'}
 <div class="admin-apu-row-main">
 <div class="admin-apu-row-title"><span class="admin-apu-status ${on ? 'on' : 'off'}">${on ? 'Habilitada' : 'Sin habilitar'}</span><strong>${ST.escapeHtml(t.nombre)}</strong></div>
 <div class="admin-apu-row-meta">#${t.id} · ${ST.escapeHtml(t.rubro || 'Sin rubro')} · ${ST.escapeHtml(t.unidad)} · ${compCount} componente${compCount === 1 ? '' : 's'} · <strong>${ST.formatMoney(cost.total)} por ${ST.escapeHtml(t.unidad)}</strong></div>
 ${t.notas_admin ? `<div class="admin-apu-row-notes">${ST.escapeHtml(t.notas_admin)}</div>` : ''}
 <div class="admin-apu-badges">${badges}</div>
 </div>
 <div class="admin-apu-row-actions">
 <button class="btn-action-drawer" type="button" onclick="window.nexoBraApp.editAdminApuTask(${t.id})">Revisar</button>
 <button class="${on ? 'btn-action-drawer' : 'btn-computo'}" type="button" onclick="window.nexoBraApp.toggleAdminApuHabilitada(${t.id})">${on ? 'Deshabilitar' : 'Habilitar'}</button>
 <button class="admin-apu-delete" type="button" title="Eliminar del catálogo" onclick="window.nexoBraApp.deleteAdminApuTask(${t.id})">Eliminar</button>
 </div>
 </div>`;
 }).join('');
}

/** Habilita o deshabilita una tarea desde la lista, sin abrir el editor. */
export async function toggleAdminApuHabilitada(id) {
 const task = Apu.getTask(id);
 if (!task) return;
 const habilitar = task.habilitada !== true;
 if (habilitar) {
 const cost = adminApuUnitCost(task);
 if (cost.faltantes > 0 && !confirm(`"${task.nombre}" tiene ${cost.faltantes} componente${cost.faltantes === 1 ? '' : 's'} sin precio: en la Calculadora van a sumar $0. ¿Habilitarla igual?`)) return;
 }
 const update = { habilitada: habilitar, updated_at: new Date().toISOString() };
 if (habilitar) update.revisada_at = new Date().toISOString();
 const { error } = await ST.supabaseClient.from('apu_tasks').update(update).eq('id', id);
 if (error) { ST.showToast('No se pudo cambiar: ' + error.message); return; }
 task.habilitada = habilitar;
 if (habilitar) task.revisada_at = update.revisada_at;
 renderAdminApuList();
 ST.showToast(habilitar ? `Habilitada en la Calculadora: ${task.nombre}` : `Deshabilitada: ${task.nombre}`);
}

async function renameAdminApuRubro() {
 const from = document.getElementById('admin-apu-rename-from')?.value;
 const to = (document.getElementById('admin-apu-rename-to')?.value || '').trim();
 if (!to) { ST.showToast('Escribí el nombre nuevo del rubro.'); return; }
 const cuantas = (ST.apuCatalogState.tasks || []).filter(t => (t.rubro || 'Sin rubro') === from).length;
 if (!confirm(`¿Cambiar el rubro "${from}" por "${to}" en ${cuantas} tarea${cuantas === 1 ? '' : 's'}?`)) return;
 const { data, error } = await ST.supabaseClient.rpc('admin_rename_apu_rubro', { p_old: from === 'Sin rubro' ? '' : from, p_new: to });
 if (error) { ST.showToast('No se pudo renombrar: ' + error.message); return; }
 ST.showToast(`Rubro renombrado en ${data} tarea${data === 1 ? '' : 's'}.`);
 document.getElementById('admin-apu-rename-to').value = '';
 document.getElementById('admin-apu-rename-box').style.display = 'none';
 await loadAdminApuTasks();
}

export async function deleteAdminApuTask(id) {
 const task = Apu.getTask(id);
 if (!confirm(`¿Eliminar "${task ? task.nombre : 'este APU'}" del catálogo? Los presupuestos que los usuarios ya guardaron con esta tarea no se ven afectados (tienen su propia copia), pero nadie va a poder volver a buscarla.`)) return;
 const { error: compErr } = await ST.supabaseClient.from('apu_task_components').delete().eq('apu_task_id', id);
 if (compErr) { ST.showToast('No se pudo eliminar: ' + compErr.message); return; }
 const { error } = await ST.supabaseClient.from('apu_tasks').delete().eq('id', id);
 if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
 if (task && task.imagen_path) await ST.supabaseClient.storage.from('apu-images').remove([task.imagen_path]);
 ST.showToast('APU eliminado del catálogo.');
 await loadAdminApuTasks();
}

// --- Modal "Agregar un APU al catálogo" ---

function resetAdminApuDraft() {
 adminApuState.draft = { components: [] };
}

function populateAdminApuSelects() {
 const laborSelect = document.getElementById('admin-apu-labor-select');
 const equipmentSelect = document.getElementById('admin-apu-equipment-select');
 if (laborSelect) {
 laborSelect.innerHTML = (ST.apuCatalogState.laborRates || [])
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
 if (equipmentSelect) {
 equipmentSelect.innerHTML = (ST.apuCatalogState.equipmentRates || [])
 .filter(r => r.id !== ST.apuCatalogState.herramientasRateId)
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
}

// Cambia el título y el texto del botón de guardar según si el modal está
// agregando un APU nuevo o editando uno ya existente (mismo modal, dos modos).
function setAdminApuModalMode(mode, nombreTarea) {
 const title = document.getElementById('admin-apu-task-title');
 const saveBtn = document.getElementById('btn-admin-apu-save');
 if (mode === 'edit') {
 if (title) title.textContent = `Editar APU: ${nombreTarea || ''}`;
 if (saveBtn) saveBtn.textContent = 'Guardar cambios';
 } else {
 if (title) title.textContent = 'Agregar un APU al catálogo';
 if (saveBtn) saveBtn.textContent = 'Guardar en el catálogo de NEXOBRA';
 }
}

function resetAdminApuImageState(task) {
 if (adminApuState.pendingImageUrl) URL.revokeObjectURL(adminApuState.pendingImageUrl);
 adminApuState.pendingImage = null;
 adminApuState.pendingImageUrl = null;
 adminApuState.removeImage = false;
 const input = document.getElementById('admin-apu-image-input');
 if (input) input.value = '';
 showAdminApuImagePreview(task && task.imagen_url ? task.imagen_url : null);
}

function showAdminApuImagePreview(url) {
 const img = document.getElementById('admin-apu-image-preview');
 const removeBtn = document.getElementById('btn-admin-apu-image-remove');
 if (img) {
 if (url) { img.src = url; img.style.display = 'block'; }
 else { img.removeAttribute('src'); img.style.display = 'none'; }
 }
 if (removeBtn) removeBtn.style.display = url ? '' : 'none';
}

async function handleAdminApuImageChange(e) {
 const file = e.target.files && e.target.files[0];
 if (!file) return;
 if (!file.type.startsWith('image/')) { ST.showToast('Tiene que ser una imagen.'); return; }
 try {
 const blob = await ST.compressImageForUpload(file);
 if (adminApuState.pendingImageUrl) URL.revokeObjectURL(adminApuState.pendingImageUrl);
 adminApuState.pendingImage = blob;
 adminApuState.pendingImageUrl = URL.createObjectURL(blob);
 adminApuState.removeImage = false;
 showAdminApuImagePreview(adminApuState.pendingImageUrl);
 } catch (err) {
 ST.showToast(err.message);
 }
}

function removeAdminApuImage() {
 if (adminApuState.pendingImageUrl) URL.revokeObjectURL(adminApuState.pendingImageUrl);
 adminApuState.pendingImage = null;
 adminApuState.pendingImageUrl = null;
 adminApuState.removeImage = true;
 const input = document.getElementById('admin-apu-image-input');
 if (input) input.value = '';
 showAdminApuImagePreview(null);
}

export async function openAdminApuTaskModal() {
 const modal = document.getElementById('admin-apu-task-modal');
 const backdrop = document.getElementById('admin-apu-task-backdrop');
 if (!modal || !backdrop) return;
 await Apu.loadApuCatalog();
 adminApuState.editingTaskId = null;
 resetAdminApuDraft();
 document.getElementById('admin-apu-nombre').value = '';
 document.getElementById('admin-apu-unidad').value = '';
 document.getElementById('admin-apu-rubro').value = '';
 document.getElementById('admin-apu-descripcion').value = '';
 document.getElementById('admin-apu-desperdicio').value = '0';
 document.getElementById('admin-apu-herramientas').value = '0';
 document.getElementById('admin-apu-material-search').value = '';
 document.getElementById('admin-apu-material-results').innerHTML = '';
 document.getElementById('admin-apu-notas').value = '';
 document.getElementById('admin-apu-habilitada').checked = false;
 document.getElementById('admin-apu-revisar').checked = false;
 resetAdminApuImageState(null);
 populateAdminApuRubroFilters();
 populateAdminApuSelects();
 renderAdminApuDraftList();
 setAdminApuModalMode('create');
 modal.classList.add('open');
 backdrop.classList.add('open');
 document.body.style.overflow = 'hidden';
}

// Abre el mismo modal, pero precargado con los datos y componentes de un APU
// ya existente del catálogo -- guardar actualiza esa fila en vez de crear una nueva.
export async function editAdminApuTask(id) {
 const modal = document.getElementById('admin-apu-task-modal');
 const backdrop = document.getElementById('admin-apu-task-backdrop');
 if (!modal || !backdrop) return;
 await Apu.loadApuCatalog();
 const task = Apu.getTask(id);
 if (!task) { ST.showToast('No se encontró esa tarea en el catálogo.'); return; }

 adminApuState.editingTaskId = id;
 const rawComponents = ST.apuCatalogState.componentsByTask[id] || [];
 adminApuState.draft = {
 components: rawComponents.map(c => ({
 localId: adminApuLocalId('comp'),
 tipo: c.tipo,
 material_id: c.tipo === 'material' ? c.material_id : null,
 labor_rate_id: c.tipo === 'mano_obra' ? c.labor_rate_id : null,
 equipment_rate_id: c.tipo === 'equipo' ? c.equipment_rate_id : null,
 denominacion: c.descripcion_original,
 unidad_snapshot: c.unidad,
 rendimiento: c.rendimiento
 }))
 };

 document.getElementById('admin-apu-nombre').value = task.nombre || '';
 document.getElementById('admin-apu-unidad').value = task.unidad || '';
 document.getElementById('admin-apu-rubro').value = task.rubro || '';
 document.getElementById('admin-apu-descripcion').value = task.descripcion || '';
 document.getElementById('admin-apu-desperdicio').value = task.desperdicio_pct ?? 0;
 document.getElementById('admin-apu-herramientas').value = task.herramientas_pct_mo ?? 0;
 document.getElementById('admin-apu-material-search').value = '';
 document.getElementById('admin-apu-material-results').innerHTML = '';
 document.getElementById('admin-apu-notas').value = task.notas_admin || '';
 document.getElementById('admin-apu-habilitada').checked = task.habilitada === true;
 document.getElementById('admin-apu-revisar').checked = !!task.necesita_revision;
 resetAdminApuImageState(task);
 populateAdminApuRubroFilters();
 populateAdminApuSelects();
 renderAdminApuDraftList();
 setAdminApuModalMode('edit', task.nombre);
 modal.classList.add('open');
 backdrop.classList.add('open');
 document.body.style.overflow = 'hidden';
}

export function closeAdminApuTaskModal() {
 const modal = document.getElementById('admin-apu-task-modal');
 const backdrop = document.getElementById('admin-apu-task-backdrop');
 if (!modal || !backdrop) return;
 modal.classList.remove('open');
 backdrop.classList.remove('open');
 document.body.style.overflow = '';
 adminApuState.editingTaskId = null;
}

export function renderAdminApuMaterialResults() {
 const searchInput = document.getElementById('admin-apu-material-search');
 const resultsEl = document.getElementById('admin-apu-material-results');
 if (!searchInput || !resultsEl) return;
 const query = searchInput.value.trim();
 if (query.length < 2) { resultsEl.innerHTML = ''; return; }
 const results = Provider.searchMaterialsSimple(query, 20);
 if (results.length === 0) {
 resultsEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Sin resultados.</p>';
 return;
 }
 resultsEl.innerHTML = results.map(item => `
 <div class="apu-task-row">
 <div class="apu-task-row-info" style="flex:1;">
 <strong>${ST.escapeHtml(item.denominacion)}</strong>
 <span>${ST.escapeHtml(item.id)} · ${ST.escapeHtml(item.rubro || '')}</span>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="admin-apu-material-rend-${ST.escapeHtml(item.id)}" value="1" min="0.0001" step="0.0001" title="Cantidad por unidad de tarea">
 <button class="btn-computo" onclick="window.nexoBraApp.addAdminApuMaterialDraft('${item.id}')">+ Agregar</button>
 </div>
 </div>
 `).join('');
}

export function addAdminApuMaterialDraft(materialId) {
 if (!adminApuState.draft) resetAdminApuDraft();
 const material = NEXOBRA_DATA.find(m => m.id === materialId);
 if (!material) return;
 const rendInput = document.getElementById(`admin-apu-material-rend-${materialId}`);
 const rendimiento = rendInput ? (parseFloat(rendInput.value) || 0) : 0;
 if (rendimiento <= 0) { ST.showToast('Poné una cantidad válida por unidad de tarea.'); return; }
 adminApuState.draft.components.push({
 localId: adminApuLocalId('comp'),
 tipo: 'material',
 material_id: material.id,
 denominacion: material.denominacion,
 unidad_snapshot: material.unidadComputo,
 rendimiento
 });
 renderAdminApuDraftList();
 ST.showToast(`+ ${material.denominacion.substring(0, 30)}`);
}

export function addAdminApuLaborDraft() {
 if (!adminApuState.draft) resetAdminApuDraft();
 const select = document.getElementById('admin-apu-labor-select');
 const rendInput = document.getElementById('admin-apu-labor-rend');
 if (!select || !select.value) { ST.showToast('Elegí una mano de obra.'); return; }
 const rate = Apu.getLaborRate(Number(select.value));
 if (!rate) return;
 const rendimiento = parseFloat(rendInput.value) || 0;
 if (rendimiento <= 0) { ST.showToast('Poné un rendimiento válido.'); return; }
 adminApuState.draft.components.push({
 localId: adminApuLocalId('comp'),
 tipo: 'mano_obra',
 labor_rate_id: rate.id,
 denominacion: rate.nombre,
 unidad_snapshot: 'hs',
 rendimiento
 });
 renderAdminApuDraftList();
}

export function addAdminApuEquipmentDraft() {
 if (!adminApuState.draft) resetAdminApuDraft();
 const select = document.getElementById('admin-apu-equipment-select');
 const rendInput = document.getElementById('admin-apu-equipment-rend');
 if (!select || !select.value) { ST.showToast('Elegí un equipo.'); return; }
 const rate = Apu.getEquipmentRate(Number(select.value));
 if (!rate) return;
 const rendimiento = parseFloat(rendInput.value) || 0;
 if (rendimiento <= 0) { ST.showToast('Poné un rendimiento válido.'); return; }
 adminApuState.draft.components.push({
 localId: adminApuLocalId('comp'),
 tipo: 'equipo',
 equipment_rate_id: rate.id,
 denominacion: rate.nombre,
 unidad_snapshot: 'hs',
 rendimiento
 });
 renderAdminApuDraftList();
}

export function removeAdminApuComponentDraft(localId) {
 if (!adminApuState.draft) return;
 adminApuState.draft.components = adminApuState.draft.components.filter(c => c.localId !== localId);
 renderAdminApuDraftList();
}

function renderAdminApuDraftList() {
 const container = document.getElementById('admin-apu-draft-list');
 if (!container) return;
 const components = adminApuState.draft ? adminApuState.draft.components : [];
 if (components.length === 0) {
 container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Todavía no agregaste ningún componente.</p>';
 return;
 }
 const iconByTipo = { material: '', mano_obra: '', equipo: '' };
 const tipoLabel = { material: 'Material', mano_obra: 'Mano de obra', equipo: 'Equipo' };
 container.innerHTML = components.map(c => `
 <div class="apu-task-row">
 <div class="apu-task-row-info" style="flex:1;">
 <strong>${iconByTipo[c.tipo] || ''} ${ST.escapeHtml(c.denominacion)}</strong>
 <span>${tipoLabel[c.tipo] || ''} · ${ST.escapeHtml(c.unidad_snapshot || '')} por unidad de tarea</span>
 </div>
 <div class="apu-task-row-add">
 <input type="number" value="${c.rendimiento}" min="0" step="any" title="Rendimiento: cantidad por unidad de tarea" aria-label="Rendimiento de ${ST.escapeHtml(c.denominacion)}" onchange="window.nexoBraApp.updateAdminApuDraftRend('${c.localId}', this.value)">
 <button class="apu-item-remove" title="Quitar" onclick="window.nexoBraApp.removeAdminApuComponentDraft('${c.localId}')">&times;</button>
 </div>
 </div>
 `).join('');
 renderAdminApuPreview();
}

/** Cambia el rendimiento de un componente del borrador sin tener que sacarlo y volver a agregarlo. */
export function updateAdminApuDraftRend(localId, value) {
 if (!adminApuState.draft) return;
 const comp = adminApuState.draft.components.find(c => c.localId === localId);
 const v = ST.parseLocaleNumber(value);
 if (!comp || !isFinite(v) || v < 0) { ST.showToast('Poné un rendimiento válido.'); return; }
 comp.rendimiento = v;
 renderAdminApuPreview();
}

/**
 * (16/11) Vista previa del costo de UNA unidad de la tarea tal como está en
 * el editor, con el mismo cálculo y los mismos precios (mes actual) que usa
 * la Calculadora para el público: así se ve, antes de habilitarla, si algún
 * componente quedó sin precio o si el total por unidad tiene sentido.
 */
function renderAdminApuPreview() {
 const el = document.getElementById('admin-apu-preview');
 if (!el) return;
 const components = adminApuState.draft ? adminApuState.draft.components : [];
 if (components.length === 0) { el.innerHTML = '<p class="admin-dash-empty">Agregá componentes para ver el costo.</p>'; return; }
 const unidad = document.getElementById('admin-apu-unidad')?.value.trim() || 'unidad';
 const item = {
 quantity: 1,
 desperdicio_pct_snapshot: ST.parseLocaleNumber(document.getElementById('admin-apu-desperdicio')?.value) || 0,
 herramientas_pct_mo_snapshot: ST.parseLocaleNumber(document.getElementById('admin-apu-herramientas')?.value) || 0,
 components: components.map(c => ({
 tipo: c.tipo,
 material_id: c.tipo === 'material' ? c.material_id : null,
 labor_rate_id: c.tipo === 'mano_obra' ? c.labor_rate_id : null,
 equipment_rate_id: c.tipo === 'equipo' ? c.equipment_rate_id : null,
 rendimiento: Number(c.rendimiento) || 0,
 descripcion_snapshot: c.denominacion,
 unidad_snapshot: c.unidad_snapshot,
 source_kind: 'reference',
 price_snapshot: null
 }))
 };
 let b;
 try { b = Apu.calcItemBreakdown(item); } catch (err) { el.innerHTML = `<p class="admin-dash-empty">${ST.escapeHtml(err.message)}</p>`; return; }
 const lineas = [...b.lineas, ...(b.herramientas && b.herramientas.cantidadNecesaria > 0 ? [b.herramientas] : [])];
 const faltan = lineas.filter(l => !l.disponible).length;
 const mes = ST.state.apuMonth || ST.state.priceMonth;
 el.innerHTML = `
 ${faltan ? `<p class="admin-apu-warning">${faltan} componente${faltan === 1 ? '' : 's'} sin precio: en la Calculadora van a sumar $0. Vinculalos a un material del catálogo o cargá el precio.</p>` : ''}
 <div class="admin-apu-preview-table">
 <div class="admin-apu-preview-row head"><span>Componente</span><span>Cantidad</span><span>Precio unit.</span><span>Costo</span></div>
 ${lineas.map(l => `<div class="admin-apu-preview-row ${l.disponible ? '' : 'missing'}"><span>${ST.escapeHtml(l.descripcion_snapshot || '')}</span><span>${ST.formatQty(l.cantidadNecesaria)} ${ST.escapeHtml(l.unidad_snapshot || '')}</span><span>${l.disponible ? ST.formatMoney(l.unitPrice) : 'sin precio'}</span><span>${ST.formatMoney(l.costo)}</span></div>`).join('')}
 <div class="admin-apu-preview-row total"><span>Total por ${ST.escapeHtml(unidad)}</span><span></span><span></span><span>${ST.formatMoney(b.total)}</span></div>
 </div>
 <p class="admin-dash-note" style="margin-top:6px;">Materiales ${ST.formatMoney(b.materialesCost)} · mano de obra ${ST.formatMoney(b.manoObraCost)} · equipos y herramientas ${ST.formatMoney(b.equiposCost)}. Precios de ${mes ? ST.monthLabel(mes) : 'referencia'}, sin cargas sociales ni impuestos (sin Factor K).</p>`;
}

/** Sube, reemplaza o borra la imagen de referencia de una tarea. Devuelve un aviso si algo falló (la tarea ya quedó guardada igual). */
async function saveAdminApuImage(taskId, previous) {
 const oldPath = previous ? previous.imagen_path : null;
 try {
 if (adminApuState.pendingImage) {
 const path = `${taskId}/${Date.now()}.jpg`;
 const { error: upErr } = await ST.supabaseClient.storage.from('apu-images').upload(path, adminApuState.pendingImage, { contentType: 'image/jpeg' });
 if (upErr) return 'no se pudo subir la imagen: ' + upErr.message;
 const { data: pub } = ST.supabaseClient.storage.from('apu-images').getPublicUrl(path);
 const { error: updErr } = await ST.supabaseClient.from('apu_tasks').update({ imagen_url: pub.publicUrl, imagen_path: path }).eq('id', taskId);
 if (updErr) return 'la imagen se subió pero no se pudo asociar: ' + updErr.message;
 if (oldPath) await ST.supabaseClient.storage.from('apu-images').remove([oldPath]);
 } else if (adminApuState.removeImage && previous && previous.imagen_url) {
 const { error: updErr } = await ST.supabaseClient.from('apu_tasks').update({ imagen_url: null, imagen_path: null }).eq('id', taskId);
 if (updErr) return 'no se pudo quitar la imagen: ' + updErr.message;
 if (oldPath) await ST.supabaseClient.storage.from('apu-images').remove([oldPath]);
 }
 } finally {
 resetAdminApuImageState(null);
 }
 return null;
}

export async function saveAdminApuTask() {
 const nombre = document.getElementById('admin-apu-nombre').value.trim();
 const unidad = document.getElementById('admin-apu-unidad').value.trim();
 const rubro = document.getElementById('admin-apu-rubro').value.trim() || null;
 const descripcion = document.getElementById('admin-apu-descripcion').value.trim() || null;
 const notas_admin = document.getElementById('admin-apu-notas')?.value.trim() || null;
 const habilitada = !!document.getElementById('admin-apu-habilitada')?.checked;
 const necesita_revision = !!document.getElementById('admin-apu-revisar')?.checked;
 const desperdicio_pct = ST.parseLocaleNumber(document.getElementById('admin-apu-desperdicio').value) || 0;
 const herramientas_pct_mo = ST.parseLocaleNumber(document.getElementById('admin-apu-herramientas').value) || 0;

 if (!nombre || !unidad) { ST.showToast('Completá al menos el nombre y la unidad de la tarea.'); return; }
 if (!adminApuState.draft || adminApuState.draft.components.length === 0) {
 ST.showToast('Agregá al menos un material, mano de obra o equipo.');
 return;
 }

 if (habilitada) {
 const faltan = document.querySelectorAll('#admin-apu-preview .admin-apu-preview-row.missing').length;
 if (faltan && !confirm(`Vas a dejar habilitada esta tarea con ${faltan} componente${faltan === 1 ? '' : 's'} sin precio (suman $0 en la Calculadora). ¿Seguir?`)) return;
 }
 const btn = document.getElementById('btn-admin-apu-save');
 if (btn) btn.disabled = true;
 const editingId = adminApuState.editingTaskId;
 const previous = editingId ? Apu.getTask(editingId) : null;
 const now = new Date().toISOString();
 const taskFields = { nombre, unidad, rubro, descripcion, desperdicio_pct, herramientas_pct_mo, notas_admin, habilitada, necesita_revision, updated_at: now };
 if (habilitada && !(previous && previous.habilitada === true)) taskFields.revisada_at = now;
 try {
 let taskId;
 if (editingId) {
 // Modo edición: actualizamos la fila existente en vez de insertar una nueva.
 const { error: updateErr } = await ST.supabaseClient
 .from('apu_tasks')
 .update({ ...taskFields })
 .eq('id', editingId);
 if (updateErr) throw updateErr;
 taskId = editingId;
 // Reemplazamos TODOS los componentes: se borran los viejos y se insertan
 // los del draft (que ya puede tener ediciones/agregados/quitados) -- más
 // simple y seguro que calcular un diff fila por fila.
 const { error: delErr } = await ST.supabaseClient.from('apu_task_components').delete().eq('apu_task_id', taskId);
 if (delErr) throw delErr;
 } else {
 const { data: taskRow, error: taskErr } = await ST.supabaseClient
 .from('apu_tasks')
 .insert({ ...taskFields })
 .select()
 .single();
 if (taskErr) throw taskErr;
 taskId = taskRow.id;
 }

 const componentRows = adminApuState.draft.components.map(c => ({
 apu_task_id: taskId,
 tipo: c.tipo,
 descripcion_original: c.denominacion,
 unidad: c.unidad_snapshot,
 rendimiento: c.rendimiento,
 material_id: c.tipo === 'material' ? c.material_id : null,
 labor_rate_id: c.tipo === 'mano_obra' ? c.labor_rate_id : null,
 equipment_rate_id: c.tipo === 'equipo' ? c.equipment_rate_id : null
 }));
 const { error: compErr } = await ST.supabaseClient.from('apu_task_components').insert(componentRows);
 if (compErr) {
 // Si esto falla al crear un APU nuevo, no dejamos un apu_tasks sin
 // componentes dando vueltas. Si falla editando uno existente, la tarea
 // ya quedó con sus componentes viejos borrados -- se avisa para que el
 // admin reintente guardar (los datos del draft siguen en el modal).
 if (!editingId) await ST.supabaseClient.from('apu_tasks').delete().eq('id', taskId);
 throw compErr;
 }

 // Imagen de referencia: se sube recién ahora que la tarea tiene id.
 const imageWarning = await saveAdminApuImage(taskId, previous);

 ST.showToast((editingId ? `Cambios guardados: ${nombre}` : `APU agregado al catálogo: ${nombre}`) + (imageWarning ? ` (${imageWarning})` : ''));
 closeAdminApuTaskModal();
 await loadAdminApuTasks();
 } catch (err) {
 ST.showToast('No se pudo guardar el APU: ' + err.message);
 } finally {
 if (btn) btn.disabled = false;
 }
}

// ============================================================
// Tablero del sitio (16/11, a pedido del usuario a partir de la auditoría
// del 12/11): los contadores que estaban en el home, ampliados con el
// origen de las visitas, el recorrido (buscar → contactar → registrarse)
// y lo que la gente busca. Todo sale de una sola función de Supabase,
// get_admin_dashboard(días) -- migración 032 --, que valida adentro que
// quien pregunta sea administrador.
// ============================================================

let adminDashChart = null;

const DASH_REFERRAL_LABELS = {
 instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
 recomendacion: 'Recomendación', proveedor: 'Un corralón o proveedor',
 buscador: 'Google / internet', prensa: 'Diario, radio o TV',
 colegio: 'Colegio o charla', otro: 'Otro', '(sin respuesta)': 'Sin respuesta'
};
const DASH_DEVICE_LABELS = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora', '(sin dato)': 'Sin dato' };
const DASH_PAGE_LABELS = {
 '/': 'Inicio', '/catalogo': 'Catálogo', '/proveedores': 'Proveedores', '/calculadora-de-obra': 'Calculadora de Obra',
 '/mano-de-obra': 'Mano de Obra', '/guia-de-uso': 'Guía de Uso', '/quienes-somos': 'Quiénes Somos', '/contacto': 'Contacto',
 '/mis-presupuestos': 'Listas anteriores (Mi Cómputo)', '/mis-presupuestos-de-obra': 'Mis presupuestos', '/mi-proveedor': 'Mi Proveedor', '/admin': 'Panel de Admin',
 '/costo-m2': 'Costo por m²'
};
const DASH_EVENT_LABELS = {
 search: 'Búsquedas de materiales', apu_task_added: 'Ítems agregados al presupuesto (tareas, materiales, mano de obra)',
 provider_cta: 'Toques en "Sumá tu negocio"',
 register_prompt: 'Toques en "Registrarme" desde la Calculadora', signup_start: 'Registros empezados',
 signup: 'Registros terminados', provider_contact: 'Contactos a proveedores por WhatsApp',
 save_budget: 'Presupuestos guardados', share_budget: 'Presupuestos compartidos por link', export: 'Excel descargados'
};

function dashPageLabel(path) {
 if (DASH_PAGE_LABELS[path]) return DASH_PAGE_LABELS[path];
 if (path && path.startsWith('/proveedor/')) return 'Ficha de proveedor: ' + path.slice('/proveedor/'.length);
 return path || '/';
}

function dashDelta(actual, previo) {
 if (!previo) return actual > 0 ? '<span class="admin-dash-delta up">nuevo</span>' : '';
 const pct = Math.round(((actual - previo) / previo) * 100);
 if (pct === 0) return '<span class="admin-dash-delta">igual</span>';
 return `<span class="admin-dash-delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '+' : ''}${pct} %</span>`;
}

function dashKpi(valor, etiqueta, extra) {
 return `<div class="admin-dash-kpi"><strong>${ST.formatInt(valor)}</strong><span>${etiqueta}</span>${extra ? `<small>${extra}</small>` : ''}</div>`;
}

/** Lista de barras horizontales (mismo estilo liviano que el tablero del proveedor). Las etiquetas pasan por escapeHtml: muchas vienen de lo que escriben los visitantes. */
function dashBars(rows, labelFn, valueKey, emptyText) {
 if (!rows || rows.length === 0) return `<p class="admin-dash-empty">${emptyText || 'Todavía no hay datos en este período.'}</p>`;
 const max = Math.max(...rows.map(r => Number(r[valueKey]) || 0), 1);
 return rows.map(r => {
 const v = Number(r[valueKey]) || 0;
 const pct = Math.max(3, Math.round((v / max) * 100));
 const label = labelFn(r);
 return `<div class="stats-bar-row"><span class="stats-bar-label admin-dash-bar-label" title="${ST.escapeHtml(label)}">${ST.escapeHtml(label)}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;"></div></div><span class="stats-bar-value">${ST.formatInt(v)}</span></div>`;
 }).join('');
}

function setDash(id, html) {
 const el = document.getElementById(id);
 if (el) el.innerHTML = html;
}

export async function loadAdminDashboard() {
 const kpisEl = document.getElementById('admin-dash-kpis');
 if (!kpisEl || !ST.supabaseClient) return;
 const errEl = document.getElementById('admin-dash-error');
 const days = parseInt(document.getElementById('admin-dash-period')?.value || '30', 10);
 kpisEl.innerHTML = '<p class="admin-dash-empty">Cargando…</p>';
 if (errEl) errEl.style.display = 'none';

 const { data, error } = await ST.supabaseClient.rpc('get_admin_dashboard', { p_days: days });
 if (error) {
 kpisEl.innerHTML = '';
 if (errEl) {
 errEl.textContent = /get_admin_dashboard/.test(error.message)
 ? 'Falta correr la migración 032 en Supabase para ver el tablero.'
 : 'No se pudo cargar el tablero: ' + error.message;
 errEl.style.display = 'block';
 }
 return;
 }
 renderAdminDashboard(data || {});
}

function renderAdminDashboard(d) {
 const k = d.kpis || {};
 const p = d.periodo || {};
 const rangeEl = document.getElementById('admin-dash-range');
 if (rangeEl && p.desde) {
 const f = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
 rangeEl.textContent = `Del ${f(p.desde)} al ${f(p.hasta)} · comparado con los ${p.dias} días anteriores`;
 }

 setDash('admin-dash-kpis', [
 dashKpi(k.visitas, 'Visitas', `${dashDelta(k.visitas, k.visitas_prev)} ${ST.formatInt(k.visitas_recurrentes)} volvieron`),
 dashKpi(k.cuentas_nuevas, 'Cuentas nuevas', `${dashDelta(k.cuentas_nuevas, k.cuentas_nuevas_prev)} ${ST.formatInt(k.cuentas_total)} en total`),
 dashKpi(k.contactos, 'Contactos a proveedores', dashDelta(k.contactos, k.contactos_prev)),
 dashKpi(k.busquedas, 'Búsquedas', `${ST.formatInt(k.busquedas_sin_resultado)} sin resultado`),
 dashKpi(k.proveedores_activos, 'Proveedores activos', `${ST.formatInt(k.proveedores_materiales)} de materiales · ${ST.formatInt(k.proveedores_servicios)} de servicios · ${ST.formatInt(k.proveedores_pendientes)} por aprobar`),
 dashKpi(k.precios_aprobados, 'Precios de proveedores', `${ST.formatInt(k.precios_pendientes)} por aprobar`),
 dashKpi(k.presupuestos_obra, 'Obras guardadas', `${ST.formatInt(k.presupuestos_obra_total)} en total · ${ST.formatInt(k.computos)} cómputos simples`),
 dashKpi(k.resenas_periodo, 'Reseñas nuevas', `${ST.formatInt(k.resenas)} en total`)
 ].join(''));

 // Recorrido: cada paso como porcentaje de las visitas con dato de sesión.
 const e = d.embudo || {};
 const pasos = [
 ['Visitas', e.visitas],
 ['Buscaron un material o usaron la Calculadora', e.usaron_herramienta],
 ['Contactaron a un proveedor', e.contactaron_proveedor],
 ['Tocaron "Registrarme" o empezaron el registro', e.empezaron_registro],
 ['Terminaron de crear la cuenta', e.se_registraron]
 ];
 const base = Number(e.visitas) || 0;
 setDash('admin-dash-funnel', base === 0
 ? '<p class="admin-dash-empty">Todavía no hay visitas con datos de recorrido en este período (empiezan a contarse después de correr la migración 032 y subir los archivos).</p>'
 : pasos.map(([label, n]) => {
 const v = Number(n) || 0;
 const pct = Math.round((v / base) * 1000) / 10;
 return `<div class="stats-bar-row admin-dash-funnel-row"><span class="stats-bar-label admin-dash-bar-label" title="${label}">${label}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.max(2, Math.min(100, pct))}%;"></div></div><span class="stats-bar-value">${ST.formatInt(v)}</span><span class="admin-dash-pct">${ST.formatPct(pct, 1)} %</span></div>`;
 }).join(''));

 setDash('admin-dash-origen', dashBars(d.origen_visitas, r => r.origen, 'visitas'));
 setDash('admin-dash-referral', dashBars(d.como_nos_conocieron, r => `${DASH_REFERRAL_LABELS[r.origen] || r.origen}${r.periodo ? ` (${r.periodo} en el período)` : ''}`, 'total', 'Todavía no hay cuentas.'));
 setDash('admin-dash-paginas', dashBars(d.paginas_entrada, r => dashPageLabel(r.pagina), 'visitas'));
 const recurrentes = Number(k.visitas_recurrentes) || 0;
 const nuevas = Number(k.visitas_nuevas) || 0;
 setDash('admin-dash-dispositivos', dashBars(d.dispositivos, r => DASH_DEVICE_LABELS[r.dispositivo] || r.dispositivo, 'visitas')
 + (recurrentes + nuevas > 0 ? `<p class="admin-dash-note" style="margin-top:8px;">${ST.formatInt(nuevas)} visitas de primera vez · ${ST.formatInt(recurrentes)} de gente que ya había entrado.</p>` : ''));
 setDash('admin-dash-busquedas', dashBars(d.busquedas_top, r => `${r.texto}${r.sin_resultado ? ` (${r.sin_resultado} sin resultado)` : ''}`, 'veces', 'Todavía no hay búsquedas en este período.'));
 setDash('admin-dash-sin-resultado', dashBars(d.busquedas_sin_resultado, r => r.texto, 'veces', 'Ninguna búsqueda quedó sin resultado en este período.'));
 setDash('admin-dash-tareas', dashBars(d.tareas_calculadora, r => r.tarea, 'veces', 'Todavía nadie agregó tareas en este período.'));
 setDash('admin-dash-proveedores', dashBars(d.proveedores_top, r => `${r.proveedor} · ${ST.formatInt(r.vistas)} ${Number(r.vistas) === 1 ? 'vista' : 'vistas'} · WhatsApp:`, 'whatsapp', 'Todavía no hay consultas a proveedores en este período.'));
 setDash('admin-dash-eventos', dashBars(d.eventos, r => DASH_EVENT_LABELS[r.evento] || r.evento, 'veces'));
 setDash('admin-dash-campanas', dashBars(d.campanas, r => [r.campana, r.fuente, r.medio].filter(Boolean).join(' · '), 'visitas', 'Ninguna visita llegó con un link etiquetado todavía. Armá uno abajo.'));

 renderAdminDashChart(d.serie_diaria || []);
}

async function renderAdminDashChart(serie) {
 const canvas = document.getElementById('admin-dash-chart');
 if (!canvas) return;
 try {
 await ST.ensureChartJsLoaded();
 } catch (err) {
 canvas.parentElement.innerHTML = `<p class="admin-dash-empty">${ST.escapeHtml(err.message)}</p>`;
 return;
 }
 const css = getComputedStyle(document.documentElement);
 const color = name => css.getPropertyValue(name).trim();
 const yellow = color('--brand-yellow') || '#F5B000';
 const ink = color('--text-main') || '#1E2229';
 const muted = color('--text-muted') || '#5E6977';
 const grid = color('--border-light') || '#e5e5e5';
 const green = color('--color-success') || '#15803d';
 const labels = serie.map(r => new Date(`${r.dia}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }));
 if (adminDashChart) adminDashChart.destroy();
 adminDashChart = new window.Chart(canvas, {
 data: {
 labels,
 datasets: [
 { type: 'bar', label: 'Visitas', data: serie.map(r => r.visitas), backgroundColor: yellow, borderRadius: 3, yAxisID: 'y', order: 2 },
 { type: 'line', label: 'Cuentas nuevas', data: serie.map(r => r.cuentas), borderColor: green, backgroundColor: green, pointRadius: 2, tension: 0, yAxisID: 'y1', order: 1 },
 { type: 'line', label: 'Contactos a proveedores', data: serie.map(r => r.contactos), borderColor: ink, backgroundColor: ink, pointRadius: 2, tension: 0, yAxisID: 'y1', order: 1 }
 ]
 },
 options: {
 responsive: true,
 maintainAspectRatio: false,
 interaction: { mode: 'index', intersect: false },
 plugins: { legend: { labels: { color: ink, boxWidth: 12 } } },
 scales: {
 x: { ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
 y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Visitas', color: muted }, ticks: { color: muted, precision: 0 }, grid: { color: grid } },
 y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Cuentas y contactos', color: muted }, ticks: { color: muted, precision: 0 }, grid: { display: false } }
 }
 }
 });
}

function buildAdminUtmLink() {
 const out = document.getElementById('admin-utm-result');
 if (!out) return;
 const clean = id => (document.getElementById(id)?.value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
 const params = new URLSearchParams();
 const source = clean('admin-utm-source');
 const medium = clean('admin-utm-medium');
 const campaign = clean('admin-utm-campaign');
 if (source) params.set('utm_source', source);
 if (medium) params.set('utm_medium', medium);
 if (campaign) params.set('utm_campaign', campaign);
 const path = document.getElementById('admin-utm-path')?.value || '/';
 const qs = params.toString();
 out.value = `${window.location.origin}${path}${qs ? '?' + qs : ''}`;
}

function setupAdminDashboardListeners() {
 const period = document.getElementById('admin-dash-period');
 const refresh = document.getElementById('btn-admin-dash-refresh');
 if (period) period.addEventListener('change', loadAdminDashboard);
 if (refresh) refresh.addEventListener('click', loadAdminDashboard);
 ['admin-utm-source', 'admin-utm-medium', 'admin-utm-campaign', 'admin-utm-path'].forEach(id => {
 const el = document.getElementById(id);
 if (el) el.addEventListener('input', buildAdminUtmLink);
 if (el) el.addEventListener('change', buildAdminUtmLink);
 });
 buildAdminUtmLink();
 const copy = document.getElementById('btn-admin-utm-copy');
 if (copy) copy.addEventListener('click', () => {
 const out = document.getElementById('admin-utm-result');
 if (!out || !out.value) return;
 if (!document.getElementById('admin-utm-source')?.value.trim()) {
 ST.showToast('Completá al menos "Dónde" (ej. instagram) para que el link sirva de algo.');
 return;
 }
 navigator.clipboard.writeText(out.value).then(
 () => ST.showToast('Link copiado.'),
 () => { out.select(); ST.showToast('Copialo a mano: ya está seleccionado.'); }
 );
 });
}

