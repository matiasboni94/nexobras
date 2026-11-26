// NEXOBRA - cuenta.js
// ============================================================================
// (24/11) MI CUENTA: configuración inicial y avisos por mail. La primera vez
// que alguien entra con su cuenta se le abre esta pantalla (/mi-cuenta) para
// cualquier tipo de usuario: cómo va a usar NEXOBRA (usuario, técnico u
// oficio, proveedor de materiales, prestador de servicios), sus datos y los
// avisos por mail, que acepta tildándolos (vienen destildados). Después queda
// en el menú de la cuenta para cambiarla cuando quiera.
// Base de datos: migración 046 (profiles.perfil / onboarding_at, avisos_prefs y
// la función perfil_elegir_rol). Si la 046 todavía no se corrió, nada de esto
// se activa y sigue el cartel de rol de siempre.
// ============================================================================
import * as Auth from './auth.js';
import * as ST from './state.js';
import { esRubroOficio } from './modo.js';

const esc = (t) => ST.escapeHtml(String(t ?? ''));
// (26/11, paquete 2) Perfiles: usuario, oficio, profesional y comercio. Tener una ficha
// para recibir pedidos es un agregado que pueden sumar oficio y profesional.
const PERFILES = [
 ['particular', 'Usuario', 'Quiero buscar materiales, comparar precios y contactar proveedores o prestadores.'],
 ['oficio', 'Oficio', 'Trabajo en obra: albañil, electricista, plomero, pintor… (oficial o ayudante).'],
 ['profesional', 'Profesional o técnico', 'Ingeniero/a, arquitecto/a, maestro mayor de obras o técnico constructor.'],
 ['materiales', 'Comercio de materiales', 'Tengo un corralón, ferretería, pinturería u otro comercio.']
];
const RUBROS_PROF = ['Ingeniero/a civil', 'Ingeniero/a (otra especialidad)', 'Arquitecto/a', 'Maestro mayor de obras', 'Técnico/a constructor', 'Estudiante'];
const RUBROS_OFICIO = ['Albañil', 'Electricista', 'Plomero / gasista', 'Pintor', 'Herrero', 'Carpintero', 'Construcción en seco', 'Techista', 'Otro oficio'];
const CATEGORIAS = [['oficial_especializado', 'Oficial especializado'], ['oficial', 'Oficial'], ['medio_oficial', 'Medio oficial'], ['ayudante', 'Ayudante']];
// Nombres orientativos para autocompletar (a validar con cada colegio)
const COLEGIOS = ['Consejo Profesional de Ingeniería de Misiones (CPIM)', 'Colegio de Arquitectos de Misiones', 'Consejo Profesional de Técnicos de Misiones'];
const ESTADO_MAT = { sin_validar: 'Sin verificar todavía', validada: 'Verificada', rechazada: 'No la pudimos verificar' };
const ACCESO = { solicitado: 'Pediste acceso a la versión profesional: lo estamos revisando.', aprobado: 'Tenés acceso a la versión profesional.', revocado: 'Tu acceso a la versión profesional fue dado de baja. Escribinos si querés revisarlo.' };
const ORIGENES = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['whatsapp', 'Un grupo o mensaje de WhatsApp'], ['recomendacion', 'Me lo recomendó alguien'], ['proveedor', 'Un corralón / proveedor me lo mencionó'], ['buscador', 'Buscando en Google / internet'], ['prensa', 'Diario, radio o TV'], ['colegio', 'Colegio profesional o una charla'], ['otro', 'Otro']];

const S = { disponible: null, pendiente: false, perfil: '', ficha: false, prefs: { email_pedidos: false, email_mis_trabajos: false }, cargado: false, guardando: false, volverA: 'home', error: '' };

/** ¿Hay que mostrarle la configuración inicial? null si la 046 no está corrida. */
export async function cuentaPendiente() {
 if (!ST.supabaseClient || !ST.authState.user) return null;
 const { data, error } = await ST.supabaseClient.from('profiles').select('perfil, onboarding_at').eq('id', ST.authState.user.id).maybeSingle();
 if (error || !data) { S.disponible = false; return null; }
 S.disponible = true;
 S.perfil = data.perfil || '';
 if (ST.authState.profile) ST.authState.profile.perfil = data.perfil || null; // (24/11) lo usa la guía
 S.pendiente = !data.onboarding_at;
 return S.pendiente;
}

