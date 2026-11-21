// NEXOBRA - catalog.js

import * as Apu from './apu.js';
import * as Computo from './computo.js';
import * as Main from './main.js';
import * as MapModule from './map.js';
import * as Pricing from './pricing.js';
import * as ST from './state.js';

 export const RUBROS_METADATA = {
 "Básicos": {
 icon: "",
 desc: "Cementos, cales, áridos (arena, piedra, binder), hormigón elaborado y aditivos químicos Sika."
 },
 "Acero de refuerzo": {
 icon: "",
 desc: "Barras lisas AL220, barras torsionadas/aletadas ADN420 del 6 al 25 y mallas electrosoldadas."
 },
 "Construcción en Seco": {
 icon: "",
 desc: "Placas de yeso Durlock (estándar, RH verde, ignífugas), perfiles montantes, soleras y masillas."
 },
 "Cerramientos Verticales": {
 icon: "",
 desc: "Ladrillos huecos cerámicos, ladrillos comunes macizos, sistema Retak (HCCA) y bloques U."
 },
 "Cubiertas": {
 icon: "",
 desc: "Chapas Cincalum y galvanizadas acanaladas y trapezoidales, fibroasfálticas, traslúcidas, tejas y zinguería (canaletas, cenefas, babetas)."
 },
 "Aislaciones": {
 icon: "",
 desc: "Hidráulicas (hidrófugos, impermeabilizantes, membranas y pinturas asfálticas, juntas de dilatación), térmicas y acústicas (lana de vidrio, espumas, placas acústicas, aislantes con aluminio)."
 },
 "Instalaciones": {
 icon: "",
 desc: "Sanitarios Ferrum, griferías FV, cañerías PVC cloacales, Hidro3 agua, gas termofusión y electricidad."
 },
 "Revestimientos": {
 icon: "",
 desc: "Pisos cerámicos, adhesivos Klaukol, porcelanatos, pisos flotantes, mármoles, granitos y pinturas látex."
 },
 "Aberturas": {
 icon: "",
 desc: "Puertas inyectadas, aluminio, madera/mdf, ventanas corredizas, cortinas roller y cerraduras."
 },
 "Maderas": {
 icon: "",
 desc: "Tablas de encofrado, tirantes de pino, fenólicos de 18mm con film y placas de melamina/MDF."
 },
 "Prefabricados": {
 icon: "",
 desc: "Viguetas pretensadas tensolite, casetones de telgopor EPS y losas huecas de hormigón."
 },
 "Metálicos": {
 icon: "",
 desc: "Perfiles C, caños estructurales cuadrados/redondos, perfiles UPN/IPN, planchuelas y metal desplegado."
 },
 "Herramientas y Equipos": {
 icon: "",
 desc: "Hormigoneras, carretillas Sorrento, andamios, amoladoras DeWalt, soldadoras y herramientas Biassoni."
 },
 "Alquiler": {
 icon: "",
 desc: "Alquiler de contenedores, retroexcavadoras, mini cargadoras Bobcat, baños químicos y camionetas."
 },
 "Seguridad e Higiene": {
 icon: "",
 desc: "Cascos Libus, arneses anticaída, botines Pampero/Ombú con puntera de acero, guantes y conos viales."
 },
 "Ferretería": {
 icon: "",
 desc: "Alambres recocidos N°16 y N°9, clavos cabeza de plomo, clavos punta parís y concertinas de seguridad."
 }
 };

 // --- APP STATE ---
 export function renderLabor() {
 const grid = document.getElementById('labor-grid');
 if (!grid) return;
 if (!ST.laborState.loaded) {
 grid.innerHTML = '<p style="color:var(--text-muted);">Cargando jornales...</p>';
 return;
 }
 grid.innerHTML = ST.laborState.roles.map(role => {
 let valor = role.values[ST.state.priceMonth];
 let projectedFromEarlierMonth = null;
 if (valor === undefined) {
 // UOCRA todavía no publicó este mes (sale a mitad del mes siguiente) --
 // usamos el último mes disponible en vez de directamente "sin dato".
 const mesesDisponibles = ST.laborState.months.filter(m => m <= ST.state.priceMonth && role.values[m] !== undefined);
 if (mesesDisponibles.length > 0) {
 const sustituto = mesesDisponibles[mesesDisponibles.length - 1];
 valor = role.values[sustituto];
 projectedFromEarlierMonth = sustituto;
 }
 }
 const disponible = valor !== undefined;
 const texto = disponible ? `$${Math.round(valor).toLocaleString('es-AR')}` : 'Sin dato para este mes';
 const unidadLabel = role.unit === 'mes' ? 'por mes' : 'por hora';
 const inputId = `labor-qty-${role.code}`;
 return `
 <article class="product-card">
 <h3 class="product-title">${ST.escapeHtml(role.name)}</h3>
 <div class="product-category-tree">UOCRA Zona A · sin cargas sociales</div>
 <p style="font-weight:600; font-size:22px; margin:12px 0 0;">${texto}</p>
 <p style="font-size:12px; color:var(--text-muted); margin:2px 0 12px;">${unidadLabel}</p>
 ${projectedFromEarlierMonth ? `<p class="price-source-tag ipc" style="margin:0 0 10px;" title="UOCRA todavía no publicó este mes">Valor de ${ST.monthLabel(projectedFromEarlierMonth)}</p>` : ''}
 ${disponible ? `
 <div class="card-actions">
 <div class="qty-control">
 <button class="qty-btn" onclick="window.nexoBraApp.changeLaborQty('${role.code}', -1)" title="Reducir cantidad">-</button>
 <input type="number" id="${inputId}" class="qty-input" value="1" min="0.5" step="0.5" aria-label="${ST.escapeHtml(unidadLabel === 'por mes' ? 'Meses de' : 'Horas de')} ${ST.escapeHtml(role.name)}">
 <button class="qty-btn" onclick="window.nexoBraApp.changeLaborQty('${role.code}', 1)" title="Aumentar cantidad">+</button>
 </div>
 <button class="btn-add-computo" onclick="window.nexoBraApp.addLaborToComputo('${role.code}')">
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <line x1="12" y1="5" x2="12" y2="19"></line>
 <line x1="5" y1="12" x2="19" y2="12"></line>
 </svg>
 <span>Sumar</span>
 </button>
 </div>` : ''}
 </article>
 `;
 }).join('');
 }

 export function changeLaborQty(code, delta) {
 const input = document.getElementById(`labor-qty-${code}`);
 if (input) {
 let val = parseFloat(input.value) || 1;
 val = Math.max(0.5, val + delta);
 input.value = val;
 }
 }

 /**
 * (18/11, pedido del usuario) A cuánto equivale la unidad de venta: "1 Bolsa
 * = 30 kg · $ 410 por kg", "1 Millar = 1.000 un", o, cuando la unidad de
 * cómputo es el mismo envase (cemento en "bl"), lo que dice el nombre:
 * "Bolsa de 50 kg". null si no hay nada útil para decir.
 */
 export function packageEquivalence(item) {
 const venta = String(item.unidadVenta || '').trim();
 const computo = String(item.unidadComputo || '').trim();
 const envase = Number(item.envase) || 1;
 const norm = (u) => u.toLowerCase().replace('²', '2').replace('³', '3').replace(/\.$/, '');
 // "ml" en el catálogo es metro lineal: se muestra "m" para no confundir con mililitros.
 const pretty = (u) => ({ ml: 'm', m2: 'm²', m3: 'm³' }[norm(u)] || u);
 if (venta && computo && norm(venta) !== norm(computo) && envase !== 1 && norm(computo) !== 'bl') {
 const precioComputo = Pricing.getReferencePrice(item, 'computo').currentPrice;
 const precioTxt = isNaN(precioComputo) ? '' : ` · ${ST.formatMoney(precioComputo)} por ${pretty(computo)}`;
 return `1 ${venta} = ${ST.formatQty(envase)} ${pretty(computo)}${precioTxt}`;
 }
 // Envases cuyo contenido figura en el nombre ("Cemento Portland 50kg"): no se
 // aplica a m³ ni a unidades sueltas, para no leer "300 kg cemento" de un hormigón.
 const esEnvase = /^(bolsa|bolsón|bolson|balde|lata|tambor|bid[oó]n|caja|pote|frasco|cartucho|rollo)$/i.test(venta);
 const m = esEnvase && String(item.denominacion || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|grs?|g|lts?|l|litros|cc|ml)\b/i);
 if (m) {
 const unidad = { kgs: 'kg', gr: 'g', grs: 'g', lt: 'l', lts: 'l', litros: 'l' }[m[2].toLowerCase()] || m[2].toLowerCase();
 const contenido = ST.parseLocaleNumber(m[1]);
 const precioVenta = Pricing.getReferencePrice(item, 'venta').currentPrice;
 const porUnidad = (['kg', 'l'].includes(unidad) && contenido > 0 && !isNaN(precioVenta))
 ? ` · ${ST.formatMoney(precioVenta / contenido)} por ${unidad}` : '';
 return `${venta} de ${m[1]} ${unidad}${porUnidad}`;
 }
 return null;
 }

 export function updateCatalogHeader() {
 if (ST.state.activeRubro === 'Todos') {
 ST.catalogHeaderTitle.textContent = 'Precios de materiales';
 ST.catalogHeaderSubtitle.textContent = 'Precios de referencia NEXOBRA, con los de corralones de tu zona.';
 } else {
 const meta = RUBROS_METADATA[ST.state.activeRubro] || { icon: "", desc: "" };
 ST.catalogHeaderTitle.textContent = ST.state.activeRubro;
 ST.catalogHeaderSubtitle.textContent = meta.desc || `Materiales y precios de referencia para ${ST.state.activeRubro}`;
 }
 }

 // --- INIT & EVENT LISTENERS ---
 export function renderHomeSubareas() {
 const rubros = [...new Set(NEXOBRA_DATA.map(i => i.rubro))];
 ST.rubrosHubGrid.innerHTML = '';

 rubros.forEach(rubro => {
 const count = NEXOBRA_DATA.filter(i => i.rubro === rubro).length;
 const meta = RUBROS_METADATA[rubro] || {
 icon: "",
 desc: "Materiales técnicos y precios de referencia de la construcción."
 };

 const card = document.createElement('div');
 card.className = 'rubro-hub-card';
 card.innerHTML = `
 <div>
 <div class="rubro-card-top">
 <div class="rubro-card-icon">${meta.icon}</div>
 <span class="rubro-count-pill">${count} materiales</span>
 </div>
 <h3 class="rubro-card-name">${rubro}</h3>
 <p class="rubro-card-desc">${meta.desc}</p>
 </div>
 <div class="rubro-card-footer">
 <span>Ver materiales</span>
 <span class="arrow">&rarr;</span>
 </div>
 `;

 card.addEventListener('click', () => {
 Main.switchView('catalog', rubro, '');
 });

 ST.rubrosHubGrid.appendChild(card);
 });
 }

 // --- RUBRO PILLS RENDER (INSIDE CATALOG) ---
 /** Compara un material contra los tokens de búsqueda (compartido entre el
 * filtro de productos y el conteo de rubros, para que ambos coincidan). */
 function itemMatchesSearchTokens(item, tokens) {
 if (tokens.length === 0) return true;
 const haystack = ST.normalizeText([
 item.denominacion,
 item.id,
 item.categoria,
 item.subcategoria,
 ...(item.tags || [])
 ].filter(Boolean).join(' '));
 return tokens.every(tok => haystack.includes(tok) || haystack.includes(ST.singularize(tok)));
 }

 export function renderRubroPills() {
 const tokens = ST.normalizeText(ST.state.searchQuery).split(' ').filter(Boolean);
 const buscando = tokens.length > 0;

 // Con una búsqueda activa, contamos SOLO lo que matchea esa búsqueda en
 // cada rubro (y ocultamos los rubros sin ningún resultado) -- así, si
 // buscás "aluminio", ves "Aberturas 12" y "Cubiertas 5",
 // no el total completo de materiales que tiene cada rubro.
 const materialesRelevantes = buscando ? NEXOBRA_DATA.filter(i => itemMatchesSearchTokens(i, tokens)) : NEXOBRA_DATA;

 const rubrosConteo = {};
 materialesRelevantes.forEach(i => { rubrosConteo[i.rubro] = (rubrosConteo[i.rubro] || 0) + 1; });

 const rubros = buscando
 ? ['Todos', ...Object.keys(rubrosConteo)]
 : ['Todos', ...new Set(NEXOBRA_DATA.map(i => i.rubro))];

 ST.rubrosFilterContainer.innerHTML = '';

 rubros.forEach(rubro => {
 const count = rubro === 'Todos' ? materialesRelevantes.length : (rubrosConteo[rubro] || 0);
 if (buscando && rubro !== 'Todos' && count === 0) return; // sin resultados en este rubro para esta búsqueda: no se muestra

 const btn = document.createElement('button');
 btn.className = `cat-btn ${ST.state.activeRubro === rubro ? 'active' : ''}`;
 btn.innerHTML = `<span>${rubro}</span><span class="count-badge">${count}</span>`;

 btn.addEventListener('click', () => {
 ST.state.activeRubro = rubro;
 updateCatalogHeader();
 renderRubroPills();
 renderProducts();
 });

 ST.rubrosFilterContainer.appendChild(btn);
 });
 }

 /** Quita una 's' o 'es' final para tolerar singular/plural en la búsqueda (ladrillo ~ ladrillos). */
 export function getFilteredItems() {
 // Se busca por palabra (no por frase completa), y cada palabra tolera singular/plural
 // y puede matchear en cualquier campo (denominación, tags, categoría, etc.), no necesariamente
 // en el mismo. Así "ladrillo hueco" encuentra "Ladrillos huecos" sin que el usuario tenga que
 // escribir el texto exacto.
 // Página de un material (/material/<ID>-<nombre>): solo ese.
 if (ST.state.materialFocusId) return NEXOBRA_DATA.filter(item => item.id === ST.state.materialFocusId);

 const tokens = ST.normalizeText(ST.state.searchQuery).split(' ').filter(Boolean);

 let items = NEXOBRA_DATA.filter(item => {
 if (ST.state.activeRubro !== 'Todos' && item.rubro !== ST.state.activeRubro) {
 return false;
 }
 return itemMatchesSearchTokens(item, tokens);
 });

 if (ST.state.sortBy === 'price-asc') {
 items.sort((a, b) => {
 const pA = Pricing.getReferencePrice(a).currentPrice;
 const pB = Pricing.getReferencePrice(b).currentPrice;
 return pA - pB;
 });
 } else if (ST.state.sortBy === 'price-desc') {
 items.sort((a, b) => {
 const pA = Pricing.getReferencePrice(a).currentPrice;
 const pB = Pricing.getReferencePrice(b).currentPrice;
 return pB - pA;
 });
 } else if (ST.state.sortBy === 'alpha-asc') {
 items.sort((a, b) => a.denominacion.localeCompare(b.denominacion));
 }

 return items;
 }

 let lastCatalogFilterSignature = null;

 // --- RENDER PRODUCTS (GRID & TABLE) ---
 export function renderProducts() {
 // Si cambió la búsqueda, el rubro o el orden, la paginación vuelve a empezar
 // desde la página 1 -- así nunca te quedás "perdido" en la página 5 de un
 // filtro que ya no aplica. Cambiar el mes o el modo de precio NO resetea
 // la página, porque esos cambios no alteran qué materiales aparecen.
 // Si estaba abierta la página de un material y el usuario buscó otra cosa
 // o eligió un rubro, se sale de esa página y se vuelve al catálogo.
 if (ST.state.materialFocusId && (ST.state.searchQuery.trim() || ST.state.activeRubro !== 'Todos')) {
 leaveMaterialFocus();
 }
 const filterSignature = `${ST.state.searchQuery}|${ST.state.activeRubro}|${ST.state.sortBy}|${ST.state.materialFocusId || ''}`;
 if (filterSignature !== lastCatalogFilterSignature) {
 ST.state.catalogPage = 1;
 lastCatalogFilterSignature = filterSignature;
 }

 const btnLoadMoreCatalog = document.getElementById('btn-load-more-catalog');
 const catalogPaginationStatus = document.getElementById('catalog-pagination-status');

 // Sin búsqueda y sin rubro elegido: no mostramos los 943 materiales de
 // entrada, mostramos los rubros (más abajo en la página) e invitamos a
 // buscar. Los materiales aparecen recién cuando hay una intención clara
 // (buscaste algo, o elegiste un rubro puntual).
 const sinFiltroActivo = !ST.state.searchQuery.trim() && ST.state.activeRubro === 'Todos' && !ST.state.materialFocusId;
 // (18/11) Sin filtro se ven las tarjetas de rubros: la barra de orden/comparar y la paginación no aplican.
 if (ST.catalogView) ST.catalogView.classList.toggle('catalog-browse-mode', sinFiltroActivo);
 if (sinFiltroActivo) {
 ST.visibleCount.textContent = NEXOBRA_DATA.length;
 ST.activeFilterLabel.textContent = '';
 ST.productsGrid.innerHTML = '';
 ST.productsTableBody.innerHTML = '';
 if (btnLoadMoreCatalog) btnLoadMoreCatalog.style.display = 'none';
 if (catalogPaginationStatus) catalogPaginationStatus.textContent = '';
 return;
 }

 const filtered = getFilteredItems();
 const pageSize = ST.state.catalogPageSize || 25;
 const visibleCount = ST.state.catalogPage * pageSize;
 const visible = filtered.slice(0, visibleCount);

 ST.visibleCount.textContent = filtered.length;
 if (ST.state.searchQuery.trim()) ST.logSearch(ST.state.searchQuery, filtered.length);
 ST.activeFilterLabel.textContent = ST.state.activeRubro !== 'Todos' ? ` en ${ST.state.activeRubro}` : '';

 if (filtered.length === 0) {
 ST.productsGrid.innerHTML = `
 <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-light);">
 <div style="font-size: 2.5rem; margin-bottom: 1rem;"></div>
 <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">No se encontraron materiales</h3>
 <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 1.5rem;">Probá buscando por términos coloquiales como "durlock", "cemento", "hierro", "vigueta" o "sika".
 </p>
 <button class="btn-computo" onclick="window.nexoBraApp.clearCatalogSearch();" style="margin: 0 auto;">Mostrar todos los materiales
 </button>
 </div>
 `;
 ST.productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No hay materiales para mostrar</td></tr>`;
 if (btnLoadMoreCatalog) btnLoadMoreCatalog.style.display = 'none';
 if (catalogPaginationStatus) catalogPaginationStatus.textContent = '';
 return;
 }

 const focusBanner = ST.state.materialFocusId ? `
 <div class="material-focus-banner">
 <span>Estás viendo la ficha de un material.</span>
 <button class="btn-action-drawer" type="button" onclick="window.nexoBraApp.clearCatalogSearch()">Ver todo el catálogo</button>
 </div>` : '';

 // Grid HTML -- (18/11, maqueta aprobada) tarjeta más simple: rubro,
 // nombre (link a la ficha), precio por unidad de venta y a cuánto equivale
 // el envase, referencia del mes, ofertas de corralones (si se comparó) y
 // cantidad + Agregar. Etiquetas, ficha técnica e historial pasaron a la
 // ficha del material.
 const mesLabel = ST.state.priceMonth ? ST.monthLabel(ST.state.priceMonth) : '';
 ST.productsGrid.innerHTML = focusBanner + visible.map(item => {
 const trace = Pricing.getReferencePrice(item, 'venta');
 const mainPrice = trace.currentPrice;
 const equiv = packageEquivalence(item);
 const oferta = ST.state.compareNearbyProviders ? ST.providerPricesState.byMaterial[item.id] : null;
 const fuente = trace.isMarketSourced
 ? 'Precio de mercado real'
 : trace.projectedFromEarlierMonth
 ? `Referencia NEXOBRA · proyectado con IPC de ${ST.monthLabel(trace.projectedFromEarlierMonth)}`
 : `Referencia NEXOBRA${mesLabel ? ' · ' + mesLabel : ''}`;
 let ofertasHtml = '';
 if (oferta) {
 ofertasHtml = `<button type="button" class="card-offers card-offers-yes" onclick="window.nexoBraApp.openOfferPicker('${item.id}')">${oferta.offers_count} corralón${oferta.offers_count === 1 ? '' : 'es'} cerca · desde ${ST.formatMoney(oferta.min_price)} <span aria-hidden="true">›</span></button>`;
 } else if (ST.state.compareNearbyProviders) {
 ofertasHtml = '<div class="card-offers card-offers-no">Todavía sin precios de corralones cerca</div>';
 }
 return `
 <article class="product-card product-card-v2" id="card-${item.id}">
 <div class="card-top">
 <span class="card-rubro-badge">${ST.escapeHtml(item.rubro)}</span>
 <span class="card-code">${item.id}</span>
 </div>
 <h3 class="product-title"><a class="product-title-link" href="${ST.materialPath(item.id, item.denominacion)}" onclick="return window.nexoBraApp.openMaterialPage('${ST.escapeHtml(item.id)}', event)">${ST.escapeHtml(item.denominacion)}</a></h3>
 ${isNaN(mainPrice) ? `
 <div class="card-price-v2"><span class="card-price-none">Sin precio de referencia todavía</span></div>
 ` : `
 <div class="card-price-v2">
 <span class="price-main-val">${ST.formatMoney(mainPrice)}</span>
 <span class="price-unit-tag">/ ${ST.escapeHtml(item.unidadVenta || trace.unit)}</span>
 </div>
 ${equiv ? `<div class="card-equiv">${ST.escapeHtml(equiv)}</div>` : ''}
 <div class="card-source">${ST.escapeHtml(fuente)}</div>
 `}
 ${ofertasHtml}
 <div class="card-actions">
 <div class="qty-control">
 <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', -1)" title="Reducir cantidad" aria-label="Menos">-</button>
 <input type="number" id="qty-${item.id}" class="qty-input" value="1" min="1" max="999" aria-label="Cantidad en ${ST.escapeHtml(item.unidadVenta || '')}">
 <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', 1)" title="Aumentar cantidad" aria-label="Más">+</button>
 </div>
 <button class="btn-add-computo" id="btn-add-${item.id}" onclick="window.nexoBraApp.addToComputo('${item.id}')">
 <span>Agregar</span>
 </button>
 </div>
 </article>
 `;
 }).join('');

 // Table HTML
 ST.productsTableBody.innerHTML = visible.map(item => {
 const ventaTrace = Pricing.getReferencePrice(item, 'venta');
 const equiv = packageEquivalence(item);
 return `
 <tr>
 <td><span class="card-code">${item.id}</span></td>
 <td>
 <a class="product-title-link" href="${ST.materialPath(item.id, item.denominacion)}" onclick="return window.nexoBraApp.openMaterialPage('${ST.escapeHtml(item.id)}', event)"><strong>${ST.escapeHtml(item.denominacion)}</strong></a>
 <div style="font-size: 0.76rem; color: var(--text-subtle);">${ST.escapeHtml(item.subcategoria)}</div>
 </td>
 <td>
 <span class="card-rubro-badge">${ST.escapeHtml(item.rubro)}</span>
 </td>
 <td>
 <strong>${ST.formatMoney(ventaTrace.currentPrice)}</strong>
 <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${ST.escapeHtml(ventaTrace.unit || '')}</span>
 </td>
 <td class="table-equiv">${equiv ? ST.escapeHtml(equiv) : '<span class="text-subtle">—</span>'}</td>
 <td style="text-align: right;">
 <button class="btn-add-computo" style="padding: 6px 12px; font-size: 0.78rem; display: inline-flex;" onclick="window.nexoBraApp.addToComputo('${item.id}')">
 + Agregar
 </button>
 </td>
 </tr>
 `;
 }).join('');

 // Clickable tags
 document.querySelectorAll('.card-tag-item').forEach(tagSpan => {
 tagSpan.addEventListener('click', (e) => {
 e.stopPropagation();
 const tag = tagSpan.getAttribute('data-tag');
 ST.catalogSearchInput.value = tag;
 ST.state.searchQuery = tag;
 renderProducts();
 ST.catalogSearchInput.focus();
 });
 });

 // Paginación: "Cargar más" + texto de estado ("Mostrando 25 de 943").
 if (btnLoadMoreCatalog) {
 btnLoadMoreCatalog.style.display = visible.length < filtered.length ? 'inline-flex' : 'none';
 }
 if (catalogPaginationStatus) {
 catalogPaginationStatus.textContent = `Mostrando ${visible.length} de ${filtered.length} materiales`;
 }
 }

 export function loadMoreCatalogItems() {
 ST.state.catalogPage++;
 renderProducts();
 }

 export function setCatalogPageSize(size) {
 ST.state.catalogPageSize = parseInt(size, 10) || 25;
 ST.state.catalogPage = 1;
 renderProducts();
 }

 /** Sale de la página de un material (vuelve a /catalogo en la barra de direcciones). */
 function leaveMaterialFocus() {
 ST.state.materialFocusId = null;
 if (window.location.pathname.startsWith('/material/')) {
 history.replaceState({ view: 'catalog' }, '', '/catalogo');
 document.title = 'Catálogo de materiales de construcción con precios de referencia | NEXOBRA';
 }
 }

 export function clearCatalogSearch() {
 leaveMaterialFocus();
 ST.catalogSearchInput.value = '';
 ST.state.searchQuery = '';
 ST.state.activeRubro = 'Todos';
 renderRubroPills();
 renderProducts();
 }

 // --- CÓMPUTO CART MANAGEMENT ---


 // ===========================================================================
 // FICHA DE UN MATERIAL (/material/<ID>-<nombre>) -- (18/11, maqueta aprobada)
 // Reemplaza al "catálogo filtrado a un solo material". Muestra el precio por
 // unidad de venta y a cuánto equivale, cómo varió, y dónde comprarlo con el
 // precio de cada corralón ("Agregar con este precio" / WhatsApp).
 // ===========================================================================
 const materialPageState = { id: null, offers: [] };

 export function renderMaterialPage(id) {
 const cont = document.getElementById('material-page-content');
 const item = NEXOBRA_DATA.find(m => m.id === id);
 if (!cont || !item) return;
 materialPageState.id = id;
 materialPageState.offers = [];
 const trace = Pricing.getReferencePrice(item, 'venta');
 const equiv = packageEquivalence(item);
 const mesLabel = ST.state.priceMonth ? ST.monthLabel(ST.state.priceMonth) : '';
 const fuente = trace.isMarketSourced
 ? 'Precio de mercado real'
 : trace.projectedFromEarlierMonth
 ? `Precio de referencia · proyectado con IPC de ${ST.monthLabel(trace.projectedFromEarlierMonth)}`
 : `Precio de referencia${mesLabel ? ' · ' + mesLabel : ''}`;
 const unidad = item.unidadVenta || trace.unit || '';
 const arbol = [item.categoria, item.subcategoria].filter(Boolean).map(ST.escapeHtml).join(' › ');
 const rubroAttr = ST.escAttr(item.rubro);
 cont.innerHTML = `
 <nav class="material-crumbs" aria-label="Ruta">
 <a href="/catalogo" onclick="event.preventDefault(); window.nexoBraApp.switchView('catalog')">Precios</a>
 <span aria-hidden="true">›</span>
 <a href="/catalogo" onclick='event.preventDefault(); window.nexoBraApp.switchView("catalog", ${rubroAttr})'>${ST.escapeHtml(item.rubro)}</a>
 <span aria-hidden="true">›</span>
 <span>${ST.escapeHtml(item.denominacion)}</span>
 </nav>
 <div class="material-layout">
 <div class="material-main">
 <section class="material-card material-hero">
 <span class="card-rubro-badge">${ST.escapeHtml(item.rubro)} · ${ST.escapeHtml(item.id)}</span>
 <h1>${ST.escapeHtml(item.denominacion)}</h1>
 ${arbol ? `<p class="material-tree">${arbol}</p>` : ''}
 <div class="material-buy">
 <div class="material-price">
 <div class="material-price-label">${ST.escapeHtml(fuente)}</div>
 ${isNaN(trace.currentPrice)
 ? '<div class="material-price-row"><span class="card-price-none">Sin precio de referencia todavía</span></div>'
 : `<div class="material-price-row"><span class="material-price-val">${ST.formatMoney(trace.currentPrice)}</span><span class="material-price-unit">/ ${ST.escapeHtml(unidad)}</span></div>`}
 <div class="material-equiv">${equiv ? ST.escapeHtml(equiv) + ' · ' : ''}<a href="/quienes-somos" onclick="event.preventDefault(); window.nexoBraApp.switchView('about')">cómo se calcula</a></div>
 </div>
 <div class="material-add">
 <label for="material-page-qty">Cantidad</label>
 <div class="qty-control">
 <button class="qty-btn" type="button" onclick="window.nexoBraApp.changeMaterialPageQty(-1)" aria-label="Menos">-</button>
 <input type="number" id="material-page-qty" class="qty-input" value="1" min="1" max="9999" aria-label="Cantidad en ${ST.escapeHtml(unidad)}">
 <button class="qty-btn" type="button" onclick="window.nexoBraApp.changeMaterialPageQty(1)" aria-label="Más">+</button>
 </div>
 <span class="material-add-unit">${ST.escapeHtml(unidad)}</span>
 <button type="button" class="btn-add-computo material-add-btn" id="material-page-add" onclick="window.nexoBraApp.addMaterialPageToBudget(null)">Agregar a mi presupuesto</button>
 </div>
 </div>
 </section>
 <section class="material-card" aria-labelledby="material-history-title">
 <div class="material-card-head">
 <h2 id="material-history-title">Cómo varió el precio</h2>
 <span id="material-history-summary" class="material-muted"></span>
 </div>
 <div id="material-history" class="material-history"><p class="material-muted">Cargando historial...</p></div>
 </section>
 </div>
 <aside class="material-card material-where" aria-labelledby="material-where-title">
 <h2 id="material-where-title">Dónde comprarlo</h2>
 <p class="material-muted">Precios cargados por cada corralón o relevados por NEXOBRA. Zona piloto: Oberá.</p>
 <div id="material-offers" class="material-offers"><p class="material-muted">Buscando corralones...</p></div>
 </aside>
 </div>
 `;
 loadMaterialHistory(item);
 loadMaterialOffers(item);
 }

 async function loadMaterialHistory(item) {
 const box = document.getElementById('material-history');
 const summary = document.getElementById('material-history-summary');
 if (!box) return;
 if (!ST.supabaseClient) { box.innerHTML = '<p class="material-muted">No se pudo cargar el historial.</p>'; return; }
 const { data, error } = await ST.supabaseClient
 .from('material_reference_anchors_cache')
 .select('target_month, anchor_price, is_market_sourced')
 .eq('material_id', item.id)
 .eq('price_kind', 'sale')
 .not('anchor_price', 'is', null)
 .order('target_month');
 if (materialPageState.id !== item.id) return; // ya se fue a otra ficha
 if (error || !data || data.length < 2) {
 box.innerHTML = '<p class="material-muted">Todavía no hay suficiente historial de precios para este material.</p>';
 return;
 }
 const rows = data.slice(-12);
 const vals = rows.map(r => Number(r.anchor_price));
 const min = Math.min(...vals), max = Math.max(...vals);
 // Coordenadas en píxeles reales del recuadro (sin estirar el SVG), así los puntos quedan redondos en el celular.
 const W = Math.max(280, Math.round(box.clientWidth || 900));
 const H = W < 500 ? 150 : 200;
 const x0 = 8, x1 = W - 10, yTop = 16, yBot = H - 18;
 const x = (i) => x0 + (rows.length === 1 ? 0 : i * (x1 - x0) / (rows.length - 1));
 const y = (v) => max === min ? (yTop + yBot) / 2 : yBot - (v - min) * (yBot - yTop) / (max - min);
 const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ');
 const dots = rows.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="${i === rows.length - 1 ? 6 : 4}" class="${r.is_market_sourced ? 'mh-dot-market' : 'mh-dot'}"><title>${ST.monthLabel(r.target_month)}: ${ST.formatMoney(vals[i])}${r.is_market_sourced ? ' (precio de mercado real)' : ' (proyectado por IPC)'}</title></circle>`).join('');
 const variacion = vals[0] > 0 ? Math.round((vals[vals.length - 1] / vals[0] - 1) * 100) : null;
 if (summary) summary.textContent = `Últimos ${rows.length} meses${variacion === null ? '' : ` · ${variacion > 0 ? '+' : ''}${variacion} %`}`;
 box.innerHTML = `
 <svg role="img" aria-label="Precio de referencia de los últimos ${rows.length} meses, de ${ST.formatMoney(vals[0])} a ${ST.formatMoney(vals[vals.length - 1])}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="mh-svg">
 <line x1="0" y1="${yBot + 10}" x2="${W}" y2="${yBot + 10}" class="mh-axis"></line>
 <line x1="0" y1="${yTop - 6}" x2="${W}" y2="${yTop - 6}" class="mh-grid"></line>
 <polyline points="${pts}" class="mh-line"></polyline>
 ${dots}
 </svg>
 <div class="mh-labels"><span>${ST.monthLabel(rows[0].target_month)} · ${ST.formatMoney(vals[0])}</span><span>${ST.monthLabel(rows[rows.length - 1].target_month)} · ${ST.formatMoney(vals[vals.length - 1])}</span></div>
 <p class="material-muted mh-legend"><span class="mh-legend-item"><span class="mh-key mh-key-market"></span>precio de mercado real</span><span class="mh-legend-item"><span class="mh-key"></span>proyectado por IPC</span></p>
 `;
 }

 async function loadMaterialOffers(item) {
 const box = document.getElementById('material-offers');
 if (!box) return;
 const offers = await Apu.fetchOffersForMaterial(item.id);
 if (materialPageState.id !== item.id) return;
 materialPageState.offers = offers;
 if (!offers.length) {
 box.innerHTML = `
 <div class="material-offers-empty">
 <p>Todavía ningún corralón cargó su precio para este material.</p>
 <p class="material-muted">¿Tenés un corralón o vendés materiales? Cargá tus precios gratis y aparecé acá.</p>
 <button type="button" class="btn-action-drawer" onclick="window.nexoBraApp.startProviderSignup()">Sumá tu negocio</button>
 </div>`;
 return;
 }
 box.innerHTML = offers.map((o, idx) => {
 const nombre = o.provider_business_name || o.provider_branch_name || 'Corralón';
 const sucursal = o.provider_branch_name && o.provider_branch_name !== nombre ? o.provider_branch_name : '';
 const detalle = [sucursal, o.locality].filter(Boolean).map(ST.escapeHtml).join(' · ');
 const nombreHtml = o.branch_slug
 ? `<a href="/proveedor/${encodeURIComponent(o.branch_slug)}" onclick='event.preventDefault(); window.nexoBraApp.goToProviderPublicPage(${ST.escAttr(o.branch_slug)})'>${ST.escapeHtml(nombre)}</a>`
 : `<span>${ST.escapeHtml(nombre)}</span>`;
 return `
 <div class="material-offer">
 <div class="material-offer-top">
 <strong class="material-offer-name">${nombreHtml}</strong>
 <span class="material-offer-price">${ST.formatMoney(o.amount)}<small> / ${ST.escapeHtml(o.unit || '')}</small></span>
 </div>
 <div class="material-offer-detail">${detalle}${detalle ? ' · ' : ''}${ST.offerAgeTag(o.reported_at)}</div>
 <div class="material-offer-actions">
 <button type="button" class="btn-action-drawer" onclick="window.nexoBraApp.addMaterialPageToBudget(${idx})">Agregar con este precio</button>
 ${o.provider_whatsapp ? `<button type="button" class="whatsapp-mini-btn material-offer-wa" onclick="window.nexoBraApp.whatsappMaterialOffer(${idx})">WhatsApp</button>` : ''}
 </div>
 </div>`;
 }).join('');
 }

 export function changeMaterialPageQty(delta) {
 const input = document.getElementById('material-page-qty');
 if (!input) return;
 input.value = Math.max(1, (ST.parseLocaleNumber(input.value) || 1) + delta);
 }

 export function addMaterialPageToBudget(offerIdx = null) {
 const item = NEXOBRA_DATA.find(m => m.id === materialPageState.id);
 if (!item) return;
 const input = document.getElementById('material-page-qty');
 const qty = input ? Math.max(1, ST.parseLocaleNumber(input.value) || 1) : 1;
 const offer = offerIdx === null ? null : materialPageState.offers[offerIdx];
 try {
 Apu.addCatalogMaterialToBudget(item.id, qty, 'venta', offer || null);
 } catch (err) {
 ST.showToast(err.message);
 return;
 }
 ST.logEvent('apu_task_added', offer ? 'material desde la ficha, con precio de proveedor' : 'material desde la ficha');
 if (ST.headerCartCount) ST.headerCartCount.textContent = ST.state.apuBudgetItems.length;
 const quien = offer ? ` con el precio de ${offer.provider_business_name || offer.provider_branch_name}` : '';
 ST.showToast(`+${ST.formatQty(qty)} ${item.unidadVenta || ''} de ${item.denominacion.substring(0, 32)}${quien}, en tu presupuesto.`, { actionLabel: 'Ver mi presupuesto', onAction: () => Main.openApuStep('presupuesto') });
 }

 export function whatsappMaterialOffer(idx) {
 const o = materialPageState.offers[idx];
 const item = NEXOBRA_DATA.find(m => m.id === materialPageState.id);
 if (!o || !item || !o.provider_whatsapp) return;
 const input = document.getElementById('material-page-qty');
 const qty = input ? Math.max(1, ST.parseLocaleNumber(input.value) || 1) : 1;
 const digits = String(o.provider_whatsapp).replace(/\D/g, '');
 const text = `Hola! Vi en NEXOBRA que tenés ${item.denominacion} a ${ST.formatMoney(o.amount)}/${o.unit || ''}. Necesitaría ${ST.formatQty(qty)} ${item.unidadVenta || ''}. ¿Lo tenés disponible?`;
 ST.logProviderInteraction(o.branch_id, o.provider_id, 'whatsapp_click', item.id, item.denominacion, null);
 window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
 }
