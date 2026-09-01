// NEXOBRA - catalog.js

import * as Computo from './computo.js';
import * as Main from './main.js';
import * as MapModule from './map.js';
import * as Pricing from './pricing.js';
import * as ST from './state.js';

  export const RUBROS_METADATA = {
    "Básicos": {
      icon: "🧱",
      desc: "Cementos, cales, áridos (arena, piedra, binder), hormigón elaborado y aditivos químicos Sika."
    },
    "Acero de refuerzo": {
      icon: "⛓️",
      desc: "Barras lisas AL220, barras torsionadas/aletadas ADN420 del 6 al 25 y mallas electrosoldadas."
    },
    "Construcción en Seco": {
      icon: "🔲",
      desc: "Placas de yeso Durlock (estándar, RH verde, ignífugas), perfiles montantes, soleras y masillas."
    },
    "Cerramientos Verticales": {
      icon: "🏗️",
      desc: "Ladrillos huecos cerámicos, ladrillos comunes macizos, sistema Retak (HCCA) y bloques U."
    },
    "Cubiertas y Aislaciones": {
      icon: "🏠",
      desc: "Chapas Cincalum acanaladas/trapezoidales, membranas asfálticas, lana de vidrio y tejas."
    },
    "Instalaciones": {
      icon: "🚿",
      desc: "Sanitarios Ferrum, griferías FV, cañerías PVC cloacales, Hidro3 agua, gas termofusión y electricidad."
    },
    "Revestimientos": {
      icon: "🎨",
      desc: "Pisos cerámicos, adhesivos Klaukol, porcelanatos, pisos flotantes, mármoles, granitos y pinturas látex."
    },
    "Aberturas": {
      icon: "🚪",
      desc: "Puertas inyectadas, aluminio, madera/mdf, ventanas corredizas, cortinas roller y cerraduras."
    },
    "Maderas": {
      icon: "🪵",
      desc: "Tablas de encofrado, tirantes de pino, fenólicos de 18mm con film y placas de melamina/MDF."
    },
    "Prefabricados": {
      icon: "📐",
      desc: "Viguetas pretensadas tensolite, casetones de telgopor EPS y losas huecas de hormigón."
    },
    "Metálicos": {
      icon: "🔩",
      desc: "Perfiles C, caños estructurales cuadrados/redondos, perfiles UPN/IPN, planchuelas y metal desplegado."
    },
    "Herramientas y Equipos": {
      icon: "🛠️",
      desc: "Hormigoneras, carretillas Sorrento, andamios, amoladoras DeWalt, soldadoras y herramientas Biassoni."
    },
    "Alquiler": {
      icon: "🚜",
      desc: "Alquiler de contenedores, retroexcavadoras, mini cargadoras Bobcat, baños químicos y camionetas."
    },
    "Seguridad e Higiene": {
      icon: "🦺",
      desc: "Cascos Libus, arneses anticaída, botines Pampero/Ombú con puntera de acero, guantes y conos viales."
    },
    "Cubierta": {
      icon: "📐",
      desc: "Zinguería de chapa galvanizada N°25, canaletas, cenefas, cumbreras, babetas y embudos."
    },
    "Ferretería": {
      icon: "🪛",
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
      const valor = role.values[ST.state.priceMonth];
      const disponible = valor !== undefined;
      const texto = disponible ? `$${Math.round(valor).toLocaleString('es-AR')}` : 'Sin dato para este mes';
      const unidadLabel = role.unit === 'mes' ? 'por mes' : 'por hora';
      const inputId = `labor-qty-${role.code}`;
      return `
        <article class="product-card">
          <h3 class="product-title">${role.name}</h3>
          <div class="product-category-tree">UOCRA Zona A · sin cargas sociales</div>
          <p style="font-weight:600; font-size:22px; margin:12px 0 0;">${texto}</p>
          <p style="font-size:12px; color:var(--text-muted); margin:2px 0 12px;">${unidadLabel}</p>
          ${disponible ? `
          <div class="card-actions">
            <div class="qty-control">
              <button class="qty-btn" onclick="window.nexoBraApp.changeLaborQty('${role.code}', -1)" title="Reducir cantidad">-</button>
              <input type="number" id="${inputId}" class="qty-input" value="1" min="0.5" step="0.5">
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

  export function updateCatalogHeader() {
    if (ST.state.activeRubro === 'Todos') {
      ST.catalogCurrentRubro.textContent = 'Catálogo General';
      ST.catalogHeaderTitle.textContent = 'Todos los Materiales de Obra';
      ST.catalogHeaderSubtitle.textContent = '';
    } else {
      const meta = RUBROS_METADATA[ST.state.activeRubro] || { icon: "📦", desc: "" };
      ST.catalogCurrentRubro.textContent = ST.state.activeRubro;
      ST.catalogHeaderTitle.textContent = `${meta.icon} ${ST.state.activeRubro}`;
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
        icon: "📦",
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
  export function renderRubroPills() {
    const rubros = ['Todos', ...new Set(NEXOBRA_DATA.map(i => i.rubro))];
    ST.rubrosFilterContainer.innerHTML = '';

    rubros.forEach(rubro => {
      const count = rubro === 'Todos' 
        ? NEXOBRA_DATA.length 
        : NEXOBRA_DATA.filter(i => i.rubro === rubro).length;

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
    const tokens = ST.normalizeText(ST.state.searchQuery).split(' ').filter(Boolean);

    let items = NEXOBRA_DATA.filter(item => {
      if (ST.state.activeRubro !== 'Todos' && item.rubro !== ST.state.activeRubro) {
        return false;
      }

      if (tokens.length > 0) {
        const haystack = ST.normalizeText([
          item.denominacion,
          item.id,
          item.categoria,
          item.subcategoria,
          ...(item.tags || [])
        ].filter(Boolean).join(' '));

        return tokens.every(tok => haystack.includes(tok) || haystack.includes(ST.singularize(tok)));
      }

      return true;
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

  // --- RENDER PRODUCTS (GRID & TABLE) ---
  export function renderProducts() {
    const filtered = getFilteredItems();

    ST.visibleCount.textContent = filtered.length;
    ST.activeFilterLabel.textContent = ST.state.activeRubro !== 'Todos' ? ` en ${ST.state.activeRubro}` : '';

    if (filtered.length === 0) {
      ST.productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-light);">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">🔍</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">No se encontraron materiales</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 1.5rem;">
            Probá buscando por términos coloquiales como "durlock", "cemento", "hierro", "vigueta" o "sika".
          </p>
          <button class="btn-computo" onclick="window.nexoBraApp.clearCatalogSearch();" style="margin: 0 auto;">
            Mostrar todos los materiales
          </button>
        </div>
      `;
      ST.productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No hay materiales para mostrar</td></tr>`;
      return;
    }

    // Grid HTML
    ST.productsGrid.innerHTML = filtered.map(item => {
      const isVentaMode = ST.state.pricingMode === 'venta';
      const mainTrace = Pricing.getReferencePrice(item, ST.state.pricingMode);
      const secondaryTrace = Pricing.getReferencePrice(item, isVentaMode ? 'computo' : 'venta');

      const oferta = ST.state.compareNearbyProviders ? ST.providerPricesState.byMaterial[item.id] : null;
      const mainPrice = mainTrace.currentPrice;
      const mainUnit = mainTrace.unit;

      let priceBoxExtra;
      if (oferta) {
        // Comparación: nunca reemplaza el precio de referencia, solo dice cuánto se alejan los proveedores cercanos de ESE precio.
        const pctMin = Math.round(((oferta.min_price - mainPrice) / mainPrice) * 100);
        const pctMax = Math.round(((oferta.max_price - mainPrice) / mainPrice) * 100);
        const fmtPct = (p) => `${p > 0 ? '+' : ''}${p}%`;
        priceBoxExtra = `
          <div class="price-secondary-row" style="color: #15803d;">
            <span>🏪 ${oferta.offers_count} proveedor${oferta.offers_count === 1 ? '' : 'es'} cerca</span>
            <strong>${fmtPct(pctMin)} a ${fmtPct(pctMax)} vs. referencia</strong>
          </div>
        `;
      } else if (ST.state.compareNearbyProviders) {
        priceBoxExtra = `
          <div class="price-secondary-row" style="color: var(--text-subtle);">
            <span>Sin proveedores cercanos cargados para este material</span>
          </div>
        `;
      } else {
        const secPrice = secondaryTrace.currentPrice;
        const secUnit = secondaryTrace.unit;
        const secLabel = isVentaMode ? 'Cómputo métrico' : 'Venta x bulto';
        priceBoxExtra = `
          <div class="price-secondary-row">
            <span>${secLabel}:</span>
            <strong>${ST.formatMoney(secPrice)} / ${secUnit}</strong>
          </div>
        `;
      }

      const tagsHtml = item.tags.slice(0, 4).map(t => 
        `<span class="card-tag-item" data-tag="${t}">#${t}</span>`
      ).join('');

      return `
        <article class="product-card" id="card-${item.id}">
          <div>
            <div class="card-top">
              <span class="card-code">${item.id}</span>
              <span class="card-rubro-badge">${item.rubro}</span>
            </div>
            <h3 class="product-title">${item.denominacion}</h3>
            <div class="product-category-tree">${item.categoria} &rsaquo; ${item.subcategoria}</div>
          </div>

          <div>
            <div class="card-price-box">
              ${isNaN(mainPrice) ? `
                <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-muted); padding: 4px 0;">
                  Sin referencia NEXOBRA todavía
                </div>
                <div class="price-secondary-row" style="color: var(--text-subtle);">
                  <span>Material nuevo, sin precio base cargado — mirá si algún proveedor lo tiene</span>
                </div>
              ` : `
                <div class="price-main-row">
                  <span class="price-main-val">${ST.formatMoney(mainPrice)}</span>
                  <span class="price-unit-tag">/ ${mainUnit}</span>
                </div>
                ${priceBoxExtra}
                ${mainTrace.isMarketSourced
                  ? '<div class="price-source-tag market">📊 Precio de mercado real</div>'
                  : '<div class="price-source-tag ipc">📈 Proyectado por IPC</div>'
                }
              `}
            </div>

            ${''}

            <div class="card-tags">
              ${tagsHtml}
            </div>

            ${oferta ? `
              <div style="display:flex; gap:6px; align-items:stretch;">
                <button class="btn-choose-provider" style="margin-top:0; flex:1;" onclick="window.nexoBraApp.openOfferPicker('${item.id}')">
                  🏪 Ver ${oferta.offers_count} oferta${oferta.offers_count === 1 ? '' : 's'} y elegir proveedor
                </button>
                <button class="btn-alert-toggle ${ST.alertsState.byMaterial[item.id] ? 'active' : ''}" title="${ST.alertsState.byMaterial[item.id] ? 'Ya tenés una alerta armada — tocá para sacarla' : 'Avisame si baja de precio'}" onclick='window.nexoBraApp.toggleMaterialAlert(${ST.escAttr(item.id)}, ${ST.escAttr(item.denominacion)})'>
                  🔔
                </button>
              </div>
            ` : ''}

            <div class="card-actions">
              <div class="qty-control">
                <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', -1)" title="Reducir cantidad">-</button>
                <input type="number" id="qty-${item.id}" class="qty-input" value="1" min="1" max="999">
                <button class="qty-btn" onclick="window.nexoBraApp.changeCardQty('${item.id}', 1)" title="Aumentar cantidad">+</button>
              </div>
              <button class="btn-add-computo" id="btn-add-${item.id}" onclick="window.nexoBraApp.addToComputo('${item.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Sumar</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Table HTML
    ST.productsTableBody.innerHTML = filtered.map(item => {
      const ventaTrace = Pricing.getReferencePrice(item, 'venta');
      const computoTrace = Pricing.getReferencePrice(item, 'computo');
      return `
        <tr>
          <td><span class="card-code">${item.id}</span></td>
          <td>
            <strong>${item.denominacion}</strong>
            <div style="font-size: 0.76rem; color: var(--text-subtle);">${item.subcategoria}</div>
          </td>
          <td>
            <span class="card-rubro-badge">${item.rubro}</span>
          </td>
          <td>
            <strong>${ST.formatMoney(ventaTrace.currentPrice)}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${ventaTrace.unit}</span>
            <div class="table-price-trace">Base ${ST.formatMoney(ventaTrace.basePrice)} · × ${ST.formatFactor(ventaTrace.factor)}</div>
          </td>
          <td>
            <span style="color: #2563EB; font-weight: 700;">${ST.formatMoney(computoTrace.currentPrice)}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${computoTrace.unit}</span>
            <div class="table-price-trace">Base ${ST.formatMoney(computoTrace.basePrice)} · × ${ST.formatFactor(computoTrace.factor)}</div>
          </td>
          <td style="text-align: right;">
            <button class="btn-add-computo" style="padding: 6px 12px; font-size: 0.78rem; display: inline-flex;" onclick="window.nexoBraApp.addToComputo('${item.id}')">
              + Cómputo
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
  }

  export function clearCatalogSearch() {
    ST.catalogSearchInput.value = '';
    ST.state.searchQuery = '';
    ST.state.activeRubro = 'Todos';
    renderRubroPills();
    renderProducts();
  }

  // --- CÓMPUTO CART MANAGEMENT ---