/** La abre la primera vez, recordando a qué vista volver. */
export function abrirConfiguracionInicial() {
 const actual = ST.state.currentView;
 if (actual === 'cuenta') return;
 S.volverA = actual && actual !== 'home' ? actual : 'home';
 window.nexoBraApp?.switchView?.('cuenta');
}

export async function loadCuentaView() {
 const root = document.getElementById('cuenta-root');
 if (!root) return;
 if (!root.dataset.listo) {
 root.dataset.listo = '1';
 root.addEventListener('click', onClick);
 root.addEventListener('change', onChange);
 }
 if (!ST.authState.user) {
 root.innerHTML = '<div class="trb-vacio"><p>Para ver tu cuenta tenés que iniciar sesión.</p><button type="button" class="btn-computo" data-cta="login">Ingresar</button></div>';
 return;
 }
 root.innerHTML = '<p class="trb-muted">Cargando tu cuenta…</p>';
 await cuentaPendiente();
 if (!S.disponible) { root.innerHTML = '<p class="trb-muted">Esta sección todavía no está disponible.</p>'; return; }
 const { data: pr } = await ST.supabaseClient.from('avisos_prefs').select('email_pedidos, email_mis_trabajos').eq('user_id', ST.authState.user.id).maybeSingle();
 S.prefs = { email_pedidos: !!(pr && pr.email_pedidos), email_mis_trabajos: !!(pr && pr.email_mis_trabajos) };
 const pf = ST.authState.profile || {};
 S.ficha = pf.role === 'provider' || S.perfil === 'servicios';
 if (S.perfil === 'tecnico' || S.perfil === 'servicios') S.perfil = esRubroOficio(pf.rubro_habitual) && !pf.matricula ? 'oficio' : 'profesional';
 if (!S.perfil) {
 S.perfil = pf.role === 'provider' ? 'materiales' : pf.matricula ? 'profesional' : pf.rubro_habitual ? (esRubroOficio(pf.rubro_habitual) ? 'oficio' : 'profesional') : '';
 }
 if (S.perfil === 'materiales') S.ficha = true;
 S.cargado = true; S.error = '';
 render();
}

