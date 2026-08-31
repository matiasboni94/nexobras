// NEXOBRA - admin.js
// Panel de administración (Fase F): editor de materiales, aprobación de
// corralones y agenda de precios pendientes. Todo gated a role='admin' --
// nadie puede autoasignarse ese rol desde la web (ver 001_initial_schema.sql
// y el trigger de registro), solo se activa a mano por SQL.

import * as ST from './state.js';
import * as Provider from './provider.js';

const adminState = {
  materialResults: [],
  editingMaterial: null,
  pendingProviders: [],
  pendingOffers: []
};

export function isAdmin() {
  return ST.authState.profile?.role === 'admin';
}

export function updateAdminNavVisibility() {
  const btn = document.getElementById('btn-open-admin');
  if (btn) btn.style.display = isAdmin() ? 'block' : 'none';
}

// ============================================================
// F2 — Editor de materiales
// ============================================================

function renderMaterialSearchResults() {
  const container = document.getElementById('admin-material-results');
  if (!container) return;
  if (adminState.materialResults.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Sin resultados.</p>';
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
  } catch (err) {
    ST.showToast('No se pudo guardar: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// F3 — Aprobación de corralones
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
    container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay corralones esperando aprobación.</p>';
    return;
  }
  container.innerHTML = adminState.pendingProviders.map(p => {
    const branch = p.provider_branches?.[0];
    return `
      <div class="computation-row">
        <div class="computation-row-info">
          <h4>${p.business_name}</h4>
          <span>
            ${p.tax_id ? `CUIT: ${p.tax_id} · ` : ''}${branch ? `${branch.name}, ${branch.locality}` : 'Sin sucursal cargada'}<br>
            ${p.contact_phone || ''} ${p.contact_email ? '· ' + p.contact_email : ''}
            ${p.description ? `<br><em>${p.description}</em>` : ''}
          </span>
        </div>
        <div class="computation-row-actions">
          <button onclick="window.nexoBraApp.approveProvider(${ST.escAttr(p.id)})">✓ Aprobar</button>
          <button class="danger" onclick="window.nexoBraApp.rejectProvider(${ST.escAttr(p.id)})">✕ Rechazar</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function approveProvider(id) {
  const { error } = await ST.supabaseClient.from('providers').update({ verification_status: 'approved' }).eq('id', id);
  if (error) { ST.showToast('No se pudo aprobar: ' + error.message); return; }
  ST.showToast('Corralón aprobado. Ya aparece en el mapa.');
  loadPendingProviders();
}

export async function rejectProvider(id) {
  if (!confirm('¿Rechazar este corralón? No va a aparecer públicamente hasta que lo apruebes.')) return;
  const { error } = await ST.supabaseClient.from('providers').update({ verification_status: 'rejected' }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Corralón rechazado.');
  loadPendingProviders();
}

// ============================================================
// F4 — Agenda de precios pendientes (por corralón)
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

  // Agrupar por corralón (agenda por corralón, como pediste).
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
                <span>${offer.provider_sku ? `SKU: ${offer.provider_sku} · ` : ''}${ST.formatMoney(offer.amount)} / ${offer.unit} · ${offer.stock_status}</span>
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
  const { error } = await ST.supabaseClient.from('provider_offers').update({ status: 'approved' }).eq('id', id);
  if (error) { ST.showToast('No se pudo aprobar: ' + error.message); return; }
  ST.showToast('Precio aprobado.');
  loadPendingOffers();
}

export async function rejectOffer(id) {
  const { error } = await ST.supabaseClient.from('provider_offers').update({ status: 'rejected' }).eq('id', id);
  if (error) { ST.showToast('No se pudo rechazar: ' + error.message); return; }
  ST.showToast('Precio rechazado.');
  loadPendingOffers();
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

  if (btnOpenAdmin) btnOpenAdmin.addEventListener('click', () => {
    ST.authDropdown.style.display = 'none';
    window.nexoBraApp.switchView('admin');
  });
  if (materialSearch) materialSearch.addEventListener('input', searchMaterialsForAdmin);
  if (btnCloseEditor) btnCloseEditor.addEventListener('click', closeMaterialEditor);
  if (btnSaveEdit) btnSaveEdit.addEventListener('click', (e) => { e.preventDefault(); saveMaterialEdit(); });
  if (btnRecalc) btnRecalc.addEventListener('click', recalcPrecioComputo);
}

export function loadAdminPanel() {
  loadPendingProviders();
  loadPendingOffers();
}
