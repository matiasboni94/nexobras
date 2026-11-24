// NEXOBRA - trabajos.js
// ============================================================================
// (24/11) "PEDÍ PRESUPUESTO" (prueba cerrada). Un vecino publica un trabajo
// cerrado (vereda, contrapiso, revoque, pintura...) con sus medidas. El precio
// de referencia sale de las APU del mes. Los prestadores de servicios aprobados
// ofertan un % por encima o por debajo de esa referencia. El vecino compara
// precio, plazo, reseñas y sellos, y elige.
// Base de datos: migración 045 (tablas trabajos / trabajo_ofertas y sus RPC).
// La composición de cada trabajo con APU es un borrador: a validar por Matías.
// ============================================================================
import * as Apu from './apu.js';
import * as Auth from './auth.js';
import * as ST from './state.js';

const esc = (t) => ST.escapeHtml(String(t ?? ''));
const f = (n, d = 1) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const PCT_MIN = -30, PCT_MAX = 50;

// Trabajos cerrados. apus: [id de APU, cantidad de APU por unidad del trabajo
// (o función de las medidas)]. oficio: palabras para reconocer el rubro del
// prestador (se comparan con el nombre de su categoría).
const ALB = ['albañil', 'albañiler', 'construc', 'maestro mayor', 'mmo', 'obra'];
const TRABAJOS = [
 { id: 'vereda', nombre: 'Vereda de hormigón', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 10], ['ancho', 'Ancho', 'm', 1.5]], cant: m => m.largo * m.ancho,
 apus: [[12, 1], [28, 2], [29, 1]],
 incluye: 'Limpieza y nivelación del terreno, contrapiso de hormigón (dos capas de 5 cm) y carpeta alisada.',
 noIncluye: 'Demoler la vereda vieja, rampas, cordón, raíces ni retiro de escombros.' },
 { id: 'contrapiso', nombre: 'Contrapiso', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 4], ['ancho', 'Ancho', 'm', 3]], cant: m => m.largo * m.ancho,
 apus: [[28, 1]], incluye: 'Contrapiso de hormigón pobre de 5 cm.', noIncluye: 'Relleno y compactación del suelo, film ni carpeta.' },
 { id: 'carpeta', nombre: 'Carpeta hidrófuga', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 4], ['ancho', 'Ancho', 'm', 3]], cant: m => m.largo * m.ancho,
 apus: [[29, 1]], incluye: 'Carpeta de 2 cm con hidrófugo.', noIncluye: 'El contrapiso de abajo ni el piso.' },
 { id: 'piso-ceramico', nombre: 'Piso cerámico', grupo: 'Albañilería', oficio: [...ALB, 'coloca'], unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 4], ['ancho', 'Ancho', 'm', 3]], cant: m => m.largo * m.ancho,
 apus: [[36, 1], [77, m => 2 * (m.largo + m.ancho) / (m.largo * m.ancho)]],
 incluye: 'Colocación del piso cerámico con su pegamento y zócalos en todo el perímetro.', noIncluye: 'Contrapiso ni carpeta (piden aparte).' },
 { id: 'revoque-int', nombre: 'Revoque interior', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['superficie', 'Superficie de pared', 'm²', 30]], cant: m => m.superficie,
 apus: [[32, 1]], incluye: 'Revoque grueso y fino en paredes interiores.', noIncluye: 'Pintura ni reparación de grietas grandes.' },
 { id: 'revoque-ext', nombre: 'Revoque exterior', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['superficie', 'Superficie de pared', 'm²', 30]], cant: m => m.superficie,
 apus: [[31, 1]], incluye: 'Revoque completo exterior con hidrófugo.', noIncluye: 'Andamios de más de un piso ni pintura.' },
 { id: 'pared-18', nombre: 'Pared de ladrillo hueco 18', grupo: 'Albañilería', oficio: ALB, unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 5], ['alto', 'Alto', 'm', 2.6]], cant: m => m.largo * m.alto,
 apus: [[10, 1]], incluye: 'Mampostería de ladrillo cerámico hueco 18 con su mortero.', noIncluye: 'Fundación, encadenados, revoques ni aberturas.' },
 { id: 'revest-bano', nombre: 'Revestimiento de baño', grupo: 'Albañilería', oficio: [...ALB, 'coloca'], unidad: 'm²',
 medidas: [['superficie', 'Superficie a revestir', 'm²', 15]], cant: m => m.superficie,
 apus: [[45, 1]], incluye: 'Azulejos colocados con pegamento y pastina.', noIncluye: 'Sacar el revestimiento viejo, griferías ni sanitarios.' },
 { id: 'pintura-int', nombre: 'Pintura interior', grupo: 'Pintura', oficio: ['pint'], unidad: 'm²',
 medidas: [['superficie', 'Superficie de pared y techo', 'm²', 60]], cant: m => m.superficie,
 apus: [[33, 1]], incluye: 'Látex interior a dos manos con fijador.', noIncluye: 'Enduído total ni arreglos de revoque.' },
 { id: 'pintura-ext', nombre: 'Pintura exterior', grupo: 'Pintura', oficio: ['pint'], unidad: 'm²',
 medidas: [['superficie', 'Superficie de pared', 'm²', 40]], cant: m => m.superficie,
 apus: [[34, 1]], incluye: 'Látex exterior a dos manos.', noIncluye: 'Andamios de más de un piso ni hidrolavado.' },
 { id: 'techo-chapa', nombre: 'Cambio de chapas del techo', grupo: 'Techos', oficio: ['tech', 'zingu', 'chap'], unidad: 'm²',
 medidas: [['superficie', 'Superficie de techo', 'm²', 50]], cant: m => m.superficie,
 apus: [[24, 1]], incluye: 'Chapas nuevas colocadas sobre la estructura existente.', noIncluye: 'Cambiar la estructura, aislación ni cielorraso.' },
 { id: 'canaletas', nombre: 'Canaletas y bajadas', grupo: 'Techos', oficio: ['tech', 'zingu', 'chap'], unidad: 'ml',
 medidas: [['largo', 'Largo de canaleta', 'm', 12], ['bajadas', 'Bajadas (de 3 m)', 'un', 2]], cant: m => m.largo,
 apus: [[38, 1], [46, m => (m.bajadas * 3) / m.largo]], incluye: 'Canaleta de chapa y caños de bajada de 3 m.', noIncluye: 'Desagüe enterrado hasta la calle.' },
 { id: 'cielorraso', nombre: 'Cielorraso de machimbre', grupo: 'Carpintería', oficio: ['carpint', 'madera', 'seco', 'durl'], unidad: 'm²',
 medidas: [['largo', 'Largo', 'm', 4], ['ancho', 'Ancho', 'm', 3]], cant: m => m.largo * m.ancho,
 apus: [[25, 1]], incluye: 'Machimbre colocado bajo la estructura.', noIncluye: 'Barniz (se pide aparte) ni aislación.' }
];
const tipoDe = (id) => TRABAJOS.find(t => t.id === id);
const LOCALIDADES = ['Oberá', 'Posadas', 'Leandro N. Alem', 'Campo Viera', 'Aristóbulo del Valle', 'Otra'];