function render() {
 const root = document.getElementById('cuenta-root');
 if (!root || !S.cargado) return;
 const p = ST.authState.profile || {}, mail = ST.authState.user?.email || '';
 const trabaja = S.perfil === 'oficio' || S.perfil === 'profesional';
 const proveedor = S.perfil === 'materiales' || (trabaja && S.ficha);
 const ofreceServicios = trabaja && S.ficha;
 const nv = ST.authState.nivel || {};
 const rubros = S.perfil === 'oficio' ? RUBROS_OFICIO : RUBROS_PROF;
 root.innerHTML = `
 <div class="cta-head">
 <h2 class="catalog-title">${S.pendiente ? '¡Bienvenido! Completá tu cuenta' : 'Mi cuenta y avisos'}</h2>
 <p class="catalog-subtitle">${S.pendiente ? 'Son tres pasos y te lleva un minuto. Así te mostramos lo que te sirve. Lo podés cambiar cuando quieras desde el menú de tu cuenta.' : 'Cambiá cómo usás NEXOBRA, tus datos y qué avisos te mandamos por mail.'}</p>
 </div>
 <form class="cta-form" id="cuenta-form" novalidate>
 <section class="cta-card">
 <h3><span>1</span> ¿Cómo vas a usar NEXOBRA?</h3>
 <div class="cta-perfiles" role="radiogroup" aria-label="Perfil">
 ${PERFILES.map(([k, n, d]) => `<label class="cta-perfil${S.perfil === k ? ' on' : ''}"><input type="radio" name="cta-perfil" value="${k}"${S.perfil === k ? ' checked' : ''}><span><b>${esc(n)}</b><small>${esc(d)}</small></span></label>`).join('')}
 </div>
 </section>
 <section class="cta-card">
 <h3><span>2</span> Tus datos</h3>
 <div class="cta-campos">
 <label class="trb-campo" for="cta-nombre"><span>Nombre y apellido</span><input id="cta-nombre" type="text" maxlength="120" autocomplete="name" value="${esc(p.full_name || '')}" required></label>
 <label class="trb-campo" for="cta-localidad"><span>Localidad</span><input id="cta-localidad" type="text" maxlength="120" value="${esc(p.locality || 'Oberá')}"></label>
 <label class="trb-campo" for="cta-telefono"><span>WhatsApp</span><input id="cta-telefono" type="tel" maxlength="40" autocomplete="tel" placeholder="Ej: 3755 412345" value="${esc(p.phone || '')}"><small>Solo se lo pasamos a quien elijas (o a quien te elija) en Pedí presupuesto.</small></label>
 ${!p.referral_source ? `<label class="trb-campo" for="cta-origen"><span>¿Cómo nos conociste?</span><select id="cta-origen"><option value="">Elegí una opción</option>${ORIGENES.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>` : ''}
 ${trabaja ? `
 <label class="trb-campo" for="cta-rubro"><span>Tu rubro</span><select id="cta-rubro"><option value="">Elegí tu rubro</option>${rubros.map(r => `<option${(p.rubro_habitual || '') === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>` : ''}
 ${S.perfil === 'oficio' ? `
 <label class="trb-campo" for="cta-categoria"><span>Categoría (UOCRA)</span><select id="cta-categoria"><option value="">Elegí tu categoría</option>${CATEGORIAS.map(([k, n]) => `<option value="${k}"${(nv.categoria_uocra || p.categoria_uocra || '') === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
 ${S.perfil === 'profesional' ? `
 <label class="trb-campo" for="cta-matricula"><span>Matrícula</span><input id="cta-matricula" type="text" maxlength="60" placeholder="Ej: MP 1234" value="${esc(p.matricula || '')}"><small>La verificamos con el padrón de tu colegio o consejo.</small></label>
 <label class="trb-campo" for="cta-colegio"><span>Colegio o consejo</span><input id="cta-colegio" type="text" maxlength="120" list="cta-colegios" value="${esc(nv.colegio || p.colegio || '')}"><datalist id="cta-colegios">${COLEGIOS.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>` : ''}
 </div>
 ${trabaja ? `<label class="cta-aviso cta-ficha" for="cta-ficha"><input id="cta-ficha" type="checkbox"${S.ficha ? ' checked' : ''}><span><b>Quiero recibir pedidos de trabajo</b><small>Armás tu ficha de prestador (aparece en el mapa y en el directorio cuando la revisamos) y te pueden pedir presupuesto.</small></span></label>` : ''}
 ${trabaja && !S.pendiente && !nv.sinMigracion ? renderNivel(nv) : ''}
 ${proveedor ? `<p class="cta-nota">Después de guardar te llevamos a <b>Mi proveedor</b> para que cargues la ficha de tu ${S.perfil === 'materiales' ? 'comercio' : 'servicio'}: rubro, CUIT, dirección y horarios. Aparece en el mapa cuando la revisamos.</p>` : ''}
 </section>
 <section class="cta-card">
 <h3><span>3</span> Avisos por mail</h3>
 <p class="trb-muted">Te escribimos a <b>${esc(mail)}</b> solo por lo que tildes. Vienen apagados.</p>
 <div class="cta-avisos">
 <label class="cta-aviso" for="cta-av-mis"><input id="cta-av-mis" type="checkbox"${S.prefs.email_mis_trabajos ? ' checked' : ''}><span><b>Mis pedidos de presupuesto</b><small>Cuando te llega una oferta o te eligen para un trabajo.</small></span></label>
 ${ofreceServicios ? `<label class="cta-aviso" for="cta-av-pedidos"><input id="cta-av-pedidos" type="checkbox"${S.prefs.email_pedidos ? ' checked' : ''}><span><b>Pedidos nuevos de mi rubro</b><small>Cuando un vecino de la zona publica un trabajo para tu oficio.</small></span></label>` : ''}
 </div>
 <p class="trb-chico trb-muted">Al tildar un aviso aceptás recibir esos mails. Los apagás cuando quieras desde esta misma pantalla, y cada mail trae el link para hacerlo.</p>
 </section>
 ${S.error ? `<p class="trb-aviso" role="alert">${esc(S.error)}</p>` : ''}
 <div class="cta-botones">
 <button type="submit" class="btn-computo" id="cta-guardar"${S.guardando ? ' disabled' : ''}>${S.guardando ? 'Guardando…' : S.pendiente ? 'Guardar y empezar' : 'Guardar cambios'}</button>
 ${S.pendiente ? '<button type="button" class="casa-link" data-cta="despues">Completar después</button>' : ''}
 </div>
 </form>`;
 const form = document.getElementById('cuenta-form');
 if (form) form.addEventListener('submit', (e) => { e.preventDefault(); guardar(); });
}

/** Estado de la matrícula y de la versión profesional de la Calculadora. */
function renderNivel(nv) {
 const p = ST.authState.profile || {};
 const partes = [];
 if (S.perfil === 'profesional' && p.matricula) {
 const vence = nv.matricula_estado === 'validada' && nv.matricula_vence ? ` hasta el ${new Date(String(nv.matricula_vence).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')}` : '';
 partes.push(`<p><b>Matrícula:</b> ${esc(ESTADO_MAT[nv.matricula_estado] || 'Sin verificar todavía')}${vence}.</p>`);
 }
 if (nv.nivel === 'completo') partes.push('<p>Usás la <b>versión profesional</b> de la Calculadora: rendimientos, desperdicio, Factor K, fases y el rango de mercado de la mano de obra.</p>');
 else {
 partes.push('<p>Usás la <b>versión simple</b> de la Calculadora. La profesional se habilita con la matrícula verificada' + (S.perfil === 'oficio' ? ', o pidiendo acceso.' : '. Si todavía no la tenés al día, podés pedir acceso.') + '</p>');
 if (ACCESO[nv.acceso_pro]) partes.push(`<p>${esc(ACCESO[nv.acceso_pro])}</p>`);
 else partes.push('<button type="button" class="btn-action-drawer" data-cta="acceso">Pedir acceso a la versión profesional</button>');
 }
 return `<div class="cta-nivel">${partes.join('')}</div>`;
}

async function pedirAcceso() {
 const { error } = await ST.supabaseClient.rpc('pedir_acceso_pro');
 if (error) { ST.showToast('No se pudo enviar el pedido. Probá de nuevo en un rato.'); return; }
 ST.showToast('Listo: te avisamos cuando lo revisemos.');
 await Auth.refreshAuthUI();
 render();
}

const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : null; };
const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : null; };

async function guardar() {
 const p = ST.authState.profile || {};
 const nombre = val('cta-nombre');
 if (!S.perfil) { S.error = 'Elegí cómo vas a usar NEXOBRA.'; render(); return; }
 if (!nombre) { S.error = 'Escribí tu nombre.'; render(); return; }
 const prefs = { email_mis_trabajos: !!chk('cta-av-mis'), email_pedidos: chk('cta-av-pedidos') === null ? S.prefs.email_pedidos : !!chk('cta-av-pedidos') };
 const datos = { full_name: nombre, locality: val('cta-localidad') || null, phone: val('cta-telefono') || null, perfil: S.perfil, onboarding_at: new Date().toISOString() };
 if (val('cta-rubro') !== null) datos.rubro_habitual = val('cta-rubro') || null;
 if (val('cta-matricula') !== null) datos.matricula = val('cta-matricula') || null;
 if (val('cta-colegio') !== null) datos.colegio = val('cta-colegio') || null;
 if (val('cta-categoria') !== null) datos.categoria_uocra = val('cta-categoria') || null;
 if (val('cta-origen')) datos.referral_source = val('cta-origen');
 if (chk('cta-ficha') !== null) S.ficha = chk('cta-ficha');
 const trabaja = S.perfil === 'oficio' || S.perfil === 'profesional';
 const proveedor = S.perfil === 'materiales' || (trabaja && S.ficha);
 // Rol: proveedor si vende o presta servicios; si no, queda como estaba (nunca se baja a un proveedor)
 const rol = proveedor ? 'provider' : (p.role === 'provider' || p.role === 'admin' ? null : 'user');
 S.guardando = true; S.error = ''; render();
 try {
 if (rol && (rol !== p.role || p.role_confirmed === false)) {
 const { error } = await ST.supabaseClient.rpc('perfil_elegir_rol', { p_rol: rol });
 if (error) throw error;
 }
 let { error: e1 } = await ST.supabaseClient.from('profiles').update(datos).eq('id', ST.authState.user.id);
 if (e1 && ['PGRST204', '42703', '23514'].includes(e1.code)) {
 // sin la migración 048: perfiles y columnas de antes
 const viejo = { ...datos, perfil: S.perfil === 'oficio' ? (S.ficha ? 'servicios' : 'tecnico') : S.perfil === 'profesional' ? (S.ficha ? 'servicios' : 'tecnico') : S.perfil };
 delete viejo.colegio; delete viejo.categoria_uocra;
 ({ error: e1 } = await ST.supabaseClient.from('profiles').update(viejo).eq('id', ST.authState.user.id));
 }
 if (e1) throw e1;
 const { error: e2 } = await ST.supabaseClient.from('avisos_prefs').upsert({ user_id: ST.authState.user.id, ...prefs }, { onConflict: 'user_id' });
 if (e2) throw e2;
 } catch (err) {
 S.guardando = false; S.error = 'No se pudo guardar. Probá de nuevo en un rato.'; console.error('[NEXOBRA] cuenta:', err); render(); return;
 }
 const eraPendiente = S.pendiente;
 S.guardando = false; S.pendiente = false; S.prefs = prefs;
 await Auth.refreshAuthUI();
 if (proveedor && eraPendiente) {
 ST.showToast('¡Listo! Ahora cargá la ficha de tu ' + (S.perfil === 'materiales' ? 'comercio.' : 'trabajo.'));
 window.nexoBraApp?.switchView?.('provider');
 } else if (eraPendiente) {
 ST.showToast('¡Listo! Ya podés usar NEXOBRA.');
 window.nexoBraApp?.switchView?.(S.volverA || 'home');
 } else {
 ST.showToast('Guardamos los cambios.');
 render();
 }
}

async function completarDespues() {
 await ST.supabaseClient.from('profiles').update({ onboarding_at: new Date().toISOString() }).eq('id', ST.authState.user.id);
 S.pendiente = false;
 window.nexoBraApp?.switchView?.(S.volverA || 'home');
}

function onClick(e) {
 const b = e.target.closest('[data-cta]');
 if (!b) return;
 if (b.dataset.cta === 'despues') completarDespues();
 if (b.dataset.cta === 'acceso') pedirAcceso();
 if (b.dataset.cta === 'login') { Auth.showAuthTab('login'); Auth.openAuthModal(); }
}
function onChange(e) {
 if (e.target.name === 'cta-perfil') {
 // se conserva lo que ya escribió antes de redibujar
 const p = ST.authState.profile || (ST.authState.profile = {});
 ['full_name:cta-nombre', 'locality:cta-localidad', 'phone:cta-telefono', 'rubro_habitual:cta-rubro', 'matricula:cta-matricula', 'colegio:cta-colegio', 'categoria_uocra:cta-categoria'].forEach(par => { const [k, id] = par.split(':'); const v = val(id); if (v !== null) p[k] = v; });
 const f = chk('cta-ficha'); if (f !== null) S.ficha = f;
 // el rubro de un perfil no vale para el otro
 if ((e.target.value === 'oficio') !== esRubroOficio(p.rubro_habitual)) p.rubro_habitual = '';
 const m = chk('cta-av-mis'); if (m !== null) S.prefs.email_mis_trabajos = m;
 const q = chk('cta-av-pedidos'); if (q !== null) S.prefs.email_pedidos = q;
 S.perfil = e.target.value;
 if (S.perfil === 'materiales') S.ficha = true;
 render();
 }
 if (e.target.id === 'cta-ficha') { S.ficha = e.target.checked; keepAndRender(); }
}
function keepAndRender() {
 const p = ST.authState.profile || (ST.authState.profile = {});
 ['full_name:cta-nombre', 'locality:cta-localidad', 'phone:cta-telefono', 'rubro_habitual:cta-rubro', 'matricula:cta-matricula', 'colegio:cta-colegio', 'categoria_uocra:cta-categoria'].forEach(par => { const [k, id] = par.split(':'); const v = val(id); if (v !== null) p[k] = v; });
 const m = chk('cta-av-mis'); if (m !== null) S.prefs.email_mis_trabajos = m;
 const q = chk('cta-av-pedidos'); if (q !== null) S.prefs.email_pedidos = q;
 render();
}
