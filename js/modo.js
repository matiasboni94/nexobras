// js/modo.js — El sitio se acomoda a quien lo usa.
// (24/11-f) Color de énfasis, menú, inicio y guía según el perfil de la cuenta.
// (25/11) Sin sesión, "visitante": busca precios y proveedores y los contacta
// por WhatsApp; la Calculadora, Mi presupuesto, cotizar Excel y sumar al
// presupuesto piden cuenta (se ven con candado y abren "Creá tu cuenta").
// La cuenta común se llama "usuario" (antes "vecino").
//
// Modos: visitante · usuario · oficio (oficial, ayudante: albañil, electricista…) ·
// profesional (ingeniero, arquitecto, MMO, técnico) · materiales (comercio).
// (26/11, paquete 2) Además, <html data-nivel> = "completo" | "simple": la Calculadora
// completa es para profesionales con matrícula verificada (o acceso aprobado por el
// admin); el resto usa la simple. Sale de la función mi_nivel() (migración 048).
// En el HTML: data-modos="usuario tecnico" muestra el elemento solo en esos
// modos y data-cuenta marca lo que pide cuenta (style.css + este módulo).
import * as ST from './state.js';
import * as Auth from './auth.js';

export const MODOS = ['visitante', 'usuario', 'oficio', 'profesional', 'materiales'];
const NOMBRE = { oficio: 'Oficio', profesional: 'Profesional', materiales: 'Comercio' };
const NOMBRE_LARGO = { oficio: 'oficio (oficial, ayudante)', profesional: 'profesional o técnico', materiales: 'comercio de materiales' };
// Rubros que son oficio (el resto de los rubros de Mi cuenta son profesionales)
const RUBROS_OFICIO = ['albañil', 'electricista', 'plomero', 'gasista', 'pintor', 'herrero', 'carpintero', 'construcción en seco', 'techista', 'otro oficio', 'oficial', 'ayudante'];
export const esRubroOficio = (r) => { const t = String(r || '').toLowerCase(); return !!t && RUBROS_OFICIO.some(x => t.includes(x)); };
const CLAVE_USUARIO = 'nexobra_ver_como_usuario';
const GUIA = { visitante: 'visitante', usuario: 'usuario', oficio: 'proveedor', profesional: 'tecnico', materiales: 'proveedor' };
// Vistas que piden cuenta (el link compartido de un presupuesto sigue abierto)
const VISTAS_CON_CUENTA = { apu: 'usar la Calculadora de Obra', 'my-apu-budgets': 'ver tus presupuestos', 'my-computations': 'ver tus listas' };

let modoCuenta = 'visitante';  // el que corresponde a la cuenta
let ultimo = null;             // el último modo pintado en esta carga de la página
let authListo = false;         // ya se sabe si hay sesión
let pendiente = null;          // vista a la que quería ir antes de ingresar
let kindCache = { uid: null, kind: null };

function leerUsuario() { try { return localStorage.getItem(CLAVE_USUARIO) === '1'; } catch (e) { return false; } }
function guardarUsuario(v) { try { if (v) localStorage.setItem(CLAVE_USUARIO, '1'); else localStorage.removeItem(CLAVE_USUARIO); } catch (e) { /* sin storage */ } }

/** Rubro de la ficha (materiales / servicios) de un proveedor sin perfil elegido. */
async function kindDeMiFicha(uid) {
  if (kindCache.uid === uid) return kindCache.kind;
  let kind = null;
  try {
    const { data: prov } = await ST.supabaseClient.from('providers').select('category_id').eq('owner_id', uid).limit(1);
    const cat = prov && prov[0] && prov[0].category_id;
    if (cat != null) {
      const { data: c } = await ST.supabaseClient.from('provider_categories').select('kind').eq('id', cat).limit(1);
      kind = (c && c[0] && c[0].kind) || null;
    }
  } catch (e) { /* sin ficha o sin permiso: queda null */ }
  kindCache = { uid, kind };
  return kind;
}

/** Modo que corresponde a la cuenta (sin contar "ver como usuario"). */
export async function modoDeCuenta() {
  const u = ST.authState.user, p = ST.authState.profile;
  if (!u) return 'visitante';
  if (!p) return 'usuario';
  if (p.perfil === 'oficio' || p.perfil === 'profesional' || p.perfil === 'materiales') return p.perfil;
  if (p.perfil === 'particular') return 'usuario';
  // valores viejos (046): 'tecnico' y 'servicios' se reparten según el rubro
  if (p.perfil === 'tecnico' || p.perfil === 'servicios') return esRubroOficio(p.rubro_habitual) && !p.matricula ? 'oficio' : 'profesional';
  if (p.role === 'provider') {
    if ((await kindDeMiFicha(u.id)) !== 'services') return 'materiales';
    return esRubroOficio(p.rubro_habitual) && !p.matricula ? 'oficio' : 'profesional';
  }
  if (p.matricula) return 'profesional';
  if (p.rubro_habitual) return esRubroOficio(p.rubro_habitual) ? 'oficio' : 'profesional';
  return 'usuario';
}