const S = {
 tab: 'pedir', tipo: 'vereda', medidas: {}, materiales: 'prestador', localidad: 'Oberá', barrio: '', descripcion: '', publicando: false,
 mios: null, abierto: '', ofertas: {}, nOfertas: {},
 paraOfertar: null, misOfertas: null, prestador: undefined, rubroPrestador: '', filtro: 'mio', borradores: {}, errorOfertar: ''
};
let listo = false;

// ---------------------------------------------------------------------------
// Precio de referencia con las APU del mes
// ---------------------------------------------------------------------------
function medidasDe(T) {
 const m = {};
 T.medidas.forEach(([k, , , def]) => { const v = Number(S.medidas[`${T.id}.${k}`]); m[k] = Number.isFinite(v) && v > 0 ? v : def; });
 return m;
}
function referencia(T, m, materiales = S.materiales) {
 const cant = T.cant(m);
 let mat = 0, mo = 0, eq = 0;
 const detalle = [];
 for (const [apuId, fac] of T.apus) {
 const q = cant * (typeof fac === 'function' ? fac(m) : fac);
 if (!(q > 0)) continue;
 let b;
 try { b = Apu.calcItemBreakdown(Apu.buildBudgetItem(apuId, q)); } catch (e) { return { falta: apuId }; }
 mat += b.materialesCost; mo += b.manoObraCost; eq += b.equiposCost;
 const task = (ST.apuCatalogState.tasks || []).find(t => t.id === apuId);
 detalle.push({ apu_id: apuId, cantidad: Math.round(q * 100) / 100, nombre: task ? task.nombre : `APU ${apuId}`, unidad: task ? task.unidad : '' });
 }
 const manoObra = mo + eq, total = materiales === 'vecino' ? manoObra : mat + manoObra;
 return { cant, materialesCost: mat, manoObra, total, detalle };
}

// ---------------------------------------------------------------------------
// Carga y render
// ---------------------------------------------------------------------------
export async function loadTrabajosView() {
 const root = document.getElementById('trabajos-root');
 if (!root) return;
 if (!root.dataset.listo) {
 root.dataset.listo = '1';
 root.addEventListener('click', onClick);
 root.addEventListener('input', onInput);
 root.addEventListener('change', onChange);
 }
 if (!ST.apuCatalogState.loaded) {
 root.innerHTML = '<p class="trb-muted">Cargando los precios de referencia…</p>';
 try { await Apu.loadApuCatalog(); } catch (e) { /* se informa abajo */ }
 }
 listo = true;
 render();
 if (ST.authState.user) { cargarMios(); cargarPrestador(); }
}

