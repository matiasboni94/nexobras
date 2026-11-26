// NEXOBRA - map.js

import * as Auth from './auth.js';
import * as Catalog from './catalog.js';
import * as Computo from './computo.js';
import * as Main from './main.js';
import * as Pricing from './pricing.js';
import * as Provider from './provider.js';
import * as Apu from './apu.js';
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
 ST.mapState.markers.forEach(m =>ST.mapState.map.removeLayer(m));
 ST.mapState.markers = [];
 }

 // ============================================================
 // FASE G5 — Buscar un material y ver sus ofertas georeferenciadas
 // en el mapa (como Booking: buscás y el mapa se filtra a eso).
 // ============================================================
 export async function searchMaterialOnMap() {
 const input = document.getElementById('home-map-material-search');
 const query = input.value.trim();
 const container = document.getElementById('home-map-material-results');
 if (query.length < 2) {
 container.innerHTML = '';
 return;
 }
 const results = Provider.searchMaterialsSimple(query, 8);
 if (results.length === 0) {
 // No es un material -- probamos si coincide con algún rubro de
 // servicio profesional (cálculo estructural, arquitectura, etc.)
 // antes de decir que no se encontró nada. Así el usuario no tiene
 // que saber de antemano si lo que busca es un material o un servicio.
 const categoriaEncontrada = await buscarRubroDeServicio(query);
 if (categoriaEncontrada) {
 container.innerHTML = `
 <div class="provider-search-row">
 <div class="provider-search-row-info">
 <strong>No encontramos ese material</strong><br>
 <span style="color:var(--text-muted); font-size:0.75rem;">Pero sí hay proveedores en "${ST.escapeHtml(categoriaEncontrada.name)}" cerca tuyo</span>
 </div>
 <button class="btn-computo" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.goToProvidersDirectoryWithCategory(${ST.escAttr(categoriaEncontrada.id)})">Ver proveedores</button>
 </div>
 `;
 return;
 }
 container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); padding: 8px 0;">Sin resultados.</p>';
 return;
 }
 // (26/11) El buscador de la portada es este: cada resultado va al mapa
 // (quién lo tiene cerca) o, si solo quiere el precio, al catálogo.
 container.innerHTML = results.map(item => `
 <div class="provider-search-row">
 <div class="provider-search-row-info">
 <strong>${ST.escapeHtml(item.denominacion)}</strong><br>
 <span style="color:var(--text-muted); font-size:0.75rem;">${ST.escapeHtml(item.id)} · ${ST.escapeHtml(item.rubro)}</span>
 </div>
 <div class="provider-search-row-acciones">
 <button type="button" class="btn-computo" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.selectMaterialOnMap(${ST.escAttr(item.id)}, ${ST.escAttr(item.denominacion)})">Ver en el mapa</button>
 <button type="button" class="btn-action-drawer btn-copy" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.buscarEnCatalogo(${ST.escAttr(item.denominacion)})">Precio</button>
 </div>
 </div>
 `).join('') + `
 <div class="provider-search-pie"><button type="button" class="link-button" onclick="window.nexoBraApp.buscarEnCatalogo(${ST.escAttr(query)})">Ver todos los precios de “${ST.escapeHtml(query)}” en el catálogo →</button></div>`;
 }

 /**
 * Busca si el texto coincide con el NOMBRE de algún rubro de servicio
 * (ej: escribir "estructural" encuentra "Cálculo Estructural"). Se usa
 * como respaldo cuando la búsqueda de materiales no encontró nada -- así
 * el buscador del home entiende solo si la persona busca un material o
 * un servicio, sin que tenga que elegir de antemano.
 */
 async function buscarRubroDeServicio(query) {
 if (!ST.supabaseClient) return null;
 if (ST.directoryState.categories.length === 0) {
 const { data } = await ST.supabaseClient
 .from('provider_categories')
 .select('id, name, kind')
 .eq('active', true)
 .order('name');
 ST.directoryState.categories = data || [];
 }
 const normalizada = ST.normalizeText(query);
 return ST.directoryState.categories.find(c =>ST.normalizeText(c.name).includes(normalizada)) || null;
 }

 export function goToProvidersDirectoryWithCategory(categoryId) {
 ST.directoryState.categoryId = categoryId;
 Main.switchView('providers-directory');
 }

 /**
 * La RPC nearby_offers_for_material no devuelve la marca (no está
 * trackeada en ninguna migración del repo, así que no se reescribe a
 * ciegas). En cambio, se pide acá aparte con un select normal a
 * provider_offers filtrado por los offer_id que ya trajo la RPC, y se
 * mergea en memoria -- así el resto del flujo (mapa, panel, comparador)
 * no tiene que saber que son dos consultas distintas.
 */
 async function attachOfferBrands(offers) {
 const ids = (offers || []).map(o => o.offer_id).filter(Boolean);
 if (ids.length === 0) return offers;
 // (18/11) También la fecha de carga del precio (reported_at), para mostrar "actualizado hace X días".
 const { data, error } = await ST.supabaseClient.from('provider_offers').select('id, brand, reported_at').in('id', ids);
 if (error || !data) return offers;
 const byId = new Map(data.map(row => [row.id, row]));
 offers.forEach(o => {
 const row = byId.get(o.offer_id);
 o.brand = row ? row.brand : null;
 o.reported_at = row ? row.reported_at : (o.reported_at || null);
 });
 return offers;
 }

 // ============================================================
 // Anuncios / promos temporales de proveedores (ej. "20% off en cemento
 // esta semana") -- se ven en la ficha del mapa (acá) y en el Directorio
 // (más abajo, loadProvidersDirectory/renderDirectoryList). RLS ya filtra
 // por activo+no vencido para lectura pública (ver migración 012), así que
 // alcanza con pedir el más nuevo de la sucursal.
 // ============================================================

 async function fetchLatestAnnouncement(branchId) {
 if (!branchId) return null;
 const { data, error } = await ST.supabaseClient
 .from('provider_announcements')
 .select('id, message, expires_at')
 .eq('branch_id', branchId)
 .order('created_at', { ascending: false })
 .limit(1)
 .maybeSingle();
 if (error) return null;
 return data || null;
 }

 /** Horario de atención: mismo patrón que fetchLatestAnnouncement -- se pide aparte por branch_id, sin tocar ninguna RPC. */
 async function fetchBranchHours(branchId) {
 if (!branchId) return null;
 const { data, error } = await ST.supabaseClient
 .from('provider_branches')
 .select('business_hours')
 .eq('id', branchId)
 .maybeSingle();
 if (error) return null;
 return data?.business_hours || null;
 }

 /** Fallback de WhatsApp cuando la sucursal no cargó whatsapp_phone -- usa el contact_phone del proveedor (mismo criterio que ya usa el Directorio). */
 async function fetchProviderContactPhone(providerId) {
 if (!providerId) return null;
 const { data, error } = await ST.supabaseClient
 .from('providers')
 .select('contact_phone')
 .eq('id', providerId)
 .maybeSingle();
 if (error) return null;
 return data?.contact_phone || null;
 }

 /** Slug de la sucursal (para el link a su página pública, /proveedor/<slug>) -- mismo patrón que fetchBranchHours. */
 async function fetchBranchSlug(branchId) {
 if (!branchId) return null;
 const { data, error } = await ST.supabaseClient
 .from('provider_branches')
 .select('slug')
 .eq('id', branchId)
 .maybeSingle();
 if (error) return null;
 return data?.slug || null;
 }

 function renderBusinessHours(hours) {
 if (!hours) return '';
 // white-space: pre-line respeta los saltos de línea que haya escrito el
 // proveedor (ej. "Lun a Vie 8 a 18\nSáb 8 a 13"), sin necesitar HTML.
 return `<p style="font-size:0.8rem; color:var(--text-muted); margin: 4px 0 8px; white-space: pre-line;"> ${ST.escapeHtml(hours)}</p>`;
 }

 function renderAnnouncementBanner(announcement) {
 if (!announcement) return '';
 return `
 <div class="provider-announcement-banner">
 <span> ${ST.escapeHtml(announcement.message)}</span>
 </div>
 `;
 }

 // Últimas ofertas mostradas en el mapa, por offer_id -- así el comparador
 // (toggleCompareOffer) puede recuperar el objeto completo (precio, marca,
 // proveedor, distancia) sin tener que repetir la consulta cada vez que se
 // agrega una oferta a comparar.
 const lastOffersById = new Map();

 export async function selectMaterialOnMap(materialId, materialName) {
 if (!ST.supabaseClient || !ST.mapState.map) return;
 ST.mapState.filterMaterialId = materialId;
 ST.mapState.filterMaterialName = materialName;
 document.getElementById('home-map-material-results').innerHTML = '';
 document.getElementById('home-map-material-search').value = materialName;
 document.getElementById('btn-clear-map-material-search').style.display = 'inline-flex';
 // (26/11) El buscador está en la portada: se baja al mapa con el resultado.
 document.querySelector('.section-map-home .home-map-search-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
 ST.mapStatusMsg.textContent = `Buscando ofertas de "${materialName}" cerca tuyo...`;
 // Limpia el panel lateral ANTES de esperar la respuesta -- así nunca queda
 // "colgada" la ficha de un proveedor viejo mientras carga la búsqueda nueva.
 ST.mapBranchPanel.innerHTML = `
 <div class="map-branch-panel-empty">
 <div style="font-size: 2rem;"></div>
 <p>Buscando ofertas de "${materialName}"...</p>
 </div>
 `;

 const { data, error } = await ST.supabaseClient.rpc('nearby_offers_for_material', {
 p_material_id: materialId,
 center_lat: ST.mapState.center.lat,
 center_lng: ST.mapState.center.lng,
 radius_km: ST.mapState.radiusKm
 });

 if (error) {
 ST.mapStatusMsg.textContent = 'No se pudo buscar: ' + error.message;
 return;
 }
 await attachOfferBrands(data);

 // Búsqueda nueva: se vacía el comparador, para no arrastrar ofertas de
 // otro material.
 ST.compareState.materialId = materialId;
 ST.compareState.materialName = materialName;
 ST.compareState.items = [];
 lastOffersById.clear();
 (data || []).forEach(o => { if (o.offer_id) lastOffersById.set(o.offer_id, o); });
 renderCompareBar();

 clearMapMarkers();
 const centerMarker = L.circleMarker([ST.mapState.center.lat, ST.mapState.center.lng], {
 radius: 7, color: '#d97757', fillColor: '#d97757', fillOpacity: 0.9
 }).addTo(ST.mapState.map).bindPopup('Tu ubicación');
 ST.mapState.markers.push(centerMarker);

 const conCoordenadas = (data || []).filter(o => o.latitude && o.longitude);
 ST.logSearch(materialName, conCoordenadas.length, 'mapa');
 conCoordenadas.forEach(offer => {
 const marker = L.marker([offer.latitude, offer.longitude]).addTo(ST.mapState.map);
 // Sin popup propio de Leaflet: el detalle se muestra siempre en el panel
 // lateral (#map-branch-panel), así hay un solo lugar de verdad y nunca
 // queda desincronizado entre lo que muestra el popup y lo que muestra el panel.
 marker.on('click', () => showMaterialOfferDetail(offer, materialId, materialName));
 ST.mapState.markers.push(marker);
 });

 if (conCoordenadas.length > 0) {
 ST.mapStatusMsg.textContent = `${conCoordenadas.length} oferta${conCoordenadas.length === 1 ? '' : 's'} de "${materialName}" en ${ST.mapState.radiusKm} km a la redonda. Tocá un pin para ver el detalle.`;
 showMaterialOfferDetail(conCoordenadas[0], materialId, materialName); // muestra la primera de una, no hace falta esperar el click
 } else {
 // Nadie cerca cargó este material: en vez de dejarte con un cartel
 // vacío, mostramos el Precio de Referencia (mercado real si hay 3+
 // proveedores en TODO el país para este mes, si no, proyectado por
 // IPC desde el último dato real) -- así siempre te llevás algo útil.
 ST.mapStatusMsg.textContent = `Ningún proveedor cargó "${materialName}" en ${ST.mapState.radiusKm} km a la redonda todavía. Te mostramos el precio de referencia.`;
 const material = NEXOBRA_DATA.find(m => m.id === materialId);
 const trace = material ? Pricing.getReferencePrice(material, 'venta') : null;

 if (trace && !isNaN(trace.currentPrice)) {
 ST.mapBranchPanel.innerHTML = `
 <div class="map-branch-panel-empty" style="text-align:left;">
 <p style="font-weight:700; margin-bottom:10px;">Nadie cerca tuyo cargó "${materialName}" todavía.</p>
 <div class="card-price-box">
 <div class="price-main-row">
 <span class="price-main-val">${ST.formatMoney(trace.currentPrice)}</span>
 <span class="price-unit-tag">/ ${material.unidadVenta}</span>
 </div>
 ${trace.isMarketSourced
 ? '<div class="price-source-tag market">Precio de mercado real</div>'
 : `<div class="price-source-tag ipc">Proyectado por IPC${trace.projectedFromEarlierMonth ? ' de ' + ST.monthLabel(trace.projectedFromEarlierMonth) : ''}</div>`
 }
 </div>
 <p style="font-size:0.78rem; color:var(--text-muted); margin-top:10px;">Este es el precio de referencia general, no de un proveedor puntual cerca tuyo. Probá ampliar el radio de búsqueda para ver ofertas reales de la zona.</p>
 </div>
 `;
 } else {
 ST.mapBranchPanel.innerHTML = `
 <div class="map-branch-panel-empty">
 <div style="font-size: 2rem;"></div>
 <p>Nadie cerca tuyo cargó "${materialName}" todavía. Probá ampliar el radio de búsqueda.</p>
 </div>
 `;
 }
 }
 }

 /**
 * Panel enfocado en UNA oferta puntual de UN material (no la lista completa
 * de materiales del proveedor -- eso es lo que pediste explícitamente).
 * Muestra precio, variación vs. la referencia, contacto y favorito.
 */
 async function showMaterialOfferDetail(offer, materialId, materialName) {
 const material = NEXOBRA_DATA.find(m => m.id === materialId);
 const trace = material ? Pricing.getReferencePrice(material, 'venta') : null;
 const refPrice = trace ? trace.currentPrice : null;
 const variacion = refPrice && !isNaN(refPrice) ? Math.round(((offer.amount - refPrice) / refPrice) * 100) : null;
 const varClass = variacion === null ? 'equal' : variacion < -1 ? 'below' : variacion > 1 ? 'above' : 'equal';
 const varTxt = variacion === null ? 'sin referencia para comparar' : `${variacion > 0 ? '+' : ''}${variacion}% vs. referencia`;
 const esFavorito = ST.favoritesState.ids.has(offer.branch_id);
 const stockLabel = offer.stock_status === 'agotado' ? 'Agotado' : offer.stock_status === 'a_pedido' ? 'A pedido' : 'En stock';
 const whatsappLink = offer.whatsapp_phone
 ? `<a class="btn-computo" style="text-decoration:none;" href="https://wa.me/${offer.whatsapp_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Vi en NEXOBRA que tenés ${materialName} a ${ST.formatMoney(offer.amount)}/${offer.unit}. ¿Seguís teniendo disponible?`)}" target="_blank" rel="noopener" onclick="window.nexoBraApp.logProviderInteraction(${ST.escAttr(offer.branch_id)}, ${ST.escAttr(offer.provider_id)}, 'whatsapp_click', ${ST.escAttr(materialId)}, ${ST.escAttr(materialName)}, ${JSON.stringify(offer.distance_km ?? null)})">Contactar por WhatsApp</a>`
 : '';

 // Registra la "consulta" a este proveedor para su dashboard de estadísticas
 // (cantidad de interacciones, por qué material, a qué distancia). No bloquea
 // ni condiciona el render del panel: si falla, no pasa nada para el usuario.
 ST.logProviderInteraction(offer.branch_id, offer.provider_id, 'offer_view', materialId, materialName, offer.distance_km);

 const enComparacion = ST.compareState.items.some(i => i.offer_id === offer.offer_id);
 const compareDisabled = !enComparacion && ST.compareState.items.length >= 2;
 const announcement = await fetchLatestAnnouncement(offer.branch_id);

 ST.mapBranchPanel.innerHTML = `
 ${renderAnnouncementBanner(announcement)}
 <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
 <div style="display:flex; align-items:center; gap:10px;">
 ${offer.logo_url ? `<img src="${ST.escapeHtml(offer.logo_url)}" class="provider-logo-mini" alt="">` : ''}
 <h3 style="margin-bottom:2px;">${ST.escapeHtml(offer.business_name)}</h3>
 </div>
 <div style="display:flex; gap:4px;">
 <button class="btn-favorite-toggle ${esFavorito ? 'active' : ''}" onclick='window.nexoBraApp.toggleFavorite(${ST.escAttr(offer.branch_id)}, ${ST.escAttr(offer.business_name)})' title="Guardar en favoritos">★</button>
 <button class="btn-favorite-toggle ${ST.offerSubscriptionsState.ids.has(offer.branch_id) ? 'active' : ''}" onclick='window.nexoBraApp.toggleOfferSubscription(${ST.escAttr(offer.branch_id)}, ${ST.escAttr(offer.provider_id)}, ${ST.escAttr(offer.business_name)})' title="Recibir sus ofertas por mail"></button>
 </div>
 </div>
 <div class="branch-meta">${offer.brand ? `<strong>${ST.escapeHtml(offer.brand)}</strong> · ` : ''}${ST.escapeHtml(offer.branch_name)} · ${ST.escapeHtml(offer.locality || '')} · ${offer.distance_km.toFixed(1)} km de tu ubicación</div>
 <div style="margin: 4px 0 10px;">${renderStarRating(offer.avg_rating, offer.review_count)}</div>

 <div class="card-price-box" style="margin: 14px 0;">
 <div class="price-main-row">
 <span class="price-main-val">${ST.formatMoney(offer.amount)}</span>
 <span class="price-unit-tag">/ ${offer.unit}</span>
 </div>
 <div class="price-secondary-row" style="color: ${varClass === 'below' ? '#15803d' : varClass === 'above' ? '#b91c1c' : 'var(--text-subtle)'};">
 <span>${materialName}</span>
 <strong>${varTxt}</strong>
 </div>
 <div class="price-secondary-row">
 <span>Stock:</span>
 <strong>${stockLabel}</strong>
 </div>
 ${offer.reported_at ? `<div class="price-secondary-row"><span>Precio:</span>${ST.offerAgeTag(offer.reported_at)}</div>` : ''}
 </div>

 <button class="btn-action-drawer ${enComparacion ? 'btn-print' : 'btn-copy'}" style="width:100%; margin-bottom:10px;" ${compareDisabled ? 'disabled title="Ya tenés 2 ofertas para comparar — sacá una primero"' : ''} onclick="window.nexoBraApp.toggleCompareOffer('${offer.offer_id}')">
 ${enComparacion ? '✓ En comparación — sacar' : ' Agregar a comparar'}
 </button>

 ${whatsappLink}

 <div id="branch-reviews-section" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-light);">
 <button class="btn-action-drawer btn-copy" style="width:100%;" onclick="window.nexoBraApp.loadBranchReviews('${offer.branch_id}', ${ST.escAttr(offer.provider_id)})">Ver / dejar una reseña</button>
 <div id="branch-reviews-body"></div>
 </div>
 `;
 }

 // ============================================================
 // Comparador de ofertas: elegís hasta 2 ofertas del mismo material
 // (típicamente de distinta marca) desde el panel "ofertas cercanas" y las
 // ves lado a lado -- precio, marca, proveedor, distancia, stock.
 // ============================================================

 export function toggleCompareOffer(offerId) {
 const idx = ST.compareState.items.findIndex(i => i.offer_id === offerId);
 if (idx >= 0) {
 ST.compareState.items.splice(idx, 1);
 } else {
 if (ST.compareState.items.length >= 2) {
 ST.showToast('Ya tenés 2 ofertas para comparar. Sacá una antes de agregar otra.');
 return;
 }
 const offer = lastOffersById.get(offerId);
 if (!offer) return;
 ST.compareState.items.push(offer);
 }
 renderCompareBar();
 // Vuelve a pintar el panel activo para que el botón "Agregar a comparar"
 // refleje el estado nuevo (activo/deshabilitado) sin tener que tocar el pin de nuevo.
 const current = ST.compareState.items.find(i => i.offer_id === offerId) || lastOffersById.get(offerId);
 if (current) showMaterialOfferDetail(current, ST.compareState.materialId, ST.compareState.materialName);
 }

 export function renderCompareBar() {
 const bar = document.getElementById('compare-bar');
 if (!bar) return;
 const items = ST.compareState.items;
 if (items.length === 0) {
 bar.style.display = 'none';
 bar.innerHTML = '';
 return;
 }
 bar.style.display = 'flex';
 bar.innerHTML = `
 <span style="font-size:0.85rem; font-weight:700;">Comparando (${items.length}/2):</span>
 ${items.map(o => `
 <span class="compare-bar-chip">
 ${o.brand ? ST.escapeHtml(o.brand) + ' — ' : ''}${ST.escapeHtml(o.business_name)}
 <button type="button" onclick="window.nexoBraApp.toggleCompareOffer('${o.offer_id}')" title="Sacar de la comparación">&times;</button>
 </span>
 `).join('')}
 ${items.length === 2 ? `<button class="btn-computo" style="padding:8px 16px; font-size:0.82rem;" onclick="window.nexoBraApp.openCompareModal()">Ver comparación</button>` : `<span style="font-size:0.78rem; color:var(--text-muted);">Elegí una oferta más para comparar</span>`}
 `;
 }

 export function openCompareModal() {
 const items = ST.compareState.items;
 if (items.length < 2) return;
 const [a, b] = items;
 const rows = [
 ['Marca', a.brand || '—', b.brand || '—'],
 ['Proveedor', ST.escapeHtml(a.business_name), ST.escapeHtml(b.business_name)],
 ['Sucursal', `${ST.escapeHtml(a.branch_name)} · ${ST.escapeHtml(a.locality || '')}`, `${ST.escapeHtml(b.branch_name)} · ${ST.escapeHtml(b.locality || '')}`],
 ['Precio', `<strong>${ST.formatMoney(a.amount)}</strong> / ${a.unit}`, `<strong>${ST.formatMoney(b.amount)}</strong> / ${b.unit}`],
 ['Distancia', `${a.distance_km.toFixed(1)} km`, `${b.distance_km.toFixed(1)} km`],
 ['Stock', a.stock_status === 'agotado' ? 'Agotado' : a.stock_status === 'a_pedido' ? 'A pedido' : 'En stock', b.stock_status === 'agotado' ? 'Agotado' : b.stock_status === 'a_pedido' ? 'A pedido' : 'En stock'],
 ['Precio cargado', ST.offerAgeTag(a.reported_at) || '—', ST.offerAgeTag(b.reported_at) || '—'],
 ['Valoración', renderStarRating(a.avg_rating, a.review_count), renderStarRating(b.avg_rating, b.review_count)]
 ];
 const masBarata = a.amount === b.amount ? null : (a.amount < b.amount ? 0 : 1);

 document.getElementById('compare-modal-subtitle').textContent = ST.compareState.materialName || '';
 document.getElementById('compare-modal-body').innerHTML = `
 <table class="compare-table">
 <thead>
 <tr>
 <th></th>
 <th style="${masBarata === 0 ? 'color:#15803d;' : ''}">${masBarata === 0 ? '✓ ' : ''}${ST.escapeHtml(a.business_name)}</th>
 <th style="${masBarata === 1 ? 'color:#15803d;' : ''}">${masBarata === 1 ? '✓ ' : ''}${ST.escapeHtml(b.business_name)}</th>
 </tr>
 </thead>
 <tbody>
 ${rows.map(([label, valA, valB]) => `<tr><td>${label}</td><td>${valA}</td><td>${valB}</td></tr>`).join('')}
 </tbody>
 </table>
 `;
 document.getElementById('compare-modal').classList.add('open');
 document.getElementById('compare-modal-backdrop').classList.add('open');
 document.body.style.overflow = 'hidden';
 }

 export function closeCompareModal() {
 document.getElementById('compare-modal').classList.remove('open');
 document.getElementById('compare-modal-backdrop').classList.remove('open');
 document.body.style.overflow = '';
 }

 export function clearMaterialSearchOnMap() {
 ST.mapState.filterMaterialId = null;
 ST.mapState.filterMaterialName = null;
 document.getElementById('home-map-material-search').value = '';
 document.getElementById('home-map-material-results').innerHTML = '';
 document.getElementById('btn-clear-map-material-search').style.display = 'none';
 ST.compareState.items = [];
 ST.compareState.materialId = null;
 ST.compareState.materialName = null;
 lastOffersById.clear();
 renderCompareBar();
 loadNearbyBranchesOnMap();
 }

 // (21/11, auditoría de pulido) Teléfono legible: "5493755573109" → "(3755) 57-3109".