export function modoActual() { return document.documentElement.dataset.modo || 'visitante'; }
export function modoDeLaCuenta() { return modoCuenta; }
export function guiaDelModo() { return GUIA[modoActual()] || 'usuario'; }
export function esVisitante() { return authListo ? !ST.authState.user : false; }

/** true si esa vista pide cuenta y no hay sesión: abre "Creá tu cuenta" y guarda adónde iba. */
export function vistaBloqueada(vista) {
  if (!VISTAS_CON_CUENTA[vista] || !esVisitante()) return false;
  pedirCuenta(VISTAS_CON_CUENTA[vista], vista);
  return true;
}

/** Envuelve una función que pide cuenta (sumar al presupuesto, etc.). */
export function conCuenta(fn, motivo) {
  return function (...args) {
    if (esVisitante()) { pedirCuenta(motivo, 'apu'); return; }
    return fn.apply(this, args);
  };
}

// ---------------------------------------------------------------------------
// Cartel "Creá tu cuenta gratis"
// ---------------------------------------------------------------------------
function cartel() { return document.getElementById('cuenta-gate'); }
export function pedirCuenta(motivo, vista = null) {
  pendiente = vista;
  const m = cartel(), bd = document.getElementById('cuenta-gate-backdrop');
  if (!m) { Auth.showAuthTab('register'); Auth.openAuthModal(); return; }
  const t = m.querySelector('#cuenta-gate-motivo');
  if (t) t.textContent = motivo ? 'Para ' + motivo + ' necesitás una cuenta. Es gratis.' : 'Esto es para cuentas registradas. Es gratis.';
  m.classList.add('open'); bd?.classList.add('open');
  document.body.style.overflow = 'hidden';
  ST.logEvent?.('register_prompt', motivo || 'cuenta');
  setTimeout(() => m.querySelector('[data-gate="registro"]')?.focus(), 60);
}
function cerrarCartel(olvidar = true) {
  const m = cartel(), bd = document.getElementById('cuenta-gate-backdrop');
  m?.classList.remove('open'); bd?.classList.remove('open');
  document.body.style.overflow = '';
  if (olvidar) pendiente = null;
}

/** Nivel de herramientas de la cuenta (048). Sin la 048 queda "completo", como antes. */
async function cargarNivel() {
  if (!ST.authState.user || !ST.supabaseClient) { ST.authState.nivel = null; return null; }
  try {
    const { data, error } = await ST.supabaseClient.rpc('mi_nivel');
    if (error) { ST.authState.nivel = { nivel: 'completo', sinMigracion: true }; return ST.authState.nivel; }
    ST.authState.nivel = data || { nivel: 'simple' };
  } catch (e) { ST.authState.nivel = { nivel: 'completo', sinMigracion: true }; }
  return ST.authState.nivel;
}
export function nivelCalculadora() { return document.documentElement.dataset.nivel || 'simple'; }