function render() {
 const root = document.getElementById('trabajos-root');
 if (!root || !listo) return;
 const logueado = !!ST.authState.user;
 const TABS = [['pedir', 'Pedir presupuesto'], ['mios', 'Mis pedidos'], ['ofertar', 'Pedidos para ofertar']];
 const tabs = `<div class="trb-tabs" role="tablist" aria-label="Pedí presupuesto">${TABS.map(([k, n]) => `<button type="button" role="tab" class="trb-tab${S.tab === k ? ' on' : ''}" aria-selected="${S.tab === k}" data-trb="tab:${k}">${esc(n)}${k === 'mios' && S.mios && S.mios.length ? ` <span class="trb-cuenta">${S.mios.length}</span>` : ''}</button>`).join('')}</div>`;
 let cuerpo = '';
 if (S.tab === 'pedir') cuerpo = vistaPedir();
 else if (!logueado) cuerpo = `<div class="trb-vacio"><p>Para ver tus pedidos y ofertas tenés que iniciar sesión.</p><button type="button" class="btn-computo" data-trb="login:1">Ingresar o crear cuenta</button></div>`;
 else if (S.tab === 'mios') cuerpo = vistaMios();
 else cuerpo = vistaOfertar();
 root.innerHTML = `
 <div class="trb-head">
 <div><span class="trb-beta">Prueba cerrada</span><h2 class="catalog-title">Pedí presupuesto</h2>
 <p class="catalog-subtitle">Publicá un trabajo con sus medidas y los prestadores de tu zona te ofertan. Todos parten del mismo precio de referencia, calculado con las APU del mes.</p></div>
 </div>
 ${tabs}
 ${cuerpo}`;
}