// Código de área de 2, 3 o 4 dígitos según los más comunes; si no lo reconoce, lo deja como vino.
const AREAS_3 = ['376', '379', '387', '388', '381', '385', '351', '341', '342', '343', '261', '264', '221', '223', '291', '297', '299', '362', '370', '380', '383'];
function digitosLocales(raw) {
 let d = String(raw || '').replace(/\D/g, '');
 if (d.startsWith('549')) d = d.slice(3); else if (d.startsWith('54')) d = d.slice(2);
 if (d.startsWith('0')) d = d.slice(1);
 if (d.length === 12) { const a = d.startsWith('11') ? 2 : AREAS_3.includes(d.slice(0, 3)) ? 3 : 4; if (d.slice(a, a + 2) === '15') d = d.slice(0, a) + d.slice(a + 2); }
 return d;
}
export function formatPhoneAR(raw) {
 const d = digitosLocales(raw);
 if (d.length !== 10) return String(raw || '');
 const a = d.startsWith('11') ? 2 : AREAS_3.includes(d.slice(0, 3)) ? 3 : 4;
 const loc = d.slice(a);
 return `(${d.slice(0, a)}) ${loc.slice(0, loc.length - 4)}-${loc.slice(-4)}`;
}
function telE164(raw) { const d = digitosLocales(raw); return d.length === 10 ? '549' + d : String(raw || '').replace(/\D/g, ''); }
const capitalizar = (t) => String(t || '').replace(/^\s*\p{L}/u, (c) => c.toUpperCase());