/** Pinta el modo. Se llama desde refreshAuthUI (con y sin sesión). */
export async function aplicarModo() {
  authListo = true;
  modoCuenta = await modoDeCuenta();
  const nv = await cargarNivel();
  const comoUsuario = modoCuenta !== 'visitante' && modoCuenta !== 'usuario' && leerUsuario();
  const modo = comoUsuario ? 'usuario' : modoCuenta;
  const antes = ultimo; ultimo = modo;
  const html = document.documentElement;
  html.dataset.modo = modo;
  html.toggleAttribute('data-vista-usuario', comoUsuario);
  const nivelAntes = html.dataset.nivel;
  html.dataset.nivel = modo === 'visitante' ? 'simple' : (comoUsuario ? 'simple' : ((nv && nv.nivel) || 'simple'));
  if (nivelAntes && nivelAntes !== html.dataset.nivel && ST.state.currentView === 'apu') {
    window.nexoBraApp?.refrescarCalculadora?.();
  }
  // Para pintar el modo correcto desde el primer momento en la próxima visita (index.html)
  try { if (modo === 'visitante') localStorage.removeItem('nexobra_modo'); else localStorage.setItem('nexobra_modo', modo); } catch (e) { /* sin storage */ }

  // (26/11) Saludo de la portada
  const hola = document.getElementById('portada-hola');
  if (hola) {
    const nombre = String(ST.authState.profile?.full_name || '').trim().split(/\s+/)[0];
    hola.textContent = nombre ? `Hola, ${nombre}` : 'Hola';
  }

  // Insignia junto al botón de la cuenta (solo técnicos y negocios)
  const badge = document.getElementById('auth-modo-badge');
  if (badge) {
    const sinVerificar = modo === 'profesional' && nv && !nv.sinMigracion && nv.nivel !== 'completo';
    const txt = comoUsuario ? 'Vista usuario' : (NOMBRE[modo] ? NOMBRE[modo] + (sinVerificar ? ' · sin verificar' : '') : '');
    badge.textContent = txt;
    badge.hidden = !txt;
    badge.title = comoUsuario ? 'Estás viendo el sitio como un usuario. Desde tu cuenta volvés a tu vista.' : (txt ? 'El sitio está acomodado para tu perfil: ' + NOMBRE_LARGO[modo] : '');
  }
  // "Ver como usuario" en el menú de la cuenta, en el inicio y en el del celular
  const especial = !!NOMBRE[modoCuenta];
  const etiqueta = comoUsuario ? 'Volver a mi vista (' + NOMBRE[modoCuenta] + ')' : 'Ver el sitio como usuario';
  document.querySelectorAll('[data-accion-modo="usuario"]').forEach(b => {
    b.hidden = !especial;
    b.textContent = etiqueta;
    b.setAttribute('aria-pressed', comoUsuario ? 'true' : 'false');
  });
  const fila = document.getElementById('mobile-modo-row');
  if (fila) {
    fila.hidden = !especial;
    const t = fila.querySelector('.mobile-modo-texto');
    if (t) t.textContent = comoUsuario ? 'Estás viendo el sitio como usuario' : 'Menú para ' + (NOMBRE_LARGO[modo] || '');
  }

  if (antes !== modo) {
    // La guía sigue al modo. Sin cuenta, siempre la del visitante; con cuenta,
    // la del perfil salvo que la persona haya elegido otra a mano.
    let elegida = null;
    try { elegida = localStorage.getItem('nexobra_guia_perfil'); } catch (e) { /* sin storage */ }
    if (document.getElementById('guide-view')?.dataset.perfil && (modo === 'visitante' || !elegida)) window.nexoBraApp?.setGuidePerfil?.(GUIA[modo], false);
    // Técnicos y prestadores: los ajustes de obra (Factor K, fases) a la vista.
    if (html.dataset.nivel === 'completo' && modo === 'profesional') window.nexoBraApp?.toggleApuSettings?.(true);
  }

  // Sin cuenta en una vista que la pide (entró por link): al inicio + cartel.
  if (modo === 'visitante' && VISTAS_CON_CUENTA[ST.state.currentView]) {
    const v = ST.state.currentView;
    window.nexoBraApp?.switchView?.('home');
    pedirCuenta(VISTAS_CON_CUENTA[v], v);
  }
  // Recién ingresó desde el cartel: lo llevamos adonde quería ir.
  if (modo !== 'visitante' && pendiente) {
    const v = pendiente; pendiente = null;
    cerrarCartel(false);
    if (ST.state.currentView !== v) window.nexoBraApp?.switchView?.(v);
  }
}

/** Alterna "Ver como usuario" / "Volver a mi vista". */
export function alternarVistaUsuario() {
  const on = !leerUsuario();
  guardarUsuario(on);
  try { localStorage.removeItem('nexobra_guia_perfil'); } catch (e) { /* sin storage */ }
  aplicarModo().then(() => {
    ST.showToast?.(on ? 'Ahora ves el sitio como lo ve un usuario.' : 'Volviste a tu vista de ' + (NOMBRE_LARGO[modoCuenta] || 'siempre') + '.');
  });
}

let listo = false;
export function initModo() {
  if (listo) return; listo = true;
  if (!document.documentElement.dataset.modo) document.documentElement.dataset.modo = 'visitante';
  // Antes que los demás listeners: lo marcado con data-cuenta, sin sesión, abre el cartel.
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cuenta]');
    if (!c || !esVisitante()) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    document.getElementById('mobile-menu-panel')?.classList.remove('open');
    document.getElementById('mobile-menu-backdrop')?.classList.remove('open');
    pedirCuenta(c.dataset.cuenta || '', c.dataset.cuentaVista || null);
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion-modo="usuario"]');
    if (b) {
      e.preventDefault();
      const dd = document.getElementById('auth-dropdown');
      if (dd && b.closest('#auth-dropdown')) dd.style.display = 'none';
      alternarVistaUsuario();
      return;
    }
    const r = e.target.closest('[data-accion-modo="registro"]');
    if (r) { e.preventDefault(); pedirCuenta('', null); return; }
    const g = e.target.closest('[data-gate]');
    if (!g) return;
    if (g.dataset.gate === 'cerrar') { cerrarCartel(); return; }
    cerrarCartel(false);
    Auth.showAuthTab(g.dataset.gate === 'login' ? 'login' : 'register');
    Auth.openAuthModal();
  });
  document.getElementById('cuenta-gate-backdrop')?.addEventListener('click', () => cerrarCartel());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cartel()?.classList.contains('open')) cerrarCartel(); });
}
