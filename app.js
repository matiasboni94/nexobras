/**
 * NEXOBRA - Comparador Técnico de Precios para la Construcción
 * Lógica Frontend Interactiva: Home, Subáreas, Catálogo Dinámico y Procesador Excel
 */

(function() {
  'use strict';

  // Metadata descriptiva e íconos para cada Subárea de la Construcción
  const RUBROS_METADATA = {
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
  const state = {
    currentView: 'home', // 'home' | 'catalog'
    pricingMode: 'venta', // 'venta' | 'computo'
    activeRubro: 'Todos',
    searchQuery: '',
    sortBy: 'relevance',
    viewMode: 'grid', // 'grid' | 'table'
    computoCart: JSON.parse(localStorage.getItem('nexobra_computo') || '[]'),
    excelProcessedRows: [],
    priceMonth: null, // "YYYY-MM-01", mes elegido por el usuario para EXPLORAR precios en el catálogo
    computoMonth: null, // "YYYY-MM-01", mes al que se recalcula TODO "Mi Cómputo" (independiente del anterior)
    pricingSource: 'reference' // 'reference' (IPC) | 'providers' (ofertas reales cercanas)
  };

  // Serie de índices IPC cargada desde public.index_values (tabla real, no valores fijos).
  // Se completa en loadIndexSeries(); mientras no haya datos, se usa el factor estático
  // heredado (precioVenta / precioBase) como respaldo para no romper el catálogo.
  const indexState = {
    seriesCode: 'ipc_materials_reference',
    values: {},   // { "2025-04-01": 8402.26, ... }
    months: [],   // ["2016-12-01", ..., "2026-02-01"] ordenado
    loaded: false
  };

  const REFERENCE_PRICE_INFO = {
    period: 'sin datos de índice cargados',
    updatedAt: '',
    source: 'Carga manual NEXOBRA',
    materialMethod: 'Precio base actualizado con la serie de IPC (INDEC) mes a mes'
  };

  function monthLabel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }

  const NOMBRE_MES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  function parsePeriodo(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return { year: d.getFullYear(), monthIdx: d.getMonth() };
  }

  /**
   * Arma un par de <select> (año / mes) a partir de una lista de fechas "YYYY-MM-01",
   * mostrando solo los meses que realmente tienen datos cargados. Reutilizable para
   * el catálogo de materiales y para mano de obra.
   */
  function wireYearMonthPicker(yearSelectEl, monthSelectEl, months, currentValue, onChange) {
    if (!yearSelectEl || !monthSelectEl || !months || months.length === 0) return;
    const parsed = months.map(m => ({ value: m, ...parsePeriodo(m) }));
    const years = [...new Set(parsed.map(p => p.year))].sort((a, b) => b - a);

    function monthsForYear(year) {
      return parsed.filter(p => p.year === year).sort((a, b) => b.monthIdx - a.monthIdx);
    }

    function renderMonths(year, preferredValue) {
      const opts = monthsForYear(year);
      monthSelectEl.innerHTML = opts.map(o => `<option value="${o.value}">${NOMBRE_MES[o.monthIdx]}</option>`).join('');
      const match = opts.find(o => o.value === preferredValue);
      monthSelectEl.value = match ? match.value : (opts[0] ? opts[0].value : '');
    }

    yearSelectEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    const initial = parsed.find(p => p.value === currentValue) || parsed[parsed.length - 1];
    yearSelectEl.value = initial.year;
    renderMonths(initial.year, currentValue);

    yearSelectEl.onchange = () => {
      renderMonths(parseInt(yearSelectEl.value, 10), null);
      onChange(monthSelectEl.value);
    };
    monthSelectEl.onchange = () => onChange(monthSelectEl.value);
  }

  // Meses en los que HAY dato real tanto de IPC como de los 5 roles de UOCRA.
  // Es el único calendario que se le ofrece al usuario: así el presupuesto final
  // (materiales + mano de obra) siempre queda con una sola fecha de referencia.
  let sharedMonths = [];

  async function loadIndexSeries() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('index_values')
      .select('reference_month, value, index_series!inner(code)')
      .eq('index_series.code', indexState.seriesCode)
      .eq('is_published', true)
      .order('reference_month');

    if (error || !data || data.length === 0) {
      console.warn('No se pudo cargar la serie de IPC desde Supabase. Se usa el factor estático de respaldo.', error?.message);
      return;
    }

    indexState.values = {};
    data.forEach(row => { indexState.values[row.reference_month] = Number(row.value); });
    indexState.months = data.map(row => row.reference_month);
    indexState.loaded = true;
  }

  function populateMonthSelect() {
    wireYearMonthPicker(
      document.getElementById('price-year-select'),
      document.getElementById('price-month-select'),
      sharedMonths,
      state.priceMonth,
      (value) => setPriceMonth(value)
    );
  }

  // --- MANO DE OBRA (UOCRA Zona A) ---
  // Cada rol es una index_series con applies_to = 'labor'. El valor ya está en
  // pesos (no es un índice base-100 como el IPC), así que no hace falta calcular
  // factor: el jornal del mes elegido se busca directo en la serie.
  const laborState = { roles: [], months: [], loaded: false };

  async function loadLaborSeries() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from('index_values')
      .select('reference_month, value, index_series!inner(code, name, unit, applies_to)')
      .eq('index_series.applies_to', 'labor')
      .eq('is_published', true)
      .order('reference_month');

    if (error || !data || data.length === 0) {
      console.warn('No se pudo cargar la serie de mano de obra (UOCRA).', error?.message);
      return;
    }

    const porRol = {};
    data.forEach(row => {
      const code = row.index_series.code;
      if (!porRol[code]) {
        porRol[code] = { code, name: row.index_series.name, unit: row.index_series.unit, values: {} };
      }
      porRol[code].values[row.reference_month] = Number(row.value);
    });
    laborState.roles = Object.values(porRol);
    // Solo cuentan los meses en los que TODOS los roles tienen dato (no solo alguno).
    const mesesConTodosLosRoles = [...new Set(data.map(r => r.reference_month))]
      .filter(m => laborState.roles.every(r => r.values[m] !== undefined))
      .sort();
    laborState.months = mesesConTodosLosRoles;
    laborState.loaded = true;
  }

  /**
   * Se llama una vez que IPC y UOCRA terminaron de cargar. Calcula la intersección
   * de meses disponibles en ambas series y fija ahí el único período del presupuesto,
   * para que materiales y mano de obra nunca queden con fechas distintas.
   */
  function reconcilePriceMonth() {
    if (!indexState.loaded && !laborState.loaded) return;

    if (indexState.loaded && laborState.loaded) {
      const interseccion = indexState.months.filter(m => laborState.months.includes(m));
      sharedMonths = interseccion.length > 0 ? interseccion : indexState.months;
      if (interseccion.length === 0) {
        console.warn('IPC y UOCRA no tienen ningún mes en común todavía; se usa solo la serie de IPC hasta que se actualice UOCRA (o viceversa).');
      }
    } else {
      // Todavía falta que termine de cargar una de las dos series; usamos la que ya está.
      sharedMonths = indexState.loaded ? indexState.months : laborState.months;
    }

    setPriceMonth(sharedMonths[sharedMonths.length - 1], { silent: true });
    if (!state.computoMonth) {
      // Solo la primera vez: "Mi Cómputo" arranca siempre en el mes más actual disponible.
      state.computoMonth = sharedMonths[sharedMonths.length - 1];
    }
    populateMonthSelect();
    populateLaborMonthSelect();
    populateComputoMonthSelect();
    renderIpcChart();
    updateReferenceStatus();
    renderProducts();
    renderLabor();
    updateCartUI();
  }

  function populateComputoMonthSelect() {
    wireYearMonthPicker(
      document.getElementById('computo-year-select'),
      document.getElementById('computo-month-select'),
      sharedMonths,
      state.computoMonth,
      (value) => {
        state.computoMonth = value;
        updateCartUI();
      }
    );
  }

  function setPriceMonth(value, { silent = false } = {}) {
    state.priceMonth = value;
    REFERENCE_PRICE_INFO.period = monthLabel(state.priceMonth);
    REFERENCE_PRICE_INFO.updatedAt = new Date(`${state.priceMonth}T00:00:00`).toLocaleDateString('es-AR');
    REFERENCE_PRICE_INFO.source = 'INDEC (IPC) y UOCRA · único período para todo el presupuesto';
    if (silent) return;
    populateMonthSelect();
    populateLaborMonthSelect();
    updateReferenceStatus();
    renderProducts();
    renderLabor();
    renderIpcChart();
  }

  function populateLaborMonthSelect() {
    wireYearMonthPicker(
      document.getElementById('labor-year-select'),
      document.getElementById('labor-month-select'),
      sharedMonths,
      state.priceMonth,
      (value) => setPriceMonth(value)
    );
  }

  function renderLabor() {
    const grid = document.getElementById('labor-grid');
    if (!grid) return;
    if (!laborState.loaded) {
      grid.innerHTML = '<p style="color:var(--text-muted);">Cargando jornales...</p>';
      return;
    }
    grid.innerHTML = laborState.roles.map(role => {
      const valor = role.values[state.priceMonth];
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

  function changeLaborQty(code, delta) {
    const input = document.getElementById(`labor-qty-${code}`);
    if (input) {
      let val = parseFloat(input.value) || 1;
      val = Math.max(0.5, val + delta);
      input.value = val;
    }
  }

  function addLaborToComputo(code) {
    const role = laborState.roles.find(r => r.code === code);
    if (!role) return;

    const qtyInput = document.getElementById(`labor-qty-${code}`);
    const qty = qtyInput ? Math.max(0.5, parseFloat(qtyInput.value) || 1) : 1;
    const unit = role.unit === 'mes' ? 'mes' : 'hora';

    const existingIndex = state.computoCart.findIndex(i => i.id === code && i.type === 'labor');
    if (existingIndex > -1) {
      state.computoCart[existingIndex].qty += qty;
    } else {
      // Igual que con materiales: no se congela precio acá, se resuelve en vivo
      // contra state.computoMonth al mostrar/exportar el cómputo.
      state.computoCart.push({
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
    showToast(`+${qty} ${unit} agregado: ${role.name}`);
  }

  let ipcChartInstance = null;

  function renderIpcChart() {
    const canvas = document.getElementById('ipc-evolution-chart');
    if (!canvas || typeof Chart === 'undefined' || indexState.months.length === 0) return;

    const labels = indexState.months.map(monthLabel);
    const data = indexState.months.map(m => indexState.values[m]);
    const selectedIdx = indexState.months.indexOf(state.priceMonth);

    if (ipcChartInstance) {
      ipcChartInstance.data.labels = labels;
      ipcChartInstance.data.datasets[0].data = data;
      ipcChartInstance.data.datasets[0].pointBackgroundColor = indexState.months.map((_, i) =>
        i === selectedIdx ? '#d97757' : 'rgba(217,119,87,0.25)');
      ipcChartInstance.data.datasets[0].pointRadius = indexState.months.map((_, i) => i === selectedIdx ? 6 : 0);
      ipcChartInstance.resize(); // el canvas pudo haber estado oculto (display:none) cuando se creó
      ipcChartInstance.update();
      return;
    }

    ipcChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Índice IPC (dic-16 = 100)',
          data,
          borderColor: '#d97757',
          backgroundColor: 'rgba(217,119,87,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.15,
          pointRadius: indexState.months.map((_, i) => i === selectedIdx ? 6 : 0),
          pointBackgroundColor: indexState.months.map((_, i) => i === selectedIdx ? '#d97757' : 'rgba(217,119,87,0.25)')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { ticks: { callback: v => v.toLocaleString('es-AR') } }
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const month = indexState.months[idx];
          state.priceMonth = month;
          const select = document.getElementById('price-month-select');
          if (select) select.value = month;
          REFERENCE_PRICE_INFO.period = monthLabel(month);
          REFERENCE_PRICE_INFO.updatedAt = new Date(`${month}T00:00:00`).toLocaleDateString('es-AR');
          updateReferenceStatus();
          renderProducts();
          renderIpcChart();
        }
      }
    });
  }

  const supabaseSettings = window.NEXOBRA_SUPABASE;
  const hasSupabaseSettings = Boolean(
    supabaseSettings &&
    supabaseSettings.url &&
    supabaseSettings.publishableKey &&
    !supabaseSettings.url.includes('PEGAR_AQUI') &&
    !supabaseSettings.publishableKey.includes('PEGAR_AQUI') &&
    window.supabase
  );
  const supabaseClient = hasSupabaseSettings
    ? window.supabase.createClient(supabaseSettings.url, supabaseSettings.publishableKey)
    : null;

  // --- AUTENTICACIÓN (Fase A) ---
  const authState = { user: null, profile: null };

  const btnOpenAuthModal = document.getElementById('btn-open-auth-modal');
  const authModal = document.getElementById('auth-modal');
  const authModalBackdrop = document.getElementById('auth-modal-backdrop');
  const authModalCloseBtn = document.getElementById('auth-modal-close-btn');
  const authTabLogin = document.getElementById('auth-tab-login');
  const authTabRegister = document.getElementById('auth-tab-register');
  const authFormLogin = document.getElementById('auth-form-login');
  const authFormRegister = document.getElementById('auth-form-register');
  const authErrorMsg = document.getElementById('auth-error-msg');
  const authInfoMsg = document.getElementById('auth-info-msg');
  const btnForgotPassword = document.getElementById('btn-forgot-password');
  const btnGoogleAuth = document.getElementById('btn-google-auth');
  const authHeaderLabel = document.getElementById('auth-header-label');
  const authDropdown = document.getElementById('auth-dropdown');
  const btnLogout = document.getElementById('btn-logout');

  function openAuthModal() {
    hideAuthMessages();
    authModal.classList.add('open');
    authModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeAuthModal() {
    authModal.classList.remove('open');
    authModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function showAuthTab(tab) {
    hideAuthMessages();
    const isLogin = tab === 'login';
    authTabLogin.classList.toggle('active', isLogin);
    authTabRegister.classList.toggle('active', !isLogin);
    authFormLogin.style.display = isLogin ? 'flex' : 'none';
    authFormRegister.style.display = isLogin ? 'none' : 'flex';
  }

  function showAuthError(message) {
    authInfoMsg.style.display = 'none';
    authErrorMsg.textContent = message;
    authErrorMsg.style.display = 'block';
  }

  function showAuthInfo(message) {
    authErrorMsg.style.display = 'none';
    authInfoMsg.textContent = message;
    authInfoMsg.style.display = 'block';
  }

  function hideAuthMessages() {
    authErrorMsg.style.display = 'none';
    authInfoMsg.style.display = 'none';
  }

  /** Traduce los mensajes de error más comunes de Supabase Auth al español. */
  function translateAuthError(message) {
    const map = {
      'Invalid login credentials': 'Email o contraseña incorrectos.',
      'User already registered': 'Ya existe una cuenta con ese email. Probá ingresar en vez de registrarte.',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      'Email not confirmed': 'Todavía no confirmaste tu email. Revisá tu casilla de correo.'
    };
    return map[message] || message;
  }

  async function refreshAuthUI() {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    authState.user = session?.user || null;
    authState.profile = null;

    if (authState.user) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('full_name, role, phone, locality, matricula, rubro_habitual, role_confirmed')
        .eq('id', authState.user.id)
        .single();
      authState.profile = profile || null;

      const nombre = (profile?.full_name || '').trim() || authState.user.email;
      authHeaderLabel.textContent = nombre.length > 18 ? nombre.slice(0, 16) + '…' : nombre;

      updateProviderNavVisibility();

      if (profile && profile.role_confirmed === false) {
        openRoleModal();
      }
    } else {
      authHeaderLabel.textContent = 'Ingresar';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    hideAuthMessages();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-submit-login');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Ingresar';

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }
    await refreshAuthUI();
    closeAuthModal();
    showToast('¡Bienvenido de nuevo!');
  }

  async function handleRegister(e) {
    e.preventDefault();
    hideAuthMessages();
    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const role = document.querySelector('input[name="register-role"]:checked').value;
    const btn = document.getElementById('btn-submit-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } }
    });

    btn.disabled = false;
    btn.textContent = 'Crear cuenta';

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }

    if (data.session) {
      // Confirmación de email desactivada en el proyecto: queda logueado directo.
      await refreshAuthUI();
      closeAuthModal();
      showToast('¡Cuenta creada! Ya estás dentro.');
    } else {
      // Confirmación de email activada: falta que confirme desde el correo.
      showAuthInfo('¡Listo! Te mandamos un email para confirmar tu cuenta. Una vez confirmado, ya podés ingresar.');
      authFormRegister.reset();
    }
  }

  async function handleForgotPassword() {
    hideAuthMessages();
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showAuthError('Escribí tu email arriba primero y volvé a tocar "Olvidé mi contraseña".');
      return;
    }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }
    showAuthInfo('Te mandamos un email con instrucciones para reestablecer tu contraseña.');
  }

  async function handleGoogleAuth() {
    hideAuthMessages();
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    if (error) {
      showAuthError('El login con Google no está disponible todavía. Probá con email y contraseña.');
    }
  }

  async function handleLogout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    authState.user = null;
    authState.profile = null;
    authDropdown.style.display = 'none';
    computationState.currentId = null;
    updateComputationNameUI();
    await refreshAuthUI();
    showToast('Cerraste sesión.');
  }

  function setupAuthListeners() {
    if (!supabaseClient) {
      if (btnOpenAuthModal) btnOpenAuthModal.style.display = 'none';
      return;
    }

    btnOpenAuthModal.addEventListener('click', () => {
      if (authState.user) {
        authDropdown.style.display = authDropdown.style.display === 'none' ? 'block' : 'none';
      } else {
        showAuthTab('login');
        openAuthModal();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.auth-header-wrapper')) authDropdown.style.display = 'none';
    });

    authModalCloseBtn.addEventListener('click', closeAuthModal);
    authModalBackdrop.addEventListener('click', closeAuthModal);
    authTabLogin.addEventListener('click', () => showAuthTab('login'));
    authTabRegister.addEventListener('click', () => showAuthTab('register'));
    authFormLogin.addEventListener('submit', handleLogin);
    authFormRegister.addEventListener('submit', handleRegister);
    btnForgotPassword.addEventListener('click', handleForgotPassword);
    btnGoogleAuth.addEventListener('click', handleGoogleAuth);
    btnLogout.addEventListener('click', handleLogout);

    supabaseClient.auth.onAuthStateChange(() => { refreshAuthUI(); });
    refreshAuthUI();
  }

  // --- PERFIL (Fase B) ---
  const profileModal = document.getElementById('profile-modal');
  const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
  const profileModalCloseBtn = document.getElementById('profile-modal-close-btn');
  const profileForm = document.getElementById('profile-form');
  const profileErrorMsg = document.getElementById('profile-error-msg');
  const profileInfoMsg = document.getElementById('profile-info-msg');
  const btnOpenProfile = document.getElementById('btn-open-profile');

  function openProfileModal() {
    if (!authState.user) return;
    profileErrorMsg.style.display = 'none';
    profileInfoMsg.style.display = 'none';
    document.getElementById('profile-full-name').value = authState.profile?.full_name || '';
    document.getElementById('profile-email').value = authState.user.email || '';
    document.getElementById('profile-phone').value = authState.profile?.phone || '';
    document.getElementById('profile-locality').value = authState.profile?.locality || '';
    document.getElementById('profile-matricula').value = authState.profile?.matricula || '';
    document.getElementById('profile-rubro').value = authState.profile?.rubro_habitual || '';
    profileModal.classList.add('open');
    profileModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    authDropdown.style.display = 'none';
  }

  function closeProfileModal() {
    profileModal.classList.remove('open');
    profileModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    if (!authState.user) return;
    const btn = document.getElementById('btn-submit-profile');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await supabaseClient
      .from('profiles')
      .update({
        full_name: document.getElementById('profile-full-name').value.trim(),
        phone: document.getElementById('profile-phone').value.trim() || null,
        locality: document.getElementById('profile-locality').value.trim() || null,
        matricula: document.getElementById('profile-matricula').value.trim() || null,
        rubro_habitual: document.getElementById('profile-rubro').value.trim() || null
      })
      .eq('id', authState.user.id);

    btn.disabled = false;
    btn.textContent = 'Guardar cambios';

    if (error) {
      profileErrorMsg.textContent = 'No se pudo guardar: ' + error.message;
      profileErrorMsg.style.display = 'block';
      return;
    }

    await refreshAuthUI();
    profileInfoMsg.textContent = 'Perfil actualizado.';
    profileInfoMsg.style.display = 'block';
    showToast('Perfil actualizado.');
  }

  function setupProfileListeners() {
    if (!supabaseClient) return;
    btnOpenProfile.addEventListener('click', openProfileModal);
    profileModalCloseBtn.addEventListener('click', closeProfileModal);
    profileModalBackdrop.addEventListener('click', closeProfileModal);
    profileForm.addEventListener('submit', handleProfileSubmit);
  }

  // --- ELEGIR ROL (solo la primera vez que se entra por Google) ---
  // El registro manual ya pregunta el rol en el propio formulario. Google no
  // permite mandar ese dato antes de redirigir, así que se lo preguntamos acá
  // apenas vuelve con sesión, una única vez (profiles.role_confirmed lo controla).
  const roleModal = document.getElementById('role-modal');
  const roleModalBackdrop = document.getElementById('role-modal-backdrop');
  const roleForm = document.getElementById('role-form');
  const roleErrorMsg = document.getElementById('role-error-msg');

  function openRoleModal() {
    roleErrorMsg.style.display = 'none';
    roleModal.classList.add('open');
    roleModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeRoleModal() {
    roleModal.classList.remove('open');
    roleModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  async function handleRoleSubmit(e) {
    e.preventDefault();
    const role = document.querySelector('input[name="onboarding-role"]:checked').value;
    const btn = document.getElementById('btn-submit-role');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await supabaseClient
      .from('profiles')
      .update({ role, role_confirmed: true })
      .eq('id', authState.user.id);

    btn.disabled = false;
    btn.textContent = 'Continuar';

    if (error) {
      roleErrorMsg.textContent = 'No se pudo guardar: ' + error.message;
      roleErrorMsg.style.display = 'block';
      return;
    }

    await refreshAuthUI();
    closeRoleModal();
    showToast('¡Listo! Ya podés usar NEXOBRA.');
  }

  function setupRoleListeners() {
    if (!supabaseClient) return;
    roleForm.addEventListener('submit', handleRoleSubmit);
    // A propósito NO se cierra clickeando el backdrop: es un paso obligatorio
    // la primera vez, para no dejar perfiles a medio configurar.
  }

  // --- MIS PRESUPUESTOS (Fase B) ---
  // El cómputo sigue viviendo en state.computoCart y localStorage mientras se edita
  // (igual que antes). Lo nuevo es que, si hay sesión iniciada, se puede además
  // guardar/actualizar como una fila en "computations" + "computation_items".
  const computationState = { currentId: null };

  const drawerComputationName = document.getElementById('drawer-computation-name');
  const btnSaveComputation = document.getElementById('btn-save-computation');
  const btnSaveComputationLabel = document.getElementById('btn-save-computation-label');
  const btnOpenMyComputations = document.getElementById('btn-open-my-computations');
  const myComputationsList = document.getElementById('my-computations-list');
  const btnNewComputation = document.getElementById('btn-new-computation');

  function updateComputationNameUI() {
    btnSaveComputationLabel.textContent = computationState.currentId ? 'Actualizar' : 'Guardar';
  }

  /** Convierte un item del carrito (state.computoCart) a una fila de computation_items. */
  function cartItemToRow(item, computationId) {
    const pricing = resolveItemPricing(item, state.computoMonth);
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
      reference_period: state.computoMonth,
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
  function rowToCartItem(row) {
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

  async function saveComputation() {
    if (!authState.user) {
      showAuthTab('login');
      openAuthModal();
      showAuthError('Iniciá sesión para guardar tu presupuesto.');
      return;
    }
    if (state.computoCart.length === 0) {
      showToast('Agregá al menos un ítem antes de guardar.');
      return;
    }

    const name = drawerComputationName.value.trim() || 'Mi cómputo';
    btnSaveComputation.disabled = true;

    try {
      let computationId = computationState.currentId;

      if (computationId) {
        const { error } = await supabaseClient
          .from('computations')
          .update({ name, locality: authState.profile?.locality || null })
          .eq('id', computationId);
        if (error) throw error;

        const { error: deleteError } = await supabaseClient
          .from('computation_items')
          .delete()
          .eq('computation_id', computationId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabaseClient
          .from('computations')
          .insert({ name, user_id: authState.user.id, locality: authState.profile?.locality || null })
          .select('id')
          .single();
        if (error) throw error;
        computationId = data.id;
        computationState.currentId = computationId;
      }

      const rows = state.computoCart.map(item => cartItemToRow(item, computationId));
      const { error: insertError } = await supabaseClient.from('computation_items').insert(rows);
      if (insertError) throw insertError;

      updateComputationNameUI();
      showToast('Presupuesto guardado.');
    } catch (err) {
      showToast('No se pudo guardar: ' + err.message);
    } finally {
      btnSaveComputation.disabled = false;
    }
  }

  function startNewComputation() {
    computationState.currentId = null;
    state.computoCart = [];
    saveCart();
    drawerComputationName.value = 'Mi cómputo';
    updateComputationNameUI();
    updateCartUI();
    showToast('Empezaste un presupuesto nuevo.');
  }

  async function loadMyComputations() {
    if (!authState.user) return;
    myComputationsList.innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';

    const { data, error } = await supabaseClient
      .from('computations')
      .select('id, name, locality, updated_at, computation_items(count)')
      .eq('user_id', authState.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      myComputationsList.innerHTML = `<p style="color:#b91c1c;">No se pudieron cargar tus presupuestos: ${error.message}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      myComputationsList.innerHTML = `
        <div class="computo-empty-state">
          <div class="empty-icon">📋</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no guardaste ningún presupuesto</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Armá un cómputo desde el catálogo y tocá "Guardar" en el panel lateral.</p>
        </div>
      `;
      return;
    }

    myComputationsList.innerHTML = data.map(comp => {
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

  async function openComputation(id) {
    const [{ data: comp, error: compError }, { data: items, error: itemsError }] = await Promise.all([
      supabaseClient.from('computations').select('id, name').eq('id', id).single(),
      supabaseClient.from('computation_items').select('*').eq('computation_id', id)
    ]);

    if (compError || itemsError) {
      showToast('No se pudo abrir el presupuesto.');
      return;
    }

    computationState.currentId = comp.id;
    state.computoCart = (items || []).map(rowToCartItem);
    saveCart();
    drawerComputationName.value = comp.name;
    // Al reabrir, el cómputo vuelve a arrancar en el mes más actual disponible
    // (no en el que se guardó la última vez) — el usuario lo cambia si quiere.
    if (sharedMonths.length > 0) {
      state.computoMonth = sharedMonths[sharedMonths.length - 1];
      populateComputoMonthSelect();
    }
    updateComputationNameUI();
    updateCartUI();
    openDrawer();
    showToast(`Abriste "${comp.name}"`);
  }

  async function duplicateComputation(id) {
    const [{ data: comp, error: compError }, { data: items, error: itemsError }] = await Promise.all([
      supabaseClient.from('computations').select('name, locality').eq('id', id).single(),
      supabaseClient.from('computation_items').select('*').eq('computation_id', id)
    ]);
    if (compError || itemsError) {
      showToast('No se pudo duplicar el presupuesto.');
      return;
    }

    const { data: newComp, error: insertError } = await supabaseClient
      .from('computations')
      .insert({ name: `${comp.name} (copia)`, user_id: authState.user.id, locality: comp.locality })
      .select('id')
      .single();
    if (insertError) {
      showToast('No se pudo duplicar el presupuesto.');
      return;
    }

    if (items && items.length > 0) {
      const rows = items.map(row => ({ ...row, id: undefined, computation_id: newComp.id, created_at: undefined, updated_at: undefined }));
      await supabaseClient.from('computation_items').insert(rows);
    }

    showToast('Presupuesto duplicado.');
    loadMyComputations();
  }

  async function deleteComputation(id) {
    if (!confirm('¿Eliminar este presupuesto? Esta acción no se puede deshacer.')) return;
    const { error } = await supabaseClient.from('computations').delete().eq('id', id);
    if (error) {
      showToast('No se pudo eliminar: ' + error.message);
      return;
    }
    if (computationState.currentId === id) startNewComputation();
    showToast('Presupuesto eliminado.');
    loadMyComputations();
  }

  function setupComputationListeners() {
    if (!supabaseClient) return;
    btnSaveComputation.addEventListener('click', saveComputation);
    btnNewComputation.addEventListener('click', startNewComputation);
    btnOpenMyComputations.addEventListener('click', () => {
      authDropdown.style.display = 'none';
      switchView('my-computations');
    });
  }

  // --- MI CORRALÓN (Fase C) ---
  // Todo lo que ve/gestiona un usuario con role='provider': datos comerciales
  // (providers + su sucursal principal en provider_branches) y su catálogo
  // propio de precios (provider_offers). Reutiliza findBestMaterialMatch, ya
  // construida para el cotizador de Excel, para el matcheo de la carga masiva.
  const providerState = { provider: null, branch: null, offers: [], excelPending: [] };

  const btnOpenMyProvider = document.getElementById('btn-open-my-provider');
  const providerView = document.getElementById('provider-view');
  const providerProfileForm = document.getElementById('provider-profile-form');
  const providerProfileStatus = document.getElementById('provider-profile-status');
  const providerAddSearch = document.getElementById('provider-add-search');
  const providerAddResults = document.getElementById('provider-add-results');
  const providerExcelInput = document.getElementById('provider-excel-input');
  const providerExcelPreview = document.getElementById('provider-excel-preview');
  const btnConfirmProviderExcel = document.getElementById('btn-confirm-provider-excel');
  const providerCatalogList = document.getElementById('provider-catalog-list');
  const providerBulkPercent = document.getElementById('provider-bulk-percent');
  const btnApplyBulkPercent = document.getElementById('btn-apply-bulk-percent');

  function isProvider() {
    return authState.profile?.role === 'provider';
  }

  /** Se llama desde refreshAuthUI(): muestra/oculta el acceso a "Mi Corralón" según el rol. */
  function updateProviderNavVisibility() {
    if (btnOpenMyProvider) btnOpenMyProvider.style.display = isProvider() ? 'block' : 'none';
  }

  async function loadProviderData() {
    if (!supabaseClient || !authState.user) return;

    const { data: provider } = await supabaseClient
      .from('providers')
      .select('*')
      .eq('owner_id', authState.user.id)
      .maybeSingle();

    providerState.provider = provider || null;

    if (provider) {
      document.getElementById('prov-business-name').value = provider.business_name || '';
      document.getElementById('prov-tax-id').value = provider.tax_id || '';
      document.getElementById('prov-website').value = provider.website_url || '';
      document.getElementById('prov-contact-phone').value = provider.contact_phone || '';
      document.getElementById('prov-contact-email').value = provider.contact_email || '';
      document.getElementById('prov-description').value = provider.description || '';

      const { data: branch } = await supabaseClient
        .from('provider_branches')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at')
        .limit(1)
        .maybeSingle();

      providerState.branch = branch || null;

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
  }

  async function handleProviderProfileSubmit(e) {
    e.preventDefault();
    if (!authState.user) return;
    const btn = document.getElementById('btn-save-provider-profile');
    btn.disabled = true;
    providerProfileStatus.textContent = 'Guardando...';

    try {
      const providerPayload = {
        owner_id: authState.user.id,
        business_name: document.getElementById('prov-business-name').value.trim(),
        tax_id: document.getElementById('prov-tax-id').value.trim() || null,
        website_url: document.getElementById('prov-website').value.trim() || null,
        contact_phone: document.getElementById('prov-contact-phone').value.trim() || null,
        contact_email: document.getElementById('prov-contact-email').value.trim() || null,
        description: document.getElementById('prov-description').value.trim() || null,
        active: true
      };

      let provider = providerState.provider;
      if (provider) {
        const { error } = await supabaseClient.from('providers').update(providerPayload).eq('id', provider.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from('providers').insert(providerPayload).select('*').single();
        if (error) throw error;
        provider = data;
        providerState.provider = provider;
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

      let branch = providerState.branch;
      if (branch) {
        const { error } = await supabaseClient.from('provider_branches').update(branchPayload).eq('id', branch.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from('provider_branches').insert(branchPayload).select('*').single();
        if (error) throw error;
        branch = data;
        providerState.branch = branch;
      }

      providerProfileStatus.textContent = '✓ Guardado';
      showToast('Datos comerciales guardados.');
    } catch (err) {
      providerProfileStatus.textContent = '';
      showToast('No se pudo guardar: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // --- Agregar material individual ---
  /** Búsqueda liviana e independiente del catálogo principal, solo para este panel. */
  function searchMaterialsSimple(query, limit = 8) {
    const tokens = normalizeText(query).split(' ').filter(Boolean);
    if (tokens.length === 0) return [];
    return NEXOBRA_DATA.filter(item => {
      const haystack = normalizeText([item.denominacion, item.id, item.categoria, item.rubro, ...(item.tags || [])].join(' '));
      return tokens.every(tok => haystack.includes(tok) || haystack.includes(singularize(tok)));
    }).slice(0, limit);
  }

  function renderProviderAddResults() {
    const query = providerAddSearch.value.trim();
    if (query.length < 2) {
      providerAddResults.innerHTML = '';
      return;
    }
    const results = searchMaterialsSimple(query);
    if (results.length === 0) {
      providerAddResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Sin resultados.</p>';
      return;
    }
    providerAddResults.innerHTML = results.map(item => `
      <div class="provider-search-row">
        <div class="provider-search-row-info">
          <strong>${item.denominacion}</strong><br>
          <span style="color:var(--text-muted); font-size:0.75rem;">${item.id} · ${item.rubro}</span>
        </div>
        <div class="provider-search-row-controls">
          <input type="text" id="prov-sku-${item.id}" placeholder="Tu SKU (opcional)">
          <input type="number" id="prov-price-${item.id}" placeholder="Precio" min="0" step="0.01">
          <select id="prov-stock-${item.id}">
            <option value="en_stock">En stock</option>
            <option value="a_pedido">A pedido</option>
            <option value="agotado">Agotado</option>
          </select>
          <button class="btn-computo" style="padding: 6px 12px; font-size: 0.78rem;" onclick="window.nexoBraApp.addOfferFromSearch('${item.id}')">Agregar</button>
        </div>
      </div>
    `).join('');
  }

  async function addOfferFromSearch(materialId) {
    if (!providerState.branch) {
      showToast('Primero guardá tus datos comerciales (sucursal) arriba.');
      return;
    }
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    const price = parseFloat(document.getElementById(`prov-price-${materialId}`).value);
    if (!price || price <= 0) {
      showToast('Ingresá un precio válido.');
      return;
    }
    const sku = document.getElementById(`prov-sku-${materialId}`).value.trim() || null;
    const stock = document.getElementById(`prov-stock-${materialId}`).value;

    const { error } = await supabaseClient.from('provider_offers').insert({
      branch_id: providerState.branch.id,
      material_id: materialId,
      price_kind: 'sale',
      amount: price,
      unit: material.unidadVenta,
      provider_sku: sku,
      stock_status: stock,
      status: 'approved',
      reported_at: new Date().toISOString()
    });

    if (error) {
      showToast('No se pudo agregar: ' + error.message);
      return;
    }
    showToast(`Agregado: ${material.denominacion.substring(0, 30)}`);
    providerAddSearch.value = '';
    providerAddResults.innerHTML = '';
    loadProviderCatalog();
  }

  // --- Mi catálogo: listado, edición, borrado, ajuste por porcentaje ---
  async function loadProviderCatalog() {
    if (!providerState.branch) {
      providerCatalogList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Guardá primero tus datos comerciales para empezar a cargar tu catálogo.</p>';
      return;
    }
    const { data, error } = await supabaseClient
      .from('provider_offers')
      .select('id, amount, unit, provider_sku, stock_status, materials(id, denomination)')
      .eq('branch_id', providerState.branch.id)
      .order('reported_at', { ascending: false });

    if (error) {
      providerCatalogList.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">Error: ${error.message}</p>`;
      return;
    }
    providerState.offers = data || [];
    renderProviderCatalog();
  }

  function renderProviderCatalog() {
    if (providerState.offers.length === 0) {
      providerCatalogList.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no cargaste materiales. Usá la búsqueda o la carga masiva de arriba.</p>';
      return;
    }
    providerCatalogList.innerHTML = providerState.offers.map(offer => `
      <div class="provider-catalog-row">
        <div class="provider-catalog-row-info">
          <h5>${offer.materials?.denomination || '(material eliminado)'}</h5>
          <span>${offer.provider_sku ? `SKU propio: ${offer.provider_sku} · ` : ''}${offer.unit}</span>
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

  async function updateOfferPrice(offerId, newAmount) {
    if (!newAmount || newAmount <= 0) return;
    const { error } = await supabaseClient.from('provider_offers').update({ amount: newAmount }).eq('id', offerId);
    if (error) { showToast('No se pudo actualizar: ' + error.message); return; }
    showToast('Precio actualizado.');
    loadProviderCatalog();
  }

  async function updateOfferStock(offerId, newStatus) {
    const { error } = await supabaseClient.from('provider_offers').update({ stock_status: newStatus }).eq('id', offerId);
    if (error) { showToast('No se pudo actualizar: ' + error.message); return; }
    showToast('Stock actualizado.');
  }

  async function deleteOffer(offerId) {
    if (!confirm('¿Eliminar este material de tu catálogo?')) return;
    const { error } = await supabaseClient.from('provider_offers').delete().eq('id', offerId);
    if (error) { showToast('No se pudo eliminar: ' + error.message); return; }
    showToast('Eliminado.');
    loadProviderCatalog();
  }

  async function applyBulkPercent() {
    const pct = parseFloat(providerBulkPercent.value);
    if (!pct || providerState.offers.length === 0) {
      showToast('Ingresá un porcentaje y tené al menos un ítem cargado.');
      return;
    }
    if (!confirm(`¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a los ${providerState.offers.length} ítems de tu catálogo?`)) return;

    btnApplyBulkPercent.disabled = true;
    const updates = providerState.offers.map(offer => {
      const newAmount = Math.round(offer.amount * (1 + pct / 100) * 100) / 100;
      return supabaseClient.from('provider_offers').update({ amount: newAmount }).eq('id', offer.id);
    });
    await Promise.all(updates);
    btnApplyBulkPercent.disabled = false;
    providerBulkPercent.value = '';
    showToast(`Ajuste del ${pct}% aplicado a todo tu catálogo.`);
    loadProviderCatalog();
  }

  // --- Carga masiva por Excel ---
  function handleProviderExcelFile(file) {
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

  function processProviderExcelRows(rows) {
    if (!rows || rows.length < 2) {
      showToast('El archivo no tiene filas de datos.');
      return;
    }
    const header = rows[0].map(h => normalizeText(h));
    let skuIdx = header.findIndex(h => h.includes('sku') || h.includes('codigo') || h.includes('cod'));
    let nameIdx = header.findIndex(h => h.includes('nombre') || h.includes('descripcion') || h.includes('material') || h.includes('producto'));
    let priceIdx = header.findIndex(h => h.includes('precio'));
    let stockIdx = header.findIndex(h => h.includes('stock') || h.includes('disponib'));

    if (nameIdx === -1) nameIdx = 0;
    if (priceIdx === -1) priceIdx = 1;

    const pending = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const sku = skuIdx > -1 && row[skuIdx] ? row[skuIdx].toString().trim() : '';
      const name = nameIdx > -1 && row[nameIdx] ? row[nameIdx].toString().trim() : '';
      const price = priceIdx > -1 && row[priceIdx] ? parseFloat(row[priceIdx]) : 0;
      const stockRaw = stockIdx > -1 && row[stockIdx] ? normalizeText(row[stockIdx].toString()) : '';
      let stock = 'en_stock';
      if (stockRaw.includes('pedido')) stock = 'a_pedido';
      if (stockRaw.includes('agot') || stockRaw.includes('sin stock')) stock = 'agotado';

      if (!name && !sku) continue;
      const match = findBestMaterialMatch(sku, name);
      pending.push({ sku, name, price, stock, matchedItem: match.item, status: match.status });
    }

    providerState.excelPending = pending;
    renderProviderExcelPreview();
  }

  function renderProviderExcelPreview() {
    const validCount = providerState.excelPending.filter(r => r.matchedItem).length;
    if (providerState.excelPending.length === 0) {
      providerExcelPreview.innerHTML = '';
      btnConfirmProviderExcel.style.display = 'none';
      return;
    }
    providerExcelPreview.innerHTML = providerState.excelPending.map(row => `
      <div class="excel-preview-row status-${row.status}">
        <div>
          <strong>${row.name || row.sku}</strong>
          ${row.matchedItem ? `→ ${row.matchedItem.denominacion} (${row.matchedItem.id})` : ' → sin coincidencia, no se va a cargar'}
        </div>
        <div>$${row.price || 0} · ${row.stock}</div>
      </div>
    `).join('');
    btnConfirmProviderExcel.style.display = validCount > 0 ? 'inline-flex' : 'none';
    showToast(`${validCount} de ${providerState.excelPending.length} filas emparejadas con el catálogo.`);
  }

  async function confirmProviderExcelUpload() {
    if (!providerState.branch) {
      showToast('Primero guardá tus datos comerciales (sucursal) arriba.');
      return;
    }
    const rows = providerState.excelPending.filter(r => r.matchedItem && r.price > 0);
    if (rows.length === 0) {
      showToast('No hay filas válidas para cargar.');
      return;
    }
    btnConfirmProviderExcel.disabled = true;

    const inserts = rows.map(row => ({
      branch_id: providerState.branch.id,
      material_id: row.matchedItem.id,
      price_kind: 'sale',
      amount: row.price,
      unit: row.matchedItem.unidadVenta,
      provider_sku: row.sku || null,
      stock_status: row.stock,
      status: 'approved',
      reported_at: new Date().toISOString()
    }));

    const { error } = await supabaseClient.from('provider_offers').insert(inserts);
    btnConfirmProviderExcel.disabled = false;

    if (error) {
      showToast('No se pudo cargar el archivo: ' + error.message);
      return;
    }
    showToast(`¡Listo! Se cargaron ${rows.length} materiales a tu catálogo.`);
    providerState.excelPending = [];
    providerExcelPreview.innerHTML = '';
    btnConfirmProviderExcel.style.display = 'none';
    providerExcelInput.value = '';
    loadProviderCatalog();
  }

  function setupProviderListeners() {
    if (!supabaseClient) return;
    btnOpenMyProvider.addEventListener('click', () => {
      authDropdown.style.display = 'none';
      switchView('provider');
    });
    providerProfileForm.addEventListener('submit', handleProviderProfileSubmit);
    providerAddSearch.addEventListener('input', renderProviderAddResults);
    providerExcelInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleProviderExcelFile(e.target.files[0]);
    });
    btnConfirmProviderExcel.addEventListener('click', confirmProviderExcelUpload);
    btnApplyBulkPercent.addEventListener('click', applyBulkPercent);
  }

  // --- MAPA DE PROVEEDORES (Fase D) ---
  // Centro por defecto: Oberá, Misiones (zona piloto). Si el usuario comparte
  // su ubicación real, se recentra ahí. El radio y el centro son el único
  // estado; todo lo demás (pines, ficha) se recalcula llamando a las
  // funciones SQL que ya hacen el trabajo pesado (distancia real, mediana).
  const DEFAULT_MAP_CENTER = { lat: -27.4864, lng: -55.1199 };
  const mapState = { map: null, markers: [], center: { ...DEFAULT_MAP_CENTER }, radiusKm: 25, initialized: false };

  const mapStatusMsg = document.getElementById('map-status-msg');
  const mapBranchPanel = document.getElementById('map-branch-panel');
  const mapRadiusSelect = document.getElementById('map-radius-select');
  const btnGeolocate = document.getElementById('btn-geolocate');

  function initProviderMap() {
    if (mapState.initialized || typeof L === 'undefined') return;
    mapState.map = L.map('provider-map').setView([mapState.center.lat, mapState.center.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(mapState.map);
    mapState.initialized = true;
  }

  function clearMapMarkers() {
    mapState.markers.forEach(m => mapState.map.removeLayer(m));
    mapState.markers = [];
  }

  async function loadNearbyBranchesOnMap() {
    if (!supabaseClient || !mapState.map) return;
    mapStatusMsg.textContent = 'Buscando proveedores cercanos...';

    const { data, error } = await supabaseClient.rpc('nearby_provider_branches', {
      center_lat: mapState.center.lat,
      center_lng: mapState.center.lng,
      radius_km: mapState.radiusKm
    });

    if (error) {
      mapStatusMsg.textContent = 'No se pudo cargar el mapa: ' + error.message;
      return;
    }

    clearMapMarkers();

    const centerMarker = L.circleMarker([mapState.center.lat, mapState.center.lng], {
      radius: 7, color: '#d97757', fillColor: '#d97757', fillOpacity: 0.9
    }).addTo(mapState.map).bindPopup('Tu ubicación');
    mapState.markers.push(centerMarker);

    (data || []).forEach(branch => {
      if (!branch.latitude || !branch.longitude) return;
      const marker = L.marker([branch.latitude, branch.longitude]).addTo(mapState.map);
      marker.bindPopup(`<strong>${branch.business_name}</strong><br>${branch.branch_name} · ${branch.distance_km.toFixed(1)} km<br>${branch.offers_count} material${branch.offers_count === 1 ? '' : 'es'} cargado${branch.offers_count === 1 ? '' : 's'}`);
      marker.on('click', () => showBranchDetail(branch.branch_id, branch));
      mapState.markers.push(marker);
    });

    mapStatusMsg.textContent = data && data.length > 0
      ? `${data.length} proveedor${data.length === 1 ? '' : 'es'} encontrado${data.length === 1 ? '' : 's'} en ${mapState.radiusKm} km a la redonda.`
      : `No hay proveedores cargados en ${mapState.radiusKm} km a la redonda todavía.`;
  }

  async function showBranchDetail(branchId, branchInfo) {
    mapBranchPanel.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Cargando ficha...</p>';

    const { data, error } = await supabaseClient.rpc('branch_price_variation', {
      p_branch_id: branchId,
      center_lat: mapState.center.lat,
      center_lng: mapState.center.lng,
      radius_km: mapState.radiusKm
    });

    if (error) {
      mapBranchPanel.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }

    const whatsappLink = branchInfo.whatsapp_phone
      ? `<a class="branch-whatsapp-btn" target="_blank" href="https://wa.me/${branchInfo.whatsapp_phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, te escribo desde NEXOBRA para consultar precios.')}">💬 Contactar por WhatsApp</a>`
      : '';

    const filas = (data || []).map(row => {
      const cls = row.variation_pct === null ? 'equal' : row.variation_pct < -1 ? 'below' : row.variation_pct > 1 ? 'above' : 'equal';
      const texto = row.variation_pct === null ? 's/d' : `${row.variation_pct > 0 ? '+' : ''}${row.variation_pct}%`;
      return `
        <div class="variation-row">
          <span class="variation-name">${row.denomination}${row.stock_status === 'agotado' ? ' <em>(agotado)</em>' : ''}</span>
          <span class="variation-badge ${cls}">${texto}</span>
        </div>
      `;
    }).join('');

    mapBranchPanel.innerHTML = `
      <h3>${branchInfo.business_name}</h3>
      <div class="branch-meta">${branchInfo.branch_name} · ${branchInfo.locality} · ${branchInfo.distance_km.toFixed(1)} km de tu ubicación</div>
      ${whatsappLink}
      <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 8px;">Variación de precio vs. la mediana de proveedores en ${mapState.radiusKm} km a la redonda:</p>
      ${filas || '<p style="font-size:0.8rem; color:var(--text-muted);">Sin materiales cargados todavía.</p>'}
    `;
  }

  function requestUserLocation() {
    if (!navigator.geolocation) {
      showToast('Tu navegador no soporta geolocalización.');
      return;
    }
    mapStatusMsg.textContent = 'Buscando tu ubicación...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapState.map.setView([mapState.center.lat, mapState.center.lng], 13);
        loadNearbyBranchesOnMap();
      },
      () => {
        showToast('No se pudo acceder a tu ubicación. Mostrando la zona por defecto.');
        loadNearbyBranchesOnMap();
      },
      { timeout: 8000 }
    );
  }

  function setupMapListeners() {
    if (!supabaseClient) return;
    const navBtnMapa = document.getElementById('nav-btn-mapa');
    const mobileNavBtnMapa = document.getElementById('mobile-nav-btn-mapa');
    if (navBtnMapa) navBtnMapa.addEventListener('click', () => switchView('map'));
    if (mobileNavBtnMapa) mobileNavBtnMapa.addEventListener('click', () => {
      switchView('map');
      const panel = document.getElementById('mobile-menu-panel');
      const backdrop = document.getElementById('mobile-menu-backdrop');
      if (panel) panel.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      document.body.style.overflow = '';
    });
    btnGeolocate.addEventListener('click', requestUserLocation);
    mapRadiusSelect.addEventListener('change', () => {
      mapState.radiusKm = parseFloat(mapRadiusSelect.value);
      loadNearbyBranchesOnMap();
    });
  }

  // --- OFERTAS DE CORRALONES EN EL CATÁLOGO (toggle "ORIGEN DEL VALOR") ---
  // Reutiliza el mismo centro/radio que el mapa (mapState) para no pedir
  // ubicación dos veces. Si el mapa nunca se abrió en esta sesión, usa el
  // centro por defecto (o pide geolocalización la primera vez que se activa).
  const providerPricesState = { loaded: false, byMaterial: {} };

  async function loadNearbyRepresentativePrices() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('nearby_representative_prices', {
      center_lat: mapState.center.lat,
      center_lng: mapState.center.lng,
      radius_km: mapState.radiusKm
    });
    if (error) {
      showToast('No se pudieron cargar las ofertas de corralones: ' + error.message);
      return;
    }
    providerPricesState.byMaterial = {};
    (data || []).forEach(row => { providerPricesState.byMaterial[row.material_id] = row; });
    providerPricesState.loaded = true;
  }

  function setupPricingSourceListeners() {
    const btnSourceReference = document.getElementById('source-reference');
    const btnSourceProviders = document.getElementById('source-providers');
    if (!btnSourceReference || !btnSourceProviders) return;

    async function activateProvidersSource() {
      btnSourceReference.classList.remove('active');
      btnSourceProviders.classList.add('active');
      state.pricingSource = 'providers';

      if (!providerPricesState.loaded) {
        if (navigator.geolocation) {
          showToast('Buscando ofertas cerca tuyo...');
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              mapState.center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              await loadNearbyRepresentativePrices();
              renderProducts();
            },
            async () => {
              await loadNearbyRepresentativePrices();
              renderProducts();
            },
            { timeout: 8000 }
          );
          return; // renderProducts() se llama dentro del callback async de arriba
        }
        await loadNearbyRepresentativePrices();
      }
      renderProducts();
    }

    btnSourceReference.addEventListener('click', () => {
      btnSourceProviders.classList.remove('active');
      btnSourceReference.classList.add('active');
      state.pricingSource = 'reference';
      renderProducts();
    });
    btnSourceProviders.addEventListener('click', activateProvidersSource);
  }

  // --- ELEGIR UN PROVEEDOR ESPECÍFICO PARA UN MATERIAL ---
  // A diferencia de los materiales "de referencia" (que siempre se recalculan
  // en vivo contra el mes elegido en Mi Cómputo), un ítem elegido de un
  // corralón puntual guarda el precio de ese momento tal cual — no hay "mes"
  // al que llevarlo, es lo que ese corralón tiene cargado ahora. Si el
  // corralón cambia después su precio, hay que sacarlo y volver a elegirlo.
  const offerPickerModal = document.getElementById('offer-picker-modal');
  const offerPickerModalBackdrop = document.getElementById('offer-picker-modal-backdrop');
  const offerPickerModalCloseBtn = document.getElementById('offer-picker-modal-close-btn');
  const offerPickerSubtitle = document.getElementById('offer-picker-subtitle');
  const offerPickerResults = document.getElementById('offer-picker-results');

  async function openOfferPicker(materialId) {
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    if (!material) return;

    offerPickerSubtitle.textContent = material.denominacion;
    offerPickerResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Buscando ofertas...</p>';
    offerPickerModal.classList.add('open');
    offerPickerModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    const { data, error } = await supabaseClient.rpc('nearby_offers_for_material', {
      p_material_id: materialId,
      center_lat: mapState.center.lat,
      center_lng: mapState.center.lng,
      radius_km: mapState.radiusKm
    });

    if (error) {
      offerPickerResults.innerHTML = `<p style="color:#b91c1c; font-size:0.85rem;">${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      offerPickerResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No hay ofertas cercanas para este material.</p>';
      return;
    }

    offerPickerResults.innerHTML = data.map((offer, idx) => `
      <div class="offer-picker-row">
        <div class="offer-picker-row-info">
          <h5>${offer.business_name}</h5>
          <span>${offer.branch_name} · ${offer.locality} · ${offer.distance_km.toFixed(1)} km${offer.stock_status === 'agotado' ? ' · <strong style="color:#b91c1c;">Agotado</strong>' : offer.stock_status === 'a_pedido' ? ' · A pedido' : ' · En stock'}</span>
        </div>
        <div class="offer-picker-row-price">
          <strong>${formatMoney(offer.amount)}</strong>
          <span style="font-size:0.72rem; color:var(--text-muted);">/ ${offer.unit}</span>
          <button class="btn-computo" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 4px; display:block;" onclick='window.nexoBraApp.chooseProviderOffer(${JSON.stringify(materialId)}, ${idx})'>
            Elegir
          </button>
        </div>
      </div>
    `).join('');

    // Se guarda temporalmente para que chooseProviderOffer no tenga que repetir la consulta.
    offerPickerResults.dataset.materialId = materialId;
    window.__offerPickerData = data;
  }

  function closeOfferPicker() {
    offerPickerModal.classList.remove('open');
    offerPickerModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function chooseProviderOffer(materialId, offerIndex) {
    const offer = window.__offerPickerData?.[offerIndex];
    const material = NEXOBRA_DATA.find(m => m.id === materialId);
    if (!offer || !material) return;

    const qtyInput = document.getElementById(`qty-${materialId}`);
    const qty = qtyInput ? Math.max(1, parseFloat(qtyInput.value) || 1) : 1;

    const existingIndex = state.computoCart.findIndex(i => i.id === materialId && i.type === 'material' && i.providerOfferId === offer.offer_id);
    if (existingIndex > -1) {
      state.computoCart[existingIndex].qty += qty;
    } else {
      state.computoCart.push({
        id: materialId,
        denominacion: material.denominacion,
        rubro: material.rubro,
        unit: offer.unit,
        qty: qty,
        type: 'material',
        mode: state.pricingMode,
        providerOfferId: offer.offer_id,
        providerBranchId: offer.branch_id,
        providerBusinessName: offer.business_name,
        providerBranchName: offer.branch_name,
        providerWhatsapp: offer.whatsapp_phone,
        providerPrice: offer.amount
      });
    }

    saveCart();
    updateCartUI();
    closeOfferPicker();
    showToast(`Agregado desde ${offer.business_name}: ${material.denominacion.substring(0, 30)}`);
  }

  function setupOfferPickerListeners() {
    if (!supabaseClient) return;
    offerPickerModalCloseBtn.addEventListener('click', closeOfferPicker);
    offerPickerModalBackdrop.addEventListener('click', closeOfferPicker);
  }

  // --- DOM ELEMENTS ---
  const homeView = document.getElementById('home-view');
  const catalogView = document.getElementById('catalog-view');
  const laborView = document.getElementById('labor-view');
  const methodologyView = document.getElementById('methodology-view');
  const myComputationsView = document.getElementById('my-computations-view');

  // Nav elements
  const navBrandLogo = document.getElementById('nav-brand-logo');
  const navBtnHome = document.getElementById('nav-btn-home');
  const navBtnRubros = document.getElementById('nav-btn-rubros');
  const navBtnCatalogo = document.getElementById('nav-btn-catalogo');
  const navBtnManoObra = document.getElementById('nav-btn-manoobra');
  const btnBackHome = document.getElementById('btn-back-home');
  const btnSeeAllCatalog = document.getElementById('btn-see-all-catalog');

  // Search & Hub elements
  const homeSearchInput = document.getElementById('home-search-input');
  const homeSearchSubmit = document.getElementById('home-search-submit');
  const rubrosHubGrid = document.getElementById('rubros-hub-grid');
  const catalogSearchInput = document.getElementById('catalog-search-input');
  const catalogCurrentRubro = document.getElementById('catalog-current-rubro');
  const catalogHeaderTitle = document.getElementById('catalog-header-title');
  const catalogHeaderSubtitle = document.getElementById('catalog-header-subtitle');

  // Catalog Controls
  const rubrosFilterContainer = document.getElementById('rubros-filter-container');
  const productsGrid = document.getElementById('products-grid');
  const productsTableView = document.getElementById('products-table-view');
  const productsTableBody = document.getElementById('products-table-body');
  const visibleCount = document.getElementById('visible-count');
  const activeFilterLabel = document.getElementById('active-filter-label');
  const sortSelect = document.getElementById('sort-select');

  const modeVentaBtn = document.getElementById('mode-venta');
  const modeComputoBtn = document.getElementById('mode-computo');
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewTable = document.getElementById('btn-view-table');
  const sourceReferenceBtn = document.getElementById('source-reference');
  const referencePriceStatus = document.getElementById('reference-price-status');

  // Drawer Elements
  const computoDrawer = document.getElementById('computo-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const btnOpenDrawer = document.getElementById('btn-open-drawer');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerBody = document.getElementById('drawer-body');
  const drawerTotalItems = document.getElementById('drawer-total-items');
  const drawerSubtotal = document.getElementById('drawer-subtotal');
  const drawerTotal = document.getElementById('drawer-total');
  const headerCartCount = document.getElementById('header-cart-count');
  const btnPrintComputo = document.getElementById('btn-print-computo');
  const btnCopyComputo = document.getElementById('btn-copy-computo');
  const btnClearComputo = document.getElementById('btn-clear-computo');
  const toastContainer = document.getElementById('toast-container');

  // Excel Modal Elements
  const btnOpenExcelModal = document.getElementById('btn-open-excel-modal');
  const excelModal = document.getElementById('excel-modal');
  const excelModalBackdrop = document.getElementById('excel-modal-backdrop');
  const excelModalCloseBtn = document.getElementById('excel-modal-close-btn');
  const excelDropzone = document.getElementById('excel-dropzone');
  const excelFileInput = document.getElementById('excel-file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const btnDownloadTemplate = document.getElementById('btn-download-template');
  const excelTargetDate = document.getElementById('excel-target-date');
  const customFactorField = document.getElementById('custom-factor-field');
  const customFactorInput = document.getElementById('custom-factor-input');
  const excelPricingMode = document.getElementById('excel-pricing-mode');
  const excelResultsContainer = document.getElementById('excel-results-container');
  const excelPreviewTbody = document.getElementById('excel-preview-tbody');
  const excelStatsText = document.getElementById('excel-stats-text');
  const btnDownloadProcessedExcel = document.getElementById('btn-download-processed-excel');

  // --- HELPER UTILITIES ---
  
  function formatMoney(amount) {
    if (isNaN(amount)) return '$ 0,00';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  function normalizeText(text) {
    if (!text) return '';
    return text.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatFactor(factor) {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(factor);
  }

  /** "abr-25" -> "2025-04-01" (para buscar el índice de mes base de cada material) */
  function baseLabelToDate(label) {
    const MESES = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, sept:9, oct:10, nov:11, dic:12 };
    const match = /^([a-záéíóú]{3,4})-(\d{2})$/i.exec((label || '').trim());
    if (!match) return null;
    const mes = MESES[match[1].toLowerCase()];
    if (!mes) return null;
    return `20${match[2]}-${String(mes).padStart(2, '0')}-01`;
  }

  /**
   * Calcula el precio actualizado de un material al mes elegido por el usuario
   * (state.priceMonth), usando la serie real de IPC cargada en indexState.
   * Si todavía no hay serie cargada (Supabase sin datos, o carga en curso),
   * cae al factor estático precioVenta/precioBase como respaldo para no romper
   * la vista, pero deja marcado dynamic:false para que la UI lo aclare.
   */
  function getReferencePrice(item, mode = state.pricingMode, targetMonthOverride = null) {
    const ventaBase = Number(item.precioBase);
    const baseDate = baseLabelToDate(item.mesBase);
    const targetDate = targetMonthOverride || state.priceMonth;
    const indiceBase = baseDate ? indexState.values[baseDate] : undefined;
    const indiceDestino = targetDate ? indexState.values[targetDate] : undefined;

    let factor = 1;
    let dynamic = false;
    if (indexState.loaded && indiceBase && indiceDestino) {
      factor = indiceDestino / indiceBase;
      dynamic = true;
    } else {
      const ventaCurrent = Number(item.precioVenta);
      factor = ventaBase > 0 && ventaCurrent > 0 ? ventaCurrent / ventaBase : 1;
    }

    const basePrice = mode === 'venta' ? ventaBase : ventaBase * (Number(item.precioComputo) / Number(item.precioVenta || 1));
    const currentPrice = basePrice * factor;

    return {
      currentPrice,
      basePrice,
      factor,
      dynamic,
      basePeriod: item.mesBase || 'período base no informado',
      targetPeriod: targetDate ? monthLabel(targetDate) : REFERENCE_PRICE_INFO.period,
      targetMonth: targetDate,
      unit: mode === 'venta' ? item.unidadVenta : item.unidadComputo
    };
  }

  /**
   * Resuelve el precio "en vivo" de un ítem del carrito contra un mes puntual
   * (normalmente state.computoMonth). No depende de nada que se haya guardado
   * al momento de agregar el ítem: siempre vuelve a calcular desde el catálogo
   * base (materiales) o desde la serie de UOCRA (mano de obra). Así, cambiar el
   * mes en "Mi Cómputo" recalcula TODO el presupuesto de una sola vez.
   */
  function resolveItemPricing(cartItem, targetMonth) {
    if (cartItem.type === 'labor') {
      const role = laborState.roles.find(r => r.code === cartItem.id);
      const valor = role ? role.values[targetMonth] : undefined;
      return {
        unitPrice: valor !== undefined ? valor : 0,
        basePrice: null,
        factor: null,
        basePeriod: null,
        disponible: valor !== undefined
      };
    }

    // Ítem elegido de un corralón puntual: precio fijo tal cual se cargó al
    // elegirlo, no se recalcula contra ningún mes (no hay un "índice" de un
    // corralón individual, solo lo que tiene puesto ahora mismo).
    if (cartItem.providerOfferId) {
      return {
        unitPrice: cartItem.providerPrice,
        basePrice: null,
        factor: null,
        basePeriod: null,
        disponible: true,
        isProviderSourced: true
      };
    }

    const material = NEXOBRA_DATA.find(m => m.id === cartItem.id);
    if (!material) {
      return { unitPrice: 0, basePrice: null, factor: null, basePeriod: null, disponible: false };
    }
    const trace = getReferencePrice(material, cartItem.mode || 'venta', targetMonth);
    return {
      unitPrice: trace.currentPrice,
      basePrice: trace.basePrice,
      factor: trace.factor,
      basePeriod: trace.basePeriod,
      disponible: true
    };
  }

  function renderPriceTrace(item, mode = state.pricingMode) {
    const trace = getReferencePrice(item, mode);
    const metodo = trace.dynamic
      ? `Índice IPC (INDEC): ${trace.basePeriod} → ${trace.targetPeriod}`
      : `Factor de referencia fijo (serie de IPC no disponible)`;
    return `
      <details class="price-trace">
        <summary>Ver cálculo y fuente</summary>
        <div class="price-trace-content">
          <div><span>Base:</span> <strong>${formatMoney(trace.basePrice)} · ${trace.basePeriod}</strong></div>
          <div><span>Factor:</span> <strong>× ${formatFactor(trace.factor)}</strong></div>
          <div><span>Fórmula:</span> ${formatMoney(trace.basePrice)} × ${formatFactor(trace.factor)} = <strong>${formatMoney(trace.currentPrice)}</strong></div>
          <div><span>Método:</span> ${metodo}</div>
          <div><span>Fuente:</span> ${REFERENCE_PRICE_INFO.source}</div>
          <p>Valor orientativo, sin impuestos ni flete incluidos. Confirmá precio final, disponibilidad, entrega y pago con el proveedor.</p>
        </div>
      </details>
    `;
  }

  function updateReferenceStatus() {
    if (!referencePriceStatus) return;
    referencePriceStatus.innerHTML = `Valores de referencia NEXOBRA · Período: <strong>${REFERENCE_PRICE_INFO.period}</strong> · Fuente: ${REFERENCE_PRICE_INFO.source} · Actualizado: ${REFERENCE_PRICE_INFO.updatedAt}`;
  }

  function toBaseMonthLabel(value) {
    if (!value) return 'período base no informado';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
  }

  function newestPrice(prices, kind, dateField) {
    return (prices || [])
      .filter(price => price.price_kind === kind)
      .sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])))[0];
  }

  function mapRemoteMaterial(row) {
    const baseSale = newestPrice(row.material_price_bases, 'sale', 'base_month');
    const baseMeasurement = newestPrice(row.material_price_bases, 'measurement', 'base_month');
    const referenceSale = newestPrice(row.material_reference_prices, 'sale', 'reference_date');
    const referenceMeasurement = newestPrice(row.material_reference_prices, 'measurement', 'reference_date');

    return {
      id: row.id,
      rubro: row.rubro,
      categoria: row.category || '',
      subcategoria: row.subcategory || '',
      denominacion: row.denomination,
      tags: (row.material_aliases || []).map(alias => alias.alias),
      unidadVenta: row.sale_unit || '',
      unidadComputo: row.measurement_unit || '',
      envase: Number(row.package_quantity) || 1,
      precioBase: Number(baseSale?.amount || referenceSale?.amount || 0),
      precioVenta: Number(referenceSale?.amount || baseSale?.amount || 0),
      precioComputo: Number(referenceMeasurement?.amount || baseMeasurement?.amount || 0),
      mesBase: toBaseMonthLabel(baseSale?.base_month)
    };
  }

  async function loadCatalogFromSupabase() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
      .from('materials')
      .select(`
        id, rubro, category, subcategory, denomination, sale_unit, measurement_unit, package_quantity,
        material_aliases(alias),
        material_price_bases(amount, price_kind, base_month),
        material_reference_prices(amount, price_kind, reference_date)
      `)
      .eq('active', true)
      .order('id');

    if (error) {
      console.warn('No se pudo cargar el catálogo remoto. Se conserva la copia local.', error.message);
      return;
    }
    if (!data || data.length === 0) return;

    const latestReferenceDate = data
      .flatMap(item => item.material_reference_prices || [])
      .map(item => item.reference_date)
      .filter(Boolean)
      .sort()
      .at(-1);

    // Hasta que existan valores de referencia publicados, conservamos el catálogo local.
    if (!latestReferenceDate) return;

    const remoteMaterials = data.map(mapRemoteMaterial).filter(item => item.precioVenta > 0);
    if (remoteMaterials.length === 0) return;

    NEXOBRA_DATA.splice(0, NEXOBRA_DATA.length, ...remoteMaterials);

    if (latestReferenceDate) {
      const latest = new Date(`${latestReferenceDate}T00:00:00`);
      REFERENCE_PRICE_INFO.period = latest.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      REFERENCE_PRICE_INFO.updatedAt = latest.toLocaleDateString('es-AR');
    }
    REFERENCE_PRICE_INFO.source = 'Base de datos NEXOBRA';

    renderHomeSubareas();
    renderRubroPills();
    renderProducts();
    updateCatalogHeader();
    updateReferenceStatus();
    showToast(`✓ Catálogo actualizado desde NEXOBRA (${remoteMaterials.length} materiales)`);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B000" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- NAVIGATION VIEW SWITCHER ---
  function switchView(viewName, rubroFilter = null, searchString = null) {
    state.currentView = viewName;

    homeView.style.display = viewName === 'home' ? 'block' : 'none';
    catalogView.style.display = viewName === 'catalog' ? 'block' : 'none';
    if (laborView) laborView.style.display = viewName === 'labor' ? 'block' : 'none';
    if (methodologyView) methodologyView.style.display = viewName === 'methodology' ? 'block' : 'none';
    if (myComputationsView) myComputationsView.style.display = viewName === 'my-computations' ? 'block' : 'none';
    if (providerView) providerView.style.display = viewName === 'provider' ? 'block' : 'none';
    const mapViewEl = document.getElementById('map-view');
    if (mapViewEl) mapViewEl.style.display = viewName === 'map' ? 'block' : 'none';

    navBtnHome.classList.toggle('active', viewName === 'home');
    navBtnCatalogo.classList.toggle('active', viewName === 'catalog');
    if (navBtnManoObra) navBtnManoObra.classList.toggle('active', viewName === 'labor');

    const mHome = document.getElementById('mobile-nav-btn-home');
    const mCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mManoObra = document.getElementById('mobile-nav-btn-manoobra');
    if (mHome) mHome.classList.toggle('active', viewName === 'home');
    if (mCatalogo) mCatalogo.classList.toggle('active', viewName === 'catalog');
    if (mManoObra) mManoObra.classList.toggle('active', viewName === 'labor');

    if (viewName === 'catalog') {
      if (rubroFilter) {
        state.activeRubro = rubroFilter;
      }
      if (searchString !== null) {
        state.searchQuery = searchString;
        catalogSearchInput.value = searchString;
      }

      updateCatalogHeader();
      renderRubroPills();
      renderProducts();
    }
    if (viewName === 'labor' && !laborState.loaded) {
      loadLaborSeries().then(reconcilePriceMonth);
    }
    if (viewName === 'methodology') {
      // El canvas estaba oculto hasta ahora; Chart.js necesita redibujar una vez visible.
      renderIpcChart();
    }
    if (viewName === 'my-computations') {
      if (!authState.user) {
        showAuthTab('login');
        openAuthModal();
        state.currentView = 'home';
        homeView.style.display = 'block';
        if (myComputationsView) myComputationsView.style.display = 'none';
      } else {
        loadMyComputations();
      }
    }
    if (viewName === 'provider') {
      if (!authState.user || !isProvider()) {
        showToast(!authState.user ? 'Iniciá sesión primero.' : 'Esta sección es solo para cuentas de Corralón.');
        state.currentView = 'home';
        homeView.style.display = 'block';
        if (providerView) providerView.style.display = 'none';
      } else {
        loadProviderData();
      }
    }
    if (viewName === 'map') {
      // Leaflet necesita el contenedor visible para calcular tamaño correctamente:
      // primero se muestra el div (ya hecho arriba), recién ahí se inicializa/redibuja.
      initProviderMap();
      setTimeout(() => {
        if (mapState.map) mapState.map.invalidateSize();
        loadNearbyBranchesOnMap();
      }, 50);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateCatalogHeader() {
    if (state.activeRubro === 'Todos') {
      catalogCurrentRubro.textContent = 'Catálogo General';
      catalogHeaderTitle.textContent = 'Todos los Materiales de Obra';
      catalogHeaderSubtitle.textContent = '';
    } else {
      const meta = RUBROS_METADATA[state.activeRubro] || { icon: "📦", desc: "" };
      catalogCurrentRubro.textContent = state.activeRubro;
      catalogHeaderTitle.textContent = `${meta.icon} ${state.activeRubro}`;
      catalogHeaderSubtitle.textContent = meta.desc || `Materiales y precios de referencia para ${state.activeRubro}`;
    }
  }

  // --- INIT & EVENT LISTENERS ---
  function init() {
    renderHomeSubareas();
    renderRubroPills();
    renderProducts();
    updateCartUI();
    updateReferenceStatus();
    loadCatalogFromSupabase();
    Promise.all([loadIndexSeries(), loadLaborSeries()]).then(reconcilePriceMonth);
    setupAuthListeners();
    setupProfileListeners();
    setupRoleListeners();
    setupComputationListeners();
    setupProviderListeners();
    setupMapListeners();
    setupPricingSourceListeners();
    setupOfferPickerListeners();

    // Nav buttons
    navBrandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    navBtnHome.addEventListener('click', () => switchView('home'));
    navBtnCatalogo.addEventListener('click', () => switchView('catalog', 'Todos', ''));
    if (navBtnManoObra) navBtnManoObra.addEventListener('click', () => switchView('labor'));

    const btnMethodologyHome = document.getElementById('btn-open-methodology-home');
    if (btnMethodologyHome) btnMethodologyHome.addEventListener('click', () => switchView('methodology'));
    const btnMethodologyCatalog = document.getElementById('btn-open-methodology-catalog');
    if (btnMethodologyCatalog) btnMethodologyCatalog.addEventListener('click', () => switchView('methodology'));
    btnBackHome.addEventListener('click', () => switchView('home'));
    btnSeeAllCatalog.addEventListener('click', () => switchView('catalog', 'Todos', ''));

    navBtnRubros.addEventListener('click', () => {
      if (state.currentView !== 'home') {
        switchView('home');
      }
      setTimeout(() => {
        document.getElementById('seccion-rubros').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // --- Menú mobile (hamburguesa) ---
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const mobileMenuPanel = document.getElementById('mobile-menu-panel');
    const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
    const mobileMenuClose = document.getElementById('mobile-menu-close');

    function openMobileMenu() {
      mobileMenuPanel.classList.add('open');
      mobileMenuBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeMobileMenu() {
      mobileMenuPanel.classList.remove('open');
      mobileMenuBackdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
    // Ejecuta la misma acción que su botón gemelo de escritorio, y cierra el panel después.
    function mobileNavAction(action) {
      action();
      closeMobileMenu();
    }

    if (btnMobileMenu) btnMobileMenu.addEventListener('click', openMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
    if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', closeMobileMenu);

    const mobileNavBtnHome = document.getElementById('mobile-nav-btn-home');
    const mobileNavBtnRubros = document.getElementById('mobile-nav-btn-rubros');
    const mobileNavBtnCatalogo = document.getElementById('mobile-nav-btn-catalogo');
    const mobileNavBtnManoObra = document.getElementById('mobile-nav-btn-manoobra');

    if (mobileNavBtnHome) mobileNavBtnHome.addEventListener('click', () => mobileNavAction(() => switchView('home')));
    if (mobileNavBtnCatalogo) mobileNavBtnCatalogo.addEventListener('click', () => mobileNavAction(() => switchView('catalog', 'Todos', '')));
    if (mobileNavBtnManoObra) mobileNavBtnManoObra.addEventListener('click', () => mobileNavAction(() => switchView('labor')));
    if (mobileNavBtnRubros) mobileNavBtnRubros.addEventListener('click', () => mobileNavAction(() => {
      if (state.currentView !== 'home') switchView('home');
      setTimeout(() => {
        document.getElementById('seccion-rubros').scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }));

    // Home Search Listeners
    homeSearchSubmit.addEventListener('click', () => {
      const query = homeSearchInput.value.trim();
      if (query) {
        switchView('catalog', 'Todos', query);
      } else {
        switchView('catalog', 'Todos', '');
      }
    });

    homeSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        homeSearchSubmit.click();
      }
    });

    // Quick tag pills in Home
    document.querySelectorAll('.quick-tags-wrapper .tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const query = pill.getAttribute('data-search');
        switchView('catalog', 'Todos', query);
      });
    });

    // Catalog Search listener
    catalogSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderProducts();
    });

    // Pricing Mode Toggle
    modeVentaBtn.addEventListener('click', () => {
      state.pricingMode = 'venta';
      modeVentaBtn.classList.add('active');
      modeComputoBtn.classList.remove('active');
      renderProducts();
      showToast('Visualizando: Precio de Venta Comercial (por bulto)');
    });

    modeComputoBtn.addEventListener('click', () => {
      state.pricingMode = 'computo';
      modeComputoBtn.classList.add('active');
      modeVentaBtn.classList.remove('active');
      renderProducts();
      showToast('Visualizando: Precio de Cómputo Métrico (m²/m³/ml)');
    });

    if (sourceReferenceBtn) {
      sourceReferenceBtn.addEventListener('click', () => {
        showToast('Mostrando valores de referencia trazables de NEXOBRA');
      });
    }

    // View toggle (Grid vs Table)
    btnViewGrid.addEventListener('click', () => {
      state.viewMode = 'grid';
      btnViewGrid.classList.add('active');
      btnViewTable.classList.remove('active');
      productsGrid.style.display = 'grid';
      productsTableView.style.display = 'none';
    });

    btnViewTable.addEventListener('click', () => {
      state.viewMode = 'table';
      btnViewTable.classList.add('active');
      btnViewGrid.classList.remove('active');
      productsGrid.style.display = 'none';
      productsTableView.style.display = 'block';
    });

    // Sort select
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderProducts();
    });

    // Drawer triggers
    btnOpenDrawer.addEventListener('click', openDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    // Drawer Actions
    btnPrintComputo.addEventListener('click', printComputo);
    btnCopyComputo.addEventListener('click', copyComputoToClipboard);
    btnClearComputo.addEventListener('click', clearComputoCart);

    // Excel Modal Listeners
    btnOpenExcelModal.addEventListener('click', openExcelModal);
    excelModalCloseBtn.addEventListener('click', closeExcelModal);
    excelModalBackdrop.addEventListener('click', closeExcelModal);

    excelTargetDate.addEventListener('change', (e) => {
      customFactorField.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    customFactorInput.addEventListener('input', () => {
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    excelPricingMode.addEventListener('change', () => {
      if (state.excelProcessedRows.length > 0) {
        recalculateExcelRows();
      }
    });

    btnBrowseFile.addEventListener('click', () => excelFileInput.click());
    excelFileInput.addEventListener('change', handleExcelFileSelect);

    // Dropzone drag & drop
    excelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      excelDropzone.classList.add('dragover');
    });
    excelDropzone.addEventListener('dragleave', () => {
      excelDropzone.classList.remove('dragover');
    });
    excelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      excelDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleExcelFile(e.dataTransfer.files[0]);
      }
    });

    btnDownloadTemplate.addEventListener('click', generateTemplateExcel);
    btnDownloadProcessedExcel.addEventListener('click', exportProcessedExcel);
  }

  // --- RENDER SUBAREAS EN EL HOME ---
  function renderHomeSubareas() {
    const rubros = [...new Set(NEXOBRA_DATA.map(i => i.rubro))];
    rubrosHubGrid.innerHTML = '';

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
        switchView('catalog', rubro, '');
      });

      rubrosHubGrid.appendChild(card);
    });
  }

  // --- RUBRO PILLS RENDER (INSIDE CATALOG) ---
  function renderRubroPills() {
    const rubros = ['Todos', ...new Set(NEXOBRA_DATA.map(i => i.rubro))];
    rubrosFilterContainer.innerHTML = '';

    rubros.forEach(rubro => {
      const count = rubro === 'Todos' 
        ? NEXOBRA_DATA.length 
        : NEXOBRA_DATA.filter(i => i.rubro === rubro).length;

      const btn = document.createElement('button');
      btn.className = `cat-btn ${state.activeRubro === rubro ? 'active' : ''}`;
      btn.innerHTML = `<span>${rubro}</span><span class="count-badge">${count}</span>`;

      btn.addEventListener('click', () => {
        state.activeRubro = rubro;
        updateCatalogHeader();
        renderRubroPills();
        renderProducts();
      });

      rubrosFilterContainer.appendChild(btn);
    });
  }

  /** Quita una 's' o 'es' final para tolerar singular/plural en la búsqueda (ladrillo ~ ladrillos). */
  function singularize(word) {
    if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  }

  // --- FILTER & SORT LOGIC ---
  function getFilteredItems() {
    // Se busca por palabra (no por frase completa), y cada palabra tolera singular/plural
    // y puede matchear en cualquier campo (denominación, tags, categoría, etc.), no necesariamente
    // en el mismo. Así "ladrillo hueco" encuentra "Ladrillos huecos" sin que el usuario tenga que
    // escribir el texto exacto.
    const tokens = normalizeText(state.searchQuery).split(' ').filter(Boolean);

    let items = NEXOBRA_DATA.filter(item => {
      if (state.activeRubro !== 'Todos' && item.rubro !== state.activeRubro) {
        return false;
      }

      if (tokens.length > 0) {
        const haystack = normalizeText([
          item.denominacion,
          item.id,
          item.categoria,
          item.subcategoria,
          ...(item.tags || [])
        ].filter(Boolean).join(' '));

        return tokens.every(tok => haystack.includes(tok) || haystack.includes(singularize(tok)));
      }

      return true;
    });

    if (state.sortBy === 'price-asc') {
      items.sort((a, b) => {
        const pA = getReferencePrice(a).currentPrice;
        const pB = getReferencePrice(b).currentPrice;
        return pA - pB;
      });
    } else if (state.sortBy === 'price-desc') {
      items.sort((a, b) => {
        const pA = getReferencePrice(a).currentPrice;
        const pB = getReferencePrice(b).currentPrice;
        return pB - pA;
      });
    } else if (state.sortBy === 'alpha-asc') {
      items.sort((a, b) => a.denominacion.localeCompare(b.denominacion));
    }

    return items;
  }

  // --- RENDER PRODUCTS (GRID & TABLE) ---
  function renderProducts() {
    const filtered = getFilteredItems();

    visibleCount.textContent = filtered.length;
    activeFilterLabel.textContent = state.activeRubro !== 'Todos' ? ` en ${state.activeRubro}` : '';

    if (filtered.length === 0) {
      productsGrid.innerHTML = `
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
      productsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No hay materiales para mostrar</td></tr>`;
      return;
    }

    // Grid HTML
    productsGrid.innerHTML = filtered.map(item => {
      const isVentaMode = state.pricingMode === 'venta';
      const mainTrace = getReferencePrice(item, state.pricingMode);
      const secondaryTrace = getReferencePrice(item, isVentaMode ? 'computo' : 'venta');

      const usaOfertas = state.pricingSource === 'providers';
      const oferta = usaOfertas ? providerPricesState.byMaterial[item.id] : null;

      let mainPrice, mainUnit, priceBoxExtra;
      if (usaOfertas && oferta) {
        mainPrice = oferta.median_price;
        mainUnit = item.unidadVenta;
        priceBoxExtra = `
          <div class="price-secondary-row" style="color: #15803d;">
            <span>🏪 ${oferta.offers_count} oferta${oferta.offers_count === 1 ? '' : 's'} cerca tuyo</span>
            <strong>${formatMoney(oferta.min_price)} - ${formatMoney(oferta.max_price)}</strong>
          </div>
        `;
      } else if (usaOfertas && !oferta) {
        mainPrice = mainTrace.currentPrice;
        mainUnit = mainTrace.unit;
        priceBoxExtra = `
          <div class="price-secondary-row" style="color: var(--text-subtle);">
            <span>Sin ofertas cercanas cargadas — mostrando referencia NEXOBRA</span>
          </div>
        `;
      } else {
        mainPrice = mainTrace.currentPrice;
        mainUnit = mainTrace.unit;
        const secPrice = secondaryTrace.currentPrice;
        const secUnit = secondaryTrace.unit;
        const secLabel = isVentaMode ? 'Cómputo métrico' : 'Venta x bulto';
        priceBoxExtra = `
          <div class="price-secondary-row">
            <span>${secLabel}:</span>
            <strong>${formatMoney(secPrice)} / ${secUnit}</strong>
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
              <div class="price-main-row">
                <span class="price-main-val">${formatMoney(mainPrice)}</span>
                <span class="price-unit-tag">/ ${mainUnit}</span>
              </div>
              ${priceBoxExtra}
            </div>

            ${usaOfertas ? '' : renderPriceTrace(item)}

            <div class="card-tags">
              ${tagsHtml}
            </div>

            ${usaOfertas && oferta ? `
              <button class="btn-choose-provider" onclick="window.nexoBraApp.openOfferPicker('${item.id}')">
                🏪 Ver ${oferta.offers_count} oferta${oferta.offers_count === 1 ? '' : 's'} y elegir proveedor
              </button>
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
    productsTableBody.innerHTML = filtered.map(item => {
      const ventaTrace = getReferencePrice(item, 'venta');
      const computoTrace = getReferencePrice(item, 'computo');
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
            <strong>${formatMoney(ventaTrace.currentPrice)}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${ventaTrace.unit}</span>
            <div class="table-price-trace">Base ${formatMoney(ventaTrace.basePrice)} · × ${formatFactor(ventaTrace.factor)}</div>
          </td>
          <td>
            <span style="color: #2563EB; font-weight: 700;">${formatMoney(computoTrace.currentPrice)}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">/ ${computoTrace.unit}</span>
            <div class="table-price-trace">Base ${formatMoney(computoTrace.basePrice)} · × ${formatFactor(computoTrace.factor)}</div>
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
        catalogSearchInput.value = tag;
        state.searchQuery = tag;
        renderProducts();
        catalogSearchInput.focus();
      });
    });
  }

  function clearCatalogSearch() {
    catalogSearchInput.value = '';
    state.searchQuery = '';
    state.activeRubro = 'Todos';
    renderRubroPills();
    renderProducts();
  }

  // --- CÓMPUTO CART MANAGEMENT ---
  function addToComputo(itemId) {
    const item = NEXOBRA_DATA.find(i => i.id === itemId);
    if (!item) return;

    const qtyInput = document.getElementById(`qty-${itemId}`);
    const qty = qtyInput ? Math.max(1, parseFloat(qtyInput.value) || 1) : 1;
    const unit = state.pricingMode === 'venta' ? item.unidadVenta : item.unidadComputo;

    const existingIndex = state.computoCart.findIndex(i => i.id === itemId && i.type === 'material' && i.mode === state.pricingMode);

    if (existingIndex > -1) {
      state.computoCart[existingIndex].qty += qty;
    } else {
      // El carrito no congela precio: solo guarda la referencia y la cantidad.
      // El precio se calcula siempre "en vivo" contra state.computoMonth (ver resolveItemPricing),
      // así que agregar un ítem hoy o hace una semana da el mismo resultado: el precio más actual,
      // hasta que el usuario elija otro mes desde "Mi Cómputo".
      state.computoCart.push({
        id: item.id,
        denominacion: item.denominacion,
        rubro: item.rubro,
        unit: unit,
        qty: qty,
        type: 'material',
        mode: state.pricingMode
      });
    }

    saveCart();
    updateCartUI();
    showToast(`+${qty} ${unit} agregado: ${item.denominacion.substring(0, 24)}...`);

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

  function changeCardQty(itemId, delta) {
    const input = document.getElementById(`qty-${itemId}`);
    if (input) {
      let val = parseInt(input.value, 10) || 1;
      val = Math.max(1, val + delta);
      input.value = val;
    }
  }

  function updateItemQtyInCart(index, newQty) {
    if (newQty <= 0) {
      state.computoCart.splice(index, 1);
    } else {
      state.computoCart[index].qty = newQty;
    }
    saveCart();
    updateCartUI();
  }

  function removeCartItem(index) {
    state.computoCart.splice(index, 1);
    saveCart();
    updateCartUI();
  }

  function clearComputoCart() {
    if (state.computoCart.length === 0) return;
    if (confirm('¿Deseas vaciar todo tu cómputo de materiales?')) {
      state.computoCart = [];
      saveCart();
      updateCartUI();
      showToast('Cómputo vaciado');
    }
  }

  function saveCart() {
    localStorage.setItem('nexobra_computo', JSON.stringify(state.computoCart));
  }

  function computeCartSubtotals() {
    const resolved = state.computoCart.map(item => ({ item, pricing: resolveItemPricing(item, state.computoMonth) }));
    const materiales = resolved.filter(r => (r.item.type || 'material') === 'material');
    const manoDeObra = resolved.filter(r => r.item.type === 'labor');
    const subtotalMateriales = materiales.reduce((sum, r) => sum + (r.item.qty * r.pricing.unitPrice), 0);
    const subtotalManoObra = manoDeObra.reduce((sum, r) => sum + (r.item.qty * r.pricing.unitPrice), 0);
    return { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total: subtotalMateriales + subtotalManoObra };
  }

  /**
   * Separa el carrito en grupos por corralón elegido (providerBranchId) más
   * un resto "sin proveedor asignado" (referencia NEXOBRA o mano de obra).
   * Conserva el índice original de cada ítem en state.computoCart, porque
   * eliminar/editar cantidad sigue operando por índice sobre ese array plano.
   */
  function groupCartByProvider() {
    const groups = {};
    const order = [];
    const sinProveedor = [];
    state.computoCart.forEach((item, idx) => {
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

  function buildProviderWhatsappUrl(group) {
    let text = `Hola! Te escribo desde NEXOBRA para pedirte presupuesto de estos materiales:\n\n`;
    group.items.forEach(({ item }) => {
      text += `• ${item.denominacion} — ${item.qty} ${item.unit}\n`;
    });
    text += `\n¿Me pasás precio y disponibilidad? Gracias!`;
    const digits = (group.whatsapp || '').replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  function renderCartItemRow(item, idx) {
    const pricing = resolveItemPricing(item, state.computoMonth);
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
                ? `<div style="font-size: 0.74rem; color: var(--text-subtle);">${formatMoney(pricing.unitPrice)}/${item.unit}</div>
                   ${pricing.basePrice ? `<div class="cart-price-trace">Base ${formatMoney(pricing.basePrice)} · × ${formatFactor(pricing.factor || 1)}</div>` : ''}
                   <div class="computo-item-subtotal">${formatMoney(subtotal)}</div>`
                : `<div style="font-size: 0.74rem; color: #b91c1c;">Sin dato para este mes</div>`
              }
          </div>
        </div>
      </div>
    `;
  }

  function updateCartUI() {
    const { subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();

    headerCartCount.textContent = state.computoCart.length;
    drawerTotalItems.textContent = state.computoCart.length;
    drawerSubtotal.textContent = formatMoney(subtotalMateriales);
    drawerTotal.textContent = formatMoney(total);

    const laborRow = document.getElementById('drawer-subtotal-labor-row');
    const laborValue = document.getElementById('drawer-subtotal-labor');
    if (laborRow && laborValue) {
      laborRow.style.display = subtotalManoObra > 0 ? 'flex' : 'none';
      laborValue.textContent = formatMoney(subtotalManoObra);
    }

    if (state.computoCart.length === 0) {
      drawerBody.innerHTML = `
        <div class="computo-empty-state">
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

    drawerBody.innerHTML = gruposHtml + sinProveedorHtml;
  }

  // --- PRINT / PDF EXPORT ---
  function printComputo() {
    if (state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();
    const dateStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
    const periodoPresupuesto = monthLabel(state.computoMonth);

    const filaMaterial = ({ item, pricing }) => `
      <tr>
        <td><strong>${item.id}</strong></td>
        <td>${item.denominacion}</td>
        <td>${item.rubro}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${formatMoney(pricing.unitPrice)}${pricing.basePrice ? `<br><small>Base ${formatMoney(pricing.basePrice)} · × ${formatFactor(pricing.factor || 1)}</small>` : ''}</td>
        <td style="text-align: right;"><strong>${formatMoney(item.qty * pricing.unitPrice)}</strong></td>
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
      <div class="subtotal-box">Subtotal Materiales: ${formatMoney(subtotalMateriales)}</div>
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
              <td>${formatMoney(pricing.unitPrice)}</td>
              <td style="text-align: right;"><strong>${formatMoney(item.qty * pricing.unitPrice)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="subtotal-box">Subtotal Mano de Obra: ${formatMoney(subtotalManoObra)}</div>
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
          Total Estimado: ${formatMoney(total)}
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
  function copyComputoToClipboard() {
    if (state.computoCart.length === 0) {
      alert('No hay ítems en tu cómputo para copiar.');
      return;
    }

    const { materiales, manoDeObra, subtotalMateriales, subtotalManoObra, total } = computeCartSubtotals();
    const periodoPresupuesto = monthLabel(state.computoMonth);

    let text = `🏗️ *NEXOBRA - Cómputo y Presupuesto*\n`;
    text += `📅 Emitido: ${new Date().toLocaleDateString('es-AR')} · Precios de: *${periodoPresupuesto}*\n\n`;

    if (materiales.length > 0) {
      text += `*MATERIALES*\n`;
      materiales.forEach(({ item, pricing }, index) => {
        text += `${index + 1}. *${item.denominacion}*\n`;
        text += `   Cant: ${item.qty} ${item.unit} | Unit: ${formatMoney(pricing.unitPrice)} | Subtotal: ${formatMoney(item.qty * pricing.unitPrice)}\n`;
      });
      text += `Subtotal Materiales: *${formatMoney(subtotalMateriales)}*\n\n`;
    }

    if (manoDeObra.length > 0) {
      text += `*MANO DE OBRA*\n`;
      manoDeObra.forEach(({ item, pricing }, index) => {
        text += `${index + 1}. *${item.denominacion}*\n`;
        text += `   Cant: ${item.qty} ${item.unit} | Unit: ${formatMoney(pricing.unitPrice)} | Subtotal: ${formatMoney(item.qty * pricing.unitPrice)}\n`;
      });
      text += `Subtotal Mano de Obra: *${formatMoney(subtotalManoObra)}*\n\n`;
    }

    text += `💰 *TOTAL ESTIMADO: ${formatMoney(total)}*\n`;
    text += `_Valores orientativos NEXOBRA, calculados a precios de ${periodoPresupuesto}. No incluyen impuestos, cargas sociales ni fletes. Confirmar disponibilidad y precio final con el proveedor._`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Cómputo copiado al portapapeles (Listo para WhatsApp)');
    }).catch(() => {
      alert('No se pudo copiar automáticamente.');
    });
  }

  // --- DRAWER TOGGLING ---
  function openDrawer() {
    computoDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    computoDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ==========================================================================
  // EXCEL BULK PROCESSOR (ETAPA 3)
  // ==========================================================================

  function openExcelModal() {
    excelModal.classList.add('open');
    excelModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeExcelModal() {
    excelModal.classList.remove('open');
    excelModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function getActiveFactor() {
    const val = excelTargetDate.value;
    if (val === 'custom') {
      return parseFloat(customFactorInput.value) || 1.0;
    }
    return parseFloat(val) || 1.0;
  }

  function getSelectedDateLabel() {
    const opt = excelTargetDate.options[excelTargetDate.selectedIndex];
    if (excelTargetDate.value === 'custom') {
      return `Personalizado (x${getActiveFactor()})`;
    }
    return opt.text.split('(')[0].trim();
  }

  function handleExcelFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
      handleExcelFile(e.target.files[0]);
    }
  }

  function handleExcelFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        processRawExcelData(jsonData);
      } catch (err) {
        alert('Error al leer el archivo Excel. Asegurate de que sea un formato .xlsx o .csv válido.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processRawExcelData(rows) {
    if (!rows || rows.length < 2) {
      alert('El archivo no contiene filas de datos suficientes.');
      return;
    }

    const header = rows[0].map(h => normalizeText(h));
    let descIdx = header.findIndex(h => h.includes('material') || h.includes('denominacion') || h.includes('descripcion') || h.includes('item') || h.includes('nombre') || h.includes('producto'));
    let qtyIdx = header.findIndex(h => h.includes('cant') || h.includes('cantidad') || h.includes('unidades'));
    let codeIdx = header.findIndex(h => h.includes('codigo') || h.includes('id') || h.includes('cod'));

    if (descIdx === -1) descIdx = 0;
    if (qtyIdx === -1) qtyIdx = descIdx === 0 ? 1 : 0;

    const processed = [];
    const factor = getActiveFactor();
    const mode = excelPricingMode.value;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || (!row[descIdx] && !row[codeIdx])) continue;

      const requestedCode = codeIdx > -1 && row[codeIdx] ? row[codeIdx].toString().trim() : '';
      const requestedDesc = row[descIdx] ? row[descIdx].toString().trim() : '';
      let qty = qtyIdx > -1 && row[qtyIdx] ? parseFloat(row[qtyIdx]) || 1 : 1;

      const matchResult = findBestMaterialMatch(requestedCode, requestedDesc);

      let matchedItem = matchResult.item;
      let status = matchResult.status;
      let unitPriceBase = 0;
      let unit = '-';
      let unitPriceUpdated = 0;
      let subtotal = 0;

      if (matchedItem) {
        unitPriceBase = mode === 'venta' ? matchedItem.precioVenta : matchedItem.precioComputo;
        unit = mode === 'venta' ? matchedItem.unidadVenta : matchedItem.unidadComputo;
        unitPriceUpdated = unitPriceBase * factor;
        subtotal = qty * unitPriceUpdated;
      }

      processed.push({
        requestedName: requestedDesc || requestedCode,
        requestedQty: qty,
        matchedItem: matchedItem,
        status: status,
        unit: unit,
        unitPrice: unitPriceUpdated,
        subtotal: subtotal
      });
    }

    state.excelProcessedRows = processed;
    renderExcelPreview();
    showToast(`✓ Se procesaron ${processed.length} materiales del Excel`);
  }

  function findBestMaterialMatch(code, text) {
    if (code) {
      const exactCode = NEXOBRA_DATA.find(i => normalizeText(i.id) === normalizeText(code));
      if (exactCode) return { item: exactCode, status: 'matched' };
    }

    if (!text) return { item: null, status: 'notfound' };

    const normText = normalizeText(text);
    const exactName = NEXOBRA_DATA.find(i => normalizeText(i.denominacion) === normText);
    if (exactName) return { item: exactName, status: 'matched' };

    const searchWords = normText.split(' ').filter(w => w.length > 2);
    let bestMatch = null;
    let highestScore = 0;

    NEXOBRA_DATA.forEach(item => {
      let score = 0;
      const normItemTitle = normalizeText(item.denominacion);
      const normRubro = normalizeText(item.rubro);
      const normCat = normalizeText(item.categoria);
      const allTags = item.tags.map(t => normalizeText(t)).join(' ');

      searchWords.forEach(word => {
        if (normItemTitle.includes(word)) score += 3;
        if (allTags.includes(word)) score += 2;
        if (normCat.includes(word) || normRubro.includes(word)) score += 1;
      });

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    });

    if (highestScore >= 4 && bestMatch) {
      return { item: bestMatch, status: 'matched' };
    } else if (highestScore >= 2 && bestMatch) {
      return { item: bestMatch, status: 'suggested' };
    }

    return { item: null, status: 'notfound' };
  }

  function recalculateExcelRows() {
    const factor = getActiveFactor();
    const mode = excelPricingMode.value;

    state.excelProcessedRows.forEach(row => {
      if (row.matchedItem) {
        const unitPriceBase = mode === 'venta' ? row.matchedItem.precioVenta : row.matchedItem.precioComputo;
        row.unit = mode === 'venta' ? row.matchedItem.unidadVenta : row.matchedItem.unidadComputo;
        row.unitPrice = unitPriceBase * factor;
        row.subtotal = row.requestedQty * row.unitPrice;
      }
    });

    renderExcelPreview();
  }

  function renderExcelPreview() {
    excelResultsContainer.style.display = 'block';
    const totalSum = state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);
    const matchedCount = state.excelProcessedRows.filter(r => r.matchedItem).length;

    excelStatsText.innerHTML = `
      <strong>${matchedCount}</strong> de <strong>${state.excelProcessedRows.length}</strong> ítems cotizados 
      | Total Estimado: <strong style="color: var(--brand-yellow);">${formatMoney(totalSum)}</strong>
    `;

    excelPreviewTbody.innerHTML = state.excelProcessedRows.map(row => {
      let statusHtml = '';
      if (row.status === 'matched') {
        statusHtml = `<span class="match-status-badge status-matched">✓ Coincidencia exacta</span>`;
      } else if (row.status === 'suggested') {
        statusHtml = `<span class="match-status-badge status-suggested">⚠ Sugerido por tag</span>`;
      } else {
        statusHtml = `<span class="match-status-badge status-notfound">✕ No encontrado</span>`;
      }

      return `
        <tr>
          <td>${statusHtml}</td>
          <td><strong>${row.requestedName}</strong></td>
          <td>
            ${row.matchedItem 
              ? `<span style="font-size: 0.82rem; color: var(--brand-dark); font-weight: 600;">[${row.matchedItem.id}] ${row.matchedItem.denominacion}</span>` 
              : `<span style="color: var(--text-subtle); font-style: italic;">Sin precio de referencia</span>`}
          </td>
          <td>${row.requestedQty} ${row.unit}</td>
          <td>${row.matchedItem ? formatMoney(row.unitPrice) : '-'}</td>
          <td style="text-align: right;"><strong>${row.matchedItem ? formatMoney(row.subtotal) : '-'}</strong></td>
        </tr>
      `;
    }).join('');
  }

  function generateTemplateExcel() {
    const ws_data = [
      ["Código (Opcional)", "Material o Descripción", "Cantidad Requerida"],
      ["BL-003", "Cemento Portland Loma Negra 50kg", 20],
      ["BG-001", "Arena gruesa 6m3", 2],
      ["ARN-002", "Hierro torsionado del 8 ADN420", 35],
      ["CS-001", "Placa Durlock 12.5mm", 15],
      ["CVLH-002", "Ladrillos huecos 12x18x25", 800],
      ["CAH-012", "Membrana asfáltica 35kg", 4],
      ["", "Inodoro blanco Ferrum Bari", 2]
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales_NEXOBRA");
    XLSX.writeFile(wb, "Plantilla_Materiales_NEXOBRA.xlsx");
    showToast('Plantilla descargada con éxito');
  }

  function exportProcessedExcel() {
    if (state.excelProcessedRows.length === 0) {
      alert('No hay datos procesados para exportar.');
      return;
    }

    const dateLabel = getSelectedDateLabel();
    const modeLabel = excelPricingMode.value === 'venta' ? 'Venta Comercial' : 'Cómputo Métrico';
    const totalPrice = state.excelProcessedRows.reduce((sum, r) => sum + r.subtotal, 0);

    const exportData = [
      ["NEXOBRA - Cómputo y Cotización Masiva de Materiales"],
      [`Fecha/Mes de Cotización: ${dateLabel}`, `Modalidad: ${modeLabel}`, `Generado: ${new Date().toLocaleDateString('es-AR')}`],
      [],
      ["Código", "Material Solicitado", "Material Asignado (NEXOBRA)", "Rubro", "Cantidad", "Unidad", "Precio Unitario Actualizado (ARS)", "Subtotal (ARS)", "Estado Coincidencia"]
    ];

    state.excelProcessedRows.forEach(row => {
      exportData.push([
        row.matchedItem ? row.matchedItem.id : "S/D",
        row.requestedName,
        row.matchedItem ? row.matchedItem.denominacion : "No encontrado en base",
        row.matchedItem ? row.matchedItem.rubro : "-",
        row.requestedQty,
        row.unit,
        row.matchedItem ? row.unitPrice : 0,
        row.matchedItem ? row.subtotal : 0,
        row.status === 'matched' ? 'Coincidencia exacta' : (row.status === 'suggested' ? 'Sugerido por Tags' : 'No encontrado')
      ]);
    });

    exportData.push([]);
    exportData.push(["", "", "", "", "", "", "TOTAL GENERAL:", totalPrice, "ARS"]);

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 35 }, { wch: 40 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 22 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotizacion_NEXOBRA");
    XLSX.writeFile(wb, `Cotizacion_NEXOBRA_${dateLabel.replace(/\s+/g, '_')}.xlsx`);
    showToast('✓ Archivo Excel cotizado descargado exitosamente');
  }

  // --- PUBLIC API EXPOSURE ---
  window.nexoBraApp = {
    switchView,
    addToComputo,
    changeCardQty,
    updateItemQtyInCart,
    removeCartItem,
    clearCatalogSearch,
    addLaborToComputo,
    changeLaborQty,
    openComputation,
    duplicateComputation,
    deleteComputation,
    addOfferFromSearch,
    updateOfferPrice,
    updateOfferStock,
    deleteOffer,
    openOfferPicker,
    chooseProviderOffer
  };

  document.addEventListener('DOMContentLoaded', init);

})();