function vistaPedir() {
 const T = tipoDe(S.tipo) || TRABAJOS[0], m = medidasDe(T), R = referencia(T, m);
 const grupos = [...new Set(TRABAJOS.map(t => t.grupo))];
 const tarjetas = grupos.map(g => `<div class="trb-grupo"><h4>${esc(g)}</h4><div class="trb-tipos">${TRABAJOS.filter(t => t.grupo === g).map(t => {
 const sinApu = referencia(t, medidasDe(t)).falta;
 return `<button type="button" class="trb-tipo${t.id === T.id ? ' on' : ''}" data-trb="tipo:${t.id}" aria-pressed="${t.id === T.id}"${sinApu ? ' aria-disabled="true" title="Todavía no tiene precio de referencia"' : ''}><b>${esc(t.nombre)}</b><small>por ${esc(t.unidad)}</small></button>`;
 }).join('')}</div></div>`).join('');
 const campos = T.medidas.map(([k, n, u, def]) => `<label class="trb-campo"><span>${esc(n)}</span><span class="trb-num"><input type="text" inputmode="decimal" data-trb-m="${T.id}.${k}" value="${f(m[k], u === 'un' ? 0 : 2)}" aria-label="${esc(n)} en ${esc(u)}"><em>${esc(u)}</em></span></label>`).join('');
 const refHtml = R.falta ? `<p class="trb-aviso">Este trabajo todavía no tiene precio de referencia (falta la APU ${R.falta}).</p>` : `
 <div class="trb-ref" aria-live="polite">
 <span class="trb-ref-tit">Precio de referencia</span>
 <strong id="trb-ref-total">${money(R.total)}</strong>
 <span class="trb-muted" id="trb-ref-cant">${f(R.cant, 2)} ${esc(T.unidad)} · ${money(R.total / R.cant)} por ${esc(T.unidad)}</span>
 <ul class="trb-ref-partes">
 <li><span>Materiales</span><b id="trb-ref-mat">${S.materiales === 'vecino' ? 'los comprás vos' : money(R.materialesCost)}</b></li>
 <li><span>Mano de obra y herramientas</span><b id="trb-ref-mo">${money(R.manoObra)}</b></li>
 </ul>
 <details class="trb-detalle"><summary>Cómo se calcula</summary><ul>${R.detalle.map(d => `<li>APU ${d.apu_id} · ${esc(d.nombre.charAt(0) + d.nombre.slice(1).toLowerCase())}: ${f(d.cantidad, 2)} ${esc(d.unidad)}</li>`).join('')}</ul><p>Sin gastos generales, beneficio ni impuestos: eso lo suma cada prestador con su porcentaje. Composición del trabajo: <b>a validar</b>.</p></details>
 </div>`;
 return `
 <div class="trb-pedir">
 <section class="trb-card">
 <h3><span>1</span> ¿Qué trabajo necesitás?</h3>
 ${tarjetas}
 </section>
 <section class="trb-card">
 <h3><span>2</span> ${esc(T.nombre)}: medidas y detalles</h3>
 <div class="trb-campos">${campos}</div>
 <fieldset class="trb-radio"><legend>¿Quién compra los materiales?</legend>
 <label><input type="radio" name="trb-mat" value="prestador" data-trb-mat="1"${S.materiales !== 'vecino' ? ' checked' : ''}> El que hace el trabajo</label>
 <label><input type="radio" name="trb-mat" value="vecino" data-trb-mat="1"${S.materiales === 'vecino' ? ' checked' : ''}> Yo</label>
 </fieldset>
 <div class="trb-campos">
 <label class="trb-campo"><span>Localidad</span><select data-trb-f="localidad">${LOCALIDADES.map(l => `<option${l === S.localidad ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
 <label class="trb-campo"><span>Barrio (opcional)</span><input type="text" maxlength="60" data-trb-f="barrio" value="${esc(S.barrio)}" placeholder="Ej: Villa Svea"></label>
 </div>
 <label class="trb-campo trb-ancho"><span>Contale algo más (opcional)</span><textarea maxlength="1000" rows="3" data-trb-f="descripcion" placeholder="Ej: la vereda vieja ya está sacada, hay que hacer una rampa para el auto…">${esc(S.descripcion)}</textarea></label>
 <div class="trb-incluye"><p><b>Incluye:</b> ${esc(T.incluye)}</p><p><b>No incluye:</b> ${esc(T.noIncluye)}</p></div>
 </section>
 <aside class="trb-card trb-lado">
 ${refHtml}
 <button type="button" class="btn-computo trb-publicar" data-trb="publicar:1"${R.falta || S.publicando ? ' disabled' : ''}>${S.publicando ? 'Publicando…' : ST.authState.user ? 'Publicar pedido' : 'Ingresá para publicar'}</button>
 <p class="trb-muted trb-chico">Lo ven los prestadores aprobados de la zona, sin tu nombre ni tu dirección. Recibís hasta 5 ofertas y el pedido vence a los 14 días. Tu contacto lo ve solo el que elijas.</p>
 </aside>
 </div>`;
}

const ESTADO_TXT = { abierto: 'Recibiendo ofertas', adjudicado: 'Elegiste a alguien', terminado: 'Terminado', cancelado: 'Cancelado', vencido: 'Venció' };
const estadoDe = (t) => t.estado === 'abierto' && new Date(t.vence_at) <= new Date() ? 'vencido' : t.estado;
const diasPara = (fecha) => Math.max(0, Math.ceil((new Date(fecha) - new Date()) / 86400000));
const telWa = (tel) => { let d = String(tel || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = d.slice(1); if (!d.startsWith('54')) d = '549' + d; return d; };

function vistaMios() {
 if (S.mios === null) return '<p class="trb-muted">Cargando tus pedidos…</p>';
 if (!S.mios.length) return '<div class="trb-vacio"><p>Todavía no publicaste ningún pedido.</p><button type="button" class="btn-computo" data-trb="tab:pedir">Pedir un presupuesto</button></div>';
 return `<div class="trb-lista">${S.mios.map(t => {
 const est = estadoDe(t), abierto = S.abierto === t.id, n = S.nOfertas[t.id] || 0;
 const ofs = S.ofertas[t.id];
 let ofertasHtml = '';
 if (abierto) {
 if (!ofs) ofertasHtml = '<p class="trb-muted">Cargando ofertas…</p>';
 else if (!ofs.length) ofertasHtml = `<p class="trb-muted">Todavía no hay ofertas. ${est === 'abierto' ? `Le quedan ${diasPara(t.vence_at)} días.` : ''}</p>`;
 else ofertasHtml = `<div class="trb-ofertas">${ofs.map(o => {
 const signo = o.pct > 0 ? '+' : '', cls = o.pct < 0 ? 'baja' : o.pct > 0 ? 'sube' : '';
 const elegida = o.estado === 'elegida';
 return `<article class="trb-oferta${elegida ? ' elegida' : ''}${o.estado === 'no_elegida' ? ' apagada' : ''}">
 <div class="trb-of-quien"><b>${esc(o.business_name)}</b>
 <span class="trb-sellos">${o.matriculado ? '<span class="trb-sello">Matrícula</span>' : ''}${o.verificado ? '<span class="trb-sello">Verificado</span>' : ''}</span>
 <span class="trb-muted">${o.n_resenas ? `★ ${f(o.rating, 1)} · ${o.n_resenas} ${o.n_resenas === 1 ? 'reseña' : 'reseñas'}` : 'Sin reseñas todavía'}${o.plazo_dias ? ` · ${o.plazo_dias} ${o.plazo_dias === 1 ? 'día' : 'días'}` : ''}</span>
 ${o.mensaje ? `<p class="trb-msj">“${esc(o.mensaje)}”</p>` : ''}</div>
 <div class="trb-of-precio"><strong>${money(o.precio)}</strong><span class="trb-pct ${cls}">${signo}${f(o.pct, 1)} % de la referencia</span></div>
 <div class="trb-of-acc">${elegida
 ? `<span class="trb-ok">Elegido</span>${o.contacto ? `<a class="btn-computo trb-wa" href="https://wa.me/${telWa(o.contacto)}?text=${encodeURIComponent(`Hola, te elegí en NEXOBRA para: ${t.titulo}`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`
 : (est === 'abierto' && o.estado === 'enviada' ? `<button type="button" class="btn-computo" data-trb="elegir:${o.id}">Elegir</button>` : `<span class="trb-muted">${o.estado === 'no_elegida' ? 'No elegida' : ''}</span>`)}</div>
 </article>`;
 }).join('')}</div>`;
 }
 const acciones = abierto ? `<div class="trb-acciones">${est === 'adjudicado' ? `<button type="button" class="btn-computo" data-trb="cerrar:${t.id}|terminado">El trabajo está terminado</button>` : ''}${['abierto', 'adjudicado'].includes(est) ? `<button type="button" class="casa-link" data-trb="cerrar:${t.id}|cancelado">Cancelar pedido</button>` : ''}</div>` : '';
 return `<section class="trb-card trb-pedido${abierto ? ' abierto' : ''}">
 <button type="button" class="trb-pedido-head" data-trb="abrir:${t.id}" aria-expanded="${abierto}">
 <span><b>${esc(t.titulo)}</b><small>${f(t.cantidad, 2)} ${esc(t.unidad)} · ${esc(t.localidad)}${t.barrio ? ', ' + esc(t.barrio) : ''} · referencia ${money(t.precio_ref)}</small></span>
 <span class="trb-est trb-est-${est}">${esc(ESTADO_TXT[est])}</span>
 <span class="trb-cuenta-of">${n} ${n === 1 ? 'oferta' : 'ofertas'}</span>
 </button>
 ${ofertasHtml}${acciones}
 </section>`;
 }).join('')}</div>`;
}

function vistaOfertar() {
 if (S.prestador === undefined) return '<p class="trb-muted">Buscando tu ficha de prestador…</p>';
 if (!S.prestador) return `<div class="trb-vacio"><p>Para ofertar necesitás una ficha de prestador de servicios aprobada.</p><button type="button" class="btn-computo" data-trb="ficha:1">Ir a Mi proveedor</button></div>`;
 if (S.prestador.verification_status !== 'approved') return `<div class="trb-vacio"><p>Tu ficha todavía está en revisión. Cuando la aprobemos vas a ver los pedidos de tu zona.</p></div>`;
 if (S.errorOfertar) return `<p class="trb-aviso">${esc(S.errorOfertar)}</p>`;
 if (S.paraOfertar === null) return '<p class="trb-muted">Cargando pedidos…</p>';
 const delRubro = (t) => { const T = tipoDe(t.tipo); const r = (S.rubroPrestador || '').toLowerCase(); return !T || !r ? true : T.oficio.some(w => r.includes(w)); };
 const lista = S.paraOfertar.filter(t => S.filtro === 'todos' || delRubro(t));
 const filtros = `<div class="trb-filtro" role="group" aria-label="Qué pedidos ver">${[['mio', `De mi rubro${S.rubroPrestador ? ` (${S.rubroPrestador})` : ''}`], ['todos', 'Todos']].map(([k, n]) => `<button type="button" class="casa-opt${S.filtro === k ? ' on' : ''}" aria-pressed="${S.filtro === k}" data-trb="filtro:${k}">${esc(n)}</button>`).join('')}</div>`;
 const pedidos = !lista.length ? `<div class="trb-vacio"><p>No hay pedidos ${S.filtro === 'mio' ? 'de tu rubro ' : ''}abiertos en este momento.</p></div>` : `<div class="trb-lista">${lista.map(t => {
 const T = tipoDe(t.tipo), b = S.borradores[t.id] || { pct: t.mi_pct ?? 0, plazo: t.mi_plazo || '', msj: t.mi_mensaje || '' };
 const precio = Math.round(t.precio_ref * (1 + Number(b.pct || 0) / 100));
 const lleno = Number(t.n_ofertas) >= 5 && !t.mi_oferta_id;
 const yaOferte = t.mi_oferta_id && t.mi_estado === 'enviada';
 return `<section class="trb-card trb-paraof">
 <div class="trb-paraof-info">
 <span class="trb-grupo-chip">${esc(T ? T.grupo : t.tipo)}</span>
 <h4>${esc(t.titulo)}</h4>
 <p class="trb-muted">${f(t.cantidad, 2)} ${esc(t.unidad)} · ${esc(t.localidad)}${t.barrio ? ', ' + esc(t.barrio) : ''} · materiales: ${t.materiales === 'vecino' ? 'los pone el vecino' : 'los ponés vos'} · vence en ${diasPara(t.vence_at)} días · ${t.n_ofertas}/5 ofertas</p>
 ${t.descripcion ? `<p class="trb-msj">“${esc(t.descripcion)}”</p>` : ''}
 ${T ? `<p class="trb-chico"><b>Incluye:</b> ${esc(T.incluye)} <b>No incluye:</b> ${esc(T.noIncluye)}</p>` : ''}
 <ul class="trb-ref-partes"><li><span>Referencia</span><b>${money(t.precio_ref)}</b></li>${t.materiales !== 'vecino' ? `<li><span>Materiales</span><b>${money(t.ref_materiales)}</b></li>` : ''}<li><span>Mano de obra</span><b>${money(t.ref_mano_obra)}</b></li></ul>
 </div>
 <div class="trb-paraof-form">
 ${lleno ? '<p class="trb-aviso">Este pedido ya tiene 5 ofertas.</p>' : `
 <label class="trb-campo"><span>Tu precio respecto de la referencia</span>
 <span class="trb-pct-fila"><input type="range" min="${PCT_MIN}" max="${PCT_MAX}" step="1" value="${Number(b.pct) || 0}" data-trb-pct="${t.id}" aria-label="Porcentaje sobre la referencia"><span class="trb-num"><input type="text" inputmode="decimal" value="${Number(b.pct) || 0}" data-trb-pctn="${t.id}" aria-label="Porcentaje"><em>%</em></span></span></label>
 <p class="trb-precio-of">Tu oferta: <strong id="trb-of-${t.id}">${money(precio)}</strong></p>
 <div class="trb-campos">
 <label class="trb-campo"><span>Plazo (días)</span><input type="text" inputmode="numeric" data-trb-plazo="${t.id}" value="${esc(b.plazo)}" placeholder="Ej: 5"></label>
 </div>
 <label class="trb-campo trb-ancho"><span>Mensaje (opcional)</span><textarea rows="2" maxlength="500" data-trb-msj="${t.id}" placeholder="Qué incluye tu precio, cuándo podés empezar…">${esc(b.msj)}</textarea></label>
 <div class="trb-acciones"><button type="button" class="btn-computo" data-trb="ofertar:${t.id}">${yaOferte ? 'Actualizar oferta' : 'Enviar oferta'}</button>${yaOferte ? `<button type="button" class="casa-link" data-trb="retirar:${t.id}">Retirar</button>` : ''}</div>
 ${yaOferte ? `<p class="trb-ok-txt">Ofertaste ${money(t.mi_precio)} (${t.mi_pct > 0 ? '+' : ''}${f(t.mi_pct, 1)} %).</p>` : ''}`}
 </div>
 </section>`;
 }).join('')}</div>`;
 const mis = S.misOfertas && S.misOfertas.length ? `<h3 class="trb-sub">Mis ofertas</h3><div class="trb-lista">${S.misOfertas.map(o => `<div class="trb-card trb-miof trb-miof-${o.estado}">
 <span><b>${esc(o.titulo)}</b><small>${esc(o.localidad)}${o.barrio ? ', ' + esc(o.barrio) : ''} · ${money(o.precio)} (${o.pct > 0 ? '+' : ''}${f(o.pct, 1)} %)</small></span>
 <span class="trb-est">${esc({ enviada: o.trabajo_estado === 'abierto' ? 'Esperando respuesta' : 'Cerrado', elegida: '¡Te eligieron!', no_elegida: 'Eligieron otra oferta', retirada: 'La retiraste' }[o.estado] || o.estado)}</span>
 ${o.estado === 'elegida' && o.vecino_telefono ? `<a class="btn-computo trb-wa" href="https://wa.me/${telWa(o.vecino_telefono)}?text=${encodeURIComponent(`Hola ${o.vecino || ''}, te escribo por tu pedido en NEXOBRA: ${o.titulo}`)}" target="_blank" rel="noopener">WhatsApp a ${esc(o.vecino || 'el vecino')}</a>` : ''}
 </div>`).join('')}</div>` : '';
 return `${filtros}${pedidos}${mis}`;
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
const errTxt = (e, ctx) => (e && e.code === 'P0001' && e.message) ? e.message : ST.friendlyError(e, ctx);
async function cargarMios() {
 if (!ST.supabaseClient || !ST.authState.user) return;
 const { data, error } = await ST.supabaseClient.from('trabajos').select('*').eq('owner_id', ST.authState.user.id).order('created_at', { ascending: false }).limit(50);
 if (error) { S.mios = []; ST.showToast(errTxt(error, 'cargar tus pedidos')); render(); return; }
 S.mios = data || [];
 const ids = S.mios.map(t => t.id);
 S.nOfertas = {};
 if (ids.length) {
 const { data: ofs } = await ST.supabaseClient.from('trabajo_ofertas').select('trabajo_id, estado').in('trabajo_id', ids);
 (ofs || []).filter(o => o.estado !== 'retirada').forEach(o => { S.nOfertas[o.trabajo_id] = (S.nOfertas[o.trabajo_id] || 0) + 1; });
 }
 render();
}
async function cargarOfertas(id) {
 const { data, error } = await ST.supabaseClient.rpc('trabajo_ofertas_de', { p_trabajo: id });
 if (error) { ST.showToast(errTxt(error, 'cargar las ofertas')); S.ofertas[id] = []; }
 else S.ofertas[id] = data || [];
 render();
}
async function cargarPrestador() {
 if (!ST.supabaseClient || !ST.authState.user) return;
 const { data } = await ST.supabaseClient.from('providers').select('id, business_name, verification_status, category_id').eq('owner_id', ST.authState.user.id).maybeSingle();
 S.prestador = data || null;
 if (data && data.category_id) {
 const { data: cat } = await ST.supabaseClient.from('provider_categories').select('name').eq('id', data.category_id).maybeSingle();
 S.rubroPrestador = cat ? cat.name : '';
 }
 if (S.tab === 'ofertar') cargarParaOfertar(); else render();
}
async function cargarParaOfertar() {
 if (!S.prestador || S.prestador.verification_status !== 'approved') { render(); return; }
 S.errorOfertar = '';
 const [a, b] = await Promise.all([ST.supabaseClient.rpc('trabajos_para_ofertar'), ST.supabaseClient.rpc('trabajos_mis_ofertas')]);
 if (a.error) { S.errorOfertar = errTxt(a.error, 'cargar los pedidos'); S.paraOfertar = []; }
 else S.paraOfertar = a.data || [];
 S.misOfertas = b.error ? [] : (b.data || []);
 render();
}

async function publicar() {
 if (!ST.authState.user) { Auth.showAuthTab('login'); Auth.openAuthModal(); return; }
 const T = tipoDe(S.tipo), m = medidasDe(T), R = referencia(T, m);
 if (R.falta || !(R.total > 0)) { ST.showToast('Este trabajo todavía no tiene precio de referencia.'); return; }
 // "12 × 1,5 m", "85 m²" o "12 m · 2 bajadas"
 const dimsM = T.medidas.filter(([, , u]) => u !== 'un'), dimsU = T.medidas.filter(([, , u]) => u === 'un');
 const fm = (v) => f(v, Number.isInteger(v) ? 0 : 2);
 const dims = [dimsM.map(([k]) => fm(m[k])).join(' × ') + (dimsM.length ? ' ' + dimsM[0][2] : ''), ...dimsU.map(([k]) => `${fm(m[k])} ${k}`)].filter(Boolean).join(' · ');
 S.publicando = true; render();
 const { error } = await ST.supabaseClient.from('trabajos').insert({
 tipo: T.id, titulo: `${T.nombre} · ${dims}`.slice(0, 120), cantidad: Math.round(R.cant * 100) / 100, unidad: T.unidad, medidas: m,
 descripcion: S.descripcion.trim() || null, localidad: S.localidad, barrio: S.barrio.trim() || null, materiales: S.materiales,
 precio_ref: Math.round(R.total), ref_materiales: Math.round(S.materiales === 'vecino' ? 0 : R.materialesCost), ref_mano_obra: Math.round(R.manoObra),
 apu_detalle: R.detalle.map(d => ({ apu_id: d.apu_id, cantidad: d.cantidad }))
 });
 S.publicando = false;
 if (error) { ST.showToast(errTxt(error, 'publicar el pedido')); render(); return; }
 ST.showToast('¡Listo! Tu pedido ya lo ven los prestadores de la zona.');
 S.descripcion = ''; S.tab = 'mios'; S.mios = null; render();
 await cargarMios();
}
async function ofertar(id) {
 const t = (S.paraOfertar || []).find(x => x.id === id); if (!t) return;
 const b = S.borradores[id] || { pct: t.mi_pct ?? 0, plazo: t.mi_plazo || '', msj: t.mi_mensaje || '' };
 const pct = Number(String(b.pct).replace(',', '.'));
 if (!Number.isFinite(pct) || pct < PCT_MIN || pct > PCT_MAX) { ST.showToast(`El porcentaje tiene que estar entre ${PCT_MIN} % y +${PCT_MAX} %.`); return; }
 const plazo = parseInt(b.plazo, 10);
 const { error } = await ST.supabaseClient.rpc('trabajo_ofertar', { p_trabajo: id, p_pct: pct, p_plazo: Number.isFinite(plazo) && plazo > 0 ? plazo : null, p_mensaje: (b.msj || '').trim() || null });
 if (error) { ST.showToast(errTxt(error, 'enviar la oferta')); return; }
 delete S.borradores[id];
 ST.showToast('Oferta enviada. Si te eligen lo vas a ver en "Mis ofertas".');
 cargarParaOfertar();
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
async function onClick(e) {
 const b = e.target.closest('[data-trb]');
 if (!b || b.getAttribute('aria-disabled') === 'true') return;
 const [acc, val] = b.dataset.trb.split(':');
 if (acc === 'tab') { S.tab = val; render(); if (val === 'ofertar' && ST.authState.user && S.prestador) cargarParaOfertar(); if (val === 'mios' && ST.authState.user && S.mios === null) cargarMios(); return; }
 if (acc === 'tipo') { S.tipo = val; render(); return; }
 if (acc === 'login') { Auth.showAuthTab('login'); Auth.openAuthModal(); return; }
 if (acc === 'ficha') { window.nexoBraApp?.switchView?.('provider'); return; }
 if (acc === 'publicar') { publicar(); return; }
 if (acc === 'abrir') { S.abierto = S.abierto === val ? '' : val; render(); if (S.abierto && !S.ofertas[val]) cargarOfertas(val); return; }
 if (acc === 'elegir') {
 if (!confirm('¿Elegís esta oferta? Las demás quedan como no elegidas y le mostramos tu nombre y teléfono a este prestador.')) return;
 const { error } = await ST.supabaseClient.rpc('trabajo_elegir', { p_oferta: val });
 if (error) { ST.showToast(errTxt(error, 'elegir la oferta')); return; }
 ST.showToast('¡Listo! Ya podés escribirle por WhatsApp.');
 const t = S.abierto; delete S.ofertas[t]; await cargarMios(); cargarOfertas(t); return;
 }
 if (acc === 'cerrar') {
 const [id, estado] = val.split('|');
 if (estado === 'cancelado' && !confirm('¿Cancelás el pedido?')) return;
 const { error } = await ST.supabaseClient.rpc('trabajo_cerrar', { p_trabajo: id, p_estado: estado });
 if (error) { ST.showToast(errTxt(error, 'cerrar el pedido')); return; }
 ST.showToast(estado === 'terminado' ? '¡Buenísimo! Contá cómo te fue con una reseña en la ficha del prestador.' : 'Pedido cancelado.');
 await cargarMios(); return;
 }
 if (acc === 'filtro') { S.filtro = val; render(); return; }
 if (acc === 'ofertar') { ofertar(val); return; }
 if (acc === 'retirar') {
 const { error } = await ST.supabaseClient.rpc('trabajo_retirar_oferta', { p_trabajo: val });
 if (error) { ST.showToast(errTxt(error, 'retirar la oferta')); return; }
 cargarParaOfertar(); return;
 }
}
function borrador(id) {
 const t = (S.paraOfertar || []).find(x => x.id === id) || {};
 return S.borradores[id] || (S.borradores[id] = { pct: t.mi_pct ?? 0, plazo: t.mi_plazo || '', msj: t.mi_mensaje || '' });
}
function actualizarPrecioOferta(id) {
 const t = (S.paraOfertar || []).find(x => x.id === id); if (!t) return;
 const pct = Number(String(borrador(id).pct).replace(',', '.')) || 0;
 const el = document.getElementById(`trb-of-${id}`);
 if (el) el.textContent = money(t.precio_ref * (1 + pct / 100));
}
function onInput(e) {
 const d = e.target.dataset || {};
 if (d.trbM) {
 S.medidas[d.trbM] = String(e.target.value).replace(',', '.');
 const T = tipoDe(S.tipo), R = referencia(T, medidasDe(T));
 if (!R.falta) {
 const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
 set('trb-ref-total', money(R.total)); set('trb-ref-cant', `${f(R.cant, 2)} ${T.unidad} · ${money(R.total / R.cant)} por ${T.unidad}`);
 set('trb-ref-mat', S.materiales === 'vecino' ? 'los comprás vos' : money(R.materialesCost)); set('trb-ref-mo', money(R.manoObra));
 }
 return;
 }
 if (d.trbF) { S[d.trbF] = e.target.value; return; }
 if (d.trbPct || d.trbPctn) {
 const id = d.trbPct || d.trbPctn;
 borrador(id).pct = e.target.value;
 const otro = document.querySelector(d.trbPct ? `[data-trb-pctn="${id}"]` : `[data-trb-pct="${id}"]`);
 if (otro) otro.value = String(e.target.value).replace(',', '.');
 actualizarPrecioOferta(id); return;
 }
 if (d.trbPlazo) { borrador(d.trbPlazo).plazo = e.target.value; return; }
 if (d.trbMsj) { borrador(d.trbMsj).msj = e.target.value; }
}
function onChange(e) {
 const d = e.target.dataset || {};
 if (d.trbMat) { S.materiales = e.target.value; render(); return; }
 if (d.trbF === 'localidad') S.localidad = e.target.value;
 if (d.trbM) render();
}

/** (24/11) Al cambiar la sesión: se vuelven a cargar pedidos y ficha. */
export function onAuthChange() {
 S.mios = null; S.prestador = undefined; S.paraOfertar = null; S.misOfertas = null; S.ofertas = {};
 if (ST.state.currentView === 'trabajos') loadTrabajosView();
}
