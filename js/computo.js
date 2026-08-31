// NEXOBRA - computo.js

import * as Auth from './auth.js';
import * as Main from './main.js';
import * as Pricing from './pricing.js';
import * as ST from './state.js';

  export function updateComputationNameUI() {
    ST.btnSaveComputationLabel.textContent = ST.computationState.currentId ? 'Actualizar' : 'Guardar';
  }

  /** Convierte un item del carrito (ST.state.computoCart) a una fila de computation_items. */
  export function cartItemToRow(item, computationId) {
    const pricing = Pricing.resolveItemPricing(item, ST.state.computoMonth);
    return {
      computation_id: computationId,
      material_id: item.type === 'material' ? item.id : null,
      labor_series_code: item.type === 'labor' ? item.id : null,
      item_type: item.type || 'material',
      denomination_snapshot: item.denominacion,
      quantity: item.qty,
      unit: item.unit,
      price_snapshot: pricing.unitPrice,
      rubro: item.rubro || null,
      base_price_snapshot: pricing.basePrice ?? null,
      factor_snapshot: pricing.factor ?? null,
      reference_period: ST.state.computoMonth,
      pricing_mode: item.mode || 'venta',
      source_kind: item.providerOfferId ? 'provider_offer' : 'reference',
      provider_offer_id: item.providerOfferId || null,
      provider_branch_id: item.providerBranchId || null,
      provider_business_name: item.providerBusinessName || null,
      provider_branch_name: item.providerBranchName || null,
      provider_whatsapp: item.providerWhatsapp || null
    };
  }

  /** Convierte una fila de computation_items de vuelta a un item de carrito "vivo" (sin precio congelado, salvo que venga de un proveedor puntual). */
  export function rowToCartItem(row) {
    const base = {
      id: row.material_id || row.labor_series_code,
      denominacion: row.denomination_snapshot,
      rubro: row.rubro,
      unit: row.unit,
      qty: Number(row.quantity),
      type: row.item_type,
      mode: row.pricing_mode || 'venta'
    };
    if (row.provider_offer_id) {
      base.providerOfferId = row.provider_offer_id;
      base.providerBranchId = row.provider_branch_id;
      base.providerBusinessName = row.provider_business_name;
      base.providerBranchName = row.provider_branch_name;
      base.providerWhatsapp = row.provider_whatsapp;
      base.providerPrice = Number(row.price_snapshot); // acá sí se respeta el precio guardado: es fijo por diseño
    }
    return base;
  }

  export async function saveComputation() {
    if (!ST.authState.user) {
      Auth.showAuthTab('login');
      Auth.openAuthModal();
      Auth.showAuthError('Iniciá sesión para guardar tu presupuesto.');
      return;
    }
    if (ST.state.computoCart.length === 0) {
      ST.showToast('Agregá al menos un ítem antes de guardar.');
      return;
    }

    const name = ST.drawerComputationName.value.trim() || 'Mi cómputo';
    ST.btnSaveComputation.disabled = true;

    try {
      let computationId = ST.computationState.currentId;

      if (computationId) {
        const { error } = await ST.supabaseClient
          .from('computations')
          .update({ name, locality: ST.authState.profile?.locality || null })
          .eq('id', computationId);
        if (error) throw error;

        const { error: deleteError } = await ST.supabaseClient
          .from('computation_items')
          .delete()
          .eq('computation_id', computationId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await ST.supabaseClient
          .from('computations')
          .insert({ name, user_id: ST.authState.user.id, locality: ST.authState.profile?.locality || null })
          .select('id')
          .single();
        if (error) throw error;
        computationId = data.id;
        ST.computationState.currentId = computationId;
      }

      const rows = ST.state.computoCart.map(item => cartItemToRow(item, computationId));
      const { error: insertError } = await ST.supabaseClient.from('computation_items').insert(rows);
      if (insertError) throw insertError;

      updateComputationNameUI();
      ST.showToast('Presupuesto guardado.');
    } catch (err) {
      ST.showToast('No se pudo guardar: ' + err.message);
    } finally {
      ST.btnSaveComputation.disabled = false;
    }
  }

  export function startNewComputation() {
    ST.computationState.currentId = null;
    ST.state.computoCart = [];
    saveCart();
    ST.drawerComputationName.value = 'Mi cómputo';
    updateComputationNameUI();
    updateCartUI();
    ST.showToast('Empezaste un presupuesto nuevo.');
  }

  export async function loadMyComputations() {
    if (!ST.authState.user) return;
    ST.myComputationsList.innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';

    const { data, error } = await ST.supabaseClient
      .from('computations')
      .select('id, name, locality, updated_at, computation_items(count)')
      .eq('user_id', ST.authState.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      ST.myComputationsList.innerHTML = `<p style="color:#b91c1c;">No se pudieron cargar tus presupuestos: ${error.message}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      ST.myComputationsList.innerHTML = `
        <div class="computo-empty-ST.state">
          <div class="empty-icon">📋</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no guardaste ningún presupuesto</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Armá un cómputo desde el catálogo y tocá "Guardar" en el panel lateral.</p>
        </div>
      `;
      return;
    }

    ST.myComputationsList.innerHTML = data.map(comp => {
      const count = comp.computation_items?.[0]?.count ?? 0;
      const fecha = new Date(comp.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div class="computation-row">
          <div class="computation-row-info">
            <h4>${comp.name}</h4>
            <span>${count} ítem${count === 1 ? '' : 's'} · actualizado el ${fecha}${comp.locality ? ' · ' + comp.locality : ''}</span>
          </div>
          <div class="computation-row-actions">
            <button onclick="window.nexoBraApp.openComputation('${comp.id}')">Abrir</button>
            <button onclick="window.nexoBraApp.duplicateComputation('${comp.id}')">Duplicar</button>
            <button class="danger" onclick="window.nexoBraApp.deleteComputation('${comp.id}')">Eliminar</button>
          </div>
        </div>
      `;
    }).join('');
  }

  export async function openComputation(id) {
    const [{ data: comp, error: compError }, { data: items, error: itemsError }] = await Promise.all([
      ST.supabaseClient.from('computations').select('id, name').eq('id', id).single(),
      ST.supabaseClient.from('computation_items').select('*').eq('computation_id', id)
    ]);

    if (compError || itemsError) {
      ST.showToast('No se pudo abrir el presupuesto.');
      return;
    }

    ST.computationState.currentId = comp.id;
    ST.state.computoCart = (items || []).map(rowToCartItem);
    saveCart();
    ST.drawerComputationName.value = comp.name;
    // Al reabrir, el cómputo vuelve a arrancar en el mes más actual disponible
    // (no en el que se guardó la última vez) — el usuario lo cambia si quiere.
    if (Pricing.sharedMonths.length > 0) {
      ST.state.computoMonth = Pricing.sharedMonths[Pricing.sharedMonths.length - 1];
      Pricing.populateComputoMonthSelect();
    }
    updateComputationNameUI();
    updateCartUI();
    openDrawer();
    ST.showToast(`Abriste "${comp.name}"`);
  }

  export async function duplicateComputation(id) {
    const [{ data: comp, error: compError }, { data: items, error: itemsError }] = await Promise.all([
      ST.supabaseClient.from('computations').select('name, locality').eq('id', id).single(),
      ST.supabaseClient.from('computation_items').select('*').eq('computation_id', id)
    ]);
    if (compError || itemsError) {
      ST.showToast('No se pudo duplicar el presupuesto.');
      return;
    }

    const { data: newComp, error: insertError } = await ST.supabaseClient
      .from('computations')
      .insert({ name: `${comp.name} (copia)`, user_id: ST.authState.user.id, locality: comp.locality })
      .select('id')
      .single();
    if (insertError) {
      ST.showToast('No se pudo duplicar el presupuesto.');
      return;
    }

    if (items && items.length > 0) {
      const rows = items.map(row => ({ ...row, id: undefined, computation_id: newComp.id, created_at: undefined, updated_at: undefined }));
      await ST.supabaseClient.from('computation_items').insert(rows);
    }

    ST.showToast('Presupuesto duplicado.');
    loadMyComputations();
  }

  export async function deleteComputation(id) {
    if (!confirm('¿Eliminar este presupuesto? Esta acción no se puede deshacer.')) return;
    const { error } = await ST.supabaseClient.from('computations').delete().eq('id', id);
    if (error) {
      ST.showToast('No se pudo eliminar: ' + error.message);
      return;
    }
    if (ST.computationState.currentId === id) startNewComputation();
    ST.showToast('Presupuesto eliminado.');
    loadMyComputations();
  }

  export function setupComputationListeners() {
    if (!ST.supabaseClient) return;
    ST.btnSaveComputation.addEventListener('click', saveComputation);
    ST.btnNewComputation.addEventListener('click', startNewComputation);
    ST.btnOpenMyComputations.addEventListener('click', () => {
      ST.authDropdown.style.display = 'none';
      Main.switchView('my-computations');
    });
  }
  export function addLaborToComputo(code) {
    const role = ST.laborState.roles.find(r => r.code === code);
    if (!role) return;

    const qtyInput = document.getElementById(`labor-qty-${code}`);
    const qty = qtyInput ? Math.max(0.5, parseFloat(qtyInput.value) || 1) : 1;
    const unit = role.unit === 'mes' ? 'mes' : 'hora';

    const existingIndex = ST.state.computoCart.findIndex(i => i.id === code && i.type === 'labor');
    if (existingIndex > -1) {
      ST.state.computoCart[existingIndex].qty += qty;
    } else {
      // Igual que con materiales: no se congela precio acá, se resuelve en vivo
      // contra ST.state.computoMonth al mostrar/exportar el cómputo.
      ST.state.computoCart.push({
        id: code,
        denominacion: `${role.name} (mano de obra)`,
        rubro: 'Mano de obra',
        unit: unit,
        qty: qty,
        type: 'labor'
      });
    }

    saveCart();
    updateCartUI();
    ST.showToast(`+${qty} ${unit} agregado: ${role.name}`);
  }

  export function addToComputo(itemId) {
    const item = NEXOBRA_DATA.find(i => i.id === itemId);
    if (!item) return;

    const qtyInput = document.getElementById(`qty-${itemId}`);
    const qty = qtyInput ? Math.max(1, parseFloat(qtyInput.value) || 1) : 1;
    const unit = ST.state.pricingMode === 'venta' ? item.unidadVenta : item.unidadComputo;

    const existingIndex = ST.state.computoCart.findIndex(i => i.id === itemId && i.type === 'material' && i.mode === ST.state.pricingMode);

    if (existingIndex > -1) {
      ST.state.computoCart[existingIndex].qty += qty;
    } else {
      // El carrito no congela precio: solo guarda la referencia y la cantidad.
      // El precio se calcula siempre "en vivo" contra ST.state.computoMonth (ver Pricing.resolveItemPricing),
      // así que agregar un ítem hoy o hace una semana da el mismo resultado: el precio más actual,
      // hasta que el usuario elija otro mes desde "Mi Cómputo".
      ST.state.computoCart.push({
        id: item.id,
        denominacion: item.denominacion,
        rubro: item.rubro,
        unit: unit,
        qty: qty,
        type: 'material',
        mode: ST.state.pricingMode
      });
    }

    saveCart();
    updateCartUI();
    ST.showToast(`+${qty} ${unit} agregado: ${item.denominacion.substring(0, 24)}...`);

    const btn = document.getElementById(`btn-add-${itemId}`);
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = `<span>✓ Agregado</span>`;
      btn.classList.add('added');
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.classList.remove('added');
      }, 1200);
    }
  }

  export function changeCardQty(itemId, delta) {
    const input = document.getElementById(`qty-${itemId}`);
    if (input) {
      let val = parseInt(input.value, 10) || 1;
      val = Math.max(1, val + delta);
      input.value = val;
    }
  }

  export function updateItemQtyInCart(index, newQty) {
    if (newQty <= 0) {
      ST.state.computoCart.splice(index, 1);
    } else {
      ST.state.computoCart[index].qty = newQty;
    }
    saveCart();
    updateCartUI();
  }

  export function removeCartItem(index) {
    ST.state.computoCart.splice(index, 1);
    saveCart();
    updateCartUI();
  }

  export function clearComputoCart() {
    if (ST.state.computoCart.length === 0) return;
    if (confirm('¿Deseas vaciar todo tu cómputo de materiales?')) {
      ST.state.computoCart = [];
      saveCart();
      updateCartUI();
      ST.showToast('Cómputo vaciado');
    }
  }

  export function saveCart() {
    localStorage.setItem('nexobra_computo', JSON.stringify(ST.state.computoCart));
  }
  export function computeCartSubtotals() {
    const resolved = ST.state.computoCart.map(item => ({ item, pricing: Pricing.resolveItemPricing(item, ST.state.computoMonth) }));
    const materiales = resolved.filter(r => (r.item.type || 'material') === 'material');
    const manoDeObra = resolved.filter(r => r.item.type === 'labor');
    const subtotalMateriales = materiales.reduce((sum, r) => sum + (r.item.qty * r.pricing.unitPrice), 0);
    const subtotalManoObra = manoDeObra.reduce((sum, r) => sum + (r.item.qty * r.pricing.unitPrice), 0);
    return { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total: subtotalMateriales + subtotalManoObra };
  }

  /**
   * Separa el carrito en grupos por proveedor elegido (providerBranchId) más
   * un resto "sin proveedor asignado" (referencia NEXOBRA o mano de obra).
   * Conserva el índice original de cada ítem en ST.state.computoCart, porque
   * eliminar/editar cantidad sigue operando por índice sobre ese array plano.
   */
  export function groupCartByProvider() {
    const groups = {};
    const order = [];
    const sinProveedor = [];
    ST.state.computoCart.forEach((item, idx) => {
      if (item.type === 'material' && item.providerOfferId) {
        const key = item.providerBranchId;
        if (!groups[key]) {
          groups[key] = {
            branchId: key,
            businessName: item.providerBusinessName,
            branchName: item.providerBranchName,
            whatsapp: item.providerWhatsapp,
            items: []
          };
          order.push(key);
        }
        groups[key].items.push({ item, idx });
      } else {
        sinProveedor.push({ item, idx });
      }
    });
    return { groups: order.map(k => groups[k]), sinProveedor };
  }

  export function buildProviderWhatsappUrl(group) {
    let text = `Hola! Te escribo desde NEXOBRA para pedirte presupuesto de estos materiales:\n\n`;
    group.items.forEach(({ item }) => {
      text += `• ${item.denominacion} — ${item.qty} ${item.unit}\n`;
    });
    text += `\n¿Me pasás precio y disponibilidad? Gracias!`;
    const digits = (group.whatsapp || '').replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  export function renderCartItemRow(item, idx) {
    const pricing = Pricing.resolveItemPricing(item, ST.state.computoMonth);
    const subtotal = item.qty * pricing.unitPrice;
    const esManoDeObra = item.type === 'labor';
    return `
      <div class="computo-item">
        <div class="computo-item-head">
          <div>
            <span class="card-code" style="font-size: 0.7rem;">${esManoDeObra ? 'MANO DE OBRA' : item.id}</span>
            <h4 class="computo-item-title">${item.denominacion}</h4>
            ${pricing.isProviderSourced ? '<span class="cart-badge-provider">Precio fijo del proveedor</span>' : ''}
          </div>
          <button class="btn-remove-item" onclick="window.nexoBraApp.removeCartItem(${idx})" title="Eliminar ítem">&times;</button>
        </div>
        
        <div class="computo-item-controls">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--text-muted);">Cant:</span>
            <input 
              type="number" 
              style="width: 55px; padding: 4px 6px; border: 1px solid var(--border-light); border-radius: 4px; font-weight: 700;" 
              value="${item.qty}" 
              min="${esManoDeObra ? 0.5 : 1}" 
              step="${esManoDeObra ? 0.5 : 1}"
              onchange="window.nexoBraApp.updateItemQtyInCart(${idx}, parseFloat(this.value) || 1)"
            >
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">${item.unit}</span>
          </div>
            <div style="text-align: right;">
              ${pricing.disponible
                ? `<div style="font-size: 0.74rem; color: var(--text-subtle);">${ST.formatMoney(pricing.unitPrice)}/${item.unit}</div>
                   ${pricing.basePrice ? `<div class="cart-price-trace">Base ${ST.formatMoney(pricing.basePrice)} · × ${ST.formatFactor(pricing.factor || 1)}</div>` : ''}
                   <div class="computo-item-subtotal">${ST.formatMoney(subtotal)}</div>`
                : `<div style="font-size: 0.74rem; color: #b91c1c;">Sin dato para este mes</div>`
              }
          </div>
        </div>
      </div>
    `;
  }

  export function updateCartUI() {
    const { subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();

    ST.headerCartCount.textContent = ST.state.computoCart.length;
    ST.drawerTotalItems.textContent = ST.state.computoCart.length;
    ST.drawerSubtotal.textContent = ST.formatMoney(subtotalMateriales);
    ST.drawerTotal.textContent = ST.formatMoney(total);

    const laborRow = document.getElementById('drawer-subtotal-labor-row');
    const laborValue = document.getElementById('drawer-subtotal-labor');
    if (laborRow && laborValue) {
      laborRow.style.display = subtotalManoObra > 0 ? 'flex' : 'none';
      laborValue.textContent = ST.formatMoney(subtotalManoObra);
    }

    if (ST.state.computoCart.length === 0) {
      ST.drawerBody.innerHTML = `
        <div class="computo-empty-ST.state">
          <div class="empty-icon">📋</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Tu cómputo está vacío</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
            Sumá materiales y mano de obra desde el catálogo para calcular los costos de tu obra o presupuesto al instante.
          </p>
          <button class="btn-computo" onclick="document.getElementById('drawer-close-btn').click();">
            Explorar catálogo
          </button>
        </div>
      `;
      return;
    }

    const { groups, sinProveedor } = groupCartByProvider();

    const gruposHtml = groups.map(group => `
      <div class="provider-group">
        <div class="provider-group-header">
          <h4>🏪 ${group.businessName} — ${group.branchName}</h4>
          ${group.whatsapp ? `<a class="whatsapp-mini-btn" target="_blank" href="${buildProviderWhatsappUrl(group)}">💬 Mandar pedido a este proveedor</a>` : '<span style="font-size:0.72rem; color:var(--text-muted);">Sin WhatsApp cargado</span>'}
        </div>
        <div class="provider-group-body">
          ${group.items.map(({ item, idx }) => renderCartItemRow(item, idx)).join('')}
        </div>
      </div>
    `).join('');

    const sinProveedorHtml = sinProveedor.length === 0 ? '' : `
      ${groups.length > 0 ? '<p style="font-size:0.78rem; font-weight:700; color:var(--text-muted); margin: 14px 0 8px;">SIN PROVEEDOR ASIGNADO (referencia NEXOBRA)</p>' : ''}
      <div class="computo-list">
        ${sinProveedor.map(({ item, idx }) => renderCartItemRow(item, idx)).join('')}
      </div>
    `;

    ST.drawerBody.innerHTML = gruposHtml + sinProveedorHtml;
  }

  // --- PRINT / PDF EXPORT ---
  /**
   * Exporta el cómputo activo a un .xlsx real (no PDF), separando materiales
   * y mano de obra en tablas, con el mismo criterio de columnas que ya usa
   * el cotizador de Excel (excel.js) para mantener el archivo consistente
   * con el resto de las exportaciones del sitio.
   */
  export function exportComputoToExcel() {
    if (ST.state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para exportar.');
      return;
    }
    const { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();
    const periodo = ST.monthLabel(ST.state.computoMonth);
    const nombre = ST.drawerComputationName.value.trim() || 'Mi cómputo';

    const exportData = [
      [`NEXOBRA - ${nombre}`],
      [`Precios calculados a: ${periodo}`, `Generado: ${new Date().toLocaleDateString('es-AR')}`],
      []
    ];

    if (materiales.length > 0) {
      exportData.push(['MATERIALES']);
      exportData.push(['Código', 'Descripción', 'Rubro', 'Cantidad', 'Unidad', 'Precio Unitario (ARS)', 'Subtotal (ARS)', 'Origen']);
      materiales.forEach(({ item, pricing }) => {
        exportData.push([
          item.id,
          item.denominacion,
          item.rubro,
          item.qty,
          item.unit,
          pricing.unitPrice,
          item.qty * pricing.unitPrice,
          pricing.isProviderSourced ? `Proveedor: ${item.providerBusinessName}` : 'Referencia NEXOBRA'
        ]);
      });
      exportData.push(['', '', '', '', '', 'Subtotal Materiales:', subtotalMateriales, '']);
      exportData.push([]);
    }

    if (manoDeObra.length > 0) {
      exportData.push(['MANO DE OBRA']);
      exportData.push(['Rol', '', '', 'Cantidad', 'Unidad', 'Precio Unitario (ARS)', 'Subtotal (ARS)', '']);
      manoDeObra.forEach(({ item, pricing }) => {
        exportData.push([item.denominacion, '', '', item.qty, item.unit, pricing.unitPrice, item.qty * pricing.unitPrice, '']);
      });
      exportData.push(['', '', '', '', '', 'Subtotal Mano de Obra:', subtotalManoObra, '']);
      exportData.push([]);
    }

    exportData.push(['', '', '', '', '', 'TOTAL ESTIMADO:', total, 'ARS']);
    exportData.push([]);
    exportData.push(['Valores orientativos. No incluyen impuestos, cargas sociales ni flete.']);

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 28 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Computo_NEXOBRA');
    const safeName = nombre.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'Computo';
    XLSX.writeFile(wb, `${safeName}_NEXOBRA.xlsx`);
    ST.showToast('Excel descargado.');
  }

  export function printComputo() {
    if (ST.state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();
    const dateStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
    const periodoPresupuesto = ST.monthLabel(ST.state.computoMonth);

    const filaMaterial = ({ item, pricing }) => `
      <tr>
        <td><strong>${item.id}</strong></td>
        <td>${item.denominacion}</td>
        <td>${item.rubro}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${ST.formatMoney(pricing.unitPrice)}${pricing.basePrice ? `<br><small>Base ${ST.formatMoney(pricing.basePrice)} · × ${ST.formatFactor(pricing.factor || 1)}</small>` : ''}</td>
        <td style="text-align: right;"><strong>${ST.formatMoney(item.qty * pricing.unitPrice)}</strong></td>
      </tr>
    `;

    const tablaMateriales = materiales.length === 0 ? '' : `
      <h3 style="margin-bottom: 15px;">Materiales</h3>
      <table>
        <thead>
          <tr>
            <th>Código</th><th>Descripción</th><th>Rubro</th><th>Cantidad</th><th>Unidad</th>
            <th>Precio Unit. / trazabilidad</th><th style="text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${materiales.map(filaMaterial).join('')}</tbody>
      </table>
      <div class="subtotal-box">Subtotal Materiales: ${ST.formatMoney(subtotalMateriales)}</div>
    `;

    const tablaManoObra = manoDeObra.length === 0 ? '' : `
      <h3 style="margin-bottom: 15px; margin-top: 30px;">Mano de Obra</h3>
      <table>
        <thead>
          <tr>
            <th>Rol</th><th>Cantidad</th><th>Unidad</th>
            <th>Precio Unit.</th><th style="text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${manoDeObra.map(({ item, pricing }) => `
            <tr>
              <td><strong>${item.denominacion}</strong></td>
              <td>${item.qty}</td>
              <td>${item.unit}</td>
              <td>${ST.formatMoney(pricing.unitPrice)}</td>
              <td style="text-align: right;"><strong>${ST.formatMoney(item.qty * pricing.unitPrice)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="subtotal-box">Subtotal Mano de Obra: ${ST.formatMoney(subtotalManoObra)}</div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <title>NEXOBRA - Cómputo y Presupuesto de Obra</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #111; }
          .header-print { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #F5B000; padding-bottom: 15px; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: 900; }
          .logo span { color: #F5B000; }
          .meta { font-size: 13px; color: #555; }
          .periodo-banner { background: #FEF3C7; border: 1px solid #F5B000; border-radius: 8px; padding: 10px 14px; font-size: 14px; font-weight: 700; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #F1F3F7; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #CCC; }
          td { padding: 10px; border-bottom: 1px solid #EEE; font-size: 13px; }
          .subtotal-box { text-align: right; font-size: 13px; font-weight: bold; padding-top: 8px; }
          .total-box { margin-top: 20px; text-align: right; font-size: 18px; font-weight: bold; border-top: 2px solid #111; padding-top: 15px; }
          .disclaimer { margin-top: 30px; font-size: 11px; color: #888; border-top: 1px dashed #CCC; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header-print">
          <div>
            <div class="logo">NEX<span>OBRA</span></div>
            <div style="font-size: 12px; color: #666; font-weight: bold;">COMPARADOR TÉCNICO & CÓMPUTO DE OBRA</div>
          </div>
          <div class="meta" style="text-align: right;">
            <div>Fecha de emisión: <strong>${dateStr}</strong></div>
          </div>
        </div>

        <h2 style="margin-bottom: 4px;">Resumen de Cómputo y Presupuesto de Obra</h2>
        <div class="periodo-banner">📅 Presupuesto calculado a precios de: ${periodoPresupuesto}</div>

        ${tablaMateriales}
        ${tablaManoObra}

        <div class="total-box">
          Total Estimado: ${ST.formatMoney(total)}
        </div>

        <div class="disclaimer">
          * Este presupuesto es orientativo, calculado a precios de ${periodoPresupuesto}. Los valores de referencia informan precio base, factor y fecha de actualización. Los montos <strong>no incluyen impuestos, cargas sociales ni fletes</strong> — deben cargarse aparte según cada caso. Confirmá precio final, disponibilidad, entrega y pago directamente con el proveedor.
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // --- COPY TEXT FOR WHATSAPP ---
  export function copyComputoToClipboard() {
    if (ST.state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para copiar.');
      return;
    }

    const { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();
    const periodoPresupuesto = ST.monthLabel(ST.state.computoMonth);

    let text = `🏗️ *NEXOBRA - Cómputo y Presupuesto*\n`;
    text += `📅 Emitido: ${new Date().toLocaleDateString('es-AR')} · Precios de: *${periodoPresupuesto}*\n\n`;

    if (materiales.length > 0) {
      text += `*MATERIALES*\n`;
      materiales.forEach(({ item, pricing }, index) => {
        text += `${index + 1}. *${item.denominacion}*\n`;
        text += `   Cant: ${item.qty} ${item.unit} | Unit: ${ST.formatMoney(pricing.unitPrice)} | Subtotal: ${ST.formatMoney(item.qty * pricing.unitPrice)}\n`;
      });
      text += `Subtotal Materiales: *${ST.formatMoney(subtotalMateriales)}*\n\n`;
    }

    if (manoDeObra.length > 0) {
      text += `*MANO DE OBRA*\n`;
      manoDeObra.forEach(({ item, pricing }, index) => {
        text += `${index + 1}. *${item.denominacion}*\n`;
        text += `   Cant: ${item.qty} ${item.unit} | Unit: ${ST.formatMoney(pricing.unitPrice)} | Subtotal: ${ST.formatMoney(item.qty * pricing.unitPrice)}\n`;
      });
      text += `Subtotal Mano de Obra: *${ST.formatMoney(subtotalManoObra)}*\n\n`;
    }

    text += `💰 *TOTAL ESTIMADO: ${ST.formatMoney(total)}*\n`;
    text += `_Valores orientativos NEXOBRA, calculados a precios de ${periodoPresupuesto}. No incluyen impuestos, cargas sociales ni fletes. Confirmar disponibilidad y precio final con el proveedor._`;

    navigator.clipboard.writeText(text).then(() => {
      ST.showToast('✓ Cómputo copiado al portapapeles (Listo para WhatsApp)');
    }).catch(() => {
      alert('No se pudo copiar automáticamente.');
    });
  }

  // --- DRAWER TOGGLING ---
  export function openDrawer() {
    ST.computoDrawer.classList.add('open');
    ST.drawerBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  export function closeDrawer() {
    ST.computoDrawer.classList.remove('open');
    ST.drawerBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ==========================================================================
  // EXCEL BULK PROCESSOR (ETAPA 3)
  // ==========================================================================
