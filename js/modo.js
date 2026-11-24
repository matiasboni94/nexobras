// js/modo.js — (24/11-f) El sitio se acomoda al perfil de la cuenta.
// Nada se bloquea: cambia el color de énfasis, qué entradas del menú y del
// inicio se ven primero y cuáles se esconden, y con qué perfil abre la guía.
// Sin cuenta, o como particular, el sitio se ve como siempre ("vecino").
// "Ver como cliente" vuelve a la vista común sin tocar la cuenta.
//
// Modos: vecino · tecnico · servicios (prestador de servicios / oficio) ·
// materiales (corralón, ferretería, proveedor de materiales).
// En el HTML: data-modos="vecino tecnico" muestra el elemento solo en esos
// modos (lo resuelve style.css con html[data-modo]).
import * as ST from './state.js';

export const MODOS = ['vecino', 'tecnico', 'servicios', 'materiales'];
const NOMBRE = { tecnico: 'Técnico', servicios: 'Prestador', materiales: 'Corralón' };
const NOMBRE_LARGO = { tecnico: 'técnico / profesional', servicios: 'prestador de servicios', materiales: 'corralón / proveedor de materiales' };
const CLAVE_CLIENTE = 'nexobra_ver_como_cliente';
const GUIA = { vecino: 'vecino', tecnico: 'tecnico', servicios: 'proveedor', materiales: 'proveedor' };

let modoCuenta = 'vecino';   // el que corresponde a la cuenta
let ultimo = null;           // el último modo pintado en esta carga de la página
let kindCache = { uid: null, kind: null };

function leerCliente() { try { return localStorage.getItem(CLAVE_CLIENTE) === '1'; } catch (e) { return false; } }
function guardarCliente(v) { try { if (v) localStorage.setItem(CLAVE_CLIENTE, '1'); else localStorage.removeItem(CLAVE_CLIENTE); } catch (e) { /* sin storage */ } }

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

/** Modo que corresponde a la cuenta (sin contar "ver como cliente"). */
export async function modoDeCuenta() {
  const u = ST.authState.user, p = ST.authState.profile;
  if (!u || !p) return 'vecino';
  if (p.perfil === 'tecnico' || p.perfil === 'servicios' || p.perfil === 'materiales') return p.perfil;
  if (p.perfil === 'particular') return 'vecino';
  if (p.role === 'provider') return (await kindDeMiFicha(u.id)) === 'services' ? 'servicios' : 'materiales';
  if (p.matricula || p.rubro_habitual) return 'tecnico';
  return 'vecino';
}

export function modoActual() { return document.documentElement.dataset.modo || 'vecino'; }
export function modoDeLaCuenta() { return modoCuenta; }
export function guiaDelModo() { return GUIA[modoActual()] || 'vecino'; }

/** Pinta el modo. Se llama desde refreshAuthUI (con y sin sesión). */
export async function aplicarModo() {
  modoCuenta = await modoDeCuenta();
  const cliente = modoCuenta !== 'vecino' && leerCliente();
  const modo = cliente ? 'vecino' : modoCuenta;
  const antes = ultimo; ultimo = modo;
  document.documentElement.dataset.modo = modo;
  document.documentElement.toggleAttribute('data-vista-cliente', cliente);
  // Para pintar el color correcto desde el primer momento en la próxima visita (index.html)
  try { if (modo === 'vecino') localStorage.removeItem('nexobra_modo'); else localStorage.setItem('nexobra_modo', modo); } catch (e) { /* sin storage */ }

  // Insignia junto al nombre
  const badge = document.getElementById('auth-modo-badge');
  if (badge) {
    const txt = cliente ? 'Vista cliente' : (NOMBRE[modo] || '');
    badge.textContent = txt;
    badge.hidden = !txt;
    badge.title = cliente ? 'Estás viendo el sitio como un cliente. Desde tu cuenta volvés a tu vista.' : (txt ? 'El sitio está acomodado para tu perfil: ' + NOMBRE_LARGO[modo] : '');
  }
  // "Ver como cliente" en el menú de la cuenta y en el del celular
  const etiqueta = cliente ? 'Volver a mi vista (' + NOMBRE[modoCuenta] + ')' : 'Ver el sitio como cliente';
  document.querySelectorAll('[data-accion-modo="cliente"]').forEach(b => {
    b.hidden = modoCuenta === 'vecino';
    b.textContent = etiqueta;
    b.setAttribute('aria-pressed', cliente ? 'true' : 'false');
  });
  const fila = document.getElementById('mobile-modo-row');
  if (fila) {
    fila.hidden = modoCuenta === 'vecino';
    const t = fila.querySelector('.mobile-modo-texto');
    if (t) t.textContent = cliente ? 'Estás viendo el sitio como cliente' : 'Menú para ' + (NOMBRE_LARGO[modo] || '');
  }

  // La guía sigue al modo, salvo que la persona haya elegido otra a mano.
  if (antes !== modo) {
    let elegida = null;
    try { elegida = localStorage.getItem('nexobra_guia_perfil'); } catch (e) { /* sin storage */ }
    if (!elegida && document.getElementById('guide-view')?.dataset.perfil) window.nexoBraApp?.setGuidePerfil?.(GUIA[modo], false);
    // Técnicos y prestadores: los ajustes de obra (Factor K, fases) a la vista.
    if (modo === 'tecnico' || modo === 'servicios') window.nexoBraApp?.toggleApuSettings?.(true);
    // Si está en una entrada que este modo esconde, no pasa nada: sigue viéndola.
  }
}

/** Alterna "Ver como cliente" / "Volver a mi vista". */
export function alternarVistaCliente() {
  const cliente = !leerCliente();
  guardarCliente(cliente);
  try { localStorage.removeItem('nexobra_guia_perfil'); } catch (e) { /* sin storage */ }
  aplicarModo().then(() => {
    ST.showToast?.(cliente ? 'Ahora ves el sitio como lo ve un cliente.' : 'Volviste a tu vista de ' + (NOMBRE_LARGO[modoCuenta] || 'siempre') + '.');
  });
}

let listo = false;
export function initModo() {
  if (listo) return; listo = true;
  if (!document.documentElement.dataset.modo) document.documentElement.dataset.modo = 'vecino';
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion-modo="cliente"]');
    if (!b) return;
    e.preventDefault();
    const dd = document.getElementById('auth-dropdown');
    if (dd && b.closest('#auth-dropdown')) dd.style.display = 'none';
    alternarVistaCliente();
  });
}