/**
 * Datos del home (16/11, auditoría 12/11 falla 4). Antes mostraba
 * proveedores, usuarios registrados y visitas -- con 1 · 1 · 4 · 178, la
 * prueba social jugaba en contra, y esos números ahora viven en el tablero
 * del Panel de Administración (uso interno). En su lugar el home muestra
 * lo que el sitio ya ofrece: materiales con precio, análisis de costos de
 * obra y el mes de los precios. Si algo falla, quedan los valores escritos
 * en el HTML (943 / 80) en vez de romper el home.
 */
 export async function loadHomeStats(retry = true) {
 const matEl = document.getElementById('home-fact-materiales');
 const apuEl = document.getElementById('home-fact-apu');
 const periodoEl = document.getElementById('home-fact-periodo');
 if (!matEl || !apuEl || !periodoEl) return;

 if (typeof NEXOBRA_DATA !== 'undefined' && NEXOBRA_DATA.length) {
 matEl.textContent = ST.formatInt(NEXOBRA_DATA.length);
 }
 if (ST.state.priceMonth) {
 periodoEl.textContent = ST.monthLabel(ST.state.priceMonth).replace(' de ', ' ');
 } else if (retry) {
 // El mes de precios se define cuando termina de sincronizar el
 // catálogo; si todavía no está, se vuelve a mirar en un rato.
 setTimeout(() => loadHomeStats(false), 2500);
 }
 if (!ST.supabaseClient) return;
 // (21/11, auditoría de pulido) Solo cuentan las tareas habilitadas: mientras
 // se revisan las APU el público ve 0, y el home no puede prometer "80".
 const { count, error } = await ST.supabaseClient.from('apu_tasks').select('id', { count: 'exact', head: true }).eq('habilitada', true);
 const tile = apuEl.closest('.home-stat-tile');
 if (!error && count) { apuEl.textContent = ST.formatInt(count); if (tile) tile.style.display = ''; }
 else if (tile) tile.style.display = 'none';
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
 marker.bindPopup(`<strong>${ST.escapeHtml(branch.business_name)}</strong><br>${ST.escapeHtml(branch.branch_name)} · ${branch.distance_km.toFixed(1)} km<br>${branch.offers_count} material${branch.offers_count === 1 ? '' : 'es'} cargado${branch.offers_count === 1 ? '' : 's'}`);
 marker.on('click', () => showBranchDetail(branch.branch_id, branch));
 ST.mapState.markers.push(marker);
 });

 ST.mapStatusMsg.textContent = data && data.length > 0
 ? `${data.length} proveedor${data.length === 1 ? '' : 'es'} encontrado${data.length === 1 ? '' : 's'} en ${ST.mapState.radiusKm} km a la redonda.`
 : `No hay proveedores cargados en ${ST.mapState.radiusKm} km a la redonda todavía.`;
 }

 /** Arma el HTML de las estrellas + cantidad de reseñas, para mostrar en cualquier ficha de proveedor. */
 function renderStarRating(avgRating, reviewCount) {
 if (!reviewCount || reviewCount === 0) {
 return `<span class="star-rating-empty">Sin reseñas todavía</span>`;
 }
 const rounded = Math.round(avgRating);
 const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
 return `<span class="star-rating"><span class="star-rating-stars">${stars}</span> ${avgRating} <span class="star-rating-count">(${reviewCount})</span></span>`;
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
 ST.mapBranchPanel.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "cargar la ficha del proveedor")}</p>`;
 return;
 }

 // Fallback a contact_phone cuando la sucursal no cargó whatsapp_phone
 // (17/09) -- mismo criterio que ya usaba el Directorio; sin esto, un
 // proveedor con solo contact_phone (ej. HIDEAR) se quedaba sin botón acá.
 const branchContactPhone = branchInfo.whatsapp_phone || await fetchProviderContactPhone(branchInfo.provider_id);
 // (18/09) Este botón no estaba registrando 'whatsapp_click' -- se había
 // perdido al rediseñar el Directorio. Sin este log, la estadística
 // "Clicks a WhatsApp" del panel del proveedor queda incompleta.
 const whatsappLink = branchContactPhone
 ? `<a class="branch-whatsapp-btn" target="_blank" rel="noopener" onclick="window.nexoBraApp.logProviderInteraction(${ST.escAttr(branchId)}, ${ST.escAttr(branchInfo.provider_id)}, 'whatsapp_click', null, null, ${JSON.stringify(branchInfo.distance_km ?? null)})" href="https://wa.me/${branchContactPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, te escribo desde NEXOBRA para consultar precios.')}">Contactar por WhatsApp</a>`
 : '';

 const esFavorito = ST.favoritesState.ids.has(branchId);
 const favBtn = `
 <button class="btn-favorite-toggle ${esFavorito ? 'active' : ''}" onclick='window.nexoBraApp.toggleFavorite(${ST.escAttr(branchId)}, ${ST.escAttr(branchInfo.business_name)})'>
 ${esFavorito ? '★ En favoritos' : '☆ Guardar favorito'}
 </button>
 `;
 const esSuscripto = ST.offerSubscriptionsState.ids.has(branchId);
 const subBtn = `
 <button class="btn-favorite-toggle ${esSuscripto ? 'active' : ''}" onclick='window.nexoBraApp.toggleOfferSubscription(${ST.escAttr(branchId)}, ${ST.escAttr(branchInfo.provider_id)}, ${ST.escAttr(branchInfo.business_name)})'>
 ${esSuscripto ? ' Recibiendo sus ofertas' : ' Recibir sus ofertas por mail'}
 </button>
 `;
 const announcement = await fetchLatestAnnouncement(branchId);
 const businessHours = await fetchBranchHours(branchId);
 const branchSlug = await fetchBranchSlug(branchId);
 const publicPageBtn = branchSlug ? `
 <button class="btn-action-drawer btn-copy" style="width:100%; margin-bottom:12px;" onclick='window.nexoBraApp.goToProviderPublicPage(${ST.escAttr(branchSlug)})'>Ver ficha completa del proveedor
 </button>
 ` : '';

 const filas = (data || []).map(row => {
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

 ST.mapBranchPanel.innerHTML = `
 ${renderAnnouncementBanner(announcement)}
 <div style="display:flex; align-items:center; gap:10px; margin-bottom:2px;">
 ${branchInfo.logo_url ? `<img src="${ST.escapeHtml(branchInfo.logo_url)}" class="provider-logo-mini" alt="">` : ''}
 <h3 style="margin-bottom:0;">${ST.escapeHtml(branchInfo.business_name)}</h3>
 </div>
 <div class="branch-meta">${ST.escapeHtml(branchInfo.branch_name)} · ${ST.escapeHtml(branchInfo.locality)} · ${branchInfo.distance_km.toFixed(1)} km de tu ubicación</div>
 <div style="margin: 4px 0 10px;">${renderStarRating(branchInfo.avg_rating, branchInfo.review_count)}</div>
 ${renderBusinessHours(businessHours)}
 ${publicPageBtn}
 <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">${whatsappLink}${favBtn}${subBtn}</div>
 <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">Variación de precio vs. la mediana de proveedores en ${ST.mapState.radiusKm} km a la redonda:</p>
 ${filas || '<p style="font-size:0.8rem; color:var(--text-muted);">Sin materiales cargados todavía.</p>'}

 <div id="branch-reviews-section" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-light);">
 <button class="btn-action-drawer btn-copy" style="width:100%;" onclick="window.nexoBraApp.loadBranchReviews('${branchId}', ${ST.escAttr(branchInfo.provider_id)})">Ver / dejar una reseña</button>
 <div id="branch-reviews-body"></div>
 </div>
 `;
 }

 // (22/09) containerId/prefix opcionales: por defecto usa los ids de
 // siempre (la ficha del mapa), pero permiten reusar TODA esta lógica de
 // reseñas en otro lugar de la página (ej. la página pública del
 // proveedor) sin duplicar código -- mismo criterio que ya se usa para
 // anuncios (fetchLatestAnnouncement/renderAnnouncementBanner, ver
 // advertencia #22). El prefix evita ids repetidos en la página cuando los
 // dos bloques (ficha del mapa + página pública) existen a la vez en el
 // DOM, aunque uno esté oculto -- ver advertencia #20.
 export async function loadBranchReviews(branchId, providerId, containerId = 'branch-reviews-body', prefix = 'review') {
 const container = document.getElementById(containerId);
 if (!container) return;
 container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">Cargando reseñas...</p>';

 const { data: reviews, error } = await ST.supabaseClient
 .from('provider_reviews')
 .select('id, user_id, rating, comment, created_at, reply, replied_at')
 .eq('provider_id', providerId)
 .order('created_at', { ascending: false })
 .limit(10);

 if (error) {
 container.innerHTML = `<p style="color:#b91c1c; font-size:0.8rem; margin-top:10px;">${ST.friendlyError(error, "cargar reseñas")}</p>`;
 return;
 }

 // Los apodos se traen aparte, desde una vista pública que solo expone
 // el apodo (nunca el nombre completo, teléfono, etc. de terceros).
 const userIds = [...new Set((reviews || []).map(r => r.user_id))];
 const displayNames = {};
 if (userIds.length > 0) {
 const { data: names } = await ST.supabaseClient
 .from('public_display_names')
 .select('id, display_name')
 .in('id', userIds);
 (names || []).forEach(n => { displayNames[n.id] = n.display_name; });
 }

 const reviewsHtml = (reviews || []).length === 0
 ? '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">Todavía nadie dejó una reseña. ¡Sé el primero!</p>'
 : reviews.map(r => `
 <div class="review-row">
 <div class="review-row-header">
 <span class="star-rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
 <span style="font-size:0.72rem; color:var(--text-subtle);">${ST.escapeHtml(displayNames[r.user_id]) || 'Usuario de NEXOBRA'} · ${new Date(r.created_at).toLocaleDateString('es-AR')}</span>
 </div>
 ${r.comment ? `<p class="review-row-comment">${ST.escapeHtml(r.comment)}</p>` : ''}
 ${r.reply ? `
 <div class="review-reply-box">
 <strong style="font-size:0.75rem;">Respuesta del proveedor:</strong>
 <p style="font-size:0.8rem; margin-top:2px;">${ST.escapeHtml(r.reply)}</p>
 </div>
 ` : ''}
 ${ST.authState.user ? `<button class="review-report-link" onclick="window.nexoBraApp.reportReview(${ST.escAttr(r.id)})">Reportar</button>` : ''}
 </div>
 `).join('');

 const formHtml = !ST.authState.user ? `
 <p style="font-size:0.78rem; color:var(--text-muted); margin-top:12px;">Iniciá sesión para dejar tu reseña.</p>
 ` : `
 <div class="review-form" style="margin-top:14px;">
 <label style="font-size:0.78rem; font-weight:700; display:block; margin-bottom:6px;">Tu calificación</label>
 <div class="review-star-picker" id="${prefix}-star-picker" data-value="0">
 ${[1,2,3,4,5].map(n => `<span class="review-star-option" data-star="${n}" onclick="window.nexoBraApp.setReviewStars(${n}, '${prefix}')">☆</span>`).join('')}
 </div>
 <textarea id="${prefix}-comment-input" class="form-select" placeholder="Comentario corto (opcional)" rows="2" maxlength="300" style="width:100%; margin-top:8px; resize:vertical;" oninput="document.getElementById('${prefix}-char-count').textContent = this.value.length"></textarea>
 <span id="${prefix}-char-count" style="font-size:0.7rem; color:var(--text-subtle); float:right;">0</span>/300
 <button class="btn-computo" style="margin-top:8px; width:100%; justify-content:center;" onclick="window.nexoBraApp.submitReview(${ST.escAttr(providerId)}, ${ST.escAttr(branchId)}, '${containerId}', '${prefix}')">Publicar reseña</button>
 </div>
 `;

 container.innerHTML = reviewsHtml + formHtml;
 }

 export function setReviewStars(n, prefix = 'review') {
 const picker = document.getElementById(`${prefix}-star-picker`);
 if (!picker) return;
 picker.dataset.value = n;
 picker.querySelectorAll('.review-star-option').forEach((el, idx) => {
 el.textContent = idx < n ? '★' : '☆';
 });
 }

 export async function submitReview(providerId, branchId, containerId = 'branch-reviews-body', prefix = 'review') {
 if (!ST.authState.user) {
 ST.showToast('Iniciá sesión para dejar una reseña.');
 return;
 }
 const picker = document.getElementById(`${prefix}-star-picker`);
 const rating = parseInt(picker?.dataset.value || '0', 10);
 if (rating < 1) {
 ST.showToast('Elegí de 1 a 5 estrellas.');
 return;
 }
 const comment = document.getElementById(`${prefix}-comment-input`)?.value.trim() || null;

 const { error } = await ST.supabaseClient
 .from('provider_reviews')
 .upsert({ provider_id: providerId, user_id: ST.authState.user.id, rating, comment }, { onConflict: 'provider_id,user_id' });

 if (error) {
 ST.showToast('No se pudo publicar la reseña: ' + error.message);
 return;
 }
 ST.showToast('¡Gracias por tu reseña!');
 loadBranchReviews(branchId, providerId, containerId, prefix);
 }

 export async function reportReview(reviewId) {
 if (!ST.authState.user) {
 ST.showToast('Iniciá sesión para reportar una reseña.');
 return;
 }
 const motivo = prompt('¿Por qué querés reportar esta reseña? (opcional)');
 if (motivo === null) return; // canceló

 const { error } = await ST.supabaseClient.from('review_reports').insert({
 review_id: reviewId,
 reporter_user_id: ST.authState.user.id,
 reason: motivo || null
 });

 if (error) {
 ST.showToast('No se pudo enviar el reporte: ' + error.message);
 return;
 }
 ST.showToast('Gracias, un administrador va a revisarlo.');
 }

 export function requestUserLocation() {
 if (!navigator.geolocation) {
 ST.showToast('Tu navegador no soporta geolocalización.');
 return;
 }
 ST.mapStatusMsg.textContent = 'Buscando tu ubicación...';
 const refresh = () =>ST.mapState.filterMaterialId
 ? selectMaterialOnMap(ST.mapState.filterMaterialId, ST.mapState.filterMaterialName)
 : loadNearbyBranchesOnMap();
 navigator.geolocation.getCurrentPosition(
 (pos) => {
 ST.mapState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
 ST.mapState.map.setView([ST.mapState.center.lat, ST.mapState.center.lng], 13);
 refresh();
 },
 () => {
 ST.showToast('No se pudo acceder a tu ubicación. Mostrando la zona por defecto.');
 refresh();
 },
 { timeout: 8000 }
 );
 }

 export function setupMapListeners() {
 if (!ST.supabaseClient) return;
 ST.btnGeolocate.addEventListener('click', requestUserLocation);
 ST.mapRadiusSelect.addEventListener('change', () => {
 ST.mapState.radiusKm = parseFloat(ST.mapRadiusSelect.value);
 if (ST.mapState.filterMaterialId) {
 selectMaterialOnMap(ST.mapState.filterMaterialId, ST.mapState.filterMaterialName);
 } else {
 loadNearbyBranchesOnMap();
 }
 });
 const materialSearchInput = document.getElementById('home-map-material-search');
 const btnClearMaterialSearch = document.getElementById('btn-clear-map-material-search');
 if (materialSearchInput) materialSearchInput.addEventListener('input', searchMaterialOnMap);
 if (btnClearMaterialSearch) btnClearMaterialSearch.addEventListener('click', clearMaterialSearchOnMap);
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
 ST.showToast('No se pudieron cargar las ofertas de proveedores: ' + error.message);
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
 : `Ningún proveedor cargó precios dentro de ${ST.mapState.radiusKm} km de tu ubicación. Probá ampliar el radio.`;
 }

 export function setupPricingSourceListeners() {
 const btnToggleCompare = document.getElementById('btn-toggle-compare-providers');
 const providersControls = document.getElementById('catalog-providers-controls');
 const catalogRadiusSelect = document.getElementById('catalog-radius-select');
 if (!btnToggleCompare) return;

 async function refreshProvidersView() {
 const status = document.getElementById('catalog-providers-status');
 if (status) status.textContent = 'Buscando proveedores cerca tuyo...';
 await loadNearbyRepresentativePrices();
 Catalog.renderProducts();
 }

 async function activateCompare() {
 btnToggleCompare.classList.add('active');
 ST.state.compareNearbyProviders = true;
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

 function deactivateCompare() {
 btnToggleCompare.classList.remove('active');
 ST.state.compareNearbyProviders = false;
 if (providersControls) providersControls.style.display = 'none';
 Catalog.renderProducts();
 }

 btnToggleCompare.addEventListener('click', () => {
 if (ST.state.compareNearbyProviders) deactivateCompare();
 else activateCompare();
 });

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
 // proveedor puntual guarda el precio de ese momento tal cual — no hay "mes"
 // al que llevarlo, es lo que ese proveedor tiene cargado ahora. Si el
 // proveedor cambia después su precio, hay que sacarlo y volver a elegirlo.
 export async function openOfferPicker(materialId, cartIndex = null) {
 const material = NEXOBRA_DATA.find(m => m.id === materialId);
 if (!material) return;

 // Si viene de "Elegir proveedor" en un ítem que YA está en Mi Cómputo (por
 // ejemplo, uno que llegó de un Excel cotizado), guardamos el índice para
 // actualizar ESE ítem en lugar de agregar uno nuevo al elegir.
 ST.mapState.offerPickerCartIndex = cartIndex;

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
 ST.offerPickerResults.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "buscar ofertas de proveedores")}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 ST.offerPickerResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay ofertas cercanas para este material.</p>';
 return;
 }
 await attachOfferBrands(data);

 ST.offerPickerResults.innerHTML = data.map((offer, idx) => `
 <div class="offer-picker-row">
 <div class="offer-picker-row-info">
 <h5>${offer.brand ? `${ST.escapeHtml(offer.brand)} — ` : ''}${ST.escapeHtml(offer.business_name)}</h5>
 <span>${ST.escapeHtml(offer.branch_name)} · ${ST.escapeHtml(offer.locality)} · ${offer.distance_km.toFixed(1)} km${offer.stock_status === 'agotado' ? ' · <strong style="color:#b91c1c;">Agotado</strong>' : offer.stock_status === 'a_pedido' ? ' · A pedido' : ' · En stock'}</span>
 ${ST.offerAgeTag(offer.reported_at)}
 </div>
 <div class="offer-picker-row-price">
 <strong>${ST.formatMoney(offer.amount)}</strong>
 <span style="font-size:0.72rem; color:var(--text-muted);">/ ${offer.unit}</span>
 <button class="btn-computo" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 4px; display:block;" onclick='window.nexoBraApp.chooseProviderOffer(${ST.escAttr(materialId)}, ${idx})'>Elegir
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
 ST.mapState.offerPickerCartIndex = null;
 }

 export async function chooseProviderOffer(materialId, offerIndex) {
 const offer = window.__offerPickerData?.[offerIndex];
 const material = NEXOBRA_DATA.find(m => m.id === materialId);
 if (!offer || !material) return;

 // (17/11) Mi Cómputo se unió con la Calculadora: el material con el
 // precio de este proveedor entra como material suelto del presupuesto.
 const qtyInput = document.getElementById(`qty-${materialId}`);
 const typedQty = qtyInput ? Math.max(1, ST.parseLocaleNumber(qtyInput.value) || 1) : 1;

 // Si venías mirando en "Cómputo Métrico" (ej: 10 metros de hierro) y el
 // proveedor vende por unidad de compra (ej: barras de 12 m), no le podés
 // pedir "10 metros": se redondea hacia arriba a unidades de compra enteras.
 let qty = typedQty;
 let mode = ST.state.pricingMode === 'venta' ? 'venta' : 'computo';
 let roundedFrom = null;
 const proveedorVendePorUnidadDeCompra = offer.unit === material.unidadVenta && material.unidadVenta !== material.unidadComputo;
 const envase = Number(material.envase) || 1;
 if (mode === 'computo' && proveedorVendePorUnidadDeCompra && envase > 0) {
 qty = Math.ceil(typedQty / envase);
 mode = 'venta';
 roundedFrom = { qty: typedQty, unit: material.unidadComputo };
 }
 try {
 Apu.addCatalogMaterialToBudget(materialId, qty, mode, {
 id: offer.offer_id,
 branch_id: offer.branch_id,
 amount: offer.amount,
 unit: offer.unit,
 provider_business_name: offer.business_name,
 provider_branch_name: offer.branch_name,
 // Sin whatsapp_phone en la sucursal: el teléfono del proveedor (mismo criterio que la ficha y el Directorio).
 provider_whatsapp: offer.whatsapp_phone || (offer.provider_id ? await fetchProviderContactPhone(offer.provider_id) : null)
 });
 } catch (err) {
 ST.showToast(err.message);
 return;
 }
 if (ST.headerCartCount) ST.headerCartCount.textContent = ST.state.apuBudgetItems.length;
 closeOfferPicker();
 ST.showToast(roundedFrom
 ? `Necesitás ${ST.formatQty(roundedFrom.qty)} ${roundedFrom.unit} → se redondeó a ${qty} ${offer.unit} de ${offer.business_name}. Está en tu presupuesto.`
 : `Agregado a tu presupuesto con el precio de ${offer.business_name}: ${material.denominacion.substring(0, 30)}`);
 }

 export function setupOfferPickerListeners() {
 if (!ST.supabaseClient) return;
 ST.offerPickerModalCloseBtn.addEventListener('click', closeOfferPicker);
 ST.offerPickerModalBackdrop.addEventListener('click', closeOfferPicker);
 }

 // --- FASE E, PARTE 1: Dashboard de competitividad (dentro de "Mi Proveedor") ---
 // Reutiliza branch_price_variation(), ya construida en la Fase D para la
 // ficha que ve el USUARIO al tocar un pin. Acá el proveedor ve exactamente
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
 .select('id, branch_id, provider_branches(name, locality, whatsapp_phone, slug, providers(business_name))')
 .eq('user_id', ST.authState.user.id)
 .order('created_at', { ascending: false });

 if (error) {
 list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "cargar favoritos")}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 list.innerHTML = `
 <div class="computo-empty-state">
 <div class="empty-icon"></div>
 <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no guardaste ningún proveedor</h4>
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
 <h4>${ST.escapeHtml(branch.providers?.business_name) || '(proveedor eliminado)'}</h4>
 <span>${ST.escapeHtml(branch.name)} · ${ST.escapeHtml(branch.locality)}</span>
 </div>
 <div class="computation-row-actions">
 ${branch.slug ? `<button class="btn-action-drawer btn-copy" style="padding:7px 12px; font-size:0.78rem;" onclick='window.nexoBraApp.goToProviderPublicPage(${ST.escAttr(branch.slug)})'>Ver ficha</button>` : ''}
 ${whatsappUrl ? `<a href="${whatsappUrl}" target="_blank" class="btn-computo" style="padding:7px 12px; font-size:0.78rem; text-decoration:none;">WhatsApp</a>` : ''}
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

 // --- SUSCRIPCIÓN A OFERTAS POR MAIL (separado de favoritos a propósito) ---
 export async function loadOfferSubscriptionIds() {
 if (!ST.supabaseClient || !ST.authState.user) return;
 const { data, error } = await ST.supabaseClient
 .from('provider_offer_subscriptions')
 .select('branch_id')
 .eq('user_id', ST.authState.user.id);
 if (!error) {
 ST.offerSubscriptionsState.ids = new Set((data || []).map(r => r.branch_id));
 ST.offerSubscriptionsState.loaded = true;
 }
 }

 export async function toggleOfferSubscription(branchId, providerId, businessName) {
 if (!ST.authState.user) {
 ST.showToast('Iniciá sesión para suscribirte a las ofertas de un proveedor.');
 Auth.showAuthTab('login');
 Auth.openAuthModal();
 return;
 }
 const suscripto = ST.offerSubscriptionsState.ids.has(branchId);
 if (suscripto) {
 const { error } = await ST.supabaseClient.from('provider_offer_subscriptions').delete().eq('user_id', ST.authState.user.id).eq('branch_id', branchId);
 if (error) {
 ST.showToast('No se pudo dar de baja la suscripción: ' + error.message);
 return;
 }
 ST.offerSubscriptionsState.ids.delete(branchId);
 ST.showToast('No vas a recibir más las ofertas de este proveedor.');
 } else {
 const { error } = await ST.supabaseClient.from('provider_offer_subscriptions').insert({ user_id: ST.authState.user.id, branch_id: branchId, provider_id: providerId });
 if (error) {
 ST.showToast('No se pudo suscribir: ' + error.message);
 return;
 }
 ST.offerSubscriptionsState.ids.add(branchId);
 ST.showToast(`Listo, vas a recibir por mail las ofertas de ${businessName}.`);
 }
 // Si la ficha del mapa está abierta, refresca el botón para mostrar el nuevo estado.
 if (ST.mapState.lastSelectedBranch && ST.mapState.lastSelectedBranch.branch_id === branchId) {
 showBranchDetail(branchId, ST.mapState.lastSelectedBranch);
 }
 }

 export async function loadOfferSubscriptions() {
 const list = document.getElementById('offer-subscriptions-list');
 if (!list || !ST.authState.user) return;
 list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

 const { data, error } = await ST.supabaseClient
 .from('provider_offer_subscriptions')
 .select('id, branch_id, provider_branches(name, locality, providers(business_name))')
 .eq('user_id', ST.authState.user.id)
 .order('created_at', { ascending: false });

 if (error) {
 list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "cargar tus suscripciones")}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no te suscribiste a las ofertas de ningún proveedor. Desde la ficha de un proveedor en el mapa, usá el botón " Recibir sus ofertas por mail".</p>';
 return;
 }

 list.innerHTML = data.map(sub => {
 const branch = sub.provider_branches;
 return `
 <div class="computation-row">
 <div class="computation-row-info">
 <h4>${ST.escapeHtml(branch?.providers?.business_name) || '(proveedor eliminado)'}</h4>
 <span>${ST.escapeHtml(branch?.name || '')} · ${ST.escapeHtml(branch?.locality || '')}</span>
 </div>
 <div class="computation-row-actions">
 <button class="danger" onclick="window.nexoBraApp.removeOfferSubscription('${sub.branch_id}')">Dar de baja</button>
 </div>
 </div>
 `;
 }).join('');
 }

 export async function removeOfferSubscription(branchId) {
 await ST.supabaseClient.from('provider_offer_subscriptions').delete().eq('user_id', ST.authState.user.id).eq('branch_id', branchId);
 ST.offerSubscriptionsState.ids.delete(branchId);
 ST.showToast('Suscripción dada de baja.');
 loadOfferSubscriptions();
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
 ST.showToast('Todavía no hay ofertas de proveedores cargadas para este material en tu zona.');
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
 list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "cargar alertas")}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 list.innerHTML = `
 <div class="computo-empty-state">
 <div class="empty-icon"></div>
 <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no armaste ninguna alerta</h4>
 <p style="font-size: 0.85rem; color: var(--text-muted);">En el catálogo, activá "Ofertas de proveedores cercanos" y usá el botón de campana en cualquier material.</p>
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
 <h4>${ST.escapeHtml(material ? material.denominacion : alert.material_id)}</h4>
 <span>Precio de referencia: ${ST.formatMoney(alert.reference_price)} ${currentPrice !== null ? `· Ahora: ${ST.formatMoney(currentPrice)}` : '· Sin ofertas cercanas actuales'}</span>
 ${alert.last_notified_at ? `<span style="display:block; font-size:0.72rem; color:var(--text-subtle);">Último aviso por mail: ${new Date(alert.last_notified_at).toLocaleDateString('es-AR')}, a ${ST.formatMoney(alert.last_notified_price)}</span>` : '<span style="display:block; font-size:0.72rem; color:var(--text-subtle);">Todavía no bajó lo suficiente como para avisarte por mail.</span>'}
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

 // --- Alertas de rubro ("avisame de proveedores nuevos cerca mío") ---
 // Independiente de price_alerts: no es por material, es por rubro +
 // radio, pensada para el Directorio de Proveedores. Un usuario tiene como
 // mucho una alerta activa por rubro (unique en la tabla).
 export async function loadCategoryAlertIds() {
 if (!ST.supabaseClient || !ST.authState.user) return;
 const { data, error } = await ST.supabaseClient
 .from('category_alerts')
 .select('*')
 .eq('user_id', ST.authState.user.id);
 if (!error) {
 ST.categoryAlertsState.byCategoryId = {};
 (data || []).forEach(row => { ST.categoryAlertsState.byCategoryId[row.category_id] = row; });
 ST.categoryAlertsState.loaded = true;
 }
 }

 export async function toggleCategoryAlert() {
 if (!ST.authState.user) {
 ST.showToast('Iniciá sesión para crear alertas de proveedores nuevos.');
 Auth.showAuthTab('login');
 Auth.openAuthModal();
 return;
 }
 const categoryId = ST.directoryState.categoryId;
 if (!categoryId) {
 ST.showToast('Elegí primero un rubro puntual (no "Todos") para poder avisarte.');
 return;
 }
 const existing = ST.categoryAlertsState.byCategoryId[categoryId];
 if (existing) {
 await ST.supabaseClient.from('category_alerts').delete().eq('id', existing.id);
 delete ST.categoryAlertsState.byCategoryId[categoryId];
 ST.showToast('Alerta de rubro eliminada.');
 } else {
 const { data, error } = await ST.supabaseClient
 .from('category_alerts')
 .insert({
 user_id: ST.authState.user.id,
 category_id: categoryId,
 center_lat: ST.directoryState.center.lat,
 center_lng: ST.directoryState.center.lng,
 radius_km: ST.directoryState.radiusKm
 })
 .select('*')
 .single();
 if (!error) {
 ST.categoryAlertsState.byCategoryId[categoryId] = data;
 ST.showToast('Listo, te avisamos por mail si aparece un proveedor nuevo de este rubro en tu zona.');
 } else {
 ST.showToast(ST.friendlyError(error, 'crear la alerta'));
 }
 }
 updateCategoryAlertButton();
 }

 export function updateCategoryAlertButton() {
 const btn = document.getElementById('btn-directory-create-alert');
 if (!btn) return;
 const categoryId = ST.directoryState.categoryId;
 if (!categoryId) {
 btn.textContent = ' Elegí un rubro para avisarte';
 btn.classList.remove('active');
 return;
 }
 const activa = !!ST.categoryAlertsState.byCategoryId[categoryId];
 btn.textContent = activa ? ' Ya te avisamos de este rubro' : ' Avisame de proveedores nuevos';
 btn.classList.toggle('active', activa);
 }

 export async function loadCategoryAlerts() {
 const list = document.getElementById('category-alerts-list');
 if (!list || !ST.authState.user) return;
 list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

 if (ST.directoryState.categories.length === 0) {
 const { data } = await ST.supabaseClient.from('provider_categories').select('id, name, kind').eq('active', true).order('name');
 ST.directoryState.categories = data || [];
 }

 const { data, error } = await ST.supabaseClient
 .from('category_alerts')
 .select('*')
 .eq('user_id', ST.authState.user.id)
 .order('created_at', { ascending: false });

 if (error) {
 list.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${ST.friendlyError(error, "cargar alertas de rubro")}</p>`;
 return;
 }
 if (!data || data.length === 0) {
 list.innerHTML = `
 <div class="computo-empty-state">
 <div class="empty-icon"></div>
 <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no armaste ninguna alerta de rubro</h4>
 <p style="font-size: 0.85rem; color: var(--text-muted);">En el Directorio de Proveedores, elegí un rubro y tocá "Avisame de proveedores nuevos".</p>
 </div>
 `;
 return;
 }

 list.innerHTML = data.map(alert => {
 const cat = ST.directoryState.categories.find(c => c.id === alert.category_id);
 return `
 <div class="computation-row">
 <div class="computation-row-info">
 <h4>${ST.escapeHtml(cat ? cat.name : 'Rubro')}</h4>
 <span>Radio: ${alert.radius_km} km</span>
 ${alert.last_checked_at ? `<span style="display:block; font-size:0.72rem; color:var(--text-subtle);">Última revisión: ${new Date(alert.last_checked_at).toLocaleDateString('es-AR')}</span>` : ''}
 </div>
 <div class="computation-row-actions" style="align-items:center;">
 <button class="danger" onclick="window.nexoBraApp.removeCategoryAlert('${alert.id}', '${alert.category_id}')">Eliminar</button>
 </div>
 </div>
 `;
 }).join('');
 }

 export async function removeCategoryAlert(alertId, categoryId) {
 await ST.supabaseClient.from('category_alerts').delete().eq('id', alertId);
 delete ST.categoryAlertsState.byCategoryId[categoryId];
 ST.showToast('Alerta de rubro eliminada.');
 loadCategoryAlerts();
 updateCategoryAlertButton();
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

 // ============================================================
 // Directorio de Proveedores (fichas por distancia + rubro)
 // ============================================================

 export async function loadDirectoryCategories() {
 const container = document.getElementById('directory-category-pills');
 if (!container || !ST.supabaseClient) return;

 if (ST.directoryState.categories.length === 0) {
 const { data } = await ST.supabaseClient
 .from('provider_categories')
 .select('id, name, kind')
 .eq('active', true)
 .order('name');
 ST.directoryState.categories = data || [];
 }

 const pill = (id, label) => `
 <button class="cat-btn ${ST.directoryState.categoryId === id ? 'active' : ''}" data-cat-id="${id === null ? '' : id}">
 <span>${ST.escapeHtml(label)}</span>
 </button>
 `;

 container.innerHTML = pill(null, 'Todos') + ST.directoryState.categories.map(c => pill(c.id, c.name)).join('');

 container.querySelectorAll('button[data-cat-id]').forEach(btn => {
 btn.addEventListener('click', () => {
 ST.directoryState.categoryId = btn.dataset.catId || null;
 loadDirectoryCategories();
 loadProvidersDirectory();
 updateCategoryAlertButton();
 });
 });
 }

 // Último resultado de nearby_providers_directory (con las palabras clave
 // ya mergeadas). Se guarda acá para que escribir en el buscador de texto
 // solo re-filtre y re-pinte en memoria, sin repetir la consulta RPC
 // (que hace el cálculo de distancia) en cada letra que se tipea.
 let directoryDataCache = [];

 export async function loadProvidersDirectory() {
 const status = document.getElementById('directory-status');
 const container = document.getElementById('directory-cards-container');
 if (!container || !ST.supabaseClient) return;
 status.textContent = 'Buscando proveedores...';

 const { data, error } = await ST.supabaseClient.rpc('nearby_providers_directory', {
 center_lat: ST.directoryState.center.lat,
 center_lng: ST.directoryState.center.lng,
 radius_km: ST.directoryState.radiusKm,
 p_category_id: ST.directoryState.categoryId
 });

 if (error) {
 status.textContent = ST.friendlyError(error, 'cargar el directorio de proveedores');
 container.innerHTML = '';
 directoryDataCache = [];
 return;
 }
 if (!data || data.length === 0) {
 status.textContent = 'No hay proveedores cargados en esta zona/rubro todavía.';
 container.innerHTML = '';
 directoryDataCache = [];
 return;
 }

 // Palabras clave: la RPC no las devuelve (no está trackeada en ninguna
 // migración, así que no se reescribe a ciegas) -- se piden aparte, mismo
 // patrón que attachOfferBrands() para las ofertas del mapa.
 const providerIds = [...new Set(data.map(p => p.provider_id))];
 const { data: keywordRows } = await ST.supabaseClient.from('provider_keywords').select('provider_id, keyword').in('provider_id', providerIds);
 const keywordsByProvider = new Map();
 (keywordRows || []).forEach(k => {
 if (!keywordsByProvider.has(k.provider_id)) keywordsByProvider.set(k.provider_id, []);
 keywordsByProvider.get(k.provider_id).push(k.keyword);
 });
 data.forEach(p => { p.keywords = keywordsByProvider.get(p.provider_id) || []; });

 // Anuncios/promos: mismo patrón que las palabras clave -- se piden en
 // bloque por los branch_id de este resultado, y se queda con el más
 // nuevo por sucursal (RLS ya filtra activo+no vencido, ver migración 012).
 const branchIds = [...new Set(data.map(p => p.branch_id))];
 const { data: announcementRows } = await ST.supabaseClient
 .from('provider_announcements')
 .select('branch_id, message, expires_at, created_at')
 .in('branch_id', branchIds)
 .order('created_at', { ascending: false });
 const announcementByBranch = new Map();
 (announcementRows || []).forEach(a => {
 if (!announcementByBranch.has(a.branch_id)) announcementByBranch.set(a.branch_id, a);
 });
 data.forEach(p => { p.announcement = announcementByBranch.get(p.branch_id) || null; });

 // Horario de atención + slug (para el link a la página pública): mismo
 // patrón, bulk-fetch por los branch_id de este resultado.
 const { data: hoursRows } = await ST.supabaseClient
 .from('provider_branches')
 .select('id, business_hours, slug')
 .in('id', branchIds);
 const hoursByBranch = new Map((hoursRows || []).map(r => [r.id, r.business_hours]));
 const slugByBranch = new Map((hoursRows || []).map(r => [r.id, r.slug]));
 data.forEach(p => {
 p.business_hours = hoursByBranch.get(p.branch_id) || null;
 p.slug = slugByBranch.get(p.branch_id) || null;
 });

 directoryDataCache = data;
 renderDirectoryList();

 // Registra que cada uno de estos proveedores apareció en una búsqueda del
 // Directorio, para su dashboard ("cantidad de interacciones" por distancia).
 // Es una señal más débil que un click, pero es la única forma de saber que
 // alguien efectivamente vio la ficha (no solo la buscó por WhatsApp/web).
 // Sobre TODOS los resultados de la zona/rubro, no solo los que matchean
 // el buscador de texto (ese es solo un filtro visual en el cliente).
 data.forEach(p =>ST.logProviderInteraction(p.branch_id, p.provider_id, 'directory_view', null, null, p.distance_km));
 }

 function directoryCardMatchesSearch(p, tokens) {
 if (tokens.length === 0) return true;
 const haystack = ST.normalizeText([p.business_name, p.category_name, p.locality, ...(p.keywords || [])].filter(Boolean).join(' '));
 return tokens.every(t => haystack.includes(t));
 }

 /** Re-filtra y re-pinta directoryDataCache según ST.directoryState.searchQuery, sin red. */
 export function renderDirectoryList() {
 const status = document.getElementById('directory-status');
 const container = document.getElementById('directory-cards-container');
 if (!container) return;

 const tokens = ST.normalizeText(ST.directoryState.searchQuery || '').split(' ').filter(Boolean);
 const filtered = directoryDataCache.filter(p => directoryCardMatchesSearch(p, tokens));

 if (filtered.length === 0) {
 status.textContent = directoryDataCache.length === 0
 ? 'No hay proveedores cargados en esta zona/rubro todavía.'
 : 'Ningún proveedor coincide con esa búsqueda.';
 container.innerHTML = '';
 return;
 }

 status.textContent = `${filtered.length} proveedor${filtered.length === 1 ? '' : 'es'} encontrado${filtered.length === 1 ? '' : 's'}.`;

 // Rediseño (17/09, a pedido del usuario): la tarjeta entera es ahora el
 // "botón" que lleva a la ficha completa del proveedor -- antes tenía un
 // botón aparte "Ver ficha completa" más otros 2 (WhatsApp/Sitio web)
 // compitiendo adentro de la tarjeta. Acá solo se muestra lo esencial
 // para elegir (nombre, ubicación, rubro, descripción, estrellas) -- el
 // contacto por WhatsApp, el sitio web, el horario y el catálogo completo
 // ya están un click más allá, en la ficha completa.
 container.innerHTML = filtered.map(p => {
 const clickable = p.slug ? `class="provider-directory-card clickable" onclick='window.nexoBraApp.goToProviderPublicPage(${ST.escAttr(p.slug)})' role="button" tabindex="0"` : `class="provider-directory-card"`;
 return `
 <div ${clickable}>
 <div class="provider-directory-card-header">
 ${p.logo_url ? `<img src="${ST.escapeHtml(p.logo_url)}" alt="">` : ''}
 <div>
 <h4 style="margin-bottom:2px;">${ST.escapeHtml(p.business_name)}</h4>
 <span style="font-size:0.75rem; color:var(--text-subtle);">${ST.escapeHtml(p.locality || '')} · ${p.distance_km.toFixed(1)} km</span>
 </div>
 </div>
 ${p.category_name ? `<span class="provider-directory-category-badge">${p.category_kind === 'services' ? '' : ''} ${ST.escapeHtml(p.category_name)}</span>` : ''}
 ${renderAnnouncementBanner(p.announcement)}
 <div>${renderStarRating(p.avg_rating, p.review_count)}</div>
 ${p.description ? `<p style="font-size:0.85rem; color:var(--text-muted);">${ST.escapeHtml(p.description)}</p>` : ''}
 </div>
 `;
 }).join('');
 }

 // ============================================================
 // Sugerencia de proveedores desde el buscador del catálogo principal: si
 // lo que se busca matchea una palabra clave que cargó un proveedor, se
 // sugiere ahí mismo (además de aparecer, como siempre, en el Directorio).
 // Cache simple en memoria -- se pide una sola vez por sesión, no en cada
 // letra que se tipea (los proveedores no cambian tan seguido).
 // ============================================================

 let keywordSuggestionCache = null;

 async function ensureKeywordSuggestionCache() {
 if (keywordSuggestionCache !== null || !ST.supabaseClient) return keywordSuggestionCache;
 const { data, error } = await ST.supabaseClient
 .from('provider_keywords')
 .select('keyword, provider_id, providers(business_name, active)');
 if (error) { keywordSuggestionCache = []; return keywordSuggestionCache; }
 // El embed de providers respeta su propia RLS -- si por lo que sea no
 // pasa (proveedor inactivo, etc.) viene null en vez de filtrar la fila,
 // así que se descarta acá.
 keywordSuggestionCache = (data || []).filter(k => k.providers && k.providers.active);
 return keywordSuggestionCache;
 }

 export async function updateCatalogProviderSuggestion(query) {
 const container = document.getElementById('catalog-provider-suggestion');
 if (!container) return;
 const tokens = ST.normalizeText(query || '').split(' ').filter(Boolean);
 if (tokens.length === 0 || (query || '').trim().length < 3) {
 container.style.display = 'none';
 container.innerHTML = '';
 return;
 }

 const cache = (await ensureKeywordSuggestionCache()) || []; // null si Supabase no respondió
 const matches = cache.filter(k => {
 const haystack = ST.normalizeText(k.keyword);
 return tokens.some(t => haystack.includes(t));
 });
 if (matches.length === 0) {
 container.style.display = 'none';
 container.innerHTML = '';
 return;
 }

 // Un proveedor puede matchear por más de una palabra clave -- se
 // muestra una sola vez.
 const seen = new Set();
 const uniqueProviders = [];
 matches.forEach(m => {
 if (!seen.has(m.provider_id)) { seen.add(m.provider_id); uniqueProviders.push(m); }
 });

 container.style.display = 'flex';
 container.innerHTML = `
 <span style="font-size:0.85rem; font-weight:700;">Proveedores relacionados:</span>
 ${uniqueProviders.slice(0, 5).map(m => `
 <button type="button" class="btn-action-drawer btn-copy" style="padding:6px 12px; font-size:0.78rem;" onclick="window.nexoBraApp.goToProviderInDirectory(${ST.escAttr(m.providers.business_name)})">${ST.escapeHtml(m.providers.business_name)}</button>
 `).join('')}
 `;
 }

 /** Desde una sugerencia del catálogo: abre el Directorio ya filtrado por ese proveedor. */
 export function goToProviderInDirectory(businessName) {
 ST.directoryState.searchQuery = businessName;
 Main.switchView('providers-directory');
 const input = document.getElementById('directory-search-input');
 if (input) input.value = businessName;
 if (directoryDataCache.length > 0) {
 renderDirectoryList();
 } else {
 loadProvidersDirectory();
 }
 }

 export function requestDirectoryUserLocation() {
 if (!navigator.geolocation) {
 ST.showToast('Tu navegador no soporta geolocalización.');
 loadProvidersDirectory();
 return;
 }
 const status = document.getElementById('directory-status');
 if (status) status.textContent = 'Buscando tu ubicación...';
 navigator.geolocation.getCurrentPosition(
 (pos) => {
 ST.directoryState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
 loadProvidersDirectory();
 },
 () => {
 ST.showToast('No se pudo acceder a tu ubicación. Mostrando la zona por defecto.');
 loadProvidersDirectory();
 },
 { timeout: 8000 }
 );
 }

 // ============================================================
 // Página pública por proveedor (nexoobra.com.ar/proveedor/<slug>) --
 // pensada para que cada corralón la comparta como "su espacio" (bio de
 // WhatsApp/Instagram, etc.). A diferencia de la ficha del mapa
 // (showBranchDetail), esta vista NO depende de la ubicación de quien la
 // visita -- no muestra "variación de precio vs. la zona" (que necesita un
 // centro de referencia), solo la lista de precios propia del proveedor.
 // Se arma por sucursal (branch), que es donde vive el slug -- ver
 // migración 013.
 // ============================================================

 // (18/11) Rediseño como mini-landing (auditoría 12/11) + "Reclamá tu
 // negocio" para las fichas cargadas por NEXOBRA (sin dueño). Lo que sigue
 // igual: se arma por sucursal (slug), no depende de la ubicación de quien
 // la visita, y las reseñas usan loadBranchReviews con ids propios ('ppr').
 let providerPublicState = { slug: null, branch: null, provider: null, offers: [] };

 function initialsOf(name) {
 return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
 }

 export async function loadProviderPublicPage(slug) {
 const container = document.getElementById('provider-public-content');
 if (!container) return;
 container.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando...</p>';

 const { data: branch, error } = await ST.supabaseClient
 .from('provider_branches')
 .select('id, name, locality, address, latitude, longitude, whatsapp_phone, business_hours, provider_id, providers(business_name, description, logo_url, website_url, contact_phone, contact_email, matricula, category_id, owner_id)')
 .eq('slug', slug)
 .eq('active', true)
 .maybeSingle();

 if (error || !branch || !branch.providers) {
 container.innerHTML = `
 <div style="text-align:center; padding: 40px 16px;">
 <p style="font-size:1rem; font-weight:700; margin-bottom:8px;">No encontramos esta página.</p>
 <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">El link puede estar mal escrito, o el proveedor todavía no está activo.</p>
 <button class="btn-action-drawer btn-copy" onclick="window.nexoBraApp.switchView('providers-directory')">Ver el Directorio de Proveedores</button>
 </div>
 `;
 document.title = 'NEXOBRA | Comparador técnico de precios para la construcción';
 return;
 }

 const provider = branch.providers;
 document.title = `${provider.business_name} | NEXOBRA`;

 let categoryName = '';
 if (provider.category_id) {
 const { data: cat } = await ST.supabaseClient.from('provider_categories').select('name').eq('id', provider.category_id).maybeSingle();
 categoryName = cat?.name || '';
 }

 const [{ data: ratingData }, { data: offers }, { data: keywordRows }, announcement, { data: photoRows }] = await Promise.all([
 ST.supabaseClient.from('provider_ratings_summary').select('avg_rating, review_count').eq('provider_id', branch.provider_id).maybeSingle(),
 ST.supabaseClient.from('provider_offers').select('id, material_id, price_kind, amount, unit, brand, stock_status, reported_at, materials(denomination)').eq('branch_id', branch.id).eq('status', 'approved').order('reported_at', { ascending: false }),
 ST.supabaseClient.from('provider_keywords').select('keyword').eq('provider_id', branch.provider_id),
 fetchLatestAnnouncement(branch.id),
 ST.supabaseClient.from('provider_branch_photos').select('photo_url').eq('branch_id', branch.id).order('sort_order'),
 ]);

 providerPublicState = { slug, branch, provider, offers: offers || [] };
 const sinDueno = !provider.owner_id;
 const contactPhone = branch.whatsapp_phone || provider.contact_phone;
 const digits = contactPhone ? contactPhone.replace(/\D/g, '') : '';
 const ultimaActualizacion = (offers || []).reduce((max, o) => (o.reported_at && (!max || o.reported_at > max)) ? o.reported_at : max, null);
 const pageUrl = `${window.location.origin}/proveedor/${slug}`;

 const waLink = digits
 ? `<a class="pp-btn pp-btn-wa" target="_blank" rel="noopener" onclick="window.nexoBraApp.logProviderInteraction(${ST.escAttr(branch.id)}, ${ST.escAttr(branch.provider_id)}, 'whatsapp_click', null, null, null)" href="https://wa.me/${digits}?text=${encodeURIComponent('Hola, te escribo desde tu página de NEXOBRA para pedirte un presupuesto.')}">Pedir presupuesto por WhatsApp</a>`
 : '';
 const telLink = contactPhone ? `<a class="pp-btn" href="tel:${ST.escapeHtml(contactPhone.replace(/[^\d+]/g, ''))}">Llamar</a>` : '';
 const webLink = provider.website_url ? `<a class="pp-btn" target="_blank" rel="noopener" href="${ST.escapeHtml(provider.website_url)}">Sitio web</a>` : '';
 const mapsLink = (branch.latitude && branch.longitude)
 ? `<a class="pp-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.latitude + ',' + branch.longitude)}">Cómo llegar</a>`
 : (branch.address ? `<a class="pp-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address + ', ' + branch.locality)}">Cómo llegar</a>` : '');
 const shareBtn = `<button type="button" class="pp-btn" onclick='window.nexoBraApp.shareProviderPublicPage()'>Compartir</button>`;

 const photosHtml = (photoRows || []).length
 ? `<section class="pp-card"><h3>Trabajos y local</h3><div class="provider-public-photos-grid">${photoRows.map(p => `<img src="${ST.escapeHtml(p.photo_url)}" alt="Foto de ${ST.escapeHtml(provider.business_name)}" loading="lazy">`).join('')}</div></section>`
 : '';

 const keywordsHtml = (keywordRows || []).length
 ? `<div class="pp-keywords">${keywordRows.map(k => `<span class="provider-keyword-chip">${ST.escapeHtml(k.keyword)}</span>`).join('')}</div>`
 : '';

 const announcementHtml = announcement
 ? `<div class="provider-announcement-banner pp-announcement"><span>${ST.escapeHtml(announcement.message)}</span><small>Vence el ${new Date(announcement.expires_at).toLocaleDateString('es-AR')}</small></div>`
 : '';

 const claimBanner = sinDueno ? `
 <div class="pp-claim">
 <div>
 <strong>¿Es tu negocio?</strong>
 <span>Esta ficha la armó NEXOBRA con precios relevados. Reclamala gratis para actualizar tus precios, sumar fotos y recibir pedidos por WhatsApp.</span>
 </div>
 <button type="button" class="btn-computo" onclick="window.nexoBraApp.openProviderClaim()">Reclamá tu negocio</button>
 </div>` : '';

 const offersCount = (offers || []).length;
 container.innerHTML = `
 <section class="pp-hero">
 <div class="pp-hero-main">
 ${provider.logo_url ? `<img src="${ST.escapeHtml(provider.logo_url)}" class="pp-logo" alt="">` : `<div class="pp-logo pp-logo-initials" aria-hidden="true">${ST.escapeHtml(initialsOf(provider.business_name))}</div>`}
 <div class="pp-hero-text">
 <h2>${ST.escapeHtml(provider.business_name)}</h2>
 <div class="pp-meta">${categoryName ? ST.escapeHtml(categoryName) + ' · ' : ''}${ST.escapeHtml(branch.name)} · ${ST.escapeHtml(branch.locality)}</div>
 <div class="pp-rating">${renderStarRating(ratingData?.avg_rating, ratingData?.review_count)}</div>
 <div class="pp-badges">
 ${offersCount ? `<span class="pp-badge">${offersCount} precio${offersCount === 1 ? '' : 's'} cargado${offersCount === 1 ? '' : 's'}</span>` : ''}
 ${ultimaActualizacion ? `<span class="pp-badge">${ST.escapeHtml(ST.formatOfferAge(ultimaActualizacion).text)}</span>` : ''}
 ${sinDueno ? '<span class="pp-badge pp-badge-muted">Ficha armada por NEXOBRA</span>' : ''}
 </div>
 </div>
 </div>
 <div class="pp-actions">${waLink}${telLink}${mapsLink}${webLink}${shareBtn}</div>
 </section>

 ${claimBanner}
 ${announcementHtml}

 <div class="pp-layout">
 <div class="pp-main">
 <section class="pp-card">
 <div class="pp-card-head">
 <h3>Lista de precios</h3>
 ${offersCount > 6 ? '<input type="search" id="pp-offer-filter" class="form-select" placeholder="Buscar en la lista..." aria-label="Buscar en la lista de precios">' : ''}
 </div>
 <p class="pp-note">Precios informados por ${sinDueno ? 'el negocio a NEXOBRA' : 'el proveedor'}, sin impuestos ni flete salvo que se indique. Tocá "Agregar" para sumarlo a tu presupuesto y mandarle el pedido desde ahí.</p>
 <div id="pp-offer-list" class="pp-offer-list"></div>
 </section>
 ${photosHtml}
 <section class="pp-card" id="provider-public-reviews-section">
 <h3>Reseñas</h3>
 <div id="provider-public-reviews-body"><p style="font-size:0.85rem; color:var(--text-muted);">Cargando reseñas...</p></div>
 </section>
 </div>
 <aside class="pp-aside">
 ${provider.description ? `<section class="pp-card"><h3>Sobre el negocio</h3><p class="pp-desc">${ST.escapeHtml(provider.description)}</p>${keywordsHtml}</section>` : (keywordsHtml ? `<section class="pp-card"><h3>Qué vende</h3>${keywordsHtml}</section>` : '')}
 <section class="pp-card">
 <h3>Datos</h3>
 <ul class="pp-data">
 ${branch.address ? `<li><span>Dirección</span>${ST.escapeHtml(capitalizar(branch.address))}, ${ST.escapeHtml(branch.locality)}</li>` : `<li><span>Localidad</span>${ST.escapeHtml(branch.locality)}</li>`}
 ${contactPhone ? `<li><span>Teléfono</span><a href="tel:+${ST.escapeHtml(telE164(contactPhone))}">${ST.escapeHtml(formatPhoneAR(contactPhone))}</a></li>` : ''}
 ${provider.contact_email ? `<li><span>Email</span><a href="mailto:${ST.escapeHtml(provider.contact_email)}">${ST.escapeHtml(provider.contact_email)}</a></li>` : ''}
 ${provider.matricula ? `<li><span>Matrícula</span>${ST.escapeHtml(provider.matricula)}</li>` : ''}
 </ul>
 ${branch.business_hours ? `<h4 class="pp-subtitle">Horarios</h4>${renderBusinessHours(branch.business_hours)}` : ''}
 </section>
 <section class="pp-card pp-cta">
 <p>Esta es la página de ${ST.escapeHtml(provider.business_name)} en <strong>NEXOBRA</strong>, el planificador de obra que conecta tu obra con los comercios de tu zona.</p>
 <button type="button" class="btn-action-drawer" onclick="window.nexoBraApp.switchView('providers-directory')">Ver más proveedores</button>
 ${sinDueno ? '' : '<button type="button" class="link-button" onclick="window.nexoBraApp.startProviderSignup()">¿Tenés un negocio? Sumalo gratis</button>'}
 </section>
 </aside>
 </div>
 `;

 renderProviderPublicOffers('');
 const filterInput = document.getElementById('pp-offer-filter');
 if (filterInput) filterInput.addEventListener('input', () => renderProviderPublicOffers(filterInput.value));

 loadBranchReviews(branch.id, branch.provider_id, 'provider-public-reviews-body', 'ppr');

 // Si la persona tocó "Reclamá tu negocio" sin cuenta, se registró y volvió: se le abre el formulario.
 let pendingClaim = null;
 try { pendingClaim = sessionStorage.getItem('nexobra_claim_slug'); } catch (e) { /* sin storage */ }
 if (pendingClaim === slug && ST.authState.user && sinDueno) {
 try { sessionStorage.removeItem('nexobra_claim_slug'); } catch (e) { /* nada */ }
 openProviderClaim();
 }
 }

 function renderProviderPublicOffers(query) {
 const list = document.getElementById('pp-offer-list');
 if (!list) return;
 const q = ST.normalizeText(query || '');
 const offers = providerPublicState.offers.filter(o => !q || ST.normalizeText(`${o.materials?.denomination || ''} ${o.brand || ''}`).includes(q));
 if (providerPublicState.offers.length === 0) {
 list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Este proveedor todavía no tiene precios cargados. Pedile presupuesto por WhatsApp.</p>';
 return;
 }
 if (offers.length === 0) {
 list.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Nada coincide con esa búsqueda.</p>';
 return;
 }
 list.innerHTML = offers.map(o => `
 <div class="pp-offer">
 <div class="pp-offer-info">
 <strong>${ST.escapeHtml(o.materials?.denomination || '(material eliminado)')}</strong>
 <span>${o.brand ? `${ST.escapeHtml(o.brand)} · ` : ''}<span class="stock-badge ${ST.stockClass(o.stock_status)}">${o.stock_status === 'en_stock' ? 'En stock' : o.stock_status === 'a_pedido' ? 'A pedido' : 'Agotado'}</span> ${ST.offerAgeTag(o.reported_at)}</span>
 </div>
 <div class="pp-offer-price">
 <strong>${ST.formatMoney(o.amount)}</strong>
 <span>/ ${ST.escapeHtml(o.unit)}</span>
 </div>
 ${o.material_id ? `<button type="button" class="btn-action-drawer pp-offer-add" onclick="window.nexoBraApp.addProviderPublicOfferToBudget('${ST.escapeHtml(o.id)}')">Agregar</button>` : ''}
 </div>
 `).join('');
 }

 /** "Agregar" en la lista de precios de la página del proveedor: suma 1 unidad del material con ESE precio al presupuesto (Calculadora). */
 export async function addProviderPublicOfferToBudget(offerId) {
 const o = providerPublicState.offers.find(x => x.id === offerId);
 const { branch, provider } = providerPublicState;
 if (!o || !branch) return;
 const material = (typeof NEXOBRA_DATA !== 'undefined' ? NEXOBRA_DATA : []).find(m => m.id === o.material_id);
 if (!material) { ST.showToast('Ese material ya no está en el catálogo.'); return; }
 const mode = o.unit === material.unidadVenta ? 'venta' : 'computo';
 try {
 Apu.addCatalogMaterialToBudget(o.material_id, 1, mode, {
 id: o.id,
 branch_id: branch.id,
 amount: o.amount,
 unit: o.unit,
 provider_business_name: provider.business_name,
 provider_branch_name: branch.name,
 provider_whatsapp: branch.whatsapp_phone || provider.contact_phone || null
 });
 } catch (err) { ST.showToast(err.message); return; }
 if (ST.headerCartCount) ST.headerCartCount.textContent = ST.state.apuBudgetItems.length;
 ST.logEvent('apu_task_added', `desde la página de ${provider.business_name}`.slice(0, 120));
 ST.showToast(`Agregado a tu presupuesto: 1 ${o.unit} de ${material.denominacion.substring(0, 28)}. Cambiá la cantidad y mandale el pedido desde "Mi presupuesto".`);
 }

 export function shareProviderPublicPage() {
 const { slug, provider } = providerPublicState;
 if (!slug) return;
 ST.shareOrCopyLink(`${window.location.origin}/proveedor/${slug}`, `${provider.business_name} | NEXOBRA`, `Mirá la lista de precios de ${provider.business_name} en NEXOBRA:`);
 }

 // --- "Reclamá tu negocio" (migración 036) ---
 export async function openProviderClaim() {
 const { slug, branch, provider } = providerPublicState;
 if (!branch) return;
 const modal = document.getElementById('provider-claim-modal');
 const backdrop = document.getElementById('provider-claim-backdrop');
 const body = document.getElementById('provider-claim-body');
 if (!modal || !backdrop || !body) return;
 document.getElementById('provider-claim-title').textContent = `Reclamá ${provider.business_name}`;
 ST.logEvent('provider_cta', `reclamar ${provider.business_name}`.slice(0, 120));

 if (!ST.authState.user) {
 try { sessionStorage.setItem('nexobra_claim_slug', slug); } catch (e) { /* sin storage */ }
 body.innerHTML = `
 <p class="pp-claim-text">Para reclamar la ficha necesitás una cuenta de NEXOBRA (gratis). Creala con el mail del negocio y volvé a esta página: te vamos a pedir tu nombre y un teléfono para confirmar que sos vos.</p>
 <div class="pp-claim-buttons">
 <button type="button" class="btn-computo" onclick="window.nexoBraApp.claimGoToAuth('register')">Crear mi cuenta</button>
 <button type="button" class="btn-action-drawer" onclick="window.nexoBraApp.claimGoToAuth('login')">Ya tengo cuenta</button>
 </div>`;
 } else {
 const { data: mine } = await ST.supabaseClient.from('provider_claims').select('id, status').eq('provider_id', branch.provider_id).eq('user_id', ST.authState.user.id).order('created_at', { ascending: false }).limit(1);
 const last = mine && mine[0];
 if (last && last.status === 'pending') {
 body.innerHTML = '<p class="pp-claim-text">Ya recibimos tu pedido para esta ficha. Te vamos a contactar al teléfono que dejaste para confirmarlo; cuando lo aprobemos, la vas a administrar desde "Mi Proveedor".</p>';
 } else {
 body.innerHTML = `
 <form id="provider-claim-form" class="pp-claim-form">
 <label>Tu nombre y apellido<input type="text" id="claim-name" class="form-select" required maxlength="120" value="${ST.escapeHtml(ST.authState.profile?.full_name || '')}"></label>
 <label>Teléfono (te llamamos para confirmar)<input type="tel" id="claim-phone" class="form-select" required maxlength="40" placeholder="Ej: 3755 123456"></label>
 <label>¿Qué sos en el negocio?
 <select id="claim-role" class="form-select"><option>Dueño/a</option><option>Encargado/a</option><option>Empleado/a</option><option>Otro</option></select>
 </label>
 <label>Algo que quieras contarnos (opcional)<textarea id="claim-message" class="form-select" rows="2" maxlength="500"></textarea></label>
 <button type="submit" class="btn-computo">Enviar pedido</button>
 </form>`;
 document.getElementById('provider-claim-form').addEventListener('submit', submitProviderClaim);
 }
 }
 modal.classList.add('open');
 backdrop.classList.add('open');
 document.body.style.overflow = 'hidden';
 }

 export function closeProviderClaim() {
 document.getElementById('provider-claim-modal')?.classList.remove('open');
 document.getElementById('provider-claim-backdrop')?.classList.remove('open');
 document.body.style.overflow = '';
 }

 export function claimGoToAuth(tab) {
 closeProviderClaim();
 Auth.showAuthTab(tab === 'login' ? 'login' : 'register');
 if (tab !== 'login') {
 const radio = document.querySelector('input[name="register-role"][value="provider"]');
 if (radio) radio.checked = true;
 }
 Auth.openAuthModal();
 }

 async function submitProviderClaim(e) {
 e.preventDefault();
 const { branch } = providerPublicState;
 const name = document.getElementById('claim-name').value.trim();
 const phone = document.getElementById('claim-phone').value.trim();
 if (name.length < 2 || phone.replace(/\D/g, '').length < 6) { ST.showToast('Completá tu nombre y un teléfono válido.'); return; }
 const btn = e.target.querySelector('button[type="submit"]');
 if (btn) btn.disabled = true;
 const { error } = await ST.supabaseClient.from('provider_claims').insert({
 provider_id: branch.provider_id,
 branch_id: branch.id,
 user_id: ST.authState.user.id,
 contact_name: name,
 contact_phone: phone,
 role_in_business: document.getElementById('claim-role').value,
 message: document.getElementById('claim-message').value.trim() || null
 });
 if (btn) btn.disabled = false;
 if (error) {
 console.error('[NEXOBRA] reclamo de proveedor:', error);
 ST.showToast(error.code === '23505' ? 'Ya tenés un pedido pendiente para esta ficha.' : 'No se pudo enviar el pedido. Probá de nuevo en un rato.');
 return;
 }
 document.getElementById('provider-claim-body').innerHTML = '<p class="pp-claim-text"><strong>¡Listo!</strong> Recibimos tu pedido. Te vamos a llamar para confirmarlo y, apenas lo aprobemos, vas a poder administrar la ficha desde "Mi Proveedor".</p>';
 }

 /** Después de iniciar sesión: si la persona venía de "Reclamá tu negocio" y sigue en esa página, se le abre el formulario. */
 export function resumePendingProviderClaim() {
 let pending = null;
 try { pending = sessionStorage.getItem('nexobra_claim_slug'); } catch (e) { return; }
 if (!pending || !ST.authState.user || providerPublicState.slug !== pending || ST.state.currentView !== 'provider-public') return;
 try { sessionStorage.removeItem('nexobra_claim_slug'); } catch (e) { /* nada */ }
 openProviderClaim();
 }
