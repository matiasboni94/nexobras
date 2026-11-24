// NEXOBRA - casa.js
// ============================================================================
// "ARMÁ TU CASA" (21/11, maquetas aprobadas del canvas): configurador del
// Costo por m². El usuario elige ciudad, lote en la manzana y norte, forma de
// la casa, techo, fachada y nivel de confort térmico; se dibuja la planta y
// la fachada, se verifica la aislación con IRAM 11605 y el costo sale de un
// cómputo paramétrico (medido sobre la misma planta) contra las APU reales.
//
// Mientras Costo por m² siga en "Próximamente" esto lo ven solo los
// administradores: es la herramienta para revisar las APU con una casa real.
// Datos climáticos y máximos de K: material de la cátedra CI 455 (UNaM, Oberá)
// con las tablas de IRAM 11603 y 11605.
// ============================================================================
import * as Admin from './admin.js';
import * as Apu from './apu.js';
import * as ST from './state.js';

const STORE_KEY = 'nexobra_casa';
const MIN_ALTURA = 2.6; // altura mínima de locales de primera (referencia Pro.Cre.Ar, a validar)
// (24/11) Medidas del lote (editables desde el croquis) y medianera donde se apoya la casa
const LOTE_LIM = { loteAncho: [6, 30], loteFondo: [12, 60] };
const LOTES_RAPIDOS = [[10, 25], [10, 30], [12, 30], [15, 30], [20, 40]];
const limLote = (k, v) => Math.round(Math.min(LOTE_LIM[k][1], Math.max(LOTE_LIM[k][0], Number(v) || 0)) * 100) / 100;
const DEFAULTS = {
 ciudad: 'Oberá', lote: 'a1', norte: 0, loteAncho: 10, loteFondo: 25, medLado: 'auto',
 tipo: 'lineal', dorm: 2, galeria: true, cochera: false, bano2: 'no',
 techo: '1', techoMat: 'chapa', fachada: 'revoque',
 nivel: 'B', muro: 'eps2', aisTecho: 'lana5', piso: 'ceramico', abert: 'aluminio', dvh: false, solar: false,
 // (21/11-d) cómo se construye y medidas
 fundacion: 'platea', muroBase: 'lch18', tabique: 'ladrillo', estructTecho: 'metalica', cielo: 'pendiente', cieloMat: 'machimbre',
 altura: 2.6, dims: {}, paso: 1,
 // (21/11-j) solapa abierta de cada paso y local que se está editando en el croquis
 grupo1: 'terreno', grupo2: 'fund', local: '',
 // (22/11) estructura del techo, ventanas, instalaciones y equipamiento
 sistTecho: 'tirantes', vent: {}, grupo3: 'agua',
 agua: 'termo-elec', artef: {}, bomba: false, coccion: 'gas',
 elec: 'minimo', luminarias: 'plafon', aa: {}, ventTecho: false,
 // (22/11-b) terminaciones, muebles, exterior, pluviales/energía, ampliación, Factor K y cronograma
 grupo4: 'pisos', pisoExt: 'alisado', revBano: 'h150', revMat: 'ceramico', revCocina: 'mesada', pintura: 'latex',
 mueblesCocina: 'bajo', placard: 'no', cercoFrente: 'no', cercoLat: 'no', porton: false, parrilla: false,
 lluvia: false, fv: 0, ampliacion: false,
 k: { gg: 10, ben: 15, iibb: 5, iva: 21 }, cuadrilla: 2, verModelos: false, modelo: null
};
let S = { ...DEFAULTS };
let ultimo = null; // último cálculo (para "Abrir en la Calculadora")
let catalogoListo = false;

function cargarEstado() {
 try { const raw = localStorage.getItem(STORE_KEY); if (raw) S = { ...DEFAULTS, ...JSON.parse(raw) }; S.techo = String(S.techo); S.dorm = Number(S.dorm) || 2;
 if (S.bano2 === true) S.bano2 = 'pasillo'; else if (!['no', 'pasillo', 'suite'].includes(S.bano2)) S.bano2 = 'no';
 if (!S.dims || typeof S.dims !== 'object') S.dims = {};
 S.altura = Math.max(MIN_ALTURA, Number(S.altura) || 2.6);
 S.loteAncho = limLote('loteAncho', S.loteAncho || 10); S.loteFondo = limLote('loteFondo', S.loteFondo || 25);
 if (!['auto', 'otra'].includes(S.medLado)) S.medLado = 'auto';
 if (S.solar === true) { S.agua = 'solar'; S.solar = false; }
 ['vent', 'artef', 'aa'].forEach(k => { if (!S[k] || typeof S[k] !== 'object') S[k] = {}; });
 if (![1, 2, 3, 4, 5].includes(S.paso)) S.paso = 1;
 if (!S.k || typeof S.k !== 'object') S.k = { ...DEFAULTS.k }; } catch (e) { /* sin storage */ }
}
function guardarEstado() {
 try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* sin storage */ }
}

const f = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = (n) => '$ ' + Math.round(n).toLocaleString('es-AR');
const esc = (t) => ST.escapeHtml(String(t ?? ''));

// ---------------------------------------------------------------------------
// Clima (IRAM 11603, tablas A.1 y A.2) y máximos de K (IRAM 11605)
// ---------------------------------------------------------------------------
const CIUDADES = {
 'Oberá': { est: 'Posadas (Aero)', tdmn: 0.9, tdmx: 38.6, gd: 298, zona: 'Ib', zonaTxt: 'muy cálida' },
 'Posadas': { est: 'Posadas (Aero)', tdmn: 0.9, tdmx: 38.6, gd: 298, zona: 'Ib', zonaTxt: 'muy cálida' },
 'Puerto Iguazú': { est: 'Iguazú (Aero)', tdmn: 0.0, tdmx: 37.0, gd: 282, zona: 'Ib', zonaTxt: 'muy cálida' },
 'Eldorado': { est: 'Iguazú (Aero)', tdmn: 0.0, tdmx: 37.0, gd: 282, zona: 'Ib', zonaTxt: 'muy cálida (estación a validar)' },
 'Apóstoles': { est: 'Posadas (Aero)', tdmn: 0.9, tdmx: 38.6, gd: 298, zona: 'Ib', zonaTxt: 'muy cálida (estación a validar)' },
 'B. de Irigoyen': { est: 'Bernardo de Irigoyen', tdmn: -0.4, tdmx: 32.8, gd: 443, zona: '?', zonaTxt: 'zona a validar (815 m)' }
};
const KINV = {
 muro: { A: [0.23,0.23,0.24,0.25,0.25,0.26,0.27,0.28,0.29,0.30,0.31,0.32,0.33,0.35,0.36,0.38], B: [0.60,0.61,0.63,0.65,0.67,0.69,0.72,0.74,0.77,0.80,0.83,0.87,0.91,0.95,0.99,1.00], C: [1.01,1.04,1.08,1.11,1.15,1.19,1.23,1.28,1.33,1.39,1.45,1.52,1.59,1.67,1.75,1.85] },
 techo: { A: [0.20,0.20,0.21,0.21,0.22,0.23,0.23,0.24,0.25,0.26,0.27,0.28,0.29,0.30,0.31,0.32], B: [0.52,0.53,0.55,0.56,0.58,0.60,0.61,0.63,0.65,0.67,0.69,0.72,0.74,0.77,0.80,0.83], C: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] }
};
const KVER = { muro: { A: 0.45, B: 1.10, C: 1.80 }, techo: { A: 0.18, B: 0.45, C: 0.72 } }; // zonas I y II
function kmaxInvierno(el, nivel, tdmn) {
 const fila = KINV[el][nivel];
 if (tdmn >= 0) return fila[15];
 if (tdmn <= -15) return fila[0];
 const i = Math.floor(tdmn) + 15, fr = tdmn - Math.floor(tdmn);
 return fila[i] + (fila[i + 1] - fila[i]) * fr;
}
// Absorción solar de la superficie exterior (tabla 8) según fachada y techo
function absorciones() {
 const muro = { revoque: 0.40, ladrillo: 0.70, contemporanea: 0.40 }[S.fachada];
 const techo = S.techo === 'plana' ? 0.55 : S.techoMat === 'teja' ? 0.85 : S.fachada === 'contemporanea' ? 0.95 : 0.50;
 return { muro, techo };
}
const correccionColor = (a, el) => a < 0.6 ? (el === 'muro' ? 1.20 : 1.30) : a > 0.8 ? (el === 'muro' ? 0.85 : 0.80) : 1;
function kmax(el, nivel) {
 const C = CIUDADES[S.ciudad];
 const a = absorciones()[el];
 return { inv: kmaxInvierno(el, nivel, C.tdmn), ver: KVER[el][nivel] * correccionColor(a, el) };
}

// Muro por capas (IRAM 11601; valores del caso de Oberá de la cátedra)
const RSI = 0.13, RSE = 0.04;
const CAPA = {
 revInt: { n: 'Revoque interior', e: '2 cm', l: '0,93', r: 0.022 },
 yeso: { n: 'Placa de yeso', e: '1,25 cm', l: '0,40', r: 0.031 },
 ladrillo: { n: 'Ladrillo cerámico hueco 18×18×25 (9 huecos)', e: '18 cm', l: 'tabla', r: 0.41 },
 revExt: { n: 'Revoque exterior', e: '2,5 cm', l: '1,16', r: 0.022 }
};
const eps = (cm) => ({ n: 'Poliestireno expandido 20 kg/m³', e: `${cm} cm`, l: '0,035', r: cm / 100 / 0.035 });
// (21/11-d) Muro exterior: lo habitual en la zona, aunque no cumpla.
// R de los ladrillos de 12 y 15: a validar con la tabla de IRAM 11601.
const BASES_MURO = {
 lch18: { n: 'Ladrillo hueco 18', d: 'Como el prototipo', esp: 18, capa: CAPA.ladrillo, apu: 10, enc: 18 },
 lch12: { n: 'Ladrillo hueco 12', d: 'Muy usado, más frío', esp: 12, capa: { n: 'Ladrillo cerámico hueco 12×18×33', e: '12 cm', l: 'tabla', r: 0.32, aValidar: true }, apu: 19, enc: 20 },
 lc15: { n: 'Ladrillo común 15', d: 'Macizo, el más frío', esp: 15, capa: { n: 'Ladrillo común macizo', e: '15 cm', l: '0,81', r: 0.15 / 0.81, aValidar: true }, apu: 9, enc: 20 }
};
const ORDEN_BASE = ['lch18', 'lch12', 'lc15'];
const AIS_MURO = { base: { n: 'Sin aislación', cm: 0 }, eps2: { n: 'EPS 2 cm + placa de yeso', cm: 2 }, eps5: { n: 'EPS 5 cm + placa de yeso', cm: 5 }, eps8: { n: 'EPS 8 cm + placa de yeso', cm: 8 } };
function capasMuro(ais = S.muro, base = S.muroBase) {
 const b = (BASES_MURO[base] || BASES_MURO.lch18).capa;
 const cm = (AIS_MURO[ais] || AIS_MURO.base).cm;
 return cm ? [CAPA.yeso, eps(cm), b, CAPA.revExt] : [CAPA.revInt, b, CAPA.revExt];
}
const kMuro = (ais = S.muro, base = S.muroBase) => 1 / (RSI + RSE + capasMuro(ais, base).reduce((t, c) => t + c.r, 0));
// Techos: K orientativo hasta cargar sus capas (a validar)
const TECHOS_AIS = {
 sin: { n: 'Sin aislación', k: 2.02, cm: 0 },
 ais10: { n: 'Aislante con aluminio (prototipo)', k: 0.87, cm: 1 },
 lana5: { n: 'Lana de vidrio 5 cm', k: 0.57, cm: 5 },
 lana10: { n: 'Lana de vidrio 10 cm', k: 0.33, cm: 10 },
 lana20: { n: 'Lana de vidrio 20 cm', k: 0.18, cm: 20 }
};
const ORDEN_MURO = ['base', 'eps2', 'eps5', 'eps8'];
const ORDEN_TECHO = ['sin', 'ais10', 'lana5', 'lana10', 'lana20'];
// (24/11) Confort como análisis: qué nivel alcanza cada elemento con lo elegido,
// qué cambiar para llegar al objetivo y una etiqueta orientativa (no es la oficial).
const limK = (el, nivel) => { const m = kmax(el, nivel); return Math.min(m.inv, m.ver); };
const nivelDe = (el, k) => ['A', 'B', 'C'].find(nv => k <= limK(el, nv) + 1e-9) || null;
const RANGO = { A: 3, B: 2, C: 1 };
function propuestaNivel(nivel) {
 const out = {};
 if (kMuro(S.muro) > limK('muro', nivel) + 1e-9) { const m = ORDEN_MURO.find(id => kMuro(id) <= limK('muro', nivel) + 1e-9); if (m) out.muro = m; }
 if (TECHOS_AIS[S.aisTecho].k > limK('techo', nivel) + 1e-9) { const t = ORDEN_TECHO.find(id => TECHOS_AIS[id].k <= limK('techo', nivel) + 1e-9); if (t) out.aisTecho = t; }
 return out;
}
const K_VIDRIO = { simple: 5.8, dvh: 2.9 }; // W/m²K orientativos (a validar con IRAM 11507-4 y el fabricante)
const ETI_COL = { A: '#15803D', B: '#4D9A2A', C: '#93B51F', D: '#E0B400', E: '#E89A1C', F: '#E0661F', G: '#C2261F' };
function etiquetaEstimada() {
 const nm = nivelDe('muro', kMuro()), nt = nivelDe('techo', TECHOS_AIS[S.aisTecho].k);
 const pts = (RANGO[nm] || 0) + (RANGO[nt] || 0) + (S.dvh ? 1 : 0) + (S.agua === 'solar' ? 1 : 0);
 const letra = pts >= 8 ? 'A' : pts >= 7 ? 'B' : pts >= 5 ? 'C' : pts >= 4 ? 'D' : pts >= 3 ? 'E' : pts >= 2 ? 'F' : 'G';
 return { letra, pts, nm, nt };
}
function confortHtml() {
 const km = kMuro(), kt = TECHOS_AIS[S.aisTecho].k, E = etiquetaEstimada();
 const peor = [E.nm, E.nt].includes(null) ? null : (RANGO[E.nm] < RANGO[E.nt] ? E.nm : E.nt);
 const chipNv = (nv) => nv ? `<b class="casa-nv casa-nv-${nv}">nivel ${nv}</b>` : '<b class="casa-nv casa-nv-no">no llega a C</b>';
 const filaEl = (n, det, nv, ir) => `<li><span><b>${n}</b><small>${det}</small></span><span>${nv}${ir ? ` <button type="button" class="casa-link" data-casa="grupo2:${ir}">Cambiar</button>` : ''}</span></li>`;
 const prop = propuestaNivel(S.nivel), faltaM = km > limK('muro', S.nivel) + 1e-9, faltaT = kt > limK('techo', S.nivel) + 1e-9;
 const props = [];
 if (faltaM) props.push(prop.muro ? `<li><span>Muros: <b>${esc(AIS_MURO[prop.muro].n)}</b> en vez de ${esc(AIS_MURO[S.muro].n.toLowerCase())} (K ${f(km, 2)} → ${f(kMuro(prop.muro), 2)}, máx. ${f(limK('muro', S.nivel), 2)})</span>${btn('muro', prop.muro, false, 'Aplicar')}</li>`
 : `<li><span>Muros: ni con EPS 8 cm llega al nivel ${S.nivel} con ${esc(BASES_MURO[S.muroBase].n.toLowerCase())}. Probá con otro ladrillo.</span><button type="button" class="casa-link" data-casa="grupo2:muro">Ver muros</button></li>`);
 if (faltaT) props.push(prop.aisTecho ? `<li><span>Techo: <b>${esc(TECHOS_AIS[prop.aisTecho].n)}</b> en vez de ${esc(TECHOS_AIS[S.aisTecho].n.toLowerCase())} (K ${f(kt, 2)} → ${f(TECHOS_AIS[prop.aisTecho].k, 2)}, máx. ${f(limK('techo', S.nivel), 2)})</span>${btn('aisTecho', prop.aisTecho, false, 'Aplicar')}</li>`
 : `<li><span>Techo: ninguna aislación de la lista llega al nivel ${S.nivel}.</span></li>`);
 const mejoras = [];
 if (!S.dvh) mejoras.push(`<li><span>Doble vidriado hermético: suma en la etiqueta y baja las pérdidas de invierno.</span>${btn('toggle', 'dvh', false, 'Aplicar')}</li>`);
 if (S.agua !== 'solar') mejoras.push(`<li><span>Termotanque solar con apoyo: agua caliente con energía renovable.</span>${btn('agua', 'solar', false, 'Aplicar')}</li>`);
 const escala = 'ABCDEFG'.split('').map((l, i) => `<li class="${l === E.letra ? 'on' : ''}"><span class="casa-eti-barra" style="width:${46 + i * 8}%;background:${ETI_COL[l]}">${l}</span>${l === E.letra ? '<em>◀ tu casa</em>' : ''}</li>`).join('');
 return `
 <label class="casa-label">Tu envolvente hoy</label>
 <ul class="casa-env">
 ${filaEl('Muros', `${esc(BASES_MURO[S.muroBase].n)} · ${esc(AIS_MURO[S.muro].n.toLowerCase())} · K ${f(km, 2)}`, chipNv(E.nm), 'muro')}
 ${filaEl('Techo', `${esc(TECHOS_AIS[S.aisTecho].n)} · K ${f(kt, 2)} (a validar)`, chipNv(E.nt), 'techo')}
 ${filaEl('Aberturas', `${S.dvh ? 'Doble vidriado' : 'Vidrio simple'} · K ≈ ${f(S.dvh ? K_VIDRIO.dvh : K_VIDRIO.simple, 1)} (a validar)`, `<b class="casa-nv">${S.dvh ? 'mejora' : 'estándar'}</b>`, 'abert')}
 ${filaEl('Agua caliente', S.agua === 'solar' ? 'Termotanque solar con apoyo' : 'Sin energía solar', `<b class="casa-nv">${S.agua === 'solar' ? 'renovable' : '—'}</b>`, '')}
 </ul>
 <p class="casa-muted">IRAM 11605 verifica muros y techo en ${esc(S.ciudad)}${peor ? `: tu casa llega al <b>nivel ${peor}</b>` : ': hoy no llega al nivel C'}. Las aberturas no tienen máximo en esa norma, pero pesan en la etiqueta.</p>
 <label class="casa-label">¿A qué nivel querés llegar?</label>
 <div class="casa-grid3">${[['C', 'Mínimo'], ['B', 'Recomendado'], ['A', 'Óptimo']].map(([k, n]) => btn('nivel', k, S.nivel === k, `<b>${n}</b><small>Nivel ${k}</small>`)).join('')}</div>
 <p class="casa-muted">Elegir el nivel no cambia lo que definiste: te dice si cumple y qué cambiar.</p>
 ${props.length ? `<div class="casa-propuestas"><b>Para llegar al nivel ${S.nivel}</b><ul>${props.join('')}</ul>${(prop.muro || prop.aisTecho) && props.length > 1 ? `<button type="button" class="btn-computo casa-aplicar-todo" data-casa="aplicarNivel:${S.nivel}">Aplicar los cambios</button>` : ''}<p class="casa-muted">Las aislaciones todavía no tienen APU: no suman al costo (a cargar).</p></div>`
 : `<p class="casa-ok-nivel">✓ Tu envolvente cumple el nivel ${S.nivel} (IRAM 11605).</p>`}
 <label class="casa-label">Etiqueta de eficiencia estimada</label>
 <div class="casa-eti">
 <ol class="casa-eti-escala" aria-label="Etiqueta estimada: ${E.letra}">${escala}</ol>
 ${mejoras.length ? `<div class="casa-propuestas suave"><b>Para subir la etiqueta</b><ul>${mejoras.join('')}</ul></div>` : ''}
 <p class="casa-muted casa-medidas-nota">Estimación orientativa con puntaje propio (muros, techo, vidrios y agua caliente solar). No es la etiqueta oficial: el índice de prestaciones energéticas (IRAM 11900) lo calcula un certificador con el aplicativo nacional de etiquetado de viviendas.</p>
 </div>`;
}
function recetaNivel(nivel) {
 const mxM = kmax('muro', nivel), mxT = kmax('techo', nivel);
 const lim = (m) => Math.min(m.inv, m.ver);
 const muro = ORDEN_MURO.find(id => kMuro(id) <= lim(mxM)) || 'eps8'; // para el muro elegido
 const aisTecho = ORDEN_TECHO.find(id => TECHOS_AIS[id].k <= lim(mxT)) || 'lana20';
 return { muro, aisTecho };
}

// ---------------------------------------------------------------------------
// Orientación: lote en la manzana + norte → frente del lote (8 rumbos)
// ---------------------------------------------------------------------------
const NOM8 = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const SIG8 = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const idx8 = (b) => Math.round((((b % 360) + 360) % 360) / 45) % 8;
const norm = (a) => ((a % 360) + 360) % 360;
function lotesManzana() {
 const L = [], A = 30, P = 56, M = 28; // manzana de 224 px dentro de 284
 const add = (id, x, y, w, h, lado, esquina, calle2 = null) => L.push({ id, x, y, w, h, lado, esquina, calle2 });
 // (24/11) calle2: de qué lado (mirando el lote desde la calle) está la otra calle de la esquina
 add('e1', A, A, P, P, 0, true, 'der'); add('e2', A + 168, A, P, P, 0, true, 'izq'); add('e3', A + 168, A + 168, P, P, 180, true, 'der'); add('e4', A, A + 168, P, P, 180, true, 'izq');
 for (let i = 0; i < 4; i++) {
 add('a' + i, A + P + i * M, A, M, P, 0, false);
 add('b' + i, A + P + i * M, A + 168, M, P, 180, false);
 add('l' + i, A, A + P + i * M, P, M, 270, false);
 add('r' + i, A + 168, A + P + i * M, P, M, 90, false);
 }
 return L;
}
const puntajeMedianera = (b) => Math.cos((b - 202.5) * Math.PI / 180); // conviene apoyar en la medianera S/SO
function orientacion() {
 const lote = lotesManzana().find(l => l.id === S.lote) || lotesManzana()[0];
 const fb = norm(lote.lado - S.norte); // rumbo hacia donde mira el frente
 const izq = norm(90 + fb), der = norm(fb - 90); // medianeras vistas desde la calle
 // (24/11) La recomendada es la que deja abrir la casa al norte; se puede elegir la otra.
 // En esquina hay una sola medianera lateral: la casa se apoya en esa.
 const solIzq = puntajeMedianera(izq) >= puntajeMedianera(der);
 const calle2 = lote.esquina ? lote.calle2 : null;
 const recIzq = calle2 ? calle2 === 'der' : solIzq;
 const bienIzq = calle2 ? recIzq : (S.medLado === 'otra' ? !recIzq : recIzq);
 const medBien = bienIzq ? izq : der, medOtra = bienIzq ? der : izq;
 const norteFrente = Math.cos(fb * Math.PI / 180); // >0: el norte entra por el frente
 const invertir = norteFrente < -0.3;
 const oeste = Math.sin(fb * Math.PI / 180) < -0.5;
 const i = idx8(fb);
 let titulo, texto;
 if (invertir) { titulo = 'Damos vuelta la casa'; texto = `El norte queda al fondo del lote: el estar y la galería van atrás y los dormitorios hacia la calle. La casa se apoya en la medianera ${SIG8[idx8(medBien)]}.`; }
 else if (norteFrente > 0.3) { titulo = 'Ideal: el estar al frente'; texto = `El sol del norte entra por el frente: ahí va el estar. La casa se apoya en la medianera ${SIG8[idx8(medBien)]} y se abre al ${NOM8[idx8(medBien + 180)]}.`; }
 else { titulo = 'Abrimos la casa hacia el norte'; texto = `El norte queda de costado: la casa se apoya en la medianera ${SIG8[idx8(medBien)]} para que las ventanas de los ambientes miren al ${NOM8[idx8(medBien + 180)]}.`; }
 if (calle2) texto += ` Lote de esquina: la otra calle queda al ${NOM8[idx8(medOtra)]}, así que la casa se apoya en la única medianera lateral.`;
 else if (bienIzq !== solIzq) texto += ` Ojo: por el sol recomendamos apoyarla en la medianera ${SIG8[idx8(medOtra)]}.`;
 if (oeste) texto += ' El frente recibe el sol de la tarde: alero más largo y ventana más chica.';
 const desfavorable = [2, 6].includes(i);
 return { lote, fb, i, nombre: NOM8[i], medArriba: bienIzq, invertir, oeste, medBien, medOtra, calle2, titulo, texto, desfavorable,
 sigRec: SIG8[idx8(recIzq ? izq : der)], sigOtra: SIG8[idx8(recIzq ? der : izq)],
 aguja: norm(270 - fb) /* en la planta la calle queda a la izquierda */ };
}

// ---------------------------------------------------------------------------
// Plantas tipo (metros; u = desde el frente, v = desde la medianera)
// ---------------------------------------------------------------------------
// Medidas editables (21/11-d). La "casa base" arranca con las medidas del
// prototipo, que respetan los mínimos; el usuario las puede cambiar con − / +.
// Mínimos de referencia: pliego Pro.Cre.Ar "Casa Propia" (cita los Estándares
// Mínimos de Calidad para Viviendas de Interés Social, Res. 59/2019): 1.º
// dormitorio lado 2,80 m; 2.º dormitorio 2,50 m; baño lado 1,50 m y 2,70 m²
// (sin bañera); cocina y lavadero ancho 1,60 m y 7 m²; pasillo 0,90 m;
// altura de locales de primera 2,60 m. Si el código local fija otras, rige el
// local: a validar con el Código de Edificación de Oberá.
const MIN = { dorm1: 2.5, dorm: 2.0, banoLado: 1.2, cocLado: 1.5, pas: 0.9, altura: 2.6 }; // (22/11) CE Oberá III.3.3
const REF = { dorm1: 2.8, dorm: 2.5, banoM2: 2.7, cocM2: 7 }; // referencia Res. 59/2019 (Pro.Cre.Ar): aviso, no bloquea
const r2 = (n) => Math.round(n * 100) / 100;
// Parámetros por forma: [clave, etiqueta, valor base, mínimo, máximo, local que muestra]
function paramsTipo(tipo = S.tipo) {
 const P = [];
 const add = (k, n, def, min, max, room, extra = {}) => P.push({ k, n, def, min, max, room, ...extra });
 const pas = D('pas', 1.0, tipo);
 const ultimo = S.dorm === 3 ? 'Dormitorio 3' : 'Dormitorio 2';
 if (tipo === 'compacta') {
 add('soc', 'Ancho de estar y cocina', 4.4, 3.0, 6.0, 'coc');
 add('estar', 'Fondo del estar-comedor', 4.9, 3.0, 7.0, 'estar');
 add('hall', 'Pasillo', 1.1, MIN.pas, 1.5, 'hall');
 add('dorm', 'Ancho de dormitorios y baño', 3.1, MIN.dorm1, 4.5, null);
 add('d1', 'Dormitorio 1', 3.3, MIN.dorm1, 4.5, 'd1');
 add('bano', 'Baño', 1.8, MIN.banoLado, 3.0, 'bano');
 add('d2', 'Dormitorio 2', 2.9, MIN.dorm, 4.5, 'dl');
 if (S.galeria) add('gal', 'Galería (fondo)', 1.8, 1.2, 3.5, 'gal');
 return P;
 }
 if (tipo === 'L') {
 add('fr', 'Ancho del frente (estar y cocina)', 4.0, 3.0, 6.0, null);
 add('estar', 'Estar-comedor', 5.0, 3.0, 7.0, 'estar');
 add('coc', 'Cocina', 3.5, MIN.cocLado, 5.0, 'coc');
 add('ala', 'Ancho del ala de dormitorios', 4.3, r2(pas + MIN.dorm1), 6.0, null);
 } else {
 add('W', 'Ancho de la casa', 4.7, r2(pas + MIN.dorm1), 6.5, null);
 add('estar', 'Estar-comedor', 4.2, 3.0, 7.0, 'estar');
 add('coc', 'Cocina', 1.8, MIN.cocLado, 4.0, 'coc');
 }
 add('pas', 'Pasillo', 1.0, MIN.pas, 1.5, 'pas');
 add('bano', 'Baño', 1.8, MIN.banoLado, 3.0, 'bano');
 add('d1', 'Dormitorio 1', 2.8, MIN.dorm1, 4.5, 'd1');
 if (S.bano2 !== 'no') add('bano2', S.bano2 === 'suite' ? 'Baño en suite' : 'Segundo baño', 1.6, MIN.banoLado, 3.0, 'bano2');
 if (S.dorm === 3) add('d2', 'Dormitorio 2', 2.7, MIN.dorm, 4.5, 'd2');
 add('dl', ultimo, 2.7, MIN.dorm, 4.5, 'dl');
 if (S.galeria) add('gal', tipo === 'L' ? 'Galería (ancho)' : 'Galería (fondo)', tipo === 'L' ? 2.4 : 1.8, tipo === 'L' ? 1.5 : 1.2, tipo === 'L' ? 4.0 : 3.5, 'gal');
 return P;
}
// Valor de una medida (la del usuario o la base)
function D(k, def, tipo = S.tipo) {
 const v = S.dims && S.dims[`${tipo}.${k}`];
 return typeof v === 'number' && isFinite(v) ? r2(v) : def;
}

function tipologia(o) {
 const rooms = [], doors = [], wins = [];
 const R = (id, n, u0, u1, v0, v1, extra = {}) => rooms.push(Object.assign({ id, n, u0: r2(u0), u1: r2(u1), v0: r2(v0), v1: r2(v1), g: id }, extra));
 const winFrente = o.oeste ? 1.0 : 1.6;
 const ala = (a, W, P) => {
 const lado = [{ id: 'bano', n: 'Baño', len: D('bano', 1.8), w: 0.7 }, { id: 'd1', n: 'Dormitorio 1', len: D('d1', 2.8), w: 0.8 }];
 if (S.bano2 === 'pasillo') lado.push({ id: 'bano2', n: 'Baño 2', len: D('bano2', 1.6), w: 0.7 });
 if (S.dorm === 3) lado.push({ id: 'd2', n: 'Dormitorio 2', len: D('d2', 2.7), w: 0.8 });
 let u = a;
 lado.forEach(z => {
 R(z.id, z.n, u, u + z.len, P, W, { banio: z.id.startsWith('bano') });
 doors.push({ r: z.id, e: 'v0', p: 0.2, w: z.w });
 wins.push({ r: z.id, e: 'v1', c: z.len / 2, w: z.id.startsWith('bano') ? 0.6 : 1.2 });
 u += z.len;
 });
 // Baño en suite: entre el pasillo y el último dormitorio, con la puerta hacia el dormitorio
 if (S.bano2 === 'suite') {
 const lb = D('bano2', 1.6);
 R('bano2', 'Baño en suite', u, u + lb, P, W, { banio: true });
 doors.push({ r: 'bano2', e: 'u1', p: Math.max(0.1, (W - P) - 0.9), w: 0.7 });
 wins.push({ r: 'bano2', e: 'v1', c: lb / 2, w: 0.6 });
 u += lb;
 }
 R('pas', '', a, u, 0, P, { g: 'social', noLabel: true });
 const ll = D('dl', 2.7);
 R('dl', S.dorm === 3 ? 'Dormitorio 3' : 'Dormitorio 2', u, u + ll, 0, W);
 doors.push({ r: 'dl', e: 'u0', p: 0.1, w: 0.8 });
 wins.push({ r: 'dl', e: 'u1', c: W / 2, w: 1.2 });
 };
 let Wf, texto;
 const gal = D('gal', S.tipo === 'L' ? 2.4 : 1.8);
 if (S.tipo === 'compacta') {
 const soc = D('soc', 4.4), es = D('estar', 4.9), hall = D('hall', 1.1), dw = D('dorm', 3.1);
 const d1 = D('d1', 3.3), bn = D('bano', 1.8), d2 = D('d2', 2.9);
 Wf = r2(d1 + bn + d2);
 const x0 = soc + hall, coc = Wf - es;
 R('estar', 'Estar-comedor', 0, soc, 0, es, { g: 'social' });
 R('coc', 'Cocina', 0, soc, es, Wf, { g: 'social', cocina: true });
 R('hall', '', soc, x0, 0, Wf, { g: 'social', noLabel: true });
 R('d1', 'Dormitorio 1', x0, x0 + dw, 0, d1);
 R('bano', 'Baño', x0, x0 + dw, d1, d1 + bn, { banio: true });
 R('dl', 'Dormitorio 2', x0, x0 + dw, d1 + bn, Wf);
 doors.push({ r: 'estar', e: 'u0', p: 0.4, w: 0.9 }, { r: 'd1', e: 'u0', p: Math.max(0.1, d1 - 0.9), w: 0.8 }, { r: 'bano', e: 'u0', p: Math.min(0.5, bn - 0.8), w: 0.7 }, { r: 'dl', e: 'u0', p: 0.3, w: 0.8 });
 wins.push({ r: 'estar', e: 'u0', c: Math.max(1.3 + winFrente / 2, es * 0.63), w: winFrente }, { r: 'coc', e: 'u0', c: coc / 2, w: 1.0 }, { r: 'coc', e: 'v1', c: soc / 2, w: 1.0 },
 { r: 'd1', e: 'u1', c: d1 / 2, w: 1.2 }, { r: 'bano', e: 'u1', c: bn / 2, w: 0.6 }, { r: 'dl', e: 'u1', c: d2 / 2, w: 1.2 }, { r: 'dl', e: 'v1', c: dw / 2, w: 1.0 });
 if (S.galeria) R('gal', 'Galería', -gal, 0, 0, es, { semi: true });
 texto = 'Casi cuadrada: menos muro exterior por cada m², por eso es la más económica.';
 } else if (S.tipo === 'L') {
 const fr = D('fr', 4.0), es = D('estar', 5.0), coc = D('coc', 3.5), W = D('ala', 4.3), P = D('pas', 1.0);
 Wf = r2(es + coc);
 R('estar', 'Estar-comedor', 0, fr, 0, es, { g: 'social' });
 R('coc', 'Cocina', 0, fr, es, Wf, { g: 'social', cocina: true });
 doors.push({ r: 'estar', e: 'u0', p: 0.5, w: 0.9 }, { r: 'coc', e: 'u1', p: Math.min(1.0, Math.max(0.1, coc - 0.9)), w: 0.8 });
 wins.push({ r: 'estar', e: 'u0', c: Math.max(1.5 + winFrente / 2, es * 0.52), w: winFrente }, { r: 'coc', e: 'u0', c: coc / 2, w: 1.0 });
 ala(fr, W, P);
 if (S.galeria) R('gal', 'Galería', fr, fr + gal, W, Wf, { semi: true });
 texto = 'Dos alas alrededor de un patio con galería: separa la zona de día y de noche.';
 } else {
 const W = D('W', 4.7), es = D('estar', 4.2), coc = D('coc', 1.8), P = D('pas', 1.0);
 Wf = W;
 R('estar', 'Estar-comedor', 0, es, 0, W, { g: 'social' });
 R('coc', 'Cocina', es, es + coc, 0, W, { g: 'social', cocina: true });
 doors.push({ r: 'estar', e: 'u0', p: 0.3, w: 0.9 });
 wins.push({ r: 'estar', e: 'u0', c: Math.max(1.4 + winFrente / 2, W * 0.62), w: winFrente }, { r: 'estar', e: 'v1', c: es / 2, w: 1.6 }, { r: 'coc', e: 'v1', c: coc / 2, w: Math.min(1.0, coc - 0.3) });
 ala(es + coc, W, P);
 if (S.galeria) R('gal', 'Galería', -gal, 0, 0, W, { semi: true });
 texto = 'Angosta y larga, sobre una medianera, como el Prototipo A de IPRODHA.';
 }
 const solid = rooms.filter(r => !r.semi);
 const L = Math.max(...solid.map(r => r.u1));
 return ajustarVentanas({ rooms, doors, wins, Wf, L, texto });
}

// ¿La casa entra en el lote? (24/11: las medidas del lote se eligen en el croquis) Devuelve el motivo si no entra.
function problemaLote(T) {
 const RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4, A = S.loteAncho, F = S.loteFondo;
 if (T.Wf > A + 1e-9) return `La casa queda de ${f(T.Wf, 2)} m de ancho y el lote tiene ${f(A, 2)} m.`;
 if (S.cochera && S.tipo === 'lineal' && T.Wf + 3.8 > A + 1e-9) return `Con cochera al costado, la casa no puede pasar de ${f(A - 3.8, 2)} m de ancho.`;
 if (RET + T.L > F - 1 + 1e-9) return `La casa queda de ${f(T.L, 2)} m de largo: con el retiro de ${f(RET, 1)} m no deja patio en el lote de ${f(F, 2)} m.`;
 if (S.tipo === 'compacta' && T.Wf - D('estar', 4.9) < MIN.cocLado) return `La cocina queda de menos de ${f(MIN.cocLado, 2)} m: achicá el estar o agrandá los dormitorios.`;
 if (S.tipo === 'L' && D('ala', 4.3) > T.Wf - 1.2) return 'El ala de dormitorios queda más ancha que el frente: no queda patio.';
 return incumpleCodigo(T);
}
// Avisos de superficie (no bloquean)
function avisosMedidas(T) {
 const av = [];
 T.rooms.forEach(r => {
 const a = (r.u1 - r.u0) * (r.v1 - r.v0), lmin = Math.min(r.u1 - r.u0, r.v1 - r.v0);
 if (r.banio && a < REF.banoM2) av.push(`${r.n}: ${f(a)} m²; el pliego Pro.Cre.Ar pide ${f(REF.banoM2)} m² (referencia, no obligatoria).`);
 if (r.cocina && a < REF.cocM2) av.push(`${r.n}: ${f(a)} m²; el pliego Pro.Cre.Ar pide ${f(REF.cocM2)} m² para cocina y lavadero (referencia).`);
 if (r.id === 'd1' && lmin < REF.dorm1 - 0.001) av.push(`Dormitorio 1: lado de ${f(lmin, 2)} m; el pliego Pro.Cre.Ar pide ${f(REF.dorm1, 2)} m (referencia).`);
 if (/^d[l2]$/.test(r.id) && lmin < REF.dorm - 0.001) av.push(`${r.n}: lado de ${f(lmin, 2)} m; el pliego Pro.Cre.Ar pide ${f(REF.dorm, 2)} m (referencia).`);
 });
 return av;
}


// ---------------------------------------------------------------------------
// (22/11) Reglamento: Código de Edificación de Oberá (texto "Actualizado" del
// Plan Estratégico Oberá). Posadas: a validar (el texto público disponible
// no trae el capítulo de locales).
//  · III.3.2.2 alturas: 1.ª clase 2,60 m; cocina 2,40 m; baño 2,10 m.
//  · III.3.3.1 áreas y lados (vivienda con varios locales): uno de 2,50 m / 10 m²,
//    los demás 2,00 m / 6 m².
//  · III.3.3.2 cocina 3 m² y lado 1,50 m; baños según artefactos (tabla).
//  · III.3.5.2 iluminación i ≥ A/X (X: 15 a frente libre, 12 bajo parte cubierta,
//    10 a patio libre, 8 a patio bajo parte cubierta); local alargado (a > 2b) con
//    el vano en el lado corto: i ≥ A/X·(r−1). Ventilación k ≥ i/3.
//  · III.3.5.3 cocina i ≥ 0,50 m², k ≥ 2/3 i (interpretación, a validar);
//    baño k ≥ 0,20 m² (o conducto de 0,03 m²).
// ---------------------------------------------------------------------------
const CE = { altura1: 2.6, alturaCoc: 2.4, alturaBano: 2.1, lado1: 2.5, area1: 10, ladoN: 2.0, areaN: 6, cocM2: 3, cocLado: 1.5, banoK: 0.2 };
// Baños: área y lado mínimos según los artefactos (CE Oberá III.3.3.2 c)
function minimoBano(id) {
 const a = artefactosBano(id);
 if (a.banera) return a.bidet ? { m2: 3.4, lado: 1.2 } : { m2: 2.6, lado: 1.2 };
 return a.bidet ? { m2: 3.0, lado: 1.2 } : { m2: 2.3, lado: 1.2 };
}
function artefactosBano(id) {
 const x = (S.artef && S.artef[id]) || {};
 return { bidet: !!x.bidet, banera: !!x.banera, vanitory: x.vanitory !== false };
}
// Incumplimientos del código (bloquean el cambio que los provoca)
function incumpleCodigo(T) {
 const solid = T.rooms.filter(r => !r.semi && !r.noLabel);
 const lados = (r) => { const a = r.u1 - r.u0, b = r.v1 - r.v0; return { a: a * b, l: Math.min(a, b) }; };
 const prim = solid.filter(r => !r.banio && !r.cocina);
 if (prim.length && !prim.some(r => { const x = lados(r); return x.l >= CE.lado1 - 1e-9 && x.a >= CE.area1 - 1e-9; })) return `Ningún local principal llega a ${f(CE.lado1, 2)} m de lado y ${f(CE.area1, 0)} m² (CE Oberá III.3.3.1).`;
 for (const r of prim) { const x = lados(r); if (x.l < CE.ladoN - 1e-9 || x.a < CE.areaN - 1e-9) return `${r.n}: queda de ${f(x.l, 2)} m de lado y ${f(x.a)} m²; el código pide ${f(CE.ladoN, 2)} m y ${f(CE.areaN, 0)} m² (CE Oberá III.3.3.1).`; }
 for (const r of solid.filter(z => z.cocina)) { const x = lados(r); if (x.l < CE.cocLado - 1e-9 || x.a < CE.cocM2 - 1e-9) return `La cocina queda de ${f(x.l, 2)} m de lado; el código pide ${f(CE.cocLado, 2)} m y ${f(CE.cocM2, 0)} m² (CE Oberá III.3.3.2).`; }
 for (const r of solid.filter(z => z.banio)) { const x = lados(r), m = minimoBano(r.id); if (x.l < m.lado - 1e-9 || x.a < m.m2 - 1e-9) return `${r.n}: ${f(x.a)} m²; con esos artefactos el código pide ${f(m.m2, 2)} m² y ${f(m.lado, 2)} m de lado (CE Oberá III.3.3.2).`; }
 return '';
}

// Ventanas: anchos comerciales y altura según el local
const ANCHOS_VENT = [0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.4];
const altoVent = (w, banio) => banio ? 0.5 : (w >= 1.5 ? 1.4 : 1.1);
const PARTE_ABRIBLE = 0.5; // ventana corrediza: ventila la mitad (como en la planilla municipal)
// Exposición de un vano: X del cuadro III.3.5.2 (frente o contrafrente / patio, libre o bajo parte cubierta)
function exposicion(T, r, w) {
 const g = { u0: [r.u0, 'u'], u1: [r.u1, 'u'], v0: [r.v0, 'v'], v1: [r.v1, 'v'] }[w.e];
 const L = Math.max(...T.rooms.filter(z => !z.semi).map(z => z.u1));
 const frente = g[1] === 'u' && (Math.abs(g[0]) < 1e-6 || Math.abs(g[0] - L) < 1e-6);
 // punto justo afuera del vano: ¿cae bajo una galería?
 const pu = g[1] === 'u' ? g[0] + (w.e === 'u0' ? -0.3 : 0.3) : r.u0 + w.c;
 const pv = g[1] === 'v' ? g[0] + (w.e === 'v0' ? -0.3 : 0.3) : r.v0 + w.c;
 const cubierta = T.rooms.some(z => z.semi && pu > z.u0 && pu < z.u1 && pv > z.v0 && pv < z.v1);
 return { X: frente ? (cubierta ? 12 : 15) : (cubierta ? 8 : 10), frente, cubierta };
}
const largoBorde = (r, e) => (e === 'u0' || e === 'u1') ? r.v1 - r.v0 : r.u1 - r.u0;
// Iluminación y ventilación de un local con sus ventanas
function ilumLocal(T, r) {
 const ws = T.wins.filter(w => w.r === r.id);
 const a = r.u1 - r.u0, b = r.v1 - r.v0, A = a * b, largo = Math.max(a, b), corto = Math.min(a, b), rr = largo / corto;
 const proy = ws.reduce((t, w) => t + w.w * w.h, 0);
 const kProy = proy * PARTE_ABRIBLE;
 if (r.banio) return { A, nec: 0, proy, kNec: CE.banoK, kProy, X: null, ok: kProy >= CE.banoK - 1e-9, clase: 'baño' };
 const main = ws.slice().sort((p, q) => q.w * q.h - p.w * p.h)[0];
 const ex = main ? exposicion(T, r, main) : { X: 10 };
 let nec = A / ex.X;
 if (main && rr > 2 && Math.abs(largoBorde(r, main.e) - corto) < 1e-6) nec *= (rr - 1);
 if (r.cocina) nec = Math.max(nec, 0.5);
 const kNec = r.cocina ? nec * 2 / 3 : nec / 3;
 return { A, nec, proy, kNec, kProy, X: ex.X, ok: proy >= nec - 1e-9 && kProy >= kNec - 1e-9, clase: r.cocina ? 'cocina' : 'primera', alargado: rr > 2 };
}
// Planilla de iluminación y ventilación (como la del legajo municipal)
function planillaHtml(T) {
 const filas = planillaIlum(T);
 const ok = filas.every(x => x.ok);
 return `<div class="casa-planilla">
 <label class="casa-label">Iluminación y ventilación <span class="casa-muted">· CE Oberá III.3.5</span></label>
 <table class="casa-mini-tabla"><thead><tr><th>Local</th><th>Iluminación<br><small>nec. / proy.</small></th><th>Ventilación<br><small>nec. / proy.</small></th><th></th></tr></thead><tbody>
 ${filas.map(x => `<tr><td>${esc(nombreLocalCorto(x.r))}${x.X ? ` <small class="casa-muted">A/${x.X}${x.alargado ? '·(r−1)' : ''}</small>` : ''}</td><td>${x.clase === 'baño' ? '—' : `${f(x.nec, 2)} / ${f(x.proy, 2)}`}</td><td>${f(x.kNec, 2)} / ${f(x.kProy, 2)}</td><td><b class="${x.ok ? 'ok' : 'no'}">${x.ok ? '✓' : '✗'}</b></td></tr>`).join('')}
 </tbody></table>
 <p class="casa-muted">${ok ? 'Todos los locales cumplen.' : 'Hay locales que no llegan: agrandá la ventana desde el croquis (paso 1) o el local.'} Ventanas corredizas (ventila la mitad). Frente libre A/15, bajo galería A/12, a patio A/10 (criterio a validar con la Dirección de Obras).</p>
 </div>`;
}
// Ajusta los anchos: respeta el que eligió el usuario y agranda hasta cumplir
function ajustarVentanas(T) {
 T.wins.forEach(w => { const r = T.rooms.find(z => z.id === w.r); w.h = altoVent(w.w, r && r.banio); w.base = w.w; });
 T.rooms.filter(r => !r.semi && !r.noLabel).forEach(r => {
 const ws = T.wins.filter(w => w.r === r.id);
 if (!ws.length) return;
 const w = ws[0], lista = r.banio ? ANCHOS_VENT.filter(x => x <= 1.0) : ANCHOS_VENT;
 const max = Math.max(0.4, largoBorde(r, w.e) - 0.3);
 const elegido = S.vent && S.vent[`${S.tipo}.${r.id}`];
 const pon = (x) => { w.w = r2(Math.min(x, max)); w.h = altoVent(w.w, r.banio); w.c = Math.min(Math.max(w.c, w.w / 2 + 0.15), largoBorde(r, w.e) - w.w / 2 - 0.15); };
 if (typeof elegido === 'number') pon(elegido);
 // si no cumple, se agranda al ancho comercial siguiente (sin pasarse del muro)
 let i = lista.findIndex(x => x >= w.w - 1e-9);
 while (!ilumLocal(T, r).ok && i >= 0 && i < lista.length - 1 && w.w < max - 1e-9) { i++; pon(lista[i]); }
 w.auto = w.w !== (typeof elegido === 'number' ? elegido : w.base);
 });
 return T;
}
function planillaIlum(T) {
 return T.rooms.filter(r => !r.semi && !r.noLabel).map(r => ({ r, ...ilumLocal(T, r), vent: T.wins.filter(w => w.r === r.id) }));
}

// ---------------------------------------------------------------------------
// (22/11) Instalación eléctrica: AEA 90364-7-770 (2017)
//  · 770.7.3 grado: cubierta + 50 % semicubierta → Mínimo ≤ 60 · Medio ≤ 130 · Elevado ≤ 200 · Superior.
//  · 770.7.4 circuitos mínimos: 2 · 3 · 5 · 6.
//  · Tabla 770.7.III puntos mínimos de utilización por ambiente.
// ---------------------------------------------------------------------------
function instalElec(T, med) {
 const sup = med.m2Cub + 0.5 * med.semi;
 const grado = sup <= 60 ? 'Mínimo' : sup <= 130 ? 'Medio' : sup <= 200 ? 'Elevado' : 'Superior';
 const gi = ['Mínimo', 'Medio', 'Elevado', 'Superior'].indexOf(grado);
 const extra = S.elec === 'completo';
 const locales = [];
 T.rooms.forEach(r => {
 const a = r.u1 - r.u0, b = r.v1 - r.v0, A = a * b, largo = Math.max(a, b);
 let iug = 0, tug = 0, mod = 0, tipo = '';
 if (r.semi) { tipo = 'Galería'; iug = Math.max(1, Math.ceil(largo / 5)); }
 else if (r.noLabel) { tipo = 'Pasillo'; iug = Math.max(1, Math.ceil(largo / 5)); tug = gi >= 1 && largo > 2 ? Math.ceil(largo / 5) : 0; }
 else if (r.banio) { tipo = 'Baño'; iug = 1; tug = 1; }
 else if (r.cocina) { tipo = 'Cocina'; iug = gi >= 1 ? 2 : 1; tug = gi >= 3 ? 4 : 3; mod = gi >= 2 ? 3 : 2; }
 else if (r.id === 'estar') { tipo = 'Estar-comedor'; iug = Math.max(1, Math.ceil(A / 18)); tug = Math.max(2, Math.ceil(A / 6)); }
 else { tipo = 'Dormitorio'; iug = A > 36 && gi >= 2 ? 2 : 1; tug = A < 10 ? 2 : 3; }
 if (extra && !r.semi && !r.noLabel && !r.banio) tug += 1;
 if (extra && r.id === 'estar') iug += 1;
 locales.push({ r, nombre: r.n || 'Pasillo', tipo, iug, tug, mod, aa: !!(S.aa && S.aa[r.id]) && !r.semi && !r.noLabel && !r.banio && !r.cocina, vt: !!S.ventTecho && /^d/.test(r.id) });
 });
 if (S.cochera) locales.push({ r: null, nombre: 'Cochera', tipo: 'Galería', iug: 2, tug: extra ? 1 : 0, mod: 0 });
 locales.push({ r: null, nombre: 'Lavadero (patio)', tipo: 'Lavadero', iug: 1, tug: gi >= 1 ? 2 : 1, mod: 0 });
 const exteriores = extra ? 2 : 1; // luces de frente y fondo
 const iug = locales.reduce((t, l) => t + l.iug + (l.vt ? 1 : 0), 0) + exteriores;
 const tug = locales.reduce((t, l) => t + l.tug + (l.mod ? 1 : 0), 0);
 // circuitos: mínimo por grado y no más de 15 bocas por circuito (770.6)
 const minC = [2, 3, 5, 6][gi];
 let cIug = Math.max(gi >= 1 ? 1 : 1, Math.ceil(iug / 15)), cTug = Math.max(1, Math.ceil(tug / 15));
 while (cIug + cTug < minC) { if (cTug <= cIug) cTug++; else cIug++; }
 const aa = locales.filter(l => l.aa);
 const cocElec = S.coccion === 'electrica';
 const tue = aa.length + (S.agua === 'termo-elec' || S.agua === 'solar' ? 1 : 0) + (cocElec ? 1 : 0) + (S.bomba ? 1 : 0);
 return { sup, grado, locales, iug, tug, exteriores, cIug, cTug, minC, tue, aa, cocElec };
}
// Frigorías del split: estimación de mostrador (≈ 150 frig/m² en clima cálido, a validar) al tamaño comercial
const FRIG = [2250, 3000, 4500, 5500, 6000];
const LUMINARIAS = { plafon: 'plafones LED', spots: 'spots embutidos LED', colgantes: 'colgantes y apliques' };
const nombreLocalCorto = (r) => (r.n || 'Pasillo').replace('Dormitorio', 'Dorm.');
const frigorias = (A) => FRIG.find(x => x >= A * 150) || 6000;
// Símbolos de instalaciones sobre la planta (esquema, no es un plano de instalación).
// El rótulo del local va al centro: los símbolos se corren arriba/abajo de él.
function simbolosInst(T, capa, E) {
 const out = [];
 if (!capa || !E) return out;
 const C = (r) => ({ uc: (r.u0 + r.u1) / 2, vc: (r.v0 + r.v1) / 2, a: r.u1 - r.u0, b: r.v1 - r.v0 });
 const perimetro = (r, n, ins, fn) => {
 const { a, b } = C(r), per = 2 * (a + b);
 for (let k = 0; k < n; k++) {
 let s = per * (k + 0.5) / n, u, v;
 if (s < a) { u = r.u0 + s; v = r.v0 + ins; }
 else if ((s -= a) < b) { u = r.u1 - ins; v = r.v0 + s; }
 else if ((s -= b) < a) { u = r.u1 - s; v = r.v1 - ins; }
 else { s -= a; u = r.u0 + ins; v = r.v1 - s; }
 fn(u, v, k);
 }
 };
 // n puntos repartidos, siempre corridos del centro en v (donde está el rótulo)
 const repartir = (r, n, lado, fn) => {
 const { uc, vc, a, b } = C(r), dv = lado * Math.min(0.3 * b, Math.max(0.45, 0.22 * b));
 for (let k = 0; k < n; k++) {
 if (n === 1) fn(uc, vc + dv, k);
 else if (a >= b) fn(r.u0 + a * (k + 0.5) / n, vc + dv, k);
 else fn(uc, r.v0 + b * (k + 0.5) / n, k);
 }
 };
 // fichas en filas de a 2 (o todas si el local es ancho) contra un muro, lejos del rótulo
 const fila = (r, n, fn) => {
 const { a, b } = C(r), cols = a >= 2.6 ? n : Math.min(2, n);
 for (let k = 0; k < n; k++) {
 const c = k % cols, f2 = Math.floor(k / cols);
 fn(r.u0 + a * (c + 0.5) / cols, r.v1 - Math.min(0.4, b * 0.12) - f2 * Math.min(0.55, b * 0.16), k);
 }
 };
 if (capa === 'elec') {
 E.locales.filter(l => l.r).forEach(l => {
 const r = l.r;
 repartir(r, l.iug, 1, (u, v) => out.push({ u, v, c: 'iug', t: 'Boca de iluminación (IUG)' }));
 if (l.vt) repartir(r, 1, -1, (u, v) => out.push({ u, v, c: 'chip vt', l: 'V', t: 'Ventilador de techo' }));
 perimetro(r, l.tug + (l.mod ? 1 : 0), 0.2, (u, v, k) => out.push({ u, v, c: k >= l.tug ? 'mod' : 'tug', t: k >= l.tug ? 'Módulos para artefactos fijos' : 'Tomacorriente (TUG)' }));
 if (l.aa) { const { uc } = C(r); out.push({ u: uc + 0.5, v: r.v1 - 0.3, c: 'chip aa', l: 'AA', t: 'Toma para aire acondicionado (uso especial)' }); }
 });
 }
 if (capa === 'agua') {
 T.rooms.filter(r => r.banio).forEach(r => {
 const a = artefactosBano(r.id);
 const lista = [['IN', 'Inodoro'], ['LV', a.vanitory ? 'Lavatorio con vanitory' : 'Lavatorio'], a.bidet ? ['BI', 'Bidé'] : null, a.banera ? ['BA', 'Bañera'] : ['DU', 'Ducha']].filter(Boolean);
 fila(r, lista.length, (u, v, k) => out.push({ u, v, c: 'chip agua', l: lista[k][0], t: lista[k][1] }));
 });
 T.rooms.filter(r => r.cocina).forEach(r => {
 const cal = S.agua !== 'sin' ? [{ 'termo-elec': 'TE', 'termo-gas': 'TG', calefon: 'CA', solar: 'TS' }[S.agua], { 'termo-elec': 'Termotanque eléctrico', 'termo-gas': 'Termotanque a gas', calefon: 'Calefón', solar: 'Termotanque solar (colector en el techo)' }[S.agua], 'calor'] : null;
 const lista = [['PC', 'Pileta de cocina', 'agua'], [S.coccion === 'electrica' ? 'AE' : 'AG', S.coccion === 'electrica' ? 'Anafe y horno eléctricos' : 'Cocina a gas', 'agua'], cal].filter(Boolean);
 fila(r, lista.length, (u, v, k) => out.push({ u, v, c: `chip ${lista[k][2]}`, l: lista[k][0], t: lista[k][1] }));
 });
 }
 if (capa === 'term') {
 if (S.placard !== 'no') T.rooms.filter(r => /^d/.test(r.id)).forEach(r => { const { uc } = C(r); out.push({ u: uc, v: r.v0 + 0.35, c: 'chip mueble', l: 'Placard', t: 'Placard' }); });
 if (S.mueblesCocina !== 'no') T.rooms.filter(r => r.cocina).forEach(r => fila(r, S.mueblesCocina === 'completo' ? 2 : 1, (u, v, k) => out.push({ u, v, c: 'chip mueble', l: ['Mesada', 'Alacena'][k], t: ['Bajo mesada y mesada', 'Alacena'][k] })));
 }
 if (capa === 'equipo') {
 E.locales.filter(l => l.r && l.aa).forEach(l => { const { uc } = C(l.r); out.push({ u: uc, v: l.r.v1 - 0.3, c: 'chip aa', l: `AA ${frigorias((l.r.u1 - l.r.u0) * (l.r.v1 - l.r.v0))}`, t: 'Aire acondicionado split (frigorías estimadas)' }); });
 E.locales.filter(l => l.r && l.vt).forEach(l => repartir(l.r, 1, -1, (u, v) => out.push({ u, v, c: 'chip vt', l: 'V', t: 'Ventilador de techo' })));
 }
 return out;
}
// (22/11-b) Muebles, tanque, pluviales, ampliación, Factor K y cronograma
function mlMuebleCocina(T) {
 const c = T.rooms.find(r => r.cocina);
 if (!c) return 2.4;
 return Math.max(1.8, Math.min(3.6, Math.max(c.u1 - c.u0, c.v1 - c.v0) - 0.9));
}
// Tanque de reserva: un día de consumo (dotación a validar con OSN / prestador)
function tanque() {
 const personas = 1 + S.dorm, dot = 250, need = personas * dot;
 const litros = [500, 750, 1000, 1100, 1500, 2000, 2500].find(x => x >= need) || 2750;
 return { personas, dot, litros };
}
function pluviales(T, M, fach) {
 const area = M.m2Cub + M.galeria + M.cochera + 2 * (M.L + M.Wmax) * (fach.AL || 0);
 const m2PorBajada = 60; // ≈ 1 cm² de bajada por m² de techo con Ø 100 (criterio práctico, a validar con OSN)
 const bajadas = Math.max(2, Math.ceil(area / m2PorBajada));
 let canaleta = 0, txtCanaleta = '';
 if (S.techo === '1') { canaleta = M.L + 1; txtCanaleta = 'Borde bajo, del lado libre (no sobre la medianera)'; }
 else if (S.techo === '2') { canaleta = 2 * (M.L + 1); txtCanaleta = 'Los dos bordes largos'; }
 else if (S.techo === '4') { canaleta = 2 * (M.L + M.Wmax) + 2; txtCanaleta = 'Todo el perímetro'; }
 return { area, bajadas, m2PorBajada, canaleta, txtCanaleta, desague: Math.round(M.L + 6) };
}
// Ampliación futura: un dormitorio más al final de la casa (si entra en el lote)
function ampliacion(T) {
 const RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4;
 const largo = 3.0, ancho = S.tipo === 'L' ? D('ala', 4.3) : S.tipo === 'compacta' ? Math.min(T.Wf, 3.4) : T.Wf;
 const entra = RET + T.L + largo <= S.loteFondo - 1 + 1e-9;
 return { u0: T.L, u1: T.L + largo, v0: 0, v1: ancho, m2: largo * ancho, entra };
}
const kFactor = () => Apu.computeKFactor ? (Apu.computeKFactor({ gastosGenerales: S.k.gg, beneficio: S.k.ben, iibb: S.k.iibb, iva: S.k.iva }) || 1) : 1;
// Cronograma orientativo: días = horas de mano de obra de las APU ÷ (cuadrilla × 8 h)
const FASES = [
 ['Preliminares', ['Tareas preliminares']], ['Fundaciones', ['Fundaciones', 'Contrapisos']], ['Muros y estructura', ['Mampostería', 'Tabiques']],
 ['Techo', ['Cubierta']], ['Instalaciones', ['Instalación sanitaria', 'Instalación eléctrica', 'Instalación de gas', 'Instalación pluvial']],
 ['Revoques y aislaciones', ['Revoques', 'Aislaciones']], ['Pisos', ['Pisos']], ['Revestimientos y cielorrasos', ['Revestimientos', 'Cielorrasos']],
 ['Aberturas', ['Aberturas']], ['Pinturas', ['Pinturas']], ['Muebles y equipamiento', ['Muebles fijos', 'Equipamiento']], ['Exterior', ['Exterior']], ['Limpieza', ['Limpieza']]
];
function cronograma(lineas, K) {
 const hsDia = Math.max(2, S.cuadrilla || 2) * 8;
 let fin = 0, iniTecho = 0;
 const fases = FASES.map(([n, rubros]) => {
 const ls = lineas.filter(l => rubros.includes(l.rubro));
 const horas = ls.reduce((t, l) => t + (l.horas || 0), 0);
 const costo = ls.reduce((t, l) => t + (l.total || 0), 0) * K;
 const sinApu = ls.filter(l => !l.item).length;
 const dias = horas > 0 ? Math.max(1, Math.ceil(horas / hsDia)) : (costo > 0 ? 1 : 0);
 return { n, horas, costo, dias, sinApu, lineas: ls.length };
 }).filter(x => x.lineas);
 fases.forEach(x => {
 if (x.n === 'Instalaciones') { x.ini = iniTecho; } // las instalaciones arrancan junto con el techo y corren en paralelo
 else { x.ini = Math.max(0, fin - Math.round(0.2 * (fases[fases.indexOf(x) - 1] || { dias: 0 }).dias)); }
 x.fin = x.ini + x.dias;
 if (x.n === 'Techo') iniTecho = x.ini;
 if (x.n !== 'Instalaciones') fin = Math.max(fin, x.fin);
 });
 const total = Math.max(...fases.map(x => x.fin), 1);
 const meses = Math.max(1, Math.ceil(total / 22)); // 22 días hábiles por mes
 const porMes = Array.from({ length: meses }, () => 0);
 fases.forEach(x => { if (!x.dias) return; for (let d = x.ini; d < x.fin; d++) porMes[Math.min(meses - 1, Math.floor(d / 22))] += x.costo / x.dias; });
 return { fases, total, meses, porMes, hsDia };
}

// ---------------------------------------------------------------------------
// Planta: muros (recorriendo los bordes), puertas, ventanas, rótulos y
// las mediciones que usa el cómputo.
// ---------------------------------------------------------------------------
function plano(o, T, S_px, capa = '', E = null) {
 // (24/11) Lote con medidas propias. En esquina la otra calle va del lado libre (el de enfrente a la medianera de la casa).
 const SC = S_px, CALLE = 26, LX = CALLE + 8, LOTE_L = S.loteFondo, LOTE_A = S.loteAncho, FS = SC >= 18 ? 10 : 8;
 const CAL2 = o.calle2 ? 24 : 0, LT = 14 + (o.medArriba ? 0 : CAL2);
 const RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4;
 const MURO = '#2B3038', FINO = '#7A8492';
 const { rooms, doors, wins, L } = T;
 const solid = rooms.filter(r => !r.semi);
 const at = (u, v) => solid.find(r => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1) || null;
 const byId = (id) => rooms.find(r => r.id === id);
 const su = o.invertir ? -1 : 1, sv = o.medArriba ? 1 : -1;
 const X0 = LX + RET * SC, loteAbajo = LT + LOTE_A * SC, yCotaLote = loteAbajo + 8 + (o.medArriba ? CAL2 : 0);
 const X = (u) => o.invertir ? X0 + (L - u) * SC : X0 + u * SC;
 const Y = (v) => o.medArriba ? LT + v * SC : loteAbajo - v * SC;
 const rect = (u1, u2, v1, v2) => {
 const x1 = X(u1), x2 = X(u2), y1 = Y(v1), y2 = Y(v2);
 return `left:${Math.min(x1, x2).toFixed(1)}px;top:${Math.min(y1, y2).toFixed(1)}px;width:${Math.abs(x2 - x1).toFixed(1)}px;height:${Math.abs(y2 - y1).toFixed(1)}px`;
 };
 const edge = (r, e) => ({
 u0: { su: r.u0, sv: r.v0, du: 0, dv: 1, iu: 1, iv: 0, len: r.v1 - r.v0 },
 u1: { su: r.u1, sv: r.v0, du: 0, dv: 1, iu: -1, iv: 0, len: r.v1 - r.v0 },
 v0: { su: r.u0, sv: r.v0, du: 1, dv: 0, iu: 0, iv: 1, len: r.u1 - r.u0 },
 v1: { su: r.u0, sv: r.v1, du: 1, dv: 0, iu: 0, iv: -1, len: r.u1 - r.u0 }
 })[e];
 const out = (r, e, m) => { const g = edge(r, e); return at(g.su + g.du * m - g.iu * 0.05, g.sv + g.dv * m - g.iv * 0.05); };

 const muros = [];
 const med = { ext: 0, medianera: 0, int: 0, tramosExt: 0 };
 solid.forEach((r, ri) => {
 ['u0', 'u1', 'v0', 'v1'].forEach(e => {
 const g = edge(r, e);
 const n = Math.round(g.len / 0.1);
 let run = null;
 const flush = () => {
 if (!run) return;
 const th = run.t === 'ext' ? 0.2 : 0.1, ext = run.t === 'ext' ? 0.1 : 0;
 const a = run.a - ext, b = run.b + ext;
 // (24/11) el muro de la medianera va entero de este lado del eje (muro propio contiguo, hueco 12)
 if (run.t === 'ext' && e === 'v0' && r.v0 === 0) muros.push({ st: rect(g.su + a, g.su + b, 0, 0.15), med: true });
 else if (g.du === 0) muros.push({ st: rect(g.su - th / 2, g.su + th / 2, Math.max(0, g.sv + a), g.sv + b) });
 else muros.push({ st: rect(g.su + a, g.su + b, g.sv - th / 2, g.sv + th / 2) });
 const largo = run.b - run.a;
 if (run.t === 'int') med.int += largo;
 else if (e === 'v0' && r.v0 === 0) med.medianera += largo;
 else { med.ext += largo; med.tramosExt++; }
 run = null;
 };
 for (let k = 0; k < n; k++) {
 const vec = out(r, e, (k + 0.5) * 0.1);
 const t = !vec ? 'ext' : vec.g === r.g ? null : (solid.indexOf(vec) > ri ? 'int' : null);
 if (run && run.t === t) run.b = (k + 1) * 0.1;
 else { flush(); if (t) run = { t, a: k * 0.1, b: (k + 1) * 0.1 }; }
 }
 flush();
 });
 });

 const huecos = [], puertas = [];
 med.puertasExt = 0; med.puertasInt = 0;
 doors.forEach(d => {
 const r = byId(d.r); if (!r) return;
 const g = edge(r, d.e);
 const exterior = !out(r, d.e, d.p + d.w / 2);
 if (exterior) med.puertasExt++; else med.puertasInt++;
 const hu = g.su + g.du * d.p, hv = g.sv + g.dv * d.p;
 huecos.push(g.du === 0 ? rect(hu - 0.12, hu + 0.12, hv, hv + d.w) : rect(hu, hu + d.w, hv - 0.12, hv + 0.12));
 const qu = hu + g.iu * 0.1, qv = hv + g.iv * 0.1, dp = (d.w * SC).toFixed(1);
 puertas.push(`left:${X(qu).toFixed(1)}px;top:${Y(qv).toFixed(1)}px;width:${dp}px;height:${dp}px;transform:matrix(${g.du * su},${g.dv * sv},${g.iu * su},${g.iv * sv},0,0)`);
 });
 med.ventanasArea = 0; med.ventanas = 0;
 const ventanas = wins.map(w => {
 const r = byId(w.r); const g = edge(r, w.e);
 const cu = g.su + g.du * w.c, cv = g.sv + g.dv * w.c;
 med.ventanas++; med.ventanasArea += w.w * w.h;
 if (g.du === 0) return { st: rect(cu - 0.11, cu + 0.11, cv - w.w / 2, cv + w.w / 2), cls: 'casa-ven-v' };
 return { st: rect(cu - w.w / 2, cu + w.w / 2, cv - 0.11, cv + 0.11), cls: 'casa-ven-h' };
 });

 const pisos = rooms.map(r => ({ st: rect(r.u0, r.u1, r.v0, r.v1), semi: !!r.semi }));
 const rot = rooms.filter(r => !r.noLabel).map(r => ({ x: X((r.u0 + r.u1) / 2), y: Y((r.v0 + r.v1) / 2), n: r.n, a: f((r.u1 - r.u0) * (r.v1 - r.v0)) + ' m²', w: (r.u1 - r.u0) * SC }));
 // Rótulo que no entra en el ancho del local: se abrevia y, si hace falta, se achica
 const ABREV = { 'Estar-comedor': 'Estar', 'Galería': 'Gal.', 'Cochera': 'Coch.', 'Cocina': 'Coc.', 'Baño en suite': 'Baño', 'Baño 2': 'Baño' };
 const anchoTxt = (t, fs) => t.length * fs * 0.62;
 const ajustarRotulo = (r) => {
 let n = r.n, fs = FS;
 if (anchoTxt(n, fs) > r.w - 6) n = n.replace('Dormitorio', 'Dorm.');
 if (anchoTxt(n, fs) > r.w - 6 && ABREV[n]) n = ABREV[n];
 while (anchoTxt(n, fs) > r.w - 4 && fs > 7) fs -= 1;
 return { ...r, n, fs, oculto: anchoTxt(n, fs) > r.w + 2 };
 };
 med.semi = rooms.filter(r => r.semi).reduce((t, r) => t + (r.u1 - r.u0) * (r.v1 - r.v0), 0);
 med.galeria = med.semi;
 med.cochera = 0;
 if (S.cochera) {
 let x1, w, v1, v2;
 if (S.tipo === 'lineal') { x1 = LX + 0.3 * SC; w = 5 * SC; v1 = T.Wf + 0.9; v2 = T.Wf + 3.8; }
 else { x1 = LX + 0.2 * SC; w = (RET - 0.5) * SC; v1 = T.Wf - 3.1; v2 = T.Wf - 0.2; }
 const y1 = Math.min(Y(v1), Y(v2)), h = Math.abs(Y(v2) - Y(v1));
 pisos.push({ st: `left:${x1.toFixed(1)}px;top:${y1.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`, semi: true });
 rot.push({ x: x1 + w / 2, y: y1 + h / 2, n: 'Cochera', a: '14,5 m²', w });
 med.semi += 14.5; med.cochera = 14.5;
 }
 med.m2Cub = solid.reduce((t, r) => t + (r.u1 - r.u0) * (r.v1 - r.v0), 0);
 med.baniosPerim = solid.filter(r => r.banio).reduce((t, r) => t + 2 * ((r.u1 - r.u0) + (r.v1 - r.v0)), 0);
 med.secosPerim = solid.filter(r => !r.banio && !r.noLabel).reduce((t, r) => t + 2 * ((r.u1 - r.u0) + (r.v1 - r.v0)), 0);
 med.banios = solid.filter(r => r.banio).length;
 const Wmax = Math.max(...solid.map(r => r.v1));
 med.L = L; med.Wmax = Wmax;

 // Sol: del lado del norte en la planta
 const ang = o.aguja * Math.PI / 180;
 const cx = LX + LOTE_L * SC / 2, cy = LT + LOTE_A * SC / 2;
 // el sol va sobre el borde del lote en la dirección del norte (así no pisa la casa)
 const hw = LOTE_L * SC / 2 - 16, hh = LOTE_A * SC / 2 - 14;
 const ds = Math.sin(ang), dc = -Math.cos(ang);
 const tSol = Math.min(Math.abs(ds) > 1e-6 ? hw / Math.abs(ds) : Infinity, Math.abs(dc) > 1e-6 ? hh / Math.abs(dc) : Infinity);
 let sx = cx + ds * tSol, sy = cy + dc * tSol;
 const casaX0 = Math.min(X(0), X(L)) - 14, casaX1 = Math.max(X(0), X(L)) + 14;
 // la cota "casa X m" va del lado libre: también la cuento como ocupada
 const casaY0 = Math.min(Y(0), Y(Wmax)) - (o.medArriba ? 14 : 36), casaY1 = Math.max(Y(0), Y(Wmax)) + (o.medArriba ? 36 : 14);
 if (sx > casaX0 && sx < casaX1 && sy > casaY0 && sy < casaY1) {
 // si cae sobre la casa (lote angosto), lo corro sobre el mismo borde hacia el lado libre
 if (Math.abs(sy - LT - 14) < 2 || Math.abs(sy - (loteAbajo - 14)) < 2) sx = (casaX1 + 10 < LX + LOTE_L * SC - 16) ? casaX1 + 10 : casaX0 - 10;
 else sy = (casaY0 - 10 > LT + 14) ? casaY0 - 10 : casaY1 + 10;
 }
 const yCasa = o.medArriba ? Y(Wmax) + 7 : Y(Wmax) - 21;

 // (24/11) Linderos: línea municipal (llena), medianeras (eje en trazo y punto) y sus rótulos
 const xF = LX + LOTE_L * SC, yMed = Y(0), yLib = Y(LOTE_A), anchoPl = xF + 28, altoPl = yCotaLote + 26;
 const EJE = '#A0522D', LM = '#2B3038', TRAZO = 'stroke-dasharray="7 3 1.5 3"';
 const lineaL = (x1, y1, x2, y2, esLM) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${esLM ? LM : EJE}" stroke-width="${esLM ? 2 : 1.8}" ${esLM ? '' : TRAZO}/>`;
 const linderos = `<svg class="casa-linderos" width="${anchoPl.toFixed(0)}" height="${altoPl.toFixed(0)}" aria-hidden="true">${lineaL(LX, LT, LX, loteAbajo, true)}${lineaL(LX, yMed, xF, yMed, false)}${lineaL(LX, yLib, xF, yLib, !!o.calle2)}${lineaL(xF, LT, xF, loteAbajo, false)}</svg>`;
 const casaFin = X0 + L * SC, patio = xF - casaFin;
 const xRot = patio >= 64 ? casaFin + patio / 2 : (X0 - LX >= 50 ? (LX + X0) / 2 : null);
 const rotLind = [];
 if (xRot !== null) {
 rotLind.push(`<div class="casa-lindero" style="left:${xRot.toFixed(1)}px;top:${(o.medArriba ? yMed + 3 : yMed - 12).toFixed(1)}px">Medianera</div>`);
 rotLind.push(`<div class="casa-lindero${o.calle2 ? ' lm' : ''}" style="left:${xRot.toFixed(1)}px;top:${(o.medArriba ? yLib - 12 : yLib + 3).toFixed(1)}px">${o.calle2 ? 'Línea municipal' : 'Medianera'}</div>`);
 }
 // el rótulo del fondo va en la mitad del lado de la medianera de la casa; el tirador, en la otra mitad
 const yMitad = (Y(0) + Y(LOTE_A / 2)) / 2, yMitadLib = (Y(LOTE_A / 2) + Y(LOTE_A)) / 2;
 if (LOTE_A * SC / 2 >= 56) rotLind.push(`<div class="casa-lindero v" style="left:${(xF - 12).toFixed(1)}px;top:${yMitad.toFixed(1)}px">${LOTE_A * SC / 2 >= 100 ? 'Medianera de fondo' : 'Medianera'}</div>`);
 const calle2Html = o.calle2 ? `<div class="casa-calle casa-calle-h" style="left:${LX}px;top:${(o.medArriba ? loteAbajo + 3 : LT - CAL2 + 1).toFixed(1)}px;width:${(LOTE_L * SC).toFixed(1)}px;height:${CAL2 - 4}px">CALLE</div>` : '';
 const loteTxt = `${f(LOTE_A, 2)} × ${f(LOTE_L, 2)} m`;
 const loteHtml = capa
 ? `<div class="casa-lote" style="left:${LX}px;top:${LT}px;width:${LOTE_L * SC}px;height:${LOTE_A * SC}px"></div>`
 : `<button type="button" class="casa-lote casa-lote-area${S.local === 'lote' ? ' sel' : ''}" data-casa="local:lote" aria-pressed="${S.local === 'lote' ? 'true' : 'false'}" aria-label="Terreno de ${loteTxt}. Cambiar las medidas del lote" title="Tocá el terreno para cambiar sus medidas" style="left:${LX}px;top:${LT}px;width:${(LOTE_L * SC).toFixed(1)}px;height:${(LOTE_A * SC).toFixed(1)}px"></button>`;
 const cotaFondo = `left:${LX}px;top:${yCotaLote.toFixed(1)}px;width:${(LOTE_L * SC).toFixed(1)}px`, cotaAncho = `left:${(xF + 6).toFixed(1)}px;top:${LT}px;height:${(LOTE_A * SC).toFixed(1)}px`;
 const cotasLote = capa
 ? `<div class="casa-cota" style="${cotaFondo}">${f(LOTE_L, 2)} m</div><div class="casa-cota casa-cota-v" style="${cotaAncho}">${f(LOTE_A, 2)} m</div>`
 : `<button type="button" class="casa-cota casa-cota-btn" data-casa="loteEd:1" aria-label="Fondo del lote: ${f(LOTE_L, 2)} m. Cambiar" title="Cambiar el fondo del lote" style="${cotaFondo}">${f(LOTE_L, 2)} m <span aria-hidden="true">✎</span></button>`
 + `<button type="button" class="casa-cota casa-cota-v casa-cota-btn" data-casa="loteEd:1" aria-label="Frente del lote: ${f(LOTE_A, 2)} m. Cambiar" title="Cambiar el frente del lote" style="${cotaAncho}">${f(LOTE_A, 2)} m <span aria-hidden="true">✎</span></button>`;
 const tiradores = capa ? '' : `
 <button type="button" class="casa-tirador v" data-lote-drag="loteFondo" aria-label="Fondo del lote: ${f(LOTE_L, 2)} m. Arrastrá o usá las flechas para cambiarlo" title="Arrastrá para cambiar el fondo" style="left:${(xF - 6).toFixed(1)}px;top:${(yMitadLib - 16).toFixed(1)}px"></button>
 <button type="button" class="casa-tirador h" data-lote-drag="loteAncho" aria-label="Frente del lote: ${f(LOTE_A, 2)} m. Arrastrá o usá las flechas para cambiarlo" title="Arrastrá para cambiar el frente" style="left:${((LX + X0) / 2 - 16).toFixed(1)}px;top:${(yLib - 6).toFixed(1)}px"></button>`;

 // (24/11) Exterior en la planta: cercos (frente, laterales y fondo), portón y parrilla
 const exter = [], chipsExt = [];
 const tira = (x1, y1, x2, y2, cls) => {
 const hor = Math.abs(y2 - y1) < 0.5, g = 5;
 return `<div class="casa-cerco ${cls} ${hor ? 'h' : 'v'}" style="left:${(hor ? Math.min(x1, x2) : x1 - g / 2).toFixed(1)}px;top:${(hor ? y1 - g / 2 : Math.min(y1, y2)).toFixed(1)}px;width:${(hor ? Math.abs(x2 - x1) : g).toFixed(1)}px;height:${(hor ? g : Math.abs(y2 - y1)).toFixed(1)}px"></div>`;
 };
 if (S.cercoLat !== 'no') {
 const xr = LX + Math.min(4, LOTE_L / 2) * SC; // sin el retiro de frente, como en el cómputo
 exter.push(tira(xr, yMed, xF, yMed, S.cercoLat), tira(xr, yLib, xF, yLib, S.cercoLat), tira(xF, LT, xF, loteAbajo, S.cercoLat));
 }
 if (S.cercoFrente !== 'no' || S.porton) {
 const ap = S.porton ? 3 : 1, cl = (v) => Math.max(ap / 2 + 0.2, Math.min(LOTE_A - ap / 2 - 0.2, v));
 const vc = cl(S.cochera ? (S.tipo === 'lineal' ? T.Wf + 2.35 : T.Wf - 1.65) : T.Wf + 0.3 + ap / 2);
 const ga = Math.min(Y(vc - ap / 2), Y(vc + ap / 2)), gb = Math.max(Y(vc - ap / 2), Y(vc + ap / 2));
 const cf = S.cercoFrente === 'muro' ? 'murobajo' : 'reja';
 if (S.cercoFrente !== 'no') exter.push(tira(LX, LT, LX, ga, cf), tira(LX, gb, LX, loteAbajo, cf));
 if (S.porton) { exter.push(`<div class="casa-porton" style="left:${(LX - 2).toFixed(1)}px;top:${ga.toFixed(1)}px;height:${(gb - ga).toFixed(1)}px"></div>`); chipsExt.push({ x: LX + 22, y: (ga + gb) / 2, l: 'Portón', t: S.cochera ? 'Portón vehicular' : 'Portón peatonal' }); }
 }
 if (S.parrilla) {
 const amp = S.ampliacion && !o.invertir && ampliacion(T).entra ? 3 : 0;
 const px = casaFin + (amp + 1) * SC, pw = 1.4 * SC, ph = 0.6 * SC;
 if (px + pw <= xF - 0.3 * SC) {
 const py = o.medArriba ? yMed + 0.2 * SC : yMed - 0.2 * SC - ph;
 exter.push(`<div class="casa-parrilla" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px;width:${pw.toFixed(1)}px;height:${ph.toFixed(1)}px"></div>`);
 chipsExt.push({ x: px + pw / 2, y: o.medArriba ? py + ph + 9 : py - 9, l: 'Parrilla', t: 'Parrilla de ladrillo con campana' });
 }
 }
 const html = `
 <div class="casa-plano" role="img" aria-label="Planta esquemática ${esc(S.tipo === 'L' ? 'en L' : S.tipo)} de ${S.dorm} dormitorios en un lote de ${f(LOTE_A, 2)} por ${f(LOTE_L, 2)} metros, frente al ${esc(o.nombre)}, apoyada en la medianera ${SIG8[idx8(o.medBien)]}, con puertas y ventanas" data-sc="${SC}" data-lx="${LX}" data-lt="${LT}" data-med-arriba="${o.medArriba ? 1 : 0}" style="width:${anchoPl.toFixed(0)}px;height:${altoPl.toFixed(0)}px">
 <div class="casa-calle" style="top:${LT}px;width:${CALLE}px;height:${LOTE_A * SC}px">CALLE</div>
 ${calle2Html}
 ${loteHtml}
 ${linderos}
 ${rotLind.join('')}
 ${exter.join('')}
 ${pisos.map(p => `<div class="casa-piso${p.semi ? ' semi' : ''}" style="${p.st}"></div>`).join('')}
 ${muros.map(m => `<div class="casa-muro${m.med ? ' med' : ''}" style="${m.st}"></div>`).join('')}
 ${huecos.map(h => `<div class="casa-hueco" style="${h}"></div>`).join('')}
 ${ventanas.map(v => `<div class="casa-ventana ${v.cls}" style="${v.st}"></div>`).join('')}
 ${puertas.map(p => `<div class="casa-puerta" style="${p}"></div>`).join('')}
 ${capa ? '' : rooms.map(r => { const a = r.u1 - r.u0, b = r.v1 - r.v0, on = S.local === r.id; return `<button type="button" class="casa-local${on ? ' sel' : ''}" data-casa="local:${r.id}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(r.n || 'Pasillo')}: ${f(a, 2)} por ${f(b, 2)} m. Cambiar medidas" title="${esc(r.n || 'Pasillo')}: tocá para cambiar las medidas" style="${rect(r.u0, r.u1, r.v0, r.v1)}"></button>`; }).join('')}
 ${capa === 'equipo' ? rooms.filter(r => !r.semi && !r.noLabel && !r.banio && !r.cocina).map(r => { const on = !!(S.aa && S.aa[r.id]); return `<button type="button" class="casa-local${on ? ' sel' : ''}" data-casa="aa:${r.id}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(r.n)}: ${on ? 'sacar' : 'poner'} aire acondicionado" title="${esc(r.n)}: tocá para ${on ? 'sacar' : 'poner'} aire acondicionado" style="${rect(r.u0, r.u1, r.v0, r.v1)}"></button>`; }).join('') : ''}
 ${chipsExt.map(z => `<span class="casa-sim chip mueble" style="left:${z.x.toFixed(1)}px;top:${z.y.toFixed(1)}px" title="${esc(z.t)}">${esc(z.l)}</span>`).join('')}
 ${simbolosInst(T, capa, E).map(z => `<span class="casa-sim ${z.c}" style="left:${X(z.u).toFixed(1)}px;top:${Y(z.v).toFixed(1)}px"${z.t ? ` title="${esc(z.t)}"` : ''}>${z.l ? esc(z.l) : ''}</span>`).join('')}
 ${rot.map(ajustarRotulo).filter(r => !r.oculto).map(r => `<div class="casa-rotulo" style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;font-size:${r.fs}px"><b>${esc(r.n)}</b>${SC >= 18 ? `<span>${r.a}</span>` : ''}</div>`).join('')}
 ${S.ampliacion ? (() => { const A = ampliacion(T); return A.entra ? `<div class="casa-futuro" style="${rect(A.u0, A.u1, A.v0, A.v1)}"><span>Ampliación<br>${f(A.m2)} m²</span></div>` : ''; })() : ''}
 ${cotasLote}
 <div class="casa-cota casa-cota-casa ${o.medArriba ? 'arriba' : 'abajo'}" style="left:${Math.min(X(0), X(L)).toFixed(1)}px;top:${yCasa.toFixed(1)}px;width:${(L * SC).toFixed(1)}px">casa ${f(L, 2)} m</div>
 <div class="casa-sol" aria-hidden="true" style="left:${(sx - 12).toFixed(1)}px;top:${(sy - 12).toFixed(1)}px">${SOL_SVG}</div>
 ${tiradores}
 </div>`;
 return { html, med };
}
const SOL_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E09E00" stroke-width="2"><circle cx="12" cy="12" r="4" fill="#F5B000"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';

// ---------------------------------------------------------------------------
// Fachada principal (vista desde la calle)
// ---------------------------------------------------------------------------
function pendienteTecho() {
 if (S.techo === 'plana') return 0.02;
 if (S.techoMat === 'teja') return 0.35;
 return S.techo === '1' ? 0.15 : 0.22;
}
function fachada(o, T, anchoDisp) {
 const front = T.rooms.filter(r => !r.semi && r.u0 === 0);
 const Wf = T.Wf, AL = S.techo === 'plana' ? 0 : (o.oeste ? 0.8 : 0.5), HM = S.altura;
 const pend = pendienteTecho();
 const sube = S.techo === '1' ? Wf * pend : S.techo === 'plana' ? 0.5 : (Wf / 2) * pend;
 const k = Math.max(18, Math.min(56, (anchoDisp - 20) / (Wf + 2 * AL)));
 const W = (Wf + 2 * AL) * k + 20, H = (HM + sube + 0.9) * k + 16;
 const x = (v) => 10 + (AL + (o.medArriba ? v : Wf - v)) * k;
 const yS = H - 10, y = (h) => yS - h * k;
 const est = {
 revoque: { muro: '#EFE8DC', zocalo: '#C9BFB0', marco: '#9CA3AF', chapa: '#8A939E' },
 ladrillo: { muro: 'repeating-linear-gradient(0deg,#B5653A 0 7px,#E8D8C8 7px 8px)', zocalo: '#8F4E2C', marco: '#3A3F47', chapa: '#6B737D' },
 contemporanea: { muro: '#F7F7F5', zocalo: '#D9DCE1', marco: '#22262C', chapa: '#2F343B' }
 }[S.fachada];
 if (S.abert === 'madera') est.marco = '#7A5230';
 const techoColor = S.techo === 'plana' ? '#C9CED6' : (S.techoMat === 'teja' ? '#B0482A' : est.chapa);
 const el = [];
 const poly = (pts, bg) => el.push(`<div class="casa-elev-pieza" style="width:${W.toFixed(0)}px;height:${H.toFixed(0)}px;background:${bg};clip-path:polygon(${pts.map(([a, b]) => `${a.toFixed(1)}px ${b.toFixed(1)}px`).join(',')})"></div>`);
 const box = (l, t, w, h, css) => el.push(`<div class="casa-elev-caja" style="left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;width:${Math.max(0, w).toFixed(1)}px;height:${Math.max(0, h).toFixed(1)}px;${css}"></div>`);
 const xl = Math.min(x(0), x(Wf)), xr = Math.max(x(0), x(Wf));
 if (S.techo === '1') poly([[x(0), y(HM)], [x(0), y(HM + sube)], [x(Wf), y(HM)]], est.muro);
 else if (S.techo === '2') poly([[xl, y(HM)], [(xl + xr) / 2, y(HM + sube)], [xr, y(HM)]], est.muro);
 else if (S.techo === 'plana') { box(xl, y(HM + 0.5), xr - xl, 0.5 * k, `background:${est.muro}`); box(xl - 2, y(HM + 0.5) - 3, xr - xl + 4, 4, 'background:#8A939E'); }
 box(xl, y(HM), xr - xl, HM * k, `background:${est.muro}`);
 box(xl, y(0.35), xr - xl, 0.35 * k, `background:${est.zocalo}`);
 if (S.fachada === 'contemporanea') {
 const p = T.doors.find(d => d.r === 'estar' && d.e === 'u0');
 if (p) { const a = x(p.p - 0.4), b = x(p.p + p.w + 0.4); box(Math.min(a, b), y(HM), Math.abs(b - a), (HM - 0.35) * k, 'background:repeating-linear-gradient(90deg,#9A6B3F 0 5px,#7A5230 5px 7px)'); }
 }
 const th = 0.18;
 if (S.techo === '1') {
 // lado alto sobre la medianera (v = 0, sin alero para no volcar agua al vecino); cae hacia el lado libre
 const xa = x(0), xb = x(Wf + AL);
 const ya = y(HM + sube), yb = y(HM - AL * pend);
 poly([[xa, ya - th * k], [xb, yb - th * k], [xb, yb], [xa, ya]], techoColor);
 } else if (S.techo === '2' || S.techo === '4') {
 // sobre la medianera el alero queda en cero (canaleta propia, sin volcar al vecino)
 const cx = (xl + xr) / 2, yTop = y(HM + sube), yEave = y(HM - AL * pend), yMed = y(HM);
 const medIzq = x(0) < x(Wf);
 const pL = medIzq ? [xl, yMed] : [xl - AL * k, yEave], pR = medIzq ? [xr + AL * k, yEave] : [xr, yMed];
 if (S.techo === '4') poly([pL, [cx, yTop - th * k], pR], techoColor);
 else poly([pL, [cx, yTop - th * k], pR, [pR[0], pR[1] + th * k * 0.2], [cx, yTop + th * k * 0.6], [pL[0], pL[1] + th * k * 0.2]], techoColor);
 }
 front.forEach(r => {
 T.doors.filter(d => d.r === r.id && d.e === 'u0').forEach(d => {
 const a = x(r.v0 + d.p), b = x(r.v0 + d.p + d.w);
 box(Math.min(a, b), y(2.05), Math.abs(b - a), 2.05 * k - 1, `background:${S.fachada === 'contemporanea' ? '#2B3038' : '#8A6A4B'};border:2px solid ${est.marco}`);
 });
 T.wins.filter(w => w.r === r.id && w.e === 'u0').forEach(w => {
 const hgt = w.h || 1.1, alf = hgt >= 1.4 ? 0.8 : hgt <= 0.6 ? 1.6 : 1.0;
 const a = x(r.v0 + w.c - w.w / 2), b = x(r.v0 + w.c + w.w / 2);
 box(Math.min(a, b), y(alf + hgt), Math.abs(b - a), hgt * k, `background:linear-gradient(to right,#BFD4E6 48%,${est.marco} 48%,${est.marco} 52%,#BFD4E6 52%);border:2.5px solid ${est.marco}`);
 });
 });
 const gal = T.rooms.find(r => r.semi && r.u1 === 0);
 if (gal) [gal.v0 + 0.1, gal.v1 - 0.25].forEach(v => box(Math.min(x(v), x(v + 0.15)), y(HM), 0.15 * k, HM * k, `background:${S.fachada === 'revoque' ? '#A67C52' : est.marco}`));
 box(0, yS, W, 2, 'background:#8A96A6');
 const nombreTecho = { '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas', plana: 'plano' }[S.techo];
 return {
 html: `<div class="casa-elev" role="img" aria-label="Fachada principal: techo ${nombreTecho}, ${esc({ revoque: 'fachada clásica', ladrillo: 'ladrillo visto', contemporanea: 'fachada contemporánea' }[S.fachada])}" style="width:${W.toFixed(0)}px;height:${H.toFixed(0)}px"><div class="casa-elev-cielo" style="height:${yS.toFixed(0)}px"></div>${el.join('')}</div>`,
 pend, AL, sube
 };
}

// ---------------------------------------------------------------------------
// Cómputo paramétrico → líneas con APU (los ids son los de apu_tasks)
// ---------------------------------------------------------------------------
function computo(o, T, M, fach) {
 const HM = S.altura, W = T.Wf, L = M.L;
 const lineas = [];
 const add = (rubro, apuId, tarea, cantidad, unidad, medicion, nota = '') => {
 if (!(cantidad > 0)) return;
 lineas.push({ rubro, apuId, tarea, cantidad: Math.round(cantidad * 100) / 100, unidad, medicion, nota });
 };
 const pend = fach.pend;
 const B = BASES_MURO[S.muroBase] || BASES_MURO.lch18;
 const tabLadrillo = S.tabique === 'ladrillo';
 const plano = S.techo === 'plana';
 const aguas = { '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas' }[S.techo];
 // Hastiales y parapetos (aprox. sobre el ancho del frente)
 let hastial = 0, medExtra = 0;
 if (S.techo === '2') hastial = 2 * (W * (W / 2 * pend) / 2);
 if (S.techo === '1') { hastial = 2 * (W * (W * pend) / 2); medExtra = L * W * pend; }
 const parapeto = plano ? 0.5 * (M.ext + M.medianera) : 0;
 const aberturasExt = M.ventanasArea + M.puertasExt * 0.9 * 2.05;
 const murExt = M.ext * HM + hastial + parapeto - aberturasExt;
 const murMed = M.medianera * HM + medExtra;
 const murInt = M.int * HM - M.puertasInt * 0.8 * 2.05;
 // (22/11-b) revestimientos según lo elegido en Terminaciones
 const hBano = S.revBano === 'techo' ? HM : (S.revBano === 'h210' ? 2.1 : 1.5);
 const mlCocina = mlMuebleCocina(T);
 const hCocina = S.revCocina === 'h150' ? 1.5 : 0.6;
 const revest = M.baniosPerim * hBano + Math.max(mlCocina, 1.8) * hCocina;
 const pisoNeto = M.m2Cub * 0.92;
 const aislaMuro = S.muro !== 'base';
 const vistoMacizo = S.fachada === 'ladrillo' && S.muroBase === 'lc15';
 const fPend = Math.sqrt(1 + pend * pend);

 add('Tareas preliminares', 12, 'Limpieza del terreno', (L + 2 + (S.galeria ? 1.8 : 0)) * (W + 2), 'm²', 'Huella de la casa + 1 m alrededor');
 add('Tareas preliminares', 6, 'Replanteo', M.m2Cub, 'm²', 'Superficie cubierta');

 // Fundación
 const mlFund = M.ext + M.medianera + (tabLadrillo ? M.int : 0);
 const txtFund = `${f(M.ext)} ml exteriores + ${f(M.medianera)} ml de medianera${tabLadrillo ? ` + ${f(M.int)} ml de tabiques` : ''}`;
 if (S.fundacion === 'platea') {
 add('Fundaciones', 14, 'Platea de fundación', M.m2Cub, 'm²', 'Superficie cubierta', 'El APU es de 0,15 m; el Prototipo A pide 0,10 m.');
 } else {
 add('Fundaciones', 2, 'Excavación de zanjas', mlFund * 0.40 * 0.60, 'm³', `${txtFund} × 0,40 × 0,60 m (a validar)`);
 if (S.fundacion === 'zapataH') add('Fundaciones', 78, 'Zapata corrida de hormigón', mlFund, 'ml', txtFund);
 else add('Fundaciones', null, 'Cimiento de ladrillo común (zapata corrida escalonada)', mlFund * 0.30 * 0.60, 'm³', `${txtFund} × 0,30 × 0,60 m promedio (a validar)`);
 add('Fundaciones', null, 'Capa aisladora horizontal (cajón hidrófugo)', mlFund, 'ml', 'Sobre el cimiento de todos los muros');
 add('Contrapisos', 28, 'Contrapiso interior sobre terreno', M.m2Cub, 'm²', 'Superficie cubierta', 'El APU es de 5 cm; sobre terreno se usan 10 a 12 cm (a validar).');
 }

 // Muros
 const nomExt = `${B.n.toLowerCase()}${vistoMacizo ? ' a la vista' : ''}`;
 add('Mampostería', B.apu, `Mampostería de ${nomExt} (exterior)`, murExt, 'm²', `${f(M.ext)} ml × ${f(HM, 2)} m${hastial ? ' + hastiales' : ''}${parapeto ? ' + parapeto' : ''} − aberturas ${f(aberturasExt)} m²`, S.muroBase === 'lc15' && !vistoMacizo ? 'El APU es de ladrillo común a la vista: para revocar, confirmar.' : '');
 add('Mampostería', 19, 'Mampostería de ladrillo hueco 12 (medianera)', murMed, 'm²', `${f(M.medianera)} ml × ${f(HM, 2)} m${medExtra ? ' + subida del techo' : ''}`);
 if (S.tabique === 'ladrillo') add('Mampostería', 19, 'Tabiques de ladrillo hueco 12', murInt, 'm²', `${f(M.int)} ml × ${f(HM, 2)} m − ${pl(M.puertasInt, 'puerta')}`);
 else if (S.tabique === 'madera') add('Tabiques', 21, 'Tabiques de madera', murInt, 'm²', `${f(M.int)} ml × ${f(HM, 2)} m − ${pl(M.puertasInt, 'puerta')}`);
 else add('Tabiques', null, 'Tabiques de placa de yeso (perfiles y 2 placas, con masillado)', murInt, 'm²', `${f(M.int)} ml × ${f(HM, 2)} m − ${pl(M.puertasInt, 'puerta')}`, 'En baños y cocina, placa verde (resistente a la humedad).');
 add('Mampostería', 17, 'Refuerzos verticales', (M.tramosExt + 4) * (HM + 0.2), 'ml', `${M.tramosExt + 4} refuerzos × ${f(HM + 0.2, 2)} m (esquinas y encuentros, aprox.)`, B.esp !== 18 ? `El APU es de 18×18: para muro de ${B.esp}, confirmar.` : '');
 add('Mampostería', B.enc, `Encadenado en muros de ${B.esp}`, M.ext, 'ml', 'Muros exteriores', B.enc === 20 && B.esp !== 12 ? `Se usa el APU del encadenado de 12: para muro de ${B.esp}, confirmar.` : '');
 add('Mampostería', 20, 'Encadenado en muros de 12', M.medianera + (tabLadrillo ? M.int : 0), 'ml', tabLadrillo ? 'Medianera + tabiques' : 'Medianera');

 // Revoques y aislación de muros
 if (vistoMacizo) { /* el muro queda a la vista: sin revoque exterior */ }
 else if (S.fachada === 'ladrillo') add('Revoques', null, 'Revestimiento de ladrillo visto (reemplaza al revoque exterior)', murExt, 'm²', `Cara exterior de los muros de ${B.esp}`);
 else add('Revoques', 31, 'Revoque completo exterior', murExt, 'm²', `Cara exterior de los muros de ${B.esp}`, 'Confirmar que incluye el azotado hidrófugo.');
 const revIntArea = Math.max(0, (tabLadrillo ? murInt * 2 : 0) + murMed + (aislaMuro ? 0 : murExt) - revest);
 add('Revoques', 32, 'Revoque completo interior', revIntArea, 'm²', `${tabLadrillo ? 'Tabiques (2 caras) + ' : ''}medianera${aislaMuro ? '' : ' + cara interior de muros exteriores'} − revestimientos`);
 if (aislaMuro) add('Aislaciones', null, `Aislación interior de muros: ${AIS_MURO[S.muro].n}`, murExt, 'm²', 'Cara interior de los muros exteriores');
 const txtRev = `${pl(M.banios, 'baño')} h ${f(hBano, 2)} m + cocina h ${f(hCocina, 2)} m`;
 if (S.revMat === 'porcelanato') add('Revestimientos', null, 'Revestimiento de porcelanato (baños y cocina)', revest, 'm²', txtRev);
 else add('Revestimientos', 45, 'Revestimiento cerámico (baños y cocina)', revest, 'm²', txtRev);

 // Pisos
 // en baños y cocina, si el piso elegido no es apto para agua, va cerámico
 const humedos = T.rooms.filter(r => r.banio || r.cocina).reduce((t, r) => t + (r.u1 - r.u0) * (r.v1 - r.v0), 0) * 0.92;
 const secoArea = S.piso === 'flotante' ? Math.max(0, pisoNeto - humedos) : pisoNeto;
 if (S.piso === 'porcelanato') add('Pisos', null, 'Piso de porcelanato', pisoNeto, 'm²', 'Superficie interior');
 else if (S.piso === 'flotante') add('Pisos', null, 'Piso flotante sobre carpeta niveladora', secoArea, 'm²', 'Locales secos (baños y cocina en cerámico)');
 else if (S.piso === 'alisado') add('Pisos', null, 'Piso de cemento alisado (o microcemento)', pisoNeto, 'm²', 'Superficie interior');
 else add('Pisos', 36, 'Piso cerámico', pisoNeto, 'm²', 'Superficie interior');
 if (S.piso === 'flotante') add('Pisos', 36, 'Piso cerámico en baños y cocina', humedos, 'm²', 'Locales húmedos');
 if (S.piso === 'flotante') add('Pisos', null, 'Zócalos de MDF o madera', M.secosPerim * 0.85, 'ml', 'Perímetro de los locales secos − puertas');
 else add('Pisos', 77, 'Zócalos cerámicos', M.secosPerim * 0.85, 'ml', 'Perímetro de los locales secos − puertas');
 const vereda = 0.4 * M.ext;
 add('Pisos', 28, 'Contrapiso exterior: vereda perimetral, galería y cochera', vereda + M.galeria + M.cochera + 0.8 * 10, 'm²', 'Vereda 0,40 m + semicubiertos + vereda municipal 0,80 × 10 m');
 if (S.pisoExt === 'ceramico') add('Pisos', null, 'Piso cerámico exterior antideslizante (galería y cochera)', M.galeria + M.cochera, 'm²', 'Semicubiertos');
 else add('Pisos', null, 'Terminación de cemento alisado (vereda, galería y cochera)', vereda + M.galeria + M.cochera + 0.8 * 10, 'm²', 'Igual que el contrapiso exterior');

 // Techo
 const planta = M.m2Cub + M.galeria + M.cochera;
 const aleroM2 = (2 * (L + W)) * fach.AL;
 const techoM2 = (planta + aleroM2) * fPend;
 const medTecho = `Planta ${f(planta)} m² + aleros, × ${f(fPend, 3)} por pendiente`;
 if (plano) {
 add('Cubierta', 23, 'Losa de hormigón maciza 12 cm', planta, 'm²', 'Superficie cubierta + semicubiertos');
 add('Cubierta', null, 'Membrana y carpeta de techo plano', planta, 'm²', 'Igual que la losa');
 add('Cielorrasos', null, 'Cielorraso de yeso aplicado bajo losa', pisoNeto, 'm²', 'Superficie interior');
 } else {
 const cerchas = S.sistTecho === 'cerchas';
 const estr = S.estructTecho === 'madera' ? (cerchas ? 'cerchas de madera y clavaderas' : 'estructura de madera (tirantes y clavaderas)') : (cerchas ? 'cerchas metálicas y correas' : 'correas metálicas');
 if (S.techoMat === 'teja') add('Cubierta', null, `Cubierta de teja cerámica ${aguas} sobre ${estr}`, techoM2, 'm²', medTecho);
 else if (S.estructTecho === 'madera') add('Cubierta', null, `Cubierta de chapa ${aguas} sobre ${estr}`, techoM2, 'm²', medTecho);
 else add('Cubierta', 24, `Cubierta de chapa ${aguas} sobre correas metálicas`, techoM2, 'm²', medTecho, [S.techo === '4' ? 'Faltan limatesas en el APU.' : '', S.aisTecho === 'ais10' ? 'Se asume que incluye el aislante con aluminio del prototipo.' : ''].filter(Boolean).join(' '));
 if (cerchas) {
 const sep = SEP_CERCHA(), nC = Math.ceil(L / sep) + 1;
 add('Cubierta', null, S.estructTecho === 'madera' ? 'Cerchas de madera (cabriadas)' : 'Cerchas metálicas reticuladas', nC, 'un', `${nC} cerchas c/ ${f(sep, 2)} m sobre ${f(L)} m de casa`, 'Cantidad y sección a validar con cálculo estructural.');
 }
 add('Cubierta', 37, 'Cenefas', 2 * (L + W) - (S.techo === '1' ? L : 0), 'ml', 'Bordes del techo');
 // Cielorraso: siguiendo la pendiente (bajo la estructura) o suspendido (horizontal)
 const susp = S.cielo === 'suspendido';
 const cieloM2 = susp ? pisoNeto : pisoNeto * fPend;
 const medCielo = susp ? 'Superficie interior (horizontal)' : `Superficie interior × ${f(fPend, 3)} por pendiente`;
 const como = susp ? 'suspendido' : 'siguiendo la pendiente';
 if (S.cieloMat === 'machimbre') add('Cielorrasos', 25, `Cielorraso de machimbre ${como}`, cieloM2, 'm²', medCielo, susp ? 'El APU es sobre correas: suspendido lleva estructura propia (a validar).' : '');
 else if (S.cieloMat === 'pvc') add('Cielorrasos', null, `Cielorraso de PVC ${como}`, cieloM2, 'm²', medCielo);
 else add('Cielorrasos', null, `Cielorraso de placa de yeso ${como}`, cieloM2, 'm²', medCielo);
 if (S.aisTecho !== 'sin' && S.aisTecho !== 'ais10') add('Aislaciones', null, `Aislación térmica de techo: ${TECHOS_AIS[S.aisTecho].n}`, pisoNeto, 'm²', susp ? 'Sobre el cielorraso suspendido' : 'Bajo la cubierta');
 }

 // Aberturas
 const AB = { aluminio: 'aluminio', pvc: 'PVC', madera: 'madera' }[S.abert] || 'aluminio';
 add('Aberturas', S.abert === 'aluminio' ? 41 : null, `Ventanas de ${AB}${S.dvh ? ' con DVH' : ''} (${M.ventanas})`, 1, 'gl', `${pl(M.ventanas, 'ventana')}, ${f(M.ventanasArea)} m²`, S.abert === 'aluminio' ? 'APU en "gl": confirmar para qué vivienda.' : '');
 if (S.dvh && S.abert === 'aluminio') add('Aberturas', null, 'Doble vidriado hermético (adicional)', M.ventanasArea, 'm²', 'Superficie de ventanas');
 add('Aberturas', 42, `Puertas placa interiores (${M.puertasInt})`, 1, 'gl', pl(M.puertasInt, 'puerta'), 'APU en "gl": confirmar cuántas puertas incluye.');
 if (S.abert === 'aluminio') add('Aberturas', 43, `Puertas exteriores de chapa (${M.puertasExt})`, 1, 'gl', pl(M.puertasExt, 'puerta'), 'APU en "gl": confirmar cuántas puertas incluye.');
 else add('Aberturas', null, `Puertas exteriores de ${AB} (${M.puertasExt})`, M.puertasExt, 'un', pl(M.puertasExt, 'puerta'));

 // Pinturas
 if (S.fachada !== 'ladrillo') add('Pinturas', 34, 'Látex exterior', murExt, 'm²', 'Igual que el revoque exterior');
 const tabYeso = S.tabique === 'durlock' ? murInt * 2 : 0;
 const cieloLatex = plano || S.cieloMat === 'durlock' ? (plano ? pisoNeto : (S.cielo === 'suspendido' ? pisoNeto : pisoNeto * fPend)) : 0;
 if (S.pintura === 'enduido') add('Pinturas', null, 'Enduído plástico (previo al látex)', revIntArea + (aislaMuro ? murExt : 0) + tabYeso, 'm²', 'Paredes interiores');
 add('Pinturas', 33, 'Látex interior', revIntArea + (aislaMuro ? murExt : 0) + tabYeso + cieloLatex, 'm²', ['Revoques interiores', aislaMuro ? 'placas de yeso de los muros' : '', tabYeso ? 'tabiques de yeso (2 caras)' : '', cieloLatex ? 'cielorraso' : ''].filter(Boolean).join(' + '));
 if (!plano && S.cieloMat === 'machimbre') add('Pinturas', 26, 'Barniz de cielorraso', S.cielo === 'suspendido' ? pisoNeto : pisoNeto * fPend, 'm²', 'Igual que el cielorraso');
 if (S.tabique === 'madera') add('Pinturas', 26, 'Barniz de tabiques de madera', murInt * 2, 'm²', 'Tabiques (2 caras)', 'Usa el APU de barniz de cielorraso.');
 if (S.fachada === 'contemporanea') add('Revestimientos', null, 'Revestimiento de listones de madera en la entrada', 2.2 * 2.25, 'm²', 'Paño junto a la puerta');

 // Instalaciones (22/11): lo que se elige en el paso "Instalaciones"
 const E = instalElec(T, M);
 const banos = T.rooms.filter(r => r.banio);
 const descArt = (id) => { const x = artefactosBano(id); return ['inodoro', x.vanitory ? 'vanitory' : 'lavatorio', x.banera ? 'bañera' : 'ducha', x.bidet ? 'bidé' : ''].filter(Boolean).join(', '); };
 add('Instalación sanitaria', 69, 'Distribución de agua fría y caliente', 1, 'gl', `${pl(M.banios, 'baño')}, cocina y lavadero`);
 const TQ = tanque();
 add('Instalación sanitaria', 68, `Tanque de reserva de ${TQ.litros} l`, 1, 'un', `${TQ.personas} personas × ${TQ.dot} l/día (a validar con OSN)`);
 add('Instalación sanitaria', 51, 'Desagües cloacales', 1, 'gl', 'Vivienda completa');
 add('Instalación sanitaria', 55, 'Artefactos, griferías y accesorios', M.banios, 'gl', banos.map(r => `${nombreLocalCorto(r)}: ${descArt(r.id)}`).join(' · '), 'Revisar si el APU incluye cocina y lavadero.');
 const nBidet = banos.filter(r => artefactosBano(r.id).bidet).length, nBanera = banos.filter(r => artefactosBano(r.id).banera).length, nVan = banos.filter(r => artefactosBano(r.id).vanitory).length;
 add('Instalación sanitaria', null, 'Bidé con grifería (adicional)', nBidet, 'un', pl(nBidet, 'bidé'));
 add('Instalación sanitaria', null, 'Bañera con grifería (en lugar de la ducha)', nBanera, 'un', pl(nBanera, 'bañera'));
 add('Instalación sanitaria', null, 'Vanitory (mueble bajo mesada del lavatorio)', nVan, 'un', pl(nVan, 'vanitory'));
 add('Instalación sanitaria', null, 'Pileta de lavar con canilla (lavadero)', 1, 'un', '1 (CE Oberá III.6.2.1)');
 add('Instalación sanitaria', 53, 'Cámara séptica', 1, 'un', 'Si no hay red cloacal');
 add('Instalación sanitaria', 52, 'Pozo absorbente', 1, 'un', 'Si no hay red cloacal');
 add('Instalación sanitaria', 54, 'Cámara de inspección', 1, 'un', '1');
 if (S.agua === 'termo-elec') add('Instalación sanitaria', 75, 'Termotanque eléctrico', 1, 'un', '1');
 else if (S.agua === 'termo-gas') add('Instalación sanitaria', null, 'Termotanque a gas', 1, 'un', '1');
 else if (S.agua === 'calefon') add('Instalación sanitaria', null, 'Calefón a gas', 1, 'un', '1');
 else if (S.agua === 'solar') add('Instalación sanitaria', null, 'Termotanque solar con apoyo eléctrico', 1, 'un', '1');
 if (S.bomba) add('Instalación sanitaria', null, 'Bomba presurizadora', 1, 'un', '1');
 add('Instalación eléctrica', 56, 'Tablero general', 1, 'gl', `Grado ${E.grado.toLowerCase()} (${f(E.sup)} m²): ${E.cIug + E.cTug} circuitos de uso general${E.tue ? ` + ${E.tue} de uso especial` : ''}`);
 add('Instalación eléctrica', 59, 'Circuitos de tomas (TUG)', 1, 'gl', `${E.tug} bocas en ${pl(E.cTug, 'circuito')}`, 'APU global: confirmar para cuántas bocas.');
 add('Instalación eléctrica', 61, 'Circuitos de iluminación (IUG)', 1, 'gl', `${E.iug} bocas en ${pl(E.cIug, 'circuito')}`, 'APU global: confirmar para cuántas bocas.');
 if (E.tue) add('Instalación eléctrica', null, 'Circuitos de uso especial (aire, termotanque, cocina, bomba)', E.tue, 'un', pl(E.tue, 'circuito'));
 add('Instalación eléctrica', null, 'Puesta a tierra: jabalina, caja de inspección y conductor', 1, 'un', 'Obligatoria (AEA 90364)');
 if (S.fv) add('Instalación eléctrica', null, `Sistema fotovoltaico conectado a red de ${f(S.fv, 1)} kWp (paneles, inversor y protecciones)`, 1, 'un', `≈ ${Math.round(S.fv * 1350)} kWh al año (≈ 1.350 kWh/kWp, a validar)`);
 add('Instalación eléctrica', 62, `Artefactos de iluminación (${LUMINARIAS[S.luminarias] || 'plafones LED'})`, 1, 'gl', `${E.iug} artefactos`, 'APU global: confirmar para cuántos artefactos.');
 const gas = [S.coccion === 'gas' ? 'cocina' : '', S.agua === 'termo-gas' ? 'termotanque' : '', S.agua === 'calefon' ? 'calefón' : ''].filter(Boolean);
 if (gas.length) add('Instalación de gas', null, `Instalación de gas (${gas.join(', ')})`, 1, 'gl', pl(gas.length, 'artefacto'));
 if (S.coccion === 'electrica') add('Equipamiento', null, 'Anafe y horno eléctricos', 1, 'un', '1');
 if (S.mueblesCocina !== 'no') add('Muebles fijos', 73, 'Mueble bajo mesada y mesada de cocina', 1, 'un', `≈ ${f(mlCocina, 2)} ml`, 'Revisar qué largo de mueble incluye el APU.');
 if (S.mueblesCocina === 'completo') add('Muebles fijos', null, 'Alacena de cocina (melamina)', mlCocina, 'ml', 'Igual que el bajo mesada');
 const placards = T.rooms.filter(r => /^d/.test(r.id) && !r.semi).map(r => Math.max(1.0, Math.min(2.0, Math.min(r.u1 - r.u0, r.v1 - r.v0) - 0.6)));
 const mlPlacard = placards.reduce((t, x) => t + x, 0);
 if (S.placard !== 'no') add('Muebles fijos', null, 'Placard: frente de hojas corredizas e interior básico (melamina)', mlPlacard, 'ml', `${pl(placards.length, 'dormitorio')}: ${placards.map(x => f(x, 2)).join(' + ')} m`);
 if (S.placard === 'completo') add('Muebles fijos', null, 'Interior de placard con cajonera y estantes', mlPlacard, 'ml', 'Igual que el frente');
 // Pluviales (Ord. Oberá 2557: canaletas a ≥ 0,85 m del eje medianero; dimensiones según OSN)
 const PL = pluviales(T, M, fach);
 if (PL.canaleta) add('Instalación pluvial', null, 'Canaletas de chapa galvanizada', PL.canaleta, 'ml', PL.txtCanaleta);
 add('Instalación pluvial', null, plano ? 'Embudos y bajadas pluviales Ø 100 (PVC)' : 'Bajadas pluviales Ø 100 (PVC)', PL.bajadas, 'un', `${f(PL.area)} m² de techo ÷ ${PL.m2PorBajada} m² por bajada (a validar con OSN)`);
 add('Instalación pluvial', null, 'Desagüe pluvial a la calle (cañería Ø 100 enterrada)', PL.desague, 'ml', 'Del fondo de la casa al cordón, aprox.');
 if (S.lluvia) add('Instalación pluvial', null, 'Tanque de agua de lluvia de 2000 l con filtro y canilla', 1, 'un', `Podría juntar ≈ ${Math.round(PL.area * 1.8 * 0.8)} m³ al año (1.800 mm, a validar)`);
 // Exterior
 const ancho = S.loteAncho, fondo = S.loteFondo;
 if (S.cercoFrente !== 'no') add('Exterior', null, S.cercoFrente === 'muro' ? 'Cerco de frente: muro bajo con reja' : 'Cerco de frente con reja', ancho - (S.porton ? 3 : 1), 'ml', `${f(ancho, 2)} m de frente − portón${S.porton ? '' : ' peatonal'}`);
 if (S.cercoLat !== 'no') add('Exterior', null, S.cercoLat === 'muro' ? 'Muro divisorio de bloques h 1,80 m' : 'Cerco de tejido romboidal h 1,80 m con postes', 2 * fondo - 2 * 4 + ancho, 'ml', 'Laterales y fondo (sin el retiro de frente)');
 if (S.porton) add('Exterior', null, S.cochera ? 'Portón vehicular de caño y chapa' : 'Portón peatonal de caño', 1, 'un', '1');
 if (S.parrilla) add('Exterior', null, 'Parrilla de ladrillo con campana', 1, 'un', '1');
 if (S.ampliacion) add('Tareas preliminares', null, 'Previsiones para ampliar: vano con dintel, cañerías y caños en espera', 1, 'gl', 'Para el dormitorio futuro');
 E.aa.forEach(l => { const A = (l.r.u1 - l.r.u0) * (l.r.v1 - l.r.v0); add('Equipamiento', null, `Aire acondicionado split ${frigorias(A)} frigorías (${l.nombre})`, 1, 'un', `${f(A)} m² × ≈150 frig/m² (estimación a validar)`); });
 if (E.aa.length) add('Equipamiento', null, 'Instalación de equipos split (cañería, desagüe y ménsula)', E.aa.length, 'un', pl(E.aa.length, 'equipo'));
 const nVt = E.locales.filter(l => l.vt).length;
 if (nVt) add('Equipamiento', null, 'Ventilador de techo', nVt, 'un', pl(nVt, 'dormitorio'));
 add('Limpieza', 50, 'Limpieza periódica y final de obra', 1, 'gl', '1');
 return lineas;
}

// Costo de las líneas con las APU cargadas (costo directo, sin Factor K)
function costear(lineas) {
 const tasks = ST.apuCatalogState.tasks || [];
 let total = 0, mat = 0, mo = 0, eq = 0;
 lineas.forEach(l => {
 l.item = null; l.total = null; l.unit = null; l.faltan = 0; l.horas = 0;
 if (!l.apuId) { l.motivo = 'Sin APU todavía'; return; }
 const task = tasks.find(t => t.id === l.apuId);
 if (!task) { l.motivo = `No se encontró la tarea APU ${l.apuId}`; return; }
 try {
 const item = Apu.buildBudgetItem(l.apuId, l.cantidad);
 const b = Apu.calcItemBreakdown(item);
 l.item = item; l.total = b.total; l.unit = b.total / l.cantidad;
 l.horas = b.lineas.filter(x => x.tipo === 'mano_obra').reduce((t, x) => t + (x.cantidadNecesaria || 0), 0);
 l.faltan = b.lineas.filter(x => !x.disponible).length;
 l.vacia = !item.components.length;
 l.apuNombre = task.nombre; l.apuUnidad = task.unidad;
 l.unidadDistinta = task.unidad && l.unidad && normUnidad(task.unidad) !== normUnidad(l.unidad);
 total += b.total; mat += b.materialesCost; mo += b.manoObraCost; eq += b.equiposCost;
 } catch (err) { l.motivo = err.message; }
 });
 return { total, mat, mo, eq };
}
const normUnidad = (u) => String(u).toLowerCase().replace('²', '2').replace('³', '3').replace(/\s/g, '');

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------
export async function loadCasaView() {
 const root = document.getElementById('casa-root');
 if (!root) return;
 if (!Admin.isAdmin()) { root.hidden = true; root.innerHTML = ''; return; }
 root.hidden = false;
 cargarEstado();
 if (!catalogoListo) {
 root.innerHTML = '<p class="casa-muted">Cargando las APU…</p>';
 try { await Apu.loadApuCatalog(); } catch (err) { /* se informa abajo */ }
 if (!ST.apuCatalogState.loaded) { root.innerHTML = '<p class="casa-muted">No se pudieron cargar las APU. Probá recargar la página.</p>'; return; }
 catalogoListo = true;
 }
 if (!root.dataset.listo) {
 root.dataset.listo = '1';
 root.addEventListener('click', onClick);
 root.addEventListener('change', onChange);
 root.addEventListener('pointerdown', tiradorDown);
 root.addEventListener('keydown', tiradorTecla);
 window.addEventListener('resize', () => { if (!root.hidden && ST.state.currentView === 'costo-m2') render(); });
 }
 render();
}

// ---------------------------------------------------------------------------
// (24/11) Medidas del lote desde el croquis: tirando de los bordes, con las
// flechas o con el editor del terreno. Si la casa no entra, se avisa y no cambia.
// ---------------------------------------------------------------------------
let arrastre = null, finArrastre = 0;
function probarLote(cambios) {
 const guard = { loteAncho: S.loteAncho, loteFondo: S.loteFondo };
 Object.entries(cambios).forEach(([k, v]) => { S[k] = limLote(k, v); });
 const pr = problemaLote(tipologia(orientacion()));
 Object.assign(S, guard);
 return pr;
}
function aplicarLote(cambios, foco = '') {
 const antes = { loteAncho: S.loteAncho, loteFondo: S.loteFondo };
 Object.entries(cambios).forEach(([k, v]) => { S[k] = limLote(k, v); });
 const pr = problemaLote(tipologia(orientacion()));
 if (pr) {
 const nuevo = { loteAncho: S.loteAncho, loteFondo: S.loteFondo };
 Object.assign(S, antes);
 if (!problemaLote(tipologia(orientacion()))) { ST.showToast(pr); render(); return false; }
 Object.assign(S, nuevo); // el lote anterior tampoco cumplía: se deja corregir
 }
 guardarEstado(); render();
 if (foco) document.querySelector(`#casa-root [data-lote-drag="${foco}"]`)?.focus();
 return true;
}
function tiradorDown(e) {
 const h = e.target.closest('[data-lote-drag]');
 if (!h || (e.button !== undefined && e.button > 0)) return;
 const pl = h.closest('.casa-plano'); if (!pl) return;
 e.preventDefault();
 const fan = document.createElement('div');
 fan.className = 'casa-lote-fantasma';
 pl.appendChild(fan);
 const k = h.dataset.loteDrag;
 arrastre = { k, h, fan, x: e.clientX, y: e.clientY, v0: S[k], v: S[k], sc: Number(pl.dataset.sc) || 20, lx: Number(pl.dataset.lx) || 0, lt: Number(pl.dataset.lt) || 0, arriba: pl.dataset.medArriba === '1', movio: false };
 try { h.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
 h.addEventListener('pointermove', tiradorMove);
 h.addEventListener('pointerup', tiradorUp);
 h.addEventListener('pointercancel', tiradorUp);
 dibujarFantasma();
}
function tiradorMove(e) {
 const a = arrastre; if (!a) return;
 const dx = e.clientX - a.x, dy = e.clientY - a.y;
 if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
 const delta = a.k === 'loteFondo' ? dx : (a.arriba ? dy : -dy);
 a.v = limLote(a.k, Math.round((a.v0 + delta / a.sc) * 2) / 2); // de a 50 cm
 dibujarFantasma();
}
function dibujarFantasma() {
 const a = arrastre;
 const F = a.k === 'loteFondo' ? a.v : S.loteFondo, A = a.k === 'loteAncho' ? a.v : S.loteAncho;
 const top = a.arriba ? a.lt : a.lt + (S.loteAncho - A) * a.sc;
 Object.assign(a.fan.style, { left: a.lx + 'px', top: top + 'px', width: (F * a.sc) + 'px', height: (A * a.sc) + 'px' });
 const pr = probarLote({ [a.k]: a.v });
 a.fan.classList.toggle('no', !!pr);
 a.fan.innerHTML = `<span>${f(A, 2)} × ${f(F, 2)} m${pr ? ' · no entra la casa' : ''}</span>`;
}
function tiradorUp(e) {
 const a = arrastre; if (!a) return;
 arrastre = null; finArrastre = Date.now();
 a.h.removeEventListener('pointermove', tiradorMove);
 a.h.removeEventListener('pointerup', tiradorUp);
 a.h.removeEventListener('pointercancel', tiradorUp);
 a.fan.remove();
 if (e.type === 'pointercancel') return;
 if (!a.movio) { S.local = 'lote'; guardarEstado(); render(); return; } // un toque abre el editor del terreno
 if (a.v !== a.v0) aplicarLote({ [a.k]: a.v });
}
function tiradorTecla(e) {
 const k = e.target && e.target.dataset ? e.target.dataset.loteDrag : null;
 if (!k) return;
 const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
 if (!d) return;
 e.preventDefault();
 aplicarLote({ [k]: S[k] + d * 0.5 }, k);
}

function onClick(e) {
 const b = e.target.closest('[data-casa]');
 if (!b) return;
 if (Date.now() - finArrastre < 350) return; // el click que sigue a soltar un tirador
 const [accion, valor] = b.dataset.casa.split(':');
 if (b.getAttribute('aria-disabled') === 'true') { if (b.title && !['mínimo', 'máximo'].includes(b.title)) ST.showToast(b.title); return; }
 if (accion === 'apu') { window.nexoBraApp?.editAdminApuTask?.(Number(valor)); return; }
 if (accion === 'recalcular') { recargarApus(); return; }
 if (accion === 'calculadora') { abrirEnCalculadora(); return; }
 // (22/11-b) Mis casas
 if (accion === 'modelos') { S.verModelos = !S.verModelos; guardarEstado(); if (S.verModelos && modelos === null) cargarModelos(); else render(); return; }
 if (accion === 'mGuardar') { guardarModelo(valor === 'nueva'); return; }
 if (accion === 'mAbrir') { abrirModelo(valor); return; }
 if (accion === 'mDup') { duplicarModelo(valor); return; }
 if (accion === 'mBorrar') { borrarModelo(valor); return; }
 if (accion === 'mNueva') { nuevaCasa(); return; }
 if (accion === 'kReset') { S.k = { ...DEFAULTS.k }; guardarEstado(); render(); return; }
 if (accion === 'loteSet') { const [a, fo] = valor.split('x').map(Number); S.local = 'lote'; aplicarLote({ loteAncho: a, loteFondo: fo }); return; }
 if (accion === 'loteEd') { S.local = 'lote'; guardarEstado(); render(); document.querySelector('#casa-root .casa-lote-ed')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
 const antes = JSON.stringify(S);
 if (accion === 'toggle') S[valor] = !S[valor];
 else if (accion === 'girar') S.norte = norm(S.norte + Number(valor));
 else if (accion === 'paso') { S.paso = Number(valor) || 1; guardarEstado(); render(); document.getElementById('casa-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
 else if (accion === 'local') S.local = (valor && S.local !== valor) ? valor : '';
 else if (accion === 'aa') S.aa = { ...(S.aa || {}), [valor]: !(S.aa && S.aa[valor]) };
 else if (accion === 'artef') {
 const [id, k] = valor.split('|');
 const x = { ...((S.artef || {})[id] || {}) };
 if (k === 'ducha' || k === 'banera') x.banera = k === 'banera'; else if (k === 'vanitory') x.vanitory = x.vanitory === false; else x[k] = !x[k];
 S.artef = { ...(S.artef || {}), [id]: x };
 }
 else if (accion === 'vent') {
 const [id, pasoV] = valor.split('|');
 const T0 = tipologia(orientacion()), w = T0.wins.find(x => x.r === id), r = T0.rooms.find(x => x.id === id);
 if (!w || !r) return;
 const lista = r.banio ? ANCHOS_VENT.filter(x => x <= 1.0) : ANCHOS_VENT;
 let i = lista.findIndex(x => x >= w.w - 1e-9); if (i < 0) i = lista.length - 1;
 i = Math.max(0, Math.min(lista.length - 1, i + Number(pasoV)));
 S.vent = { ...(S.vent || {}), [`${S.tipo}.${id}`]: lista[i] };
 }
 else if (accion === 'nivel') S.nivel = valor; // (24/11) objetivo: no toca lo que eligió el usuario
 else if (accion === 'aplicarNivel') Object.assign(S, propuestaNivel(S.nivel));
 else if (accion === 'reset') { S = { ...DEFAULTS, dims: {} }; }
 else if (accion === 'dim') {
 // dim:clave|±1 (pasos de 10 cm) · dim:base|0 vuelve a las medidas de la casa base
 const [k, paso] = valor.split('|');
 if (k === 'base') { const dims = { ...S.dims }; Object.keys(dims).filter(x => x.startsWith(S.tipo + '.')).forEach(x => delete dims[x]); S.dims = dims; S.altura = DEFAULTS.altura; }
 else if (k === 'altura') S.altura = r2(Math.min(3.2, Math.max(MIN_ALTURA, S.altura + Number(paso) * 0.05)));
 else if (k === 'loteAncho' || k === 'loteFondo') S[k] = limLote(k, S[k] + Number(paso) * 0.5);
 else {
 const p = paramsTipo().find(x => x.k === k);
 if (!p) return;
 const v = r2(Math.min(p.max, Math.max(p.min, D(k, p.def) + Number(paso) * 0.1)));
 S.dims = { ...S.dims, [`${S.tipo}.${k}`]: v };
 }
 }
 else S[accion] = ['dorm', 'cuadrilla', 'fv'].includes(accion) ? Number(valor) : valor; // techo '1'/'2'/'4' queda como texto
 if (accion === 'tipo' && valor === 'compacta') { S.dorm = 2; S.bano2 = 'no'; }
 if (accion === 'techo' && valor === 'plana') S.techoMat = 'chapa';
 if (accion === 'techoMat' && valor === 'teja') S.estructTecho = 'madera';
 if (accion === 'sistTecho' && valor === 'cerchas') S.cielo = 'suspendido'; // con cerchas el cielorraso va bajo el tirante inferior
 if (accion === 'cielo' && valor === 'pendiente') S.sistTecho = 'tirantes';
 // Si con el cambio la casa no entra en el lote, se vuelve atrás y se avisa
 const problema = problemaLote(tipologia(orientacion()));
 if (problema) {
 // si el estado anterior ya no cumplía (p. ej. medidas guardadas antes de este cambio), se deja corregir
 const nuevo = S; S = JSON.parse(antes);
 if (problemaLote(tipologia(orientacion()))) S = nuevo;
 else { ST.showToast(problema); return; }
 }
 guardarEstado();
 render();
}

async function recargarApus() {
 const root = document.getElementById('casa-root');
 try {
 if (typeof Admin.refreshApuCatalogCache === 'function') await Admin.refreshApuCatalogCache();
 else { ST.apuCatalogState.loaded = false; await Apu.loadApuCatalog(); }
 } catch (err) { ST.showToast('No se pudieron recargar las APU.'); }
 if (root) render();
 ST.showToast('Recalculado con las APU actuales.');
}

function abrirEnCalculadora() {
 if (!ultimo) return;
 const conApu = ultimo.lineas.filter(l => l.item);
 if (ST.state.apuBudgetItems.length && !confirm('Esto reemplaza el presupuesto que tenés abierto en la Calculadora. ¿Seguimos?')) return;
 Apu.newApuBudget();
 // (22/11-b) se lleva también el Factor K de la casa
 Object.assign(ST.apuBudgetMeta, { kGastosGenerales: S.k.gg, kBeneficio: S.k.ben, kIibb: S.k.iibb, kIva: S.k.iva, kFactor: kFactor() });
 ST.state.apuBudgetItems = conApu.map(l => Apu.buildBudgetItem(l.apuId, l.cantidad));
 const nombre = `Casa ${ultimo.resumen}`;
 ST.apuBudgetMeta.name = nombre;
 if (ST.apuBudgetName) ST.apuBudgetName.value = nombre;
 Apu.saveApuCart();
 Apu.updateApuBudgetUI();
 window.nexoBraApp?.openApuStep?.('presupuesto');
}

const btn = (accion, valor, on, contenido, extra = '') => `<button type="button" class="casa-opt${on ? ' on' : ''}" data-casa="${accion}:${valor}" aria-pressed="${on ? 'true' : 'false'}" ${extra}>${contenido}</button>`;

// ---------------------------------------------------------------------------
// (21/11-e) Cortes constructivos: un dibujo por paquete (fundación y piso,
// muro exterior, tabique, techo y carpintería) que cambia con cada opción.
// Esquemas orientativos, no son detalles de obra. Dibujados en SVG.
// ---------------------------------------------------------------------------
const COL = {
 rev: '#E6DDCC', yeso: '#E4E6E8', eps: '#FFFFFF', lch: '#F39A2B', hueco: '#5B6067', comun: '#F6D9BE', junta: '#C4C2BC', borde: '#1E2229', hierro: '#E0201B',
 horm: '#C9C9C4', tierra: '#E7DCC6', lana: '#F4D98B', madera: '#D9A86C', maderaOsc: '#B5834A', chapa: '#8A939E', teja: '#B0482A',
 membrana: '#2B3038', pvc: '#EEF0F2', aire: '#FBFBFA', linea: '#7A8492', piso: { ceramico: '#C98F67', porcelanato: '#CFC8BF' }
};
const fx = (n) => Number(n).toFixed(1);
const rct = (x, y, w, h, fill, extra = '') => `<rect x="${fx(x)}" y="${fx(y)}" width="${fx(Math.max(0, w))}" height="${fx(Math.max(0, h))}" fill="${fill}" ${extra}/>`;
const lin = (x1, y1, x2, y2, st = COL.linea, w = 1, extra = '') => `<line x1="${fx(x1)}" y1="${fx(y1)}" x2="${fx(x2)}" y2="${fx(y2)}" stroke="${st}" stroke-width="${w}" ${extra}/>`;
const txt = (x, y, t, extra = '') => `<text x="${fx(x)}" y="${fx(y)}" font-size="9" fill="#5E6977" font-family="Inter, sans-serif" ${extra}>${esc(t)}</text>`;
function patrones(p) {
 return `<defs>
 <pattern id="${p}-rev" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${COL.rev}"/><circle cx="1" cy="1" r="0.5" fill="#C9BBA2"/><circle cx="3" cy="3" r="0.4" fill="#D3C6AE"/></pattern>
 <pattern id="${p}-eps" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><circle cx="3" cy="3" r="2" fill="none" stroke="#AFC0D0" stroke-width="0.7"/></pattern>
 <pattern id="${p}-horm" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="${COL.horm}"/><circle cx="1.5" cy="2" r="0.7" fill="#8E8E88"/><circle cx="5" cy="5" r="0.9" fill="#9C9C96"/><path d="M4 1 l1.2 1.4 -1.6 0z" fill="#A5A59F"/></pattern>
 <pattern id="${p}-pobre" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#D6D3CB"/><circle cx="2" cy="3" r="0.8" fill="#B3ABA0"/><circle cx="5.5" cy="5.5" r="0.6" fill="#B3ABA0"/></pattern>
 <pattern id="${p}-tierra" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#F7F4EE"/><path d="M0 6 L6 0 M0 12 L6 6 M6 0 L12 6 M6 6 L12 12" stroke="#C9C2B4" stroke-width="0.8" fill="none"/></pattern>
 <pattern id="${p}-lana" width="10" height="6" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="${COL.lana}"/><path d="M0 3 q2.5 -3 5 0 t5 0" fill="none" stroke="#D9A92E" stroke-width="0.8"/></pattern>
 <pattern id="${p}-mad" width="14" height="5" patternUnits="userSpaceOnUse"><rect width="14" height="5" fill="${COL.madera}"/><path d="M0 2 q7 -1.5 14 0" fill="none" stroke="${COL.maderaOsc}" stroke-width="0.6"/></pattern>
 <pattern id="${p}-madv" width="5" height="14" patternUnits="userSpaceOnUse"><rect width="5" height="14" fill="${COL.madera}"/><path d="M2 0 q-1.5 7 0 14" fill="none" stroke="${COL.maderaOsc}" stroke-width="0.6"/></pattern>
 </defs>`;
}
const svgCorte = (w, h, p, body, label) => `<svg class="casa-corte-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${patrones(p)}${body}</svg>`;

// Capa vertical de un muro (corte vertical: el espesor va de izquierda a derecha)
function capaVertical(t, x, w, y0, y1, p, PX) {
 const H = y1 - y0;
 if (t === 'rev') return rct(x, y0, w, H, `url(#${p}-rev)`);
 if (t === 'yeso') return rct(x, y0, w, H, COL.yeso, `stroke="#7A8492" stroke-width="0.8"`);
 if (t === 'eps') return rct(x, y0, w, H, `url(#${p}-eps)`, `stroke="#AFC0D0" stroke-width="0.6"`);
 if (t === 'mach') { let s = rct(x, y0, w, H, `url(#${p}-madv)`); for (let y = y0 + 10 * PX; y < y1; y += 10 * PX) s += lin(x, y, x + w, y, COL.maderaOsc, 0.8); return s; }
 if (t === 'bastidor') return rct(x, y0, w, H, `url(#${p}-madv)`, `stroke="${COL.maderaOsc}" stroke-width="0.6"`);
 if (t === 'cavidad') { let c = rct(x, y0, w, H, '#EDF0F3') + rct(x, y0, 1.6, H, COL.chapa) + rct(x + w - 1.6, y0, 1.6, H, COL.chapa); for (let y = y0 + 6; y < y1; y += 14) c += lin(x + 3, y, x + w - 3, y + 8, '#C5CDD5', 0.7); return c; }
 // (22/11-g) Ladrillos como en los detalles de la cátedra: los huecos, naranjas con
 // borde negro y los tubos cortados en gris oscuro; los comunes, con sus juntas
 // (una hilada entera y la siguiente partida al medio).
 const hil = { lch18: [18, 3, 3], lch12: [18, 2, 3], lc15: [5.5, 0, 0], comun: [5.5, 0, 0], plaqueta: [5.5, 0, 0] }[t] || [18, 0, 0];
 const cols = hil[1], filas = hil[2], hc = hil[0] * PX, j = (cols ? 1.5 : 1.2) * PX;
 let s = rct(x, y0, w, H, COL.junta);
 let k = 0;
 for (let y = y0 - (hc + j) * 0.35; y < y1; y += hc + j, k++) {
 const ya = Math.max(y, y0), yb = Math.min(y + hc, y1);
 if (yb <= ya) continue;
 if (cols) {
 s += rct(x, ya, w, yb - ya, COL.lch, `stroke="${COL.borde}" stroke-width="1.2"`);
 const t0 = Math.max(1.2, 0.9 * PX), hw = (w - (cols + 1) * t0) / cols, hh = (hc - (filas + 1) * t0) / filas;
 for (let c = 0; c < cols; c++) for (let r = 0; r < filas; r++) {
 const hy = y + t0 + r * (hh + t0);
 const a = Math.max(hy, y0), b = Math.min(hy + hh, y1);
 if (b > a) s += rct(x + t0 + c * (hw + t0), a, hw, b - a, COL.hueco, `stroke="${COL.borde}" stroke-width="0.5"`);
 }
 } else if (k % 2 && w > 3 * j) {
 const hw = (w - j) / 2;
 s += rct(x, ya, hw, yb - ya, COL.comun) + rct(x + hw + j, ya, hw, yb - ya, COL.comun);
 } else s += rct(x, ya, w, yb - ya, COL.comun);
 }
 return s;
}
// (22/11-g) Hormigón armado en corte: borde negro, estribo y barras en rojo
function hormigonArmado(x, y, w, h, p, rec = 3) {
 const r = Math.min(rec, w / 4, h / 4);
 let s = rct(x, y, w, h, `url(#${p}-horm)`, `stroke="${COL.borde}" stroke-width="1.2"`);
 s += `<rect x="${fx(x + r)}" y="${fx(y + r)}" width="${fx(w - 2 * r)}" height="${fx(h - 2 * r)}" rx="1.5" fill="none" stroke="${COL.hierro}" stroke-width="1.6"/>`;
 const b = 1.9, pts = [[x + r + b, y + r + b], [x + w - r - b, y + r + b], [x + r + b, y + h - r - b], [x + w - r - b, y + h - r - b]];
 if (w > 14 * r) pts.push([x + w / 2, y + h - r - b]);
 pts.forEach(([cx, cy]) => { s += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${b}" fill="${COL.hierro}"/>`; });
 s += lin(x + w - r - 1, y + r + 1, x + w - r - 6, y + r + 6, COL.hierro, 1.4); // gancho del estribo
 return s;
}
const SWATCH = { rev: COL.rev, yeso: COL.yeso, eps: '#E8EEF4', lch18: COL.lch, lch12: COL.lch, lc15: COL.comun, comun: COL.comun, plaqueta: COL.comun, mach: COL.madera, bastidor: COL.madera, cavidad: '#EDF0F3' };
const leyenda = (items) => `<ul class="casa-corte-ley">${items.map(it => `<li><i style="background:${it.c}"></i><span>${esc(it.n)}${it.e ? ` <em>${esc(it.e)}</em>` : ''}</span></li>`).join('')}</ul>`;
const ficha = (svg, items, pie = '') => `<figure class="casa-corte">${svg}<figcaption>${leyenda(items)}${pie ? `<p>${pie}</p>` : ''}</figcaption></figure>`;

// (24/11) Corte transversal del lote, visto desde la calle: la casa contra su
// medianera (muro propio contiguo al eje), el techo y su canaleta, el costado
// libre y el cerco del otro lado. A escala aproximada. Las distancias de la
// canaleta al eje medianero son de la Ord. Oberá 2557 (a validar).
function corteMedianera(o, T) {
 const A = S.loteAncho, Wf = T.Wf, HM = S.altura, pend = pendienteTecho(), plana = S.techo === 'plana';
 const AL = plana ? 0 : (o.oeste ? 0.8 : 0.5);
 const sube = S.techo === '1' ? Wf * pend : plana ? 0.5 : (Wf / 2) * pend;
 const W = 340, VEC = 34, k = Math.min(40, (W - 20 - 2 * VEC) / A);
 const yG = 22 + (HM + sube + 0.5) * k, H = yG + 54;
 const izq = o.medArriba; // como en la fachada: con la medianera de la casa a la izquierda
 const X = (v) => 10 + VEC + (izq ? v : A - v) * k;
 const Y = (h) => yG - h * k;
 const p = 'cmed', EJE = '#A0522D';
 const techoCol = plana ? '#C9CED6' : (S.techoMat === 'teja' ? COL.teja : COL.chapa);
 const xa = (v1, v2) => Math.min(X(v1), X(v2)), wa = (v1, v2) => Math.abs(X(v2) - X(v1));
 const tm = Math.max(5, 0.15 * k), esp = (BASES_MURO[S.muroBase] || BASES_MURO.lch18).esp, te = Math.max(5, esp / 100 * k);
 let b = '';
 // terreno, vecinos y calle
 b += rct(0, yG, W, 12, `url(#${p}-tierra)`) + lin(0, yG, W, yG, '#8A96A6', 1.2);
 const xVecCasa = izq ? 10 + VEC / 2 : W - 10 - VEC / 2, xVecOtro = izq ? W - 10 - VEC / 2 : 10 + VEC / 2;
 b += txt(xVecCasa, yG - 6, 'Vecino', 'text-anchor="middle" font-size="8"');
 if (o.calle2) b += rct(izq ? X(A) : 0, yG, VEC + 10, 5, '#9AA3B0') + txt(xVecOtro, yG - 6, 'Calle', 'text-anchor="middle" font-size="8" font-weight="700"');
 else b += txt(xVecOtro, yG - 6, 'Vecino', 'text-anchor="middle" font-size="8"');
 // ejes medianeros (o línea municipal en esquina)
 const eje = (x, esLM) => lin(x, 8, x, yG + 12, esLM ? '#2B3038' : EJE, esLM ? 1.6 : 1.4, esLM ? '' : 'stroke-dasharray="6 3 1.5 3"');
 b += eje(X(0), false) + eje(X(A), !!o.calle2);
 b += txt(X(0) + (izq ? -3 : 3), 14, 'eje', `text-anchor="${izq ? 'end' : 'start'}" font-size="8" fill="${EJE}"`);
 b += txt(X(A) + (izq ? 3 : -3), 14, o.calle2 ? 'L.M.' : 'eje', `text-anchor="${izq ? 'start' : 'end'}" font-size="8" fill="${o.calle2 ? '#2B3038' : EJE}"`);
 // piso de la casa
 b += rct(xa(0, Wf), yG - Math.max(3, 0.12 * k), wa(0, Wf), Math.max(3, 0.12 * k), `url(#${p}-horm)`, `stroke="${COL.borde}" stroke-width="0.6"`);
 // muros: el de la medianera (sube hasta el techo a 1 agua o hasta el parapeto) y el del costado libre
 const hMed = S.techo === '1' ? HM + sube : plana ? HM + 0.5 : HM;
 const xMed = izq ? X(0) : X(0) - tm, xLib = izq ? X(Wf) - te : X(Wf);
 b += rct(xMed, Y(hMed), tm, hMed * k, COL.lch, `stroke="${COL.borde}" stroke-width="0.8"`);
 b += rct(xLib, Y(plana ? HM + 0.5 : HM), te, (plana ? HM + 0.5 : HM) * k, COL.lch, `stroke="${COL.borde}" stroke-width="0.8"`);
 // techo y canaletas
 const canaleta = (v, h, mal) => { const cx = X(v), cy = Y(h); return `<path d="M${fx(cx - 4)} ${fx(cy - 1)} V${fx(cy + 5)} H${fx(cx + 4)} V${fx(cy - 1)}" fill="none" stroke="${mal ? '#C2410C' : '#5E6670'}" stroke-width="1.6"/>`; };
 const linea = (pts) => `<polyline points="${pts.map(([v, h]) => `${fx(X(v))},${fx(Y(h))}`).join(' ')}" fill="none" stroke="${techoCol}" stroke-width="4" stroke-linejoin="round"/>`;
 let distLibre = A - (Wf + AL), canMed = false;
 if (S.techo === '1') { b += linea([[0.07, HM + sube], [Wf + AL, HM - AL * pend]]) + canaleta(Wf + AL, HM - AL * pend - 0.05); }
 else if (plana) {
 b += rct(xa(0, Wf), Y(HM + 0.15), wa(0, Wf), 0.15 * k, `url(#${p}-horm)`, `stroke="${COL.borde}" stroke-width="0.8"`);
 distLibre = null;
 } else {
 b += linea([[0.15, HM], [Wf / 2, HM + sube], [Wf + AL, HM - AL * pend]]) + canaleta(Wf + AL, HM - AL * pend - 0.05) + canaleta(0.3, HM - 0.05, true);
 canMed = true;
 }
 b += txt((X(0) + X(Wf)) / 2, Y(HM * 0.45), 'Casa', 'text-anchor="middle" font-size="10" font-weight="700" fill="#2B3038"');
 // cochera al costado (planta lineal)
 if (S.cochera && S.tipo === 'lineal') b += rct(xa(Wf + 0.9, Wf + 3.8), Y(2.4), wa(Wf + 0.9, Wf + 3.8), 2.4 * k, 'none', 'stroke="#7A8492" stroke-dasharray="4 3"') + txt((X(Wf + 0.9) + X(Wf + 3.8)) / 2, Y(1.1), 'cochera', 'text-anchor="middle" font-size="8"');
 // cerco del otro lado
 if (!o.calle2) {
 const xc = izq ? X(A) - 4 : X(A) + 1;
 if (S.cercoLat === 'muro') { b += rct(xc - 1, Y(1.8), 4.5, 1.8 * k, '#B9BEC5', `stroke="${COL.borde}" stroke-width="0.6"`); for (let h = 0.2; h < 1.8; h += 0.2) b += lin(xc - 1, Y(h), xc + 3.5, Y(h), '#8E949C', 0.5); }
 else if (S.cercoLat === 'tejido') { b += rct(xc, Y(1.8), 2.5, 1.8 * k, '#5E6670') + lin(xc + 1.2, Y(1.8), xc + 1.2, yG, '#9AA3B0', 3, 'stroke-dasharray="1.5 1.5"'); }
 }
 // canaleta: distancia al eje del vecino
 if (distLibre !== null && !o.calle2) {
 const okD = distLibre >= 0.85 - 1e-9, yc = Y(HM - AL * pend) + 12;
 b += lin(X(Wf + AL), yc, X(A), yc, okD ? '#0E9F6E' : '#C2410C', 1, 'stroke-dasharray="2 2"');
 if (wa(Wf + AL, A) > 26) b += txt((X(Wf + AL) + X(A)) / 2, yc - 3, `${f(distLibre, 2)} m`, `text-anchor="middle" font-size="8" fill="${okD ? '#0E9F6E' : '#C2410C'}"`);
 }
 // cotas
 const cota = (v1, v2, y, t) => { const x1 = Math.min(X(v1), X(v2)), x2 = Math.max(X(v1), X(v2)); let c = lin(x1, y, x2, y, '#5E6977', 0.8) + lin(x1, y - 3, x1, y + 3, '#5E6977', 0.8) + lin(x2, y - 3, x2, y + 3, '#5E6977', 0.8); if (x2 - x1 > t.length * 4.6) c += txt((x1 + x2) / 2, y - 3, t, 'text-anchor="middle" font-size="8.5"'); return c; };
 b += cota(0, Wf, yG + 26, `casa ${f(Wf, 2)} m`) + cota(Wf, A, yG + 26, `libre ${f(A - Wf, 2)} m`) + cota(0, A, yG + 46, `terreno ${f(A, 2)} m`);
 // leyenda y verificación
 const items = [
 { c: COL.lch, n: 'Muro propio sobre la medianera', e: 'hueco 12, pegado al eje: cada casa tiene el suyo' },
 { c: EJE, n: o.calle2 ? 'Eje medianero y, del otro lado, la línea municipal' : 'Eje medianero: el límite con el vecino', e: '' },
 S.techo === '1' ? { c: techoCol, n: 'Techo a 1 agua: lo alto va sobre la medianera', e: 'sin alero hacia el vecino; el muro sube hasta el techo' }
 : plana ? { c: techoCol, n: 'Losa con parapeto de 0,50 m', e: 'desagua a embudos propios, sin volcar al vecino' }
 : { c: techoCol, n: `Techo a ${S.techo} aguas: sin alero del lado de la medianera`, e: 'ese faldón desagua en una canaleta pegada al muro' }
 ];
 if (!o.calle2) items.push({ c: S.cercoLat === 'muro' ? '#B9BEC5' : S.cercoLat === 'tejido' ? '#5E6670' : '#E2E6EC', n: { no: 'Sin cerco en la otra medianera', tejido: 'Cerco de tejido de 1,80 m', muro: 'Muro de bloques de 1,80 m' }[S.cercoLat] || 'Sin cerco', e: 'se elige en Terminaciones › Exterior' });
 else items.push({ c: '#9AA3B0', n: 'Lote de esquina: del lado libre está la otra calle', e: 'ochava y retiros según el código: a validar' });
 const avisos = [];
 if (distLibre !== null && !o.calle2) avisos.push(distLibre >= 0.85 - 1e-9 ? `<span class="ok">La canaleta queda a ${f(distLibre, 2)} m del eje del vecino (la Ord. Oberá 2557 pide 0,85 m o más; a validar).</span>` : `<span class="no">La canaleta queda a ${f(distLibre, 2)} m del eje del vecino y la Ord. Oberá 2557 pide 0,85 m o más (a validar): achicá la casa o ensanchá el lote.</span>`);
 if (distLibre !== null && o.calle2 && distLibre < 0) avisos.push('<span class="no">El alero pasa la línea municipal: achicá la casa o ensanchá el lote.</span>');
 if (canMed) avisos.push('<span class="no">Del lado de la medianera la canaleta queda a unos 0,30 m del eje: no llega a los 0,85 m de la Ord. 2557 (a validar). A 1 agua, con lo alto sobre la medianera, se evita.</span>');
 avisos.push('Esquema a escala aproximada, visto desde la calle.');
 return ficha(svgCorte(W, Math.round(H), p, b, `Corte por el terreno: casa apoyada en la medianera ${SIG8[idx8(o.medBien)]}`), items, avisos.join(' '));
}
// Ícono de cada cerco (para los botones de Exterior)
function iconoCerco(t) {
 let c = '<line x1="2" y1="21" x2="42" y2="21" stroke="#8A96A6" stroke-width="1.5"/>';
 if (t === 'tejido') { c += '<rect x="5" y="5" width="2.5" height="16" fill="#5E6670"/><rect x="36.5" y="5" width="2.5" height="16" fill="#5E6670"/>'; for (let x = 8; x < 36; x += 5) c += `<path d="M${x} 6 l5 7 l-5 7 M${x + 5} 6 l-5 7 l5 7" fill="none" stroke="#9AA3B0" stroke-width="0.7"/>`; }
 else if (t === 'muro') { c += '<rect x="4" y="6" width="36" height="15" fill="#B9BEC5" stroke="#5E6670" stroke-width="0.8"/>'; for (let y = 11; y < 21; y += 5) c += `<line x1="4" y1="${y}" x2="40" y2="${y}" stroke="#8E949C" stroke-width="0.6"/>`; for (let i = 0; i < 3; i++) for (let x = (i % 2 ? 10 : 16); x < 40; x += 12) c += `<line x1="${x}" y1="${6 + i * 5}" x2="${x}" y2="${11 + i * 5}" stroke="#8E949C" stroke-width="0.6"/>`; }
 else c += '<line x1="22" y1="3" x2="22" y2="21" stroke="#A0522D" stroke-width="1.2" stroke-dasharray="4 2 1 2"/>';
 return `<svg class="casa-ico-cerco" width="44" height="24" viewBox="0 0 44 24" aria-hidden="true">${c}</svg>`;
}

// Capas del muro exterior (de adentro hacia afuera)
function capasMuroDibujo() {
 const B = BASES_MURO[S.muroBase] || BASES_MURO.lch18, ais = AIS_MURO[S.muro] || AIS_MURO.base;
 const c = [];
 if (ais.cm) { c.push({ t: 'yeso', cm: 1.25, n: 'Placa de yeso', e: '1,25 cm' }); c.push({ t: 'eps', cm: ais.cm, n: 'Poliestireno expandido', e: `${ais.cm} cm` }); }
 else c.push({ t: 'rev', cm: 2, n: 'Revoque interior', e: '2 cm' });
 c.push({ t: S.muroBase, cm: B.esp, n: B.capa.n, e: `${B.esp} cm` });
 if (S.fachada === 'ladrillo') { if (S.muroBase !== 'lc15') c.push({ t: 'plaqueta', cm: 2, n: 'Revestimiento de ladrillo visto', e: '2 cm' }); }
 else c.push({ t: 'rev', cm: 2.5, n: 'Revoque exterior con hidrófugo', e: '2,5 cm' });
 return c;
}

function corteMuro() {
 const PX = 4, H = 140, p = 'cm', capas = capasMuroDibujo();
 const tot = capas.reduce((t, c) => t + c.cm, 0), W = Math.max(150, tot * PX + 40), x0 = (W - tot * PX) / 2;
 let x = x0, body = '';
 capas.forEach(c => { body += capaVertical(c.t, x, c.cm * PX, 0, H - 14, p, PX); x += c.cm * PX; });
 body += txt(2, H - 3, 'Interior') + txt(W - 2, H - 3, 'Exterior', 'text-anchor="end"');
 const km = kMuro(), mx = kmax('muro', S.nivel), ok = km <= Math.min(mx.inv, mx.ver);
 return ficha(svgCorte(W, H, p, body, 'Corte del muro exterior'), capas.map(c => ({ c: SWATCH[c.t], n: c.n, e: c.e })),
 `Espesor ${f(tot, 1)} cm · K ${f(km, 2)} W/m²K · <b class="${ok ? 'ok' : 'no'}">${ok ? 'cumple' : 'no cumple'} nivel ${S.nivel}</b>${BASES_MURO[S.muroBase].capa.aValidar ? ' (a validar)' : ''}`);
}

function corteTabique() {
 const PX = 4, H = 140, p = 'ct';
 const capas = S.tabique === 'durlock' ? [{ t: 'yeso', cm: 1.25, n: 'Placa de yeso', e: '1,25 cm' }, { t: 'cavidad', cm: 7, n: 'Montantes y soleras de chapa', e: '70 mm' }, { t: 'yeso', cm: 1.25, n: 'Placa de yeso', e: '1,25 cm' }]
 : S.tabique === 'madera' ? [{ t: 'mach', cm: 1, n: 'Machimbre', e: '1 cm' }, { t: 'bastidor', cm: 5, n: 'Bastidor de madera', e: '2" × 3"' }, { t: 'mach', cm: 1, n: 'Machimbre', e: '1 cm' }]
 : [{ t: 'rev', cm: 1.5, n: 'Revoque', e: '1,5 cm' }, { t: 'lch12', cm: 12, n: 'Ladrillo cerámico hueco 12', e: '12 cm' }, { t: 'rev', cm: 1.5, n: 'Revoque', e: '1,5 cm' }];
 const tot = capas.reduce((t, c) => t + c.cm, 0), W = 150, x0 = (W - tot * PX) / 2;
 let x = x0, body = '';
 capas.forEach(c => { body += capaVertical(c.t, x, c.cm * PX, 0, H - 14, p, PX); x += c.cm * PX; });
 body += txt(W / 2, H - 3, `Tabique de ${f(tot, 1)} cm`, 'text-anchor="middle"');
 const pie = S.tabique === 'durlock' ? 'En baños y cocina, placa verde.' : S.tabique === 'madera' ? 'Terminación barnizada.' : 'Revocado y pintado en las dos caras.';
 return ficha(svgCorte(W, H, p, body, 'Corte del tabique'), capas.filter((c, i, a) => a.findIndex(d => d.n === c.n) === i).map(c => ({ c: SWATCH[c.t], n: c.n, e: c.e })), pie);
}

function corteTecho() {
 const W = 280, H = 170, p = 'cx', PX = 2.6;
 const items = [];
 let body = '';
 if (S.techo === 'plana') {
 // de abajo hacia arriba: yeso aplicado, losa, aislación, contrapiso con pendiente, carpeta y membrana (siguen la pendiente)
 const aisP = TECHOS_AIS[S.aisTecho], cmA = aisP.cm >= 5 ? aisP.cm : (S.aisTecho === 'ais10' ? 1 : 0);
 let y = H - 26;
 body += rct(0, y, W, 1.5 * PX, COL.yeso, 'stroke="#9AA3B0" stroke-width="0.6"');
 y -= 12 * PX;
 body += rct(0, y, W, 12 * PX, `url(#${p}-horm)`);
 for (let xx = 12; xx < W; xx += 18) body += `<circle cx="${xx}" cy="${fx(y + 12 * PX - 2.5 * PX)}" r="1.6" fill="#3A3F47"/>`;
 if (cmA) { y -= cmA * PX; body += rct(0, y, W, cmA * PX, `url(#${p}-eps)`, 'stroke="#AFC0D0" stroke-width="0.5"'); }
 const yL = y - 5 * PX, yR = y - 10 * PX; // contrapiso de 5 a 10 cm
 body += `<path d="M0 ${fx(y)} L0 ${fx(yL)} L${W} ${fx(yR)} L${W} ${fx(y)}Z" fill="url(#${p}-pobre)"/>`;
 const c2 = 2 * PX;
 body += `<path d="M0 ${fx(yL)} L${W} ${fx(yR)} L${W} ${fx(yR - c2)} L0 ${fx(yL - c2)}Z" fill="url(#${p}-rev)"/>`;
 body += `<path d="M0 ${fx(yL - c2)} L${W} ${fx(yR - c2)}" stroke="${COL.membrana}" stroke-width="2.4"/>`;
 items.push({ c: COL.membrana, n: 'Membrana asfáltica', e: '4 mm' }, { c: COL.rev, n: 'Carpeta', e: '2 cm' }, { c: '#D6D3CB', n: 'Contrapiso con pendiente', e: '5 a 10 cm' });
 if (cmA) items.push({ c: '#E8EEF4', n: `Aislación térmica (${aisP.n.toLowerCase()})`, e: `${cmA} cm` });
 items.push({ c: COL.horm, n: 'Losa de hormigón armado', e: '12 cm' }, { c: COL.yeso, n: 'Yeso aplicado', e: '1,5 cm' });
 body += txt(4, 14, 'Exterior') + txt(4, H - 6, 'Interior');
 return ficha(svgCorte(W, H, p, body, 'Corte del techo plano'), items, `K ${f(aisP.k, 2)} W/m²K (a validar)`);
 }
 const pend = pendienteTecho(), ang = Math.atan(pend) * 180 / Math.PI;
 const teja = S.techoMat === 'teja', madera = S.estructTecho === 'madera', susp = S.cielo === 'suspendido';
 const ais = TECHOS_AIS[S.aisTecho], aisCm = ais.cm >= 5 ? ais.cm : 0, aluminio = S.aisTecho === 'ais10';
 const L = 360, y0 = H * 0.42;
 let g = '', v = 0;
 // cubierta
 if (teja) {
 const per = 15 * PX, hT = 5 * PX;
 for (let u = -per; u < L; u += per) g += `<path d="M${fx(u)} ${fx(v + hT)} a${fx(per / 2)} ${fx(hT)} 0 0 1 ${fx(per)} 0 Z" fill="${COL.teja}" stroke="#8C3519" stroke-width="0.8"/>`;
 v += hT;
 items.push({ c: COL.teja, n: 'Teja cerámica', e: '' });
 } else {
 const per = 7.6 * PX, a = 1.8 * PX;
 let d = `M0 ${fx(v + a)}`;
 for (let u = 0; u < L; u += per) d += ` L${fx(u + per * 0.2)} ${fx(v)} L${fx(u + per * 0.5)} ${fx(v)} L${fx(u + per * 0.7)} ${fx(v + a)} L${fx(u + per)} ${fx(v + a)}`;
 g += `<path d="${d}" fill="none" stroke="${COL.chapa}" stroke-width="1.8"/>`;
 v += a + 1;
 items.push({ c: COL.chapa, n: 'Chapa acanalada', e: '' });
 }
 if (aluminio) { g += rct(0, v, L, 1.2 * PX, '#C8CED4', 'stroke="#9AA3B0" stroke-width="0.5"'); v += 1.2 * PX; items.push({ c: '#C8CED4', n: 'Aislante con aluminio', e: '10 mm' }); }
 if (aisCm && !susp) { g += rct(0, v, L, aisCm * PX, `url(#${p}-lana)`); v += aisCm * PX; items.push({ c: COL.lana, n: 'Lana de vidrio', e: `${aisCm} cm` }); }
 // estructura
 if (madera) {
 const cl = 5 * PX;
 for (let u = 10; u < L; u += 55) g += rct(u, v, cl, cl, `url(#${p}-mad)`, `stroke="${COL.maderaOsc}" stroke-width="0.6"`);
 v += cl;
 g += rct(0, v, L, 15 * PX, `url(#${p}-mad)`, `stroke="${COL.maderaOsc}" stroke-width="0.6"`);
 v += 15 * PX;
 items.push({ c: COL.madera, n: 'Clavaderas y tirantes de madera', e: '2" × 2" y 2" × 6"' });
 } else {
 const hC = 12 * PX, bC = 5 * PX;
 for (let u = 30; u < L; u += 90) g += `<path d="M${fx(u + bC)} ${fx(v)} H${fx(u)} V${fx(v + hC)} H${fx(u + bC)}" fill="none" stroke="#5E6670" stroke-width="2"/>`;
 v += hC;
 items.push({ c: COL.chapa, n: 'Correas metálicas C', e: '120 mm' });
 }
 // cielorraso
 const cielo = { machimbre: ['Machimbre', 1, `url(#${p}-mad)`, COL.madera], pvc: ['Lama de PVC', 1, COL.pvc, COL.pvc], durlock: ['Placa de yeso', 1.25, COL.yeso, COL.yeso] }[S.cieloMat] || ['Machimbre', 1, `url(#${p}-mad)`, COL.madera];
 const juntas = (y, h, len, paso) => { let s = ''; for (let u = paso; u < len; u += paso) s += lin(u, y, u, y + h, '#9AA3B0', 0.6); return s; };
 if (!susp) { g += rct(0, v, L, cielo[1] * PX, cielo[2], 'stroke="#9AA3B0" stroke-width="0.5"') + juntas(v, cielo[1] * PX, L, S.cieloMat === 'durlock' ? 120 : 26); v += cielo[1] * PX; }
 body += `<g transform="translate(0 ${fx(y0)}) rotate(${fx(-ang)})">${g}</g>`;
 if (susp) {
 const yc = H - 24, hC = cielo[1] * PX;
 // velas (colgantes) desde la estructura hasta el cielorraso
 [50, 130, 210].forEach(xx => { const yTop = y0 - xx * Math.tan(ang * Math.PI / 180) + v / Math.cos(ang * Math.PI / 180); if (yTop < yc - 4) body += lin(xx, yTop, xx, yc - (aisCm ? aisCm * PX : 0), '#8A939E', 1); });
 if (aisCm) { body += rct(0, yc - aisCm * PX, W, aisCm * PX, `url(#${p}-lana)`); items.push({ c: COL.lana, n: 'Lana de vidrio sobre el cielorraso', e: `${aisCm} cm` }); }
 body += rct(0, yc, W, hC, cielo[2], 'stroke="#9AA3B0" stroke-width="0.5"') + juntas(yc, hC, W, S.cieloMat === 'durlock' ? 120 : 26);
 }
 items.push({ c: cielo[3], n: `Cielorraso de ${cielo[0].toLowerCase()} ${susp ? 'suspendido' : 'siguiendo la pendiente'}`, e: `${f(cielo[1], cielo[1] % 1 ? 2 : 0)} cm` });
 body += txt(4, 14, 'Exterior') + txt(W - 4, H - 4, 'Interior', 'text-anchor="end"');
 return ficha(svgCorte(W, H, p, body, 'Corte del techo'), items, `Pendiente ${Math.round(pend * 100)} % · K ${f(ais.k, 2)} W/m²K (a validar)`);
}

// (22/11) Estructura del techo: tirantes/correas apoyados en muros o cerchas.
// Luz a cubrir y recomendación orientativa (a validar con cálculo estructural).
function luzTecho(T) {
 const ancho = S.tipo === 'L' ? Math.max(D('fr', 4.0), D('ala', 4.3)) : T.Wf;
 const madera = S.estructTecho === 'madera';
 const portantes = S.tabique === 'ladrillo';
 // madera: los tirantes cruzan el ancho (a 2 aguas con cumbrera apoyada en un muro interior)
 // metálica: las correas van a lo largo, entre muros transversales
 const tramos = T.rooms.filter(r => !r.semi && !r.noLabel).map(r => S.tipo === 'L' && r.u0 >= D('fr', 4.0) - 1e-6 ? r.v1 - r.v0 : r.u1 - r.u0);
 const luz = madera ? (S.techo === '1' || !portantes ? ancho : ancho / 2) : (portantes ? Math.max(...tramos) : T.L);
 const recom = S.techo === 'plana' ? '' : (luz > 4.0 ? 'cerchas' : 'tirantes');
 return { ancho, luz, recom, madera, portantes };
}
const SEP_CERCHA = () => S.estructTecho === 'madera' ? 1.0 : 1.5;
function esquemaTecho(T) {
 if (S.techo === 'plana') return '';
 const W = 280, H = 150, p = 'ce';
 const lz = luzTecho(T), ancho = lz.ancho, pend = pendienteTecho();
 const k = (W - 50) / ancho, x0 = 25, yM = H - 30, hm = 34; // muros dibujados cortos (no a escala vertical)
 const X = (m) => x0 + m * k;
 const sube = S.techo === '1' ? ancho * pend : ancho / 2 * pend;
 const yTop = yM - hm - sube * k;
 const madera = S.estructTecho === 'madera', cerchas = S.sistTecho === 'cerchas';
 const colE = madera ? COL.maderaOsc : '#5E6670', grosor = madera ? 3.2 : 2.2;
 let b = '';
 // muros (exteriores siempre; interior portante al medio si hay)
 const hIzq = S.techo === '1' ? hm + ancho * pend * k : hm; // a 1 agua el muro alto (medianera) sube hasta el techo
 b += rct(X(0) - 4, yM - hIzq, 8, hIzq, COL.lch, 'stroke="#8C3519" stroke-width="0.6"') + rct(X(ancho) - 4, yM - hm, 8, hm, COL.lch, 'stroke="#8C3519" stroke-width="0.6"');
 const medio = S.techo !== '1' && lz.portantes && !cerchas;
 if (medio) b += rct(X(ancho / 2) - 3, yM - hm, 6, hm, COL.lch, 'stroke="#8C3519" stroke-width="0.6"');
 b += lin(0, yM, W, yM, '#8A96A6', 1.2);
 const yA = yM - hm; // apoyo
 const pts = S.techo === '1' ? [[X(0), yA - ancho * pend * k], [X(ancho), yA]] : [[X(0), yA], [X(ancho / 2), yA - sube * k], [X(ancho), yA]];
 const linea = (a, c, col = colE, g = grosor) => lin(a[0], a[1], c[0], c[1], col, g, 'stroke-linecap="round"');
 const items = [];
 if (cerchas) {
 // cordón superior, tirante inferior y montantes/diagonales (tipo Howe)
 const yb = yA;
 for (let i = 0; i < pts.length - 1; i++) b += linea(pts[i], pts[i + 1]);
 b += linea([X(0), yb], [X(ancho), yb]);
 const n = 4, yTopAt = (xm) => { if (S.techo === '1') return yA - (ancho - xm) * pend * k; const d = Math.abs(xm - ancho / 2); return yA - (ancho / 2 - d) * pend * k; };
 for (let i = 1; i < n; i++) { const xm = ancho * i / n; b += linea([X(xm), yb], [X(xm), yTopAt(xm)], colE, grosor * 0.7); }
 for (let i = 0; i < n; i++) { const xa = ancho * i / n, xb = ancho * (i + 1) / n; const haciaCentro = S.techo === '1' ? true : xa < ancho / 2; b += haciaCentro ? linea([X(xa), yb], [X(xb), yTopAt(xb)], colE, grosor * 0.6) : linea([X(xb), yb], [X(xa), yTopAt(xa)], colE, grosor * 0.6); }
 items.push({ c: colE, n: madera ? `Cerchas de madera (cabriadas) c/ ${f(SEP_CERCHA(), 2)} m` : `Cerchas metálicas reticuladas c/ ${f(SEP_CERCHA(), 2)} m`, e: 'a validar con cálculo' });
 items.push({ c: COL.lch, n: 'Apoyan solo en los muros exteriores', e: '' });
 } else if (!madera) {
 // correas metálicas: en este corte se ven de punta (corren a lo largo, de muro a muro transversal)
 for (let i = 0; i < pts.length - 1; i++) {
 b += linea(pts[i], pts[i + 1], '#8A939E', 1.4);
 const [xa, ya] = pts[i], [xb, yb] = pts[i + 1], n = Math.max(2, Math.round(Math.hypot(xb - xa, yb - ya) / (0.9 * k)));
 for (let j = 0; j <= n; j++) { const t = j / n, cx = xa + (xb - xa) * t, cy = ya + (yb - ya) * t; b += `<path d="M${fx(cx + 3)} ${fx(cy + 1)} H${fx(cx - 3)} V${fx(cy + 8)} H${fx(cx + 3)}" fill="none" stroke="${colE}" stroke-width="1.6"/>`; }
 }
 if (S.techo !== '1' && medio) b += lin(X(ancho / 2), yTop + 6, X(ancho / 2), yA, colE, 2);
 if (S.techo !== '1' && !medio) b += lin(X(ancho / 2), yTop + 6, X(ancho / 2), yA, '#C2410C', 1.2, 'stroke-dasharray="4 3"');
 items.push({ c: colE, n: 'Correas metálicas C (se ven de punta)', e: '120 mm c/ 0,90 m (a validar)' });
 items.push({ c: COL.lch, n: S.tipo === 'L' ? 'Apoyan en los muros transversales de cada ala' : 'Apoyan en los muros transversales', e: '' });
 } else {
 for (let i = 0; i < pts.length - 1; i++) b += linea(pts[i], pts[i + 1], colE, grosor * 1.4);
 if (S.techo !== '1' && medio) b += lin(X(ancho / 2), yTop + 5, X(ancho / 2), yA, colE, 2.4);
 if (S.techo !== '1') b += rct(X(ancho / 2) - 4, yTop - 3, 8, 8, madera ? COL.madera : '#8A939E', `stroke="${colE}" stroke-width="0.8"`);
 if (S.techo !== '1' && !medio) b += lin(X(ancho / 2), yTop + 5, X(ancho / 2), yA, '#C2410C', 1.2, 'stroke-dasharray="4 3"');
 items.push({ c: colE, n: 'Tirantes de madera apoyados en los muros', e: '2" × 6" c/ 0,60 m (a validar)' });
 if (S.techo !== '1') items.push({ c: medio ? COL.lch : '#C2410C', n: medio ? 'Cumbrera apoyada en un muro interior' : 'La cumbrera necesita un apoyo intermedio', e: '' });
 }
 // cielorraso
 if (S.cielo === 'suspendido' || cerchas) b += lin(X(0) + 4, yA + 6, X(ancho) - 4, yA + 6, '#9AA3B0', 2.4);
 else for (let i = 0; i < pts.length - 1; i++) b += lin(pts[i][0], pts[i][1] + 6, pts[i + 1][0], pts[i + 1][1] + 6, '#9AA3B0', 2.4);
 // cota de la luz
 b += lin(X(0), H - 14, X(ancho), H - 14, '#5E6977', 0.8) + txt((X(0) + X(ancho)) / 2, H - 4, `ancho ${f(ancho, 2)} m · luz entre apoyos ${f(lz.luz, 2)} m`, 'text-anchor="middle"');
 const pie = lz.recom === 'cerchas' && !cerchas ? `<span class="no">Con ${f(lz.luz, 2)} m de luz conviene usar cerchas o sumar apoyos.</span>` : (lz.recom === 'tirantes' && cerchas ? 'Con esta luz también alcanzan tirantes o correas.' : 'Esquema orientativo: dimensionar con cálculo (CIRSOC).');
 return ficha(svgCorte(W, H, p, b, 'Esquema de la estructura del techo'), items, pie);
}

function corteFundacion() {
 const W = 280, H = 240, p = 'cf', PX = 2.5;
 const capas = capasMuroDibujo();
 const espMuro = capas.reduce((t, c) => t + c.cm, 0);
 const xw = 150, yg = 80; // cara interior del muro · nivel del terreno
 const yf = yg - 15 * PX; // piso terminado, 15 cm sobre el terreno
 const items = [];
 const piso = COL.piso[S.piso] || COL.piso.ceramico;
 let body = rct(0, yg, W, H - yg, `url(#${p}-tierra)`); // terreno natural
 const xe = xw + espMuro * PX; // cara exterior
 let yBaseMuro, cajon = ''; // el cajón hidrófugo se dibuja arriba del muro
 if (S.fundacion === 'platea') {
 const ep = 15 * PX, yp = yf + 3 * PX; // piso + carpeta sobre la platea
 body += rct(0, yp, xe + 10 * PX, ep, `url(#${p}-horm)`, `stroke="${COL.borde}" stroke-width="1"`);
 body += hormigonArmado(xw - 5 * PX, yp + ep, espMuro * PX + 15 * PX, 25 * PX, p, 3 * PX); // viga de borde
 for (let xx = 8; xx < xe + 8 * PX; xx += 14) body += `<circle cx="${xx}" cy="${fx(yp + ep - 3 * PX)}" r="1.3" fill="${COL.hierro}"/>`;
 body += rct(0, yp + ep, xw - 5 * PX, 1.2, '#3A3F47'); // film de polietileno
 body += rct(0, yf + 1 * PX, xw, 2 * PX, `url(#${p}-rev)`) + rct(0, yf, xw, 1 * PX, piso);
 yBaseMuro = yp;
 items.push({ c: COL.horm, n: 'Platea de hormigón armado con viga de borde', e: '15 cm' }, { c: '#3A3F47', n: 'Film de polietileno', e: '' });
 } else {
 const yz0 = yg + 30 * PX, yz1 = yg + 60 * PX, cx = xw + espMuro * PX / 2;
 if (S.fundacion === 'zapataH') {
 body += hormigonArmado(cx - 20 * PX, yz0, 40 * PX, yz1 - yz0, p, 3 * PX);
 items.push({ c: COL.horm, n: 'Zapata corrida de hormigón armado', e: '40 × 30 cm' });
 } else {
 [[45, yz1 - 10 * PX, yz1], [37.5, yz0 + 10 * PX, yz1 - 10 * PX], [30, yz0, yz0 + 10 * PX]].forEach(([a, y1, y2]) => { body += capaVertical('comun', cx - a * PX / 2, a * PX, y1, y2, p, PX); });
 items.push({ c: COL.comun, n: 'Cimiento de ladrillo común escalonado', e: '45 a 30 cm' });
 }
 // muro de cimiento (ladrillo común) hasta el piso
 body += capaVertical('comun', xw, espMuro * PX, yf + 5 * PX, yz0, p, PX);
 // relleno, contrapiso, carpeta y piso del lado de adentro
 body += rct(0, yf + 13 * PX, xw, yg - yf - 13 * PX, `url(#${p}-tierra)`) + rct(0, yf + 3 * PX, xw, 10 * PX, `url(#${p}-pobre)`);
 body += rct(0, yf + 1 * PX, xw, 2 * PX, `url(#${p}-rev)`) + rct(0, yf, xw, 1 * PX, piso);
 // capa aisladora horizontal (cajón hidrófugo)
 const yA = yf + 4 * PX, yB = yf - 8 * PX;
 cajon = rct(xw, yA, espMuro * PX, 2.2, COL.borde) + rct(xw, yB, espMuro * PX, 2.2, COL.borde) + rct(xw - 1.2, yB, 2.2, yA - yB, COL.borde) + rct(xe - 1, yB - 18 * PX, 2.2, yA - yB + 18 * PX, COL.borde);
 yBaseMuro = yf + 5 * PX;
 items.push({ c: COL.comun, n: 'Muro de cimiento de ladrillo común', e: '' }, { c: '#D6D3CB', n: 'Contrapiso sobre terreno compactado', e: '10 cm' }, { c: '#2B3038', n: 'Capa aisladora horizontal (cajón)', e: '' });
 }
 // muro exterior con sus capas, desde la base hasta arriba
 let x = xw;
 capas.forEach(c => { body += capaVertical(c.t, x, c.cm * PX, 0, yBaseMuro, p, PX); x += c.cm * PX; });
 body += cajon;
 // vereda exterior
 body += rct(xe, yg - 8 * PX, W - xe, 8 * PX, `url(#${p}-pobre)`) + rct(xe, yg - 8 * PX, W - xe, 1.4, '#9A938A');
 items.push({ c: COL.rev, n: 'Carpeta', e: '2 cm' }, { c: piso, n: { porcelanato: 'Porcelanato', flotante: 'Piso flotante', alisado: 'Cemento alisado' }[S.piso] || 'Piso cerámico', e: '' });
 // juntas del piso
 if (S.piso !== 'alisado') for (let xx = 0; xx < xw; xx += S.piso === 'porcelanato' ? 60 * PX / 2 : 30 * PX / 2) body += lin(xx, yf, xx, yf + 1 * PX, '#FFFFFF', 0.8);
 body += txt(4, 14, 'Interior') + txt(W - 4, 14, 'Exterior', 'text-anchor="end"') + txt(W - 4, yg + 12, 'Terreno', 'text-anchor="end"');
 return ficha(svgCorte(W, H, p, body, 'Corte de la fundación y el piso'), items, S.fundacion === 'platea' ? 'Como el prototipo de IPRODHA.' : 'Medidas de la zapata orientativas (a validar con el suelo).');
}

function corteCarpinteria() {
 const W = 230, H = 120, p = 'cv';
 const marco = { aluminio: ['#9CA3AF', 'Aluminio'], pvc: ['#F2F2F0', 'PVC'], madera: ['#8A5A33', 'Madera'] }[S.abert] || ['#9CA3AF', 'Aluminio'];
 // vista de la ventana
 const vx = 12, vy = 12, vw = 110, vh = 92, m = 6;
 let body = rct(vx, vy, vw, vh, marco[0], 'stroke="#5E6670" stroke-width="0.8"');
 body += rct(vx + m, vy + m, vw / 2 - m * 1.5, vh - 2 * m, '#BFD4E6') + rct(vx + vw / 2 + m / 2, vy + m, vw / 2 - m * 1.5, vh - 2 * m, '#BFD4E6');
 body += lin(vx + vw / 2, vy, vx + vw / 2, vy + vh, '#5E6670', 0.8);
 // corte del vidrio en el marco
 const sx = 160, sy = 20, sh = 76;
 body += rct(sx, sy, 34, 10, marco[0], 'stroke="#5E6670" stroke-width="0.8"') + rct(sx, sy + sh - 10, 34, 10, marco[0], 'stroke="#5E6670" stroke-width="0.8"');
 if (S.dvh) body += rct(sx + 8, sy + 10, 3, sh - 20, '#9FC3E0') + rct(sx + 11, sy + 10, 12, sh - 20, '#EEF5FB') + rct(sx + 23, sy + 10, 3, sh - 20, '#9FC3E0');
 else body += rct(sx + 15, sy + 10, 4, sh - 20, '#9FC3E0');
 body += txt(vx + vw / 2, H - 2, 'Vista', 'text-anchor="middle"') + txt(sx + 17, H - 2, 'Corte', 'text-anchor="middle"');
 const items = [{ c: marco[0], n: `Marco y hojas de ${marco[1].toLowerCase()}`, e: '' }, { c: '#9FC3E0', n: S.dvh ? 'Doble vidriado hermético (4 + 12 + 4)' : 'Vidrio simple', e: S.dvh ? '' : '4 mm' }];
 return ficha(svgCorte(W, H, p, body, 'Carpintería'), items, S.abert === 'aluminio' ? 'Puertas exteriores de chapa.' : `Puertas exteriores de ${marco[1].toLowerCase()}.`);
}

// (21/11-j) Medidas editables desde el croquis: se toca un local y aparecen
// las medidas que lo cambian (la propia primero y las compartidas después).
const filaDim = (k, n, v, min, max, detalle, cambiada, noMenos = v <= min + 1e-9, noMas = v >= max - 1e-9) => `
 <div class="casa-dim">
 <div class="casa-dim-txt"><b>${n}</b><small>${detalle}${detalle ? ' · ' : ''}mín. ${f(min, 2)} m${cambiada ? ' · <em>cambiada</em>' : ''}</small></div>
 <div class="casa-dim-ctrl">
 <button type="button" class="casa-opt" data-casa="dim:${k}|-1" aria-label="Achicar: ${esc(n.replace(/<[^>]+>/g, ''))}" ${noMenos ? `aria-disabled="true" title="${esc(noMenos === true ? 'mínimo' : noMenos)}"` : ''}>−</button>
 <output aria-live="polite">${f(v, 2)} m</output>
 <button type="button" class="casa-opt" data-casa="dim:${k}|1" aria-label="Agrandar: ${esc(n.replace(/<[^>]+>/g, ''))}" ${noMas ? `aria-disabled="true" title="${esc(noMas === true ? 'máximo' : noMas)}"` : ''}>+</button>
 </div>
 </div>`;
const nombreLocal = (r) => r.n || 'Pasillo';
// Para cada medida, qué locales cambian de tamaño si se la toca
function localesPorMedida(o) {
 const base = tipologia(o).rooms, guard = S.dims, out = {};
 const lado = (r) => [r.u1 - r.u0, r.v1 - r.v0];
 try {
 paramsTipo().forEach(p => {
 const v = D(p.k, p.def), prueba = v + 0.1 <= p.max + 1e-9 ? v + 0.1 : v - 0.1;
 S.dims = { ...guard, [`${S.tipo}.${p.k}`]: r2(prueba) };
 const t = tipologia(o).rooms;
 out[p.k] = base.map(r => {
 const q = t.find(x => x.id === r.id); if (!q) return null;
 const [a0, b0] = lado(r), [a1, b1] = lado(q);
 const eje = Math.abs(a1 - a0) > 1e-6 ? 'h' : Math.abs(b1 - b0) > 1e-6 ? 'v' : '';
 return eje ? { id: r.id, eje } : null;
 }).filter(Boolean);
 S.dims = guard;
 });
 } finally { S.dims = guard; }
 return out;
}
function filaLote(k, n, det) {
 const [mn, mx] = LOTE_LIM[k], v = S[k];
 const noMenos = v <= mn + 1e-9 ? 'mínimo' : probarLote({ [k]: v - 0.5 });
 const noMas = v >= mx - 1e-9 ? 'máximo' : '';
 return `<div class="casa-dim">
 <div class="casa-dim-txt"><b>${n}</b><small>${det} · entre ${f(mn, 0)} y ${f(mx, 0)} m</small></div>
 <div class="casa-dim-ctrl">
 <button type="button" class="casa-opt" data-casa="dim:${k}|-1" aria-label="Achicar 50 cm" ${noMenos ? `aria-disabled="true" title="${esc(noMenos)}"` : ''}>−</button>
 <label class="casa-lote-num"><input type="text" inputmode="decimal" data-casa-lote="${k}" value="${f(v, 2)}" aria-label="${esc(n.replace(/<[^>]+>/g, '').trim())} en metros"><span>m</span></label>
 <button type="button" class="casa-opt" data-casa="dim:${k}|1" aria-label="Agrandar 50 cm" ${noMas ? `aria-disabled="true" title="${noMas}"` : ''}>+</button>
 </div>
 </div>`;
}
function editorLote(T, o) {
 const A = S.loteAncho, F = S.loteFondo, RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4;
 const huella = T.rooms.reduce((t, r) => t + (r.u1 - r.u0) * (r.v1 - r.v0), 0) + (S.cochera ? 14.5 : 0);
 const pct = Math.round(huella / (A * F) * 100);
 return `<div class="casa-local-ed casa-lote-ed" aria-live="polite">
 <div class="casa-local-tit"><div><b>Terreno</b><span>${f(A, 2)} × ${f(F, 2)} m · ${f(A * F, 0)} m²</span></div><button type="button" class="casa-local-x" data-casa="local:" aria-label="Cerrar el editor del terreno">×</button></div>
 ${filaLote('loteAncho', '<span class="casa-eje" aria-hidden="true">↕</span> Frente', o.calle2 ? 'De la medianera a la otra calle' : 'De medianera a medianera')}
 ${filaLote('loteFondo', '<span class="casa-eje" aria-hidden="true">↔</span> Fondo', 'De la línea municipal a la medianera del fondo')}
 <div class="casa-chips casa-lote-atajos" role="group" aria-label="Medidas rápidas">${LOTES_RAPIDOS.map(([a, b]) => btn('loteSet', `${a}x${b}`, A === a && F === b, `${a} × ${b} m`, 'data-chip="1"')).join('')}</div>
 <p class="casa-muted">Retiro de frente ${f(RET, 2)} m · costado libre ${f(A - T.Wf, 2)} m · patio al fondo ${f(F - RET - T.L, 2)} m · la casa ocupa ≈ ${pct} % del terreno.</p>
 <p class="casa-muted casa-medidas-nota">También podés tirar de las manijas naranjas del croquis. El retiro y la ocupación máxima dependen de la zona del código de cada municipio: <b>a validar</b>.</p>
 </div>`;
}
function editorLocal(T, o) {
 if (S.local === 'lote') return editorLote(T, o);
 const r = S.local && T.rooms.find(x => x.id === S.local);
 if (!r) return `<p class="casa-local-hint">Tocá un local del croquis para cambiar sus medidas, o el terreno (o sus cotas) para cambiar el lote.</p>`;
 const porMedida = localesPorMedida(o);
 const probar = (k, v) => { const guard = S.dims; S.dims = { ...guard, [`${S.tipo}.${k}`]: r2(v) }; const pr = problemaLote(tipologia(o)); S.dims = guard; return pr; };
 const nom = (id) => { const x = T.rooms.find(y => y.id === id); return x ? nombreLocal(x).replace('Dormitorio', 'Dorm.').replace('Estar-comedor', 'Estar') : id; };
 const filas = paramsTipo()
 .map(p => ({ p, loc: porMedida[p.k] || [] }))
 .filter(x => x.loc.some(l => l.id === r.id))
 .sort((a, b) => (b.p.room === r.id) - (a.p.room === r.id) || a.loc.length - b.loc.length)
 .map(({ p, loc }) => {
 const v = D(p.k, p.def);
 const eje = loc.find(l => l.id === r.id).eje === 'h' ? '↔' : '↕';
 const otros = loc.filter(l => l.id !== r.id && !(T.rooms.find(y => y.id === l.id) || {}).noLabel).map(l => nom(l.id));
 const det = otros.length ? (otros.length > 3 ? 'cambia varios locales' : `también cambia: ${otros.join(', ')}`) : '';
 const noMas = v >= p.max - 1e-9 ? 'máximo' : probar(p.k, v + 0.1), noMenos = v <= p.min + 1e-9 ? 'mínimo' : probar(p.k, v - 0.1);
 const etiqueta = p.room === r.id ? (eje === '↔' ? 'Largo' : 'Ancho') + ' del local' : esc(p.n);
 return filaDim(p.k, `<span class="casa-eje" aria-hidden="true">${eje}</span> ${etiqueta}`, v, p.min, p.max, det, v !== p.def, noMenos, noMas);
 }).join('');
 const a = r.u1 - r.u0, b = r.v1 - r.v0;
 const av = avisosMedidas(T).filter(t => t.startsWith(nombreLocal(r)));
 // ventana principal del local (ancho comercial; se agranda sola si no cumple el código)
 const w = !r.semi && !r.noLabel ? T.wins.find(x => x.r === r.id) : null;
 let ventHtml = '';
 if (w) {
 const il = ilumLocal(T, r), lista = r.banio ? ANCHOS_VENT.filter(x => x <= 1.0) : ANCHOS_VENT;
 const i = lista.findIndex(x => x >= w.w - 1e-9), maxW = largoBorde(r, w.e) - 0.3;
 const menor = i > 0 ? (() => { const g = S.vent; S.vent = { ...g, [`${S.tipo}.${r.id}`]: lista[i - 1] }; const T2 = tipologia(o); S.vent = g; const w2 = T2.wins.find(x => x.r === r.id); return w2 && w2.w < w.w - 1e-9; })() : false;
 const noMenos = !menor ? (i <= 0 ? 'mínimo' : 'Más chica no cumple la iluminación o ventilación del código') : false;
 const noMas = i < 0 || i >= lista.length - 1 || lista[i + 1] > maxW + 1e-9 ? 'No entra más ancha en ese muro' : false;
 const det = il.clase === 'baño' ? `ventila ${f(il.kProy, 2)} m² (mín. ${f(il.kNec, 2)})` : `ilumina ${f(il.proy, 2)} m² (mín. ${f(il.nec, 2)}) · ventila ${f(il.kProy, 2)} (mín. ${f(il.kNec, 2)})`;
 ventHtml = `<div class="casa-dim">
 <div class="casa-dim-txt"><b><span class="casa-eje" aria-hidden="true">▭</span> Ventana ${f(w.w, 2)} × ${f(w.h, 2)} m</b><small>${det} · <b class="${il.ok ? 'ok' : 'no'}">${il.ok ? 'cumple' : 'no cumple'}</b>${w.auto ? ' · <em>agrandada para cumplir</em>' : ''}</small></div>
 <div class="casa-dim-ctrl">
 <button type="button" class="casa-opt" data-casa="vent:${r.id}|-1" aria-label="Ventana más chica" ${noMenos ? `aria-disabled="true" title="${esc(noMenos)}"` : ''}>−</button>
 <output aria-live="polite">${f(w.w, 2)} m</output>
 <button type="button" class="casa-opt" data-casa="vent:${r.id}|1" aria-label="Ventana más grande" ${noMas ? `aria-disabled="true" title="${esc(noMas)}"` : ''}>+</button>
 </div>
 </div>`;
 }
 return `<div class="casa-local-ed" aria-live="polite">
 <div class="casa-local-tit"><div><b>${esc(nombreLocal(r))}</b><span>${f(a, 2)} × ${f(b, 2)} m · ${f(a * b)} m²${r.semi ? ' · semicubierto' : ''}</span></div><button type="button" class="casa-local-x" data-casa="local:" aria-label="Cerrar el editor de medidas">×</button></div>
 ${filas || '<p class="casa-muted">Este local se ajusta solo con las medidas de los locales vecinos.</p>'}
 ${ventHtml}
 ${av.length ? `<p class="casa-aviso">${av.map(esc).join('<br>')}</p>` : ''}
 <p class="casa-muted casa-medidas-nota">Mínimos del Código de Edificación de Oberá (III.3.3 y III.3.5). Posadas: <b>a validar</b>. Los avisos del pliego Pro.Cre.Ar son referencia.</p>
 </div>`;
}

// ---------------------------------------------------------------------------
// (22/11-b) Mis casas: modelos guardados en la cuenta (tabla casa_modelos,
// migración 041, RLS por usuario). Se guarda la configuración; los precios se
// recalculan siempre con las APU del mes al abrirla.
// ---------------------------------------------------------------------------
let modelos = null, modelosCargando = false, modeloBorrar = null, modelosError = '';
const CLAVES_VISTA = ['paso', 'grupo1', 'grupo2', 'grupo3', 'grupo4', 'local', 'verModelos', 'modelo'];
function configActual() { const c = JSON.parse(JSON.stringify(S)); CLAVES_VISTA.forEach(k => delete c[k]); return c; }
const hayCuenta = () => !!(ST.authState.user && ST.supabaseClient);
async function cargarModelos() {
 if (!hayCuenta()) { modelos = []; render(); return; }
 modelosCargando = true; render();
 try {
 const { data, error } = await ST.supabaseClient.from('casa_modelos').select('id, nombre, resumen, updated_at').order('updated_at', { ascending: false }).limit(50);
 if (error) throw error;
 modelos = data || []; modelosError = '';
 } catch (err) { modelos = []; modelosError = 'No se pudieron leer tus casas. ¿Ya corriste la migración 041?'; }
 modelosCargando = false; render();
}
async function guardarModelo(comoNueva) {
 if (!hayCuenta()) { ST.showToast('Ingresá a tu cuenta para guardar.'); return; }
 const input = document.getElementById('casa-modelo-nombre');
 const nombre = ((input && input.value.trim()) || (S.modelo && S.modelo.nombre) || 'Mi casa').slice(0, 120);
 const fila = { nombre, config: configActual(), resumen: ultimo ? ultimo.guardar : null };
 try {
 if (S.modelo && S.modelo.id && !comoNueva) {
 const { error } = await ST.supabaseClient.from('casa_modelos').update(fila).eq('id', S.modelo.id);
 if (error) throw error;
 S.modelo = { id: S.modelo.id, nombre };
 } else {
 const { data, error } = await ST.supabaseClient.from('casa_modelos').insert({ ...fila, user_id: ST.authState.user.id }).select('id').single();
 if (error) throw error;
 S.modelo = { id: data.id, nombre };
 }
 guardarEstado();
 ST.showToast(`"${nombre}" quedó guardada en tu cuenta.`);
 await cargarModelos();
 } catch (err) { ST.showToast('No se pudo guardar la casa.'); render(); }
}
async function abrirModelo(id) {
 try {
 const { data, error } = await ST.supabaseClient.from('casa_modelos').select('id, nombre, config').eq('id', id).single();
 if (error || !data) throw error || new Error('vacío');
 const cfg = { ...DEFAULTS, ...(data.config || {}), paso: 1, verModelos: true, local: '', modelo: { id: data.id, nombre: data.nombre } };
 try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* sin storage */ }
 S = cfg; cargarEstado(); S.modelo = { id: data.id, nombre: data.nombre };
 modeloBorrar = null; guardarEstado(); render();
 ST.showToast(`Abriste "${data.nombre}".`);
 } catch (err) { ST.showToast('No se pudo abrir esa casa.'); }
}
async function duplicarModelo(id) {
 try {
 const { data, error } = await ST.supabaseClient.from('casa_modelos').select('nombre, config, resumen').eq('id', id).single();
 if (error || !data) throw error || new Error('vacío');
 const { error: e2 } = await ST.supabaseClient.from('casa_modelos').insert({ user_id: ST.authState.user.id, nombre: `${data.nombre} (copia)`.slice(0, 120), config: data.config, resumen: data.resumen });
 if (e2) throw e2;
 await cargarModelos();
 } catch (err) { ST.showToast('No se pudo duplicar.'); }
}
async function borrarModelo(id) {
 if (modeloBorrar !== id) { modeloBorrar = id; render(); return; } // segundo toque para confirmar
 try {
 const { error } = await ST.supabaseClient.from('casa_modelos').delete().eq('id', id);
 if (error) throw error;
 if (S.modelo && S.modelo.id === id) { S.modelo = null; guardarEstado(); }
 modeloBorrar = null;
 await cargarModelos();
 } catch (err) { ST.showToast('No se pudo borrar.'); }
}
function nuevaCasa() {
 S = { ...DEFAULTS, dims: {}, vent: {}, artef: {}, aa: {}, k: { ...DEFAULTS.k }, verModelos: true, modelo: null };
 guardarEstado(); render();
}
function onChange(e) {
 const kl = e.target && e.target.dataset ? e.target.dataset.casaLote : null;
 if (kl) {
 const v = Number(String(e.target.value).replace(',', '.'));
 if (Number.isFinite(v) && v > 0) aplicarLote({ [kl]: v }); else render();
 return;
 }
 const k = e.target && e.target.dataset ? e.target.dataset.casaK : null;
 if (!k) return;
 const v = Number(String(e.target.value).replace(',', '.'));
 if (Number.isFinite(v) && v >= 0 && v <= 100) { S.k = { ...S.k, [k]: v }; guardarEstado(); }
 render();
}
function modelosHtml(c, K, m2Eq, resumen) {
 const fecha = (t) => { try { return new Date(t).toLocaleDateString('es-AR'); } catch (e) { return ''; } };
 let cuerpo;
 if (!hayCuenta()) cuerpo = '<p class="casa-muted">Ingresá a tu cuenta para guardar casas y volver a editarlas cuando quieras.</p>';
 else cuerpo = `
 <div class="casa-modelo-guardar">
 <label for="casa-modelo-nombre">Nombre</label>
 <input id="casa-modelo-nombre" type="text" maxlength="120" value="${esc(S.modelo ? S.modelo.nombre : resumen)}">
 <button type="button" class="btn-computo" data-casa="mGuardar:actual">${S.modelo ? 'Guardar cambios' : 'Guardar'}</button>
 ${S.modelo ? '<button type="button" class="btn-action-drawer btn-copy" data-casa="mGuardar:nueva">Guardar como otra</button>' : ''}
 <button type="button" class="casa-link" data-casa="mNueva:1">Empezar una casa nueva</button>
 </div>
 ${modelosError ? `<p class="casa-aviso">${esc(modelosError)}</p>` : ''}
 ${modelos === null || modelosCargando ? '<p class="casa-muted">Cargando tus casas…</p>' : modelos.length ? `<ul class="casa-modelos-lista">${modelos.map(m => `
 <li class="${S.modelo && S.modelo.id === m.id ? 'on' : ''}">
 <div><b>${esc(m.nombre)}</b><small>${m.resumen ? `${esc(m.resumen.desc || '')} · ${money(m.resumen.porM2 || 0)}/m² al guardar · ` : ''}${fecha(m.updated_at)}</small></div>
 <div class="casa-modelo-acc">
 <button type="button" class="casa-opt" data-casa="mAbrir:${esc(m.id)}">Abrir</button>
 <button type="button" class="casa-opt" data-casa="mDup:${esc(m.id)}">Duplicar</button>
 <button type="button" class="casa-opt${modeloBorrar === m.id ? ' peligro' : ''}" data-casa="mBorrar:${esc(m.id)}">${modeloBorrar === m.id ? '¿Borrar?' : 'Borrar'}</button>
 </div>
 </li>`).join('')}</ul>` : '<p class="casa-muted">Todavía no guardaste ninguna casa.</p>'}`;
 return `<section class="casa-card casa-modelos">
 <div class="casa-card-head"><h3>Mis casas</h3><span class="casa-muted">Se guarda cómo es la casa; los precios se recalculan con las APU del mes al abrirla.</span></div>
 ${cuerpo}
 </section>`;
}

function render() {
 const root = document.getElementById('casa-root');
 if (!root) return;
 const ancho = root.clientWidth || 1100;
 const o = orientacion();
 const T = tipologia(o);
 // (21/11-j) el croquis va a la izquierda y las opciones en una columna de 380 px (desde 900 px)
 const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; // (22/11) en pantallas grandes el rem crece
 const colOpc = ancho >= 1500 ? 28 : 23.75; // (24/11) en pantallas grandes las opciones tienen más aire
 const colDer = ancho >= 900 ? ancho - colOpc * rem - 18 - 36 : ancho - 28;
 // en el celular la planta no baja de 13 px/m: si no entra, se desliza de costado (casa-scroll)
 const SC = Math.max(13, Math.min(36, (colDer - 64) / S.loteFondo, 520 / S.loteAncho));
 const P = plano(o, T, SC);
 const E = instalElec(T, P.med);
 const K = kFactor();
 const fach = fachada(o, T, ancho >= 900 ? Math.max(260, Math.min(colDer - 260, 460)) : Math.min(colDer - 10, 420));
 const lineas = computo(o, T, P.med, fach);
 const c = costear(lineas);
 const C = CIUDADES[S.ciudad];
 const m2Eq = P.med.m2Cub + P.med.semi * 0.5;
 const tipoNombre = { lineal: 'Lineal', compacta: 'Compacta', L: 'En L' }[S.tipo];
 const resumen = `${tipoNombre} · ${S.dorm} dormitorios · ${f(P.med.m2Cub)} m² cubiertos${P.med.semi ? ' + ' + f(P.med.semi) + ' semicubiertos' : ''}`;
 ultimo = { lineas, resumen, guardar: { desc: resumen, m2: Math.round(m2Eq * 10) / 10, total: Math.round(c.total), k: K, totalK: Math.round(c.total * K), porM2: Math.round(c.total * K / m2Eq) } };

 // Verificación IRAM 11605
 const km = kMuro(S.muro), kt = TECHOS_AIS[S.aisTecho].k;
 const mxM = kmax('muro', S.nivel), mxT = kmax('techo', S.nivel);
 const chk = (n, k, mx) => `<div class="casa-verif-fila"><span>${n}</span><span><span class="casa-muted">K ${f(k, 2)} ≤ ${f(mx, 2)}</span> <b class="${k <= mx ? 'ok' : 'no'}">${k <= mx ? 'Cumple' : 'No cumple'}</b></span></div>`;
 const rFalta = 1 / Math.min(mxM.inv, mxM.ver) - 1 / km;
 const ab = absorciones();

 // Por rubro
 const rubros = {};
 lineas.filter(l => l.total).forEach(l => { rubros[l.rubro] = (rubros[l.rubro] || 0) + l.total; });
 const rubrosOrden = Object.entries(rubros).sort((a, b) => b[1] - a[1]);
 const sinApu = lineas.filter(l => !l.item);
 const enCero = lineas.filter(l => l.item && !(l.total > 0));

 // Manzana
 const lotesHtml = lotesManzana().map(l => {
 const fbL = norm(l.lado - S.norte);
 return `<button type="button" class="casa-lote-btn${l.id === S.lote ? ' on' : ''}" data-casa="lote:${l.id}" aria-pressed="${l.id === S.lote ? 'true' : 'false'}" aria-label="Lote ${l.esquina ? 'de esquina' : 'intermedio'} con frente al ${NOM8[idx8(fbL)]}" style="left:${l.x + 1}px;top:${l.y + 1}px;width:${l.w - 2}px;height:${l.h - 2}px"></button>`;
 }).join('');

 const nMod = paramsTipo().filter(p => D(p.k, p.def) !== p.def).length + (S.altura !== DEFAULTS.altura ? 1 : 0);
 // (21/11-i) Pasos: 1 Terreno y casa · 2 Cómo se construye · 3 Presupuesto
 const PASOS = [[1, 'Terreno y casa'], [2, 'Cómo se construye'], [3, 'Instalaciones'], [4, 'Terminaciones'], [5, 'Presupuesto']];
 const paso = [1, 2, 3, 4, 5].includes(S.paso) ? S.paso : 1;
 const stepper = `
 <nav class="casa-pasos" aria-label="Pasos de Armá tu casa">
 <div class="casa-pasos-tabs">${PASOS.map(([n, t]) => `<button type="button" class="casa-paso${n === paso ? ' on' : ''}${n < paso ? ' hecho' : ''}" data-casa="paso:${n}" aria-current="${n === paso ? 'step' : 'false'}" aria-label="Paso ${n}: ${esc(t)}"><span>${n}</span><em class="casa-paso-largo">${esc(t)}</em><em class="casa-paso-corto" aria-hidden="true">${esc(['Casa', 'Obra', 'Instal.', 'Termin.', 'Costo'][n - 1])}</em></button>`).join('')}</div>
 <div class="casa-pasos-total"><span>Precio estimado con K ${f(K, 3)}</span><strong>${money(c.total * K)}</strong><small>${money(c.total * K / m2Eq)} por m² · ${f(m2Eq)} m²</small></div>
 </nav>`;
 const navPie = `
 <div class="casa-pasos-pie">
 ${paso > 1 ? `<button type="button" class="btn-action-drawer btn-copy" data-casa="paso:${paso - 1}">← ${esc(PASOS[paso - 2][1])}</button>` : '<span></span>'}
 ${paso < PASOS.length ? `<button type="button" class="btn-computo" data-casa="paso:${paso + 1}">Siguiente: ${esc(PASOS[paso][1])} →</button>` : '<span></span>'}
 </div>`;
 const AGUA_TXT = { 'termo-elec': 'Termotanque eléctrico', 'termo-gas': 'Termotanque a gas', calefon: 'Calefón a gas', solar: 'Termotanque solar con apoyo', sin: 'Sin agua caliente' };
 const nombreAguas = { '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas', plana: 'plano' }[S.techo];
 const fila = (k, v) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`;
 const banosTxt = { no: 'Un baño', pasillo: 'Dos baños (al pasillo)', suite: 'Dos baños (uno en suite)' }[S.bano2] || 'Un baño';
 const resumenElecciones = `
 <section class="casa-card casa-resumen">
 <div class="casa-card-head"><h3>Tu casa</h3><span class="casa-muted">${esc(resumen)}</span></div>
 <div class="casa-resumen-grid">
 <div><h4>Terreno y casa <button type="button" class="casa-link" data-casa="paso:1">Cambiar</button></h4><ul>
 ${fila('Ciudad', `${S.ciudad} · zona ${C.zona}`)}${fila('Lote', `${f(S.loteAncho, 2)} × ${f(S.loteFondo, 2)} m · frente al ${o.nombre} · ${o.lote.esquina ? 'esquina' : 'intermedio'}`)}${fila('Medianera', `Casa apoyada en la ${SIG8[idx8(o.medBien)]}`)}${fila('Forma', `${tipoNombre} · ${S.dorm} dormitorios`)}${fila('Baños', banosTxt)}${fila('Semicubiertos', [S.galeria ? 'galería' : '', S.cochera ? 'cochera' : ''].filter(Boolean).join(' y ') || 'ninguno')}${fila('Superficie', `${f(P.med.m2Cub)} m² cubiertos${P.med.semi ? ` + ${f(P.med.semi)} semicubiertos` : ''}`)}
 </ul></div>
 <div><h4>Cómo se construye <button type="button" class="casa-link" data-casa="paso:2">Cambiar</button></h4><ul>
 ${fila('Fundación', { platea: 'Platea', zapataH: 'Zapata corrida de hormigón', zapataL: 'Cimiento de ladrillo común' }[S.fundacion])}${fila('Muro exterior', `${BASES_MURO[S.muroBase].n} · ${AIS_MURO[S.muro].n.toLowerCase()}`)}${fila('Tabiques', { ladrillo: 'Ladrillo hueco 12', durlock: 'Placa de yeso', madera: 'Madera' }[S.tabique])}${fila('Techo', S.techo === 'plana' ? 'Losa plana' : `${S.techoMat === 'teja' ? 'Teja' : 'Chapa'} ${nombreAguas} · estructura ${S.estructTecho === 'madera' ? 'de madera' : 'metálica'}`)}${fila('Aislación del techo', TECHOS_AIS[S.aisTecho].n)}${fila('Cielorraso', S.techo === 'plana' ? 'Yeso aplicado' : `${{ machimbre: 'Machimbre', pvc: 'PVC', durlock: 'Placa de yeso' }[S.cieloMat]} · ${S.cielo === 'suspendido' ? 'suspendido' : 'sigue la pendiente'}`)}${fila('Carpinterías', `${{ aluminio: 'Aluminio', pvc: 'PVC', madera: 'Madera' }[S.abert]}${S.dvh ? ' con DVH' : ''}`)}${fila('Fachada', { revoque: 'Clásica', ladrillo: 'Ladrillo visto', contemporanea: 'Contemporánea' }[S.fachada])}${fila('Confort', (() => { const E = etiquetaEstimada(), peor = [E.nm, E.nt].includes(null) ? null : (RANGO[E.nm] < RANGO[E.nt] ? E.nm : E.nt); return `${peor ? `Llega al nivel ${peor}` : 'No llega al nivel C'} (objetivo ${S.nivel}) · etiqueta estimada ${E.letra}`; })())}
 </ul></div>
 <div><h4>Terminaciones <button type="button" class="casa-link" data-casa="paso:4">Cambiar</button></h4><ul>
 ${fila('Pisos', { ceramico: 'Cerámico', porcelanato: 'Porcelanato', flotante: 'Flotante (húmedos en cerámico)', alisado: 'Cemento alisado' }[S.piso] || 'Cerámico')}${fila('Baños', `${S.revMat === 'porcelanato' ? 'Porcelanato' : 'Cerámico'} ${{ h150: 'hasta 1,50 m', h210: 'hasta 2,10 m', techo: 'hasta el techo' }[S.revBano]}`)}${fila('Pintura', S.pintura === 'enduido' ? 'Enduído y látex' : 'Látex')}${fila('Cocina', { no: 'Sin muebles', bajo: 'Bajo mesada', completo: 'Bajo mesada y alacena' }[S.mueblesCocina])}${fila('Placards', { no: 'No', frente: 'Frente e interior', completo: 'Completos' }[S.placard])}${fila('Exterior', [S.cercoFrente !== 'no' ? 'cerco de frente' : '', S.cercoLat !== 'no' ? 'cerco perimetral' : '', S.porton ? 'portón' : '', S.parrilla ? 'parrilla' : ''].filter(Boolean).join(', ') || 'sin cercos')}
 </ul></div>
 <div><h4>Instalaciones <button type="button" class="casa-link" data-casa="paso:3">Cambiar</button></h4><ul>
 ${fila('Agua caliente', AGUA_TXT[S.agua] || 'Termotanque eléctrico')}${fila('Cocción', S.coccion === 'electrica' ? 'Eléctrica' : 'A gas')}${fila('Electricidad', `Grado ${E.grado.toLowerCase()} · ${E.iug} luces · ${E.tug} tomas`)}${fila('Circuitos', `${E.cIug + E.cTug} de uso general${E.tue ? ` + ${E.tue} especiales` : ''}`)}${fila('Iluminación', LUMINARIAS[S.luminarias] || 'plafones LED')}${fila('Aire acondicionado', E.aa.length ? E.aa.map(l => nombreLocalCorto(l.r)).join(', ') : 'no')}${S.ventTecho ? fila('Ventiladores', 'en dormitorios') : ''}${S.bomba ? fila('Bomba', 'presurizadora') : ''}${S.fv ? fila('Paneles solares', `${f(S.fv, 1)} kWp`) : ''}${S.lluvia ? fila('Agua de lluvia', 'tanque de 2000 l') : ''}
 </ul></div>
 </div>
 </section>`;
 // (21/11-j) Croquis siempre a la vista + opciones en solapas cortas
 const tabsGrupo = (acc, items, act) => `<div class="casa-grupos" role="tablist" aria-label="Opciones de este paso">${items.map(([k, n], i) => `<button type="button" role="tab" class="casa-grupo${k === act ? ' on' : ''}" data-casa="${acc}:${k}" aria-selected="${k === act ? 'true' : 'false'}"><span>${i + 1}</span>${esc(n)}</button>`).join('')}</div>`;
 const seguir = (acc, items, act) => {
 const i = items.findIndex(x => x[0] === act);
 if (i < items.length - 1) return `<button type="button" class="casa-seguir" data-casa="${acc}:${items[i + 1][0]}">Seguir con ${esc(items[i + 1][1])} →</button>`;
 return paso < PASOS.length ? `<button type="button" class="casa-seguir fin" data-casa="paso:${paso + 1}">Siguiente: ${esc(PASOS[paso][1])} →</button>` : '';
 };
 const consejo = `<div class="casa-consejo"><div class="casa-brujula chica" role="img" aria-label="Norte en la planta"><div class="casa-aguja" style="transform:rotate(${o.aguja}deg)"><i></i><b>N</b></div></div><div><b>${esc(o.titulo)}</b><br>${esc(o.texto)}</div></div>`;
 const totalMovil = `<span class="casa-vis-total casa-solo-movil">${money(c.total * K / m2Eq)}/m² · ${f(m2Eq)} m²</span>`;
 let cuerpo;
 if (paso === 1) {
 const G1 = [['terreno', 'Terreno'], ['casa', 'La casa']];
 const g1 = G1.some(x => x[0] === S.grupo1) ? S.grupo1 : 'terreno';
 const opciones = g1 === 'terreno' ? `
 <section class="casa-card">
 <h3>Terreno y orientación</h3>
 <div class="casa-chips" role="group" aria-label="Ciudad">${Object.keys(CIUDADES).map(n => btn('ciudad', n, S.ciudad === n, esc(n), 'data-chip="1"')).join('')}</div>
 <p class="casa-muted casa-clima">Zona bioambiental ${esc(C.zona)} (${esc(C.zonaTxt)}) · diseño ${f(C.tdmn)} °C / ${f(C.tdmx)} °C · estación ${esc(C.est)}</p>
 <div class="casa-manzana-fila">
 <div class="casa-manzana" aria-label="Manzana: tocá tu lote">
 <div class="casa-manzana-centro"></div>
 ${lotesHtml}
 </div>
 <div class="casa-brujula-col">
 <div class="casa-brujula" role="img" aria-label="Brújula de la manzana"><div class="casa-aguja" style="transform:rotate(${S.norte}deg)"><i></i><b>N</b></div></div>
 <div class="casa-girar">
 <button type="button" class="casa-opt" data-casa="girar:-45" aria-label="Girar el norte 45 grados a la izquierda">↺</button>
 <button type="button" class="casa-opt" data-casa="girar:45" aria-label="Girar el norte 45 grados a la derecha">↻</button>
 </div>
 <span class="casa-muted">Girá el norte</span>
 </div>
 </div>
 <p class="casa-frente">Frente al <b>${esc(o.nombre)}</b> · lote ${o.lote.esquina ? 'de esquina' : 'intermedio'}${o.desfavorable ? ' · <span class="no">orientación desfavorable en zona I</span>' : ''}</p>
 <label class="casa-label">Medidas del terreno</label>
 <div class="casa-lote-resumen"><span><b>${f(S.loteAncho, 2)} × ${f(S.loteFondo, 2)} m</b> · ${f(S.loteAncho * S.loteFondo, 0)} m²</span><button type="button" class="casa-link" data-casa="loteEd:1">Cambiar en el croquis</button></div>
 <label class="casa-label">Medianera donde se apoya la casa</label>
 ${o.calle2 ? `<p class="casa-muted">Lote de esquina: hay una sola medianera lateral (${esc(SIG8[idx8(o.medBien)])}) y la casa se apoya en ella.</p>`
 : `<div class="casa-grid2">${btn('medLado', 'auto', S.medLado !== 'otra', `<b>Medianera ${esc(o.sigRec)}</b><small>Recomendada por el sol</small>`)}${btn('medLado', 'otra', S.medLado === 'otra', `<b>Medianera ${esc(o.sigOtra)}</b><small>La de enfrente</small>`)}</div>`}
 ${corteMedianera(o, T)}
 <div class="casa-solo-movil">${consejo}</div>
 ${seguir('grupo1', G1, g1)}
 </section>` : `
 <section class="casa-card">
 <h3>Forma y ambientes</h3>
 <div class="casa-grid3">
 ${[['lineal', 'Lineal', 'Lote angosto'], ['compacta', 'Compacta', 'La más económica'], ['L', 'En L', 'Con patio']].map(([k, n, d]) => btn('tipo', k, S.tipo === k, `<b>${n}</b><small>${d}</small>`)).join('')}
 </div>
 <p class="casa-muted">${esc(T.texto)}</p>
 <div class="casa-grid2">
 ${[2, 3].map(n => btn('dorm', n, S.dorm === n, `${n} dormitorios`, S.tipo === 'compacta' && n === 3 ? 'aria-disabled="true" title="No entra en la planta compacta"' : '')).join('')}
 </div>
 <label class="casa-label">Baños</label>
 <div class="casa-grid3">
 ${[['no', 'Un baño', ''], ['pasillo', '2.º baño', 'Al pasillo'], ['suite', 'En suite', 'En el último dormitorio']].map(([k, n, d]) => btn('bano2', k, S.bano2 === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`, S.tipo === 'compacta' && k !== 'no' ? 'aria-disabled="true" title="No entra en la planta compacta"' : '')).join('')}
 </div>
 <label class="casa-label">Semicubiertos</label>
 <div class="casa-grid2">
 ${btn('toggle', 'galeria', S.galeria, '<b>Galería</b><small>Semicubierta</small>')}
 ${btn('toggle', 'cochera', S.cochera, '<b>Cochera</b><small>Semicubierta, 14,5 m²</small>')}
 </div>
 <div class="casa-lista">${(() => { const A = ampliacion(T); return btn('toggle', 'ampliacion', S.ampliacion && A.entra, `<b>Casa que crece</b><small>${A.entra ? `Dejar previsto un dormitorio más (≈ ${f(A.m2)} m²)` : 'No entra otro dormitorio en el lote'}</small>`, A.entra ? '' : `aria-disabled="true" title="No entra otro dormitorio en el lote de ${f(S.loteFondo, 2)} m"`); })()}</div>
 <label class="casa-label">Medidas</label>
 <p class="casa-tip"><b>Tocá un local en el croquis</b> para cambiar sus medidas.</p>
 <div class="casa-medidas">
 ${filaDim('altura', 'Altura de los locales', S.altura, MIN_ALTURA, 3.2, '', S.altura !== DEFAULTS.altura)}
 <button type="button" class="casa-link" data-casa="dim:base|0"${nMod ? '' : ' hidden'}>Volver a las medidas de la casa base (${nMod === 1 ? '1 cambiada' : `${nMod} cambiadas`})</button>
 </div>
 ${seguir('grupo1', G1, g1)}
 </section>`;
 cuerpo = `
 <div class="casa-layout v2${ancho >= 1500 ? ' ancha' : ''}">
 <div class="casa-visual">
 <section class="casa-card">
 <div class="casa-card-head"><h3>Planta en el lote</h3><span class="casa-muted casa-solo-esc">${esc(resumen)}</span>${totalMovil}</div>
 <div class="casa-scroll">${P.html}</div>
 ${editorLocal(T, o)}
 <div class="casa-solo-esc">${consejo}</div>
 <p class="casa-muted casa-leyenda casa-solo-esc"><span class="casa-ley-it"><span class="ley muro"></span>Muros</span><span class="casa-ley-it"><span class="ley puerta"></span>Puertas</span><span class="casa-ley-it"><span class="ley ventana"></span>Ventanas</span><span class="casa-ley-it"><span class="ley semi"></span>Semicubierto</span><span class="casa-ley-it"><span class="ley med"></span>Muro sobre la medianera</span><span class="casa-ley-it"><span class="ley eje"></span>Eje medianero</span><span>Esquema orientativo, no es un plano de obra.</span></p>
 </section>
 </div>
 <div class="casa-opciones">
 ${tabsGrupo('grupo1', G1, g1)}
 ${opciones}
 </div>
 </div>`;
 } else if (paso === 2) {
 const G2 = [['fund', 'Fundación'], ['muro', 'Muros'], ['tabique', 'Tabiques'], ['techo', 'Techo'], ['abert', 'Aberturas'], ['fachada', 'Fachada'], ['confort', 'Confort']];
 const g2 = G2.some(x => x[0] === S.grupo2) ? S.grupo2 : 'fund';
 const verifHtml = `<div class="casa-verif">
 <b>Aislación · IRAM 11605 nivel ${S.nivel}</b>
 ${chk('Muros, invierno', km, mxM.inv)}${chk('Muros, verano', km, mxM.ver)}${chk('Techo, invierno', kt, mxT.inv)}${chk('Techo, verano', kt, mxT.ver)}
 <p class="casa-muted">${rFalta > 0 ? `Al muro le falta R ${f(rFalta, 2)} m²K/W (≈ ${f(rFalta * 3.5, 1)} cm de EPS).` : 'El muro cumple con margen.'} Absorción: muro ${f(ab.muro, 2)}, techo ${f(ab.techo, 2)}.</p>
 </div>`;
 const lzT = luzTecho(T);
 const sinLosa = (extra = '') => S.techo === 'plana' ? `aria-disabled="true"${extra}` : '';
 const OPC = {
 fund: ['Fundación', `
 <div class="casa-grid3">${[['platea', 'Platea', 'Como IPRODHA'], ['zapataH', 'Zapata corrida', 'De hormigón'], ['zapataL', 'Cimiento', 'De ladrillo común']].map(([k, n, d]) => btn('fundacion', k, S.fundacion === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <p class="casa-muted">El piso se elige en el paso Terminaciones.</p>`, corteFundacion],
 muro: ['Muro exterior', `
 <div class="casa-grid3">${ORDEN_BASE.map(k => { const kb = kMuro('base', k), ok = kb <= Math.min(kmax('muro', 'C').inv, kmax('muro', 'C').ver); return btn('muroBase', k, S.muroBase === k, `<b>${esc(BASES_MURO[k].n.replace('Ladrillo ', '').replace(/^./, ch => ch.toUpperCase()))}</b><small>Ladrillo · K ${f(kb, 2)}${ok ? '' : ' · no llega a C'}</small>`); }).join('')}</div>
 <label class="casa-label">Aislación</label>
 <div class="casa-grid2">${ORDEN_MURO.map(id => btn('muro', id, S.muro === id, `<b>${esc(AIS_MURO[id].n)}</b><small>K ${f(kMuro(id), 2)} · ${nivelDe('muro', kMuro(id)) ? 'nivel ' + nivelDe('muro', kMuro(id)) : 'no llega a C'}${BASES_MURO[S.muroBase].capa.aValidar ? ' (a validar)' : ''}</small>`)).join('')}</div>
 <p class="casa-muted">Muros, IRAM 11605 nivel ${S.nivel}: <b class="${km <= Math.min(mxM.inv, mxM.ver) ? 'ok' : 'no'}">${km <= Math.min(mxM.inv, mxM.ver) ? 'cumple' : 'no cumple'}</b> (K ${f(km, 2)}).</p>`, corteMuro],
 tabique: ['Tabiques interiores', `
 <div class="casa-grid3">${[['ladrillo', 'Ladrillo', 'Hueco 12'], ['durlock', 'Placa de yeso', 'Tipo Durlock'], ['madera', 'Madera', 'Machimbre']].map(([k, n, d]) => btn('tabique', k, S.tabique === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>`, corteTabique],
 techo: ['Techo', `
 <div class="casa-grid4">${[['1', '1 agua'], ['2', '2 aguas'], ['4', '4 aguas'], ['plana', 'Plano']].map(([k, n]) => btn('techo', k, S.techo === k, n)).join('')}</div>
 <label class="casa-label">Cubierta</label>
 <div class="casa-grid2">
 ${btn('techoMat', 'chapa', S.techoMat === 'chapa' && S.techo !== 'plana', '<b>Chapa</b><small>Desde 15 %</small>', sinLosa())}
 ${btn('techoMat', 'teja', S.techoMat === 'teja' && S.techo !== 'plana', '<b>Teja cerámica</b><small>Desde 30 %</small>', sinLosa())}
 </div>
 <label class="casa-label">Estructura</label>
 <div class="casa-grid2">${[['metalica', 'Metálica', 'Perfiles de chapa'], ['madera', 'Madera', 'Pino o eucalipto']].map(([k, n, d]) => btn('estructTecho', k, S.estructTecho === k && S.techo !== 'plana', `<b>${n}</b><small>${d}</small>`, sinLosa(' title="El techo plano es una losa"'))).join('')}</div>
 <div class="casa-grid2">${[['tirantes', S.estructTecho === 'madera' ? 'Tirantes' : 'Correas', 'Apoyan en los muros'], ['cerchas', 'Cerchas', S.estructTecho === 'madera' ? 'Cabriadas, luces grandes' : 'Reticuladas, luces grandes']].map(([k, n, d]) => btn('sistTecho', k, S.sistTecho === k && S.techo !== 'plana', `<b>${n}${lzT.recom === k ? ' <i class="casa-recom">recomendado</i>' : ''}</b><small>${d}</small>`, sinLosa())).join('')}</div>
 ${S.techo !== 'plana' ? `<p class="casa-muted">Luz entre apoyos: <b>${f(lzT.luz, 2)} m</b>${!lzT.portantes && S.estructTecho === 'madera' ? ' (los tabiques livianos no son portantes)' : ''}. Hasta unos 4 m alcanzan ${S.estructTecho === 'madera' ? 'tirantes' : 'correas'}; más que eso conviene cerchas o sumar apoyos (a validar con cálculo).</p>` : ''}
 <label class="casa-label">Aislación</label>
 <div class="casa-grid2">${ORDEN_TECHO.map(id => btn('aisTecho', id, S.aisTecho === id, `<b>${esc(TECHOS_AIS[id].n)}</b><small>K ${f(TECHOS_AIS[id].k, 2)} · ${nivelDe('techo', TECHOS_AIS[id].k) ? 'nivel ' + nivelDe('techo', TECHOS_AIS[id].k) : 'no llega a C'} (a validar)</small>`)).join('')}</div>
 <p class="casa-muted">El cielorraso se elige en el paso Terminaciones.</p>`, () => corteTecho() + esquemaTecho(T) + corteMedianera(o, T)],
 abert: ['Carpinterías', `
 <div class="casa-grid3">${[['aluminio', 'Aluminio', 'Puerta de chapa'], ['pvc', 'PVC', ''], ['madera', 'Madera', '']].map(([k, n, d]) => btn('abert', k, S.abert === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`)).join('')}</div>
 <div class="casa-lista">${btn('toggle', 'dvh', S.dvh, '<b>Doble vidriado hermético</b><small>Menos pérdidas en invierno</small>')}</div>
 ${planillaHtml(T)}`, corteCarpinteria],
 fachada: ['Fachada', `
 <div class="casa-grid3">${[['revoque', 'Clásica', 'Revoque claro'], ['ladrillo', 'Ladrillo visto', 'Sin revoque'], ['contemporanea', 'Contemporánea', 'Madera y negro']].map(([k, n, d]) => btn('fachada', k, S.fachada === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <p class="casa-muted">El color de la fachada cambia cuánto sol absorben muros y techo (IRAM 11605).</p>`, null],
 confort: ['Confort térmico', `
 ${confortHtml()}
 <div class="casa-solo-movil casa-verif-movil">${verifHtml}</div>`, null]
 };
 const [titulo, html, corteFn] = OPC[g2];
 cuerpo = `
 <div class="casa-layout v2${ancho >= 1500 ? ' ancha' : ''}">
 <div class="casa-visual">
 ${corteFn ? `<section class="casa-card casa-corte-card">
 <div class="casa-card-head"><h3>${esc(titulo)} · esquema</h3><span class="casa-muted casa-solo-esc">Cambia con lo que elegís a la derecha · orientativo, no es un detalle de obra</span>${totalMovil}</div>
 ${corteFn()}
 </section>` : ''}
 <section class="casa-card${corteFn ? ' casa-solo-esc casa-vista-chica' : ''}">
 <div class="casa-card-head"><h3>Fachada principal</h3><span class="casa-muted casa-solo-esc">Techo ${nombreAguas} · pendiente ${Math.round(fach.pend * 100)} % · alero ${f(fach.AL, 2)} m</span>${totalMovil}</div>
 <div class="casa-fachada-fila">
 <div class="casa-scroll">${fach.html}</div>
${verifHtml}
 </div>
 </section>
 </div>
 <div class="casa-opciones">
 ${tabsGrupo('grupo2', G2, g2)}
 <section class="casa-card casa-construye">
 <h3>${esc(titulo)}</h3>
 ${html}
 ${seguir('grupo2', G2, g2)}
 </section>
 </div>
 </div>`;
 }
 else if (paso === 3) {
 const G3 = [['agua', 'Agua y baños'], ['elec', 'Electricidad'], ['equipo', 'Equipamiento']];
 const g3 = G3.some(x => x[0] === S.grupo3) ? S.grupo3 : 'agua';
 const Pi = plano(o, T, SC, g3, E);
 const banosR = T.rooms.filter(r => r.banio);
 const OPC3 = {
 agua: ['Agua y baños', `
 <label class="casa-label">Agua caliente</label>
 <div class="casa-grid2">${[['termo-elec', 'Termotanque eléctrico', ''], ['termo-gas', 'Termotanque a gas', ''], ['calefon', 'Calefón a gas', 'Instantáneo'], ['solar', 'Termotanque solar', 'Con apoyo eléctrico']].map(([k, n, d]) => btn('agua', k, S.agua === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`)).join('')}</div>
 ${banosR.map(r => { const a = artefactosBano(r.id), m = minimoBano(r.id), A = (r.u1 - r.u0) * (r.v1 - r.v0); return `
 <label class="casa-label">${esc(r.n)} <span class="casa-muted">· ${f(A)} m² (el código pide ${f(m.m2, 2)} m²)</span></label>
 <div class="casa-grid2">${btn('artef', `${r.id}|ducha`, !a.banera, '<b>Ducha</b>')}${btn('artef', `${r.id}|banera`, a.banera, '<b>Bañera</b>')}</div>
 <div class="casa-grid2">${btn('artef', `${r.id}|bidet`, a.bidet, '<b>Bidé</b><small>Inodoro y lavatorio van siempre</small>')}${btn('artef', `${r.id}|vanitory`, a.vanitory, '<b>Vanitory</b><small>Mueble bajo el lavatorio</small>')}</div>`; }).join('')}
 <label class="casa-label">Cocina</label>
 <div class="casa-grid2">${btn('coccion', 'gas', S.coccion !== 'electrica', '<b>A gas</b><small>Envasado o red</small>')}${btn('coccion', 'electrica', S.coccion === 'electrica', '<b>Eléctrica</b><small>Anafe y horno</small>')}</div>
 <div class="casa-lista">${btn('toggle', 'bomba', S.bomba, '<b>Bomba presurizadora</b><small>Más presión en duchas y canillas</small>')}</div>
 ${(() => { const TQ = tanque(), PL = pluviales(T, P.med, fach); return `
 <label class="casa-label">Tanque y lluvia</label>
 <p class="casa-muted">Tanque de reserva de <b>${TQ.litros} l</b> (${TQ.personas} personas × ${TQ.dot} l por día, a validar con el prestador). Techo de ${f(PL.area)} m²: ${PL.canaleta ? `${f(PL.canaleta)} ml de canaleta y ` : ''}${PL.bajadas} bajadas de Ø 100. Las canaletas van a 0,85 m o más del eje medianero (Ord. Oberá 2557).</p>
 <div class="casa-lista">${btn('toggle', 'lluvia', S.lluvia, `<b>Juntar agua de lluvia</b><small>Tanque de 2000 l para riego y lavado (≈ ${Math.round(PL.area * 1.8 * 0.8)} m³ al año)</small>`)}</div>`; })()}
 <p class="casa-muted">Mínimo por vivienda: inodoro, pileta de lavar y ducha (CE Oberá III.6.2.1). El área del baño se verifica con la tabla III.3.3.2 según los artefactos.</p>`],
 elec: ['Electricidad', `
 <p class="casa-muted">Superficie ${f(E.sup)} m² (cubierta + 50 % semicubierta): grado de electrificación <b>${esc(E.grado.toLowerCase())}</b> (AEA 90364-7-770).</p>
 <div class="casa-grid2">${btn('elec', 'minimo', S.elec !== 'completo', '<b>Reglamentaria</b><small>Bocas mínimas AEA</small>')}${btn('elec', 'completo', S.elec === 'completo', '<b>Más completa</b><small>+1 toma por ambiente</small>')}</div>
 <table class="casa-mini-tabla"><thead><tr><th>Local</th><th>Luz</th><th>Tomas</th></tr></thead><tbody>
 ${E.locales.map(l => `<tr><td>${esc(l.nombre)}</td><td>${l.iug + (l.vt ? 1 : 0)}</td><td>${l.tug}${l.mod ? ' + módulos' : ''}${l.aa ? ' + AA' : ''}</td></tr>`).join('')}
 <tr><td>Exterior</td><td>${E.exteriores}</td><td>—</td></tr>
 </tbody><tfoot><tr><td>Total</td><td>${E.iug}</td><td>${E.tug}</td></tr></tfoot></table>
 <p class="casa-muted">Circuitos de uso general: <b>${E.cIug} de luz y ${E.cTug} de tomas</b> (mínimo ${E.minC} para el grado ${esc(E.grado.toLowerCase())}, hasta 15 bocas cada uno)${E.tue ? `, más <b>${E.tue} de uso especial</b> (aire, termotanque, cocina o bomba)` : ''}.</p>
 <label class="casa-label">Paneles solares conectados a la red</label>
 <div class="casa-grid4">${[[0, 'No'], [1.5, '1,5 kWp'], [3, '3 kWp'], [5, '5 kWp']].map(([k, n]) => btn('fv', k, Number(S.fv) === k, n)).join('')}</div>
 <p class="casa-muted">${S.fv ? `Generarían ≈ ${Math.round(S.fv * 1350).toLocaleString('es-AR')} kWh al año (a validar). La conexión a la red la habilita la distribuidora.` : 'La puesta a tierra (jabalina y conductor) va siempre: es obligatoria.'}</p>
 <label class="casa-label">Artefactos de iluminación</label>
 <div class="casa-grid3">${[['plafon', 'Plafones', 'LED'], ['spots', 'Spots', 'Embutidos'], ['colgantes', 'Colgantes', 'Y apliques']].map(([k, n, d]) => btn('luminarias', k, S.luminarias === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>`],
 equipo: ['Equipamiento', `
 <p class="casa-tip"><b>Tocá un ambiente en el croquis</b> para ponerle o sacarle aire acondicionado.</p>
 <div class="casa-lista">${E.locales.filter(l => l.r && !l.r.semi && !l.r.noLabel && !l.r.banio && !l.r.cocina).map(l => { const A = (l.r.u1 - l.r.u0) * (l.r.v1 - l.r.v0); return btn('aa', l.r.id, l.aa, `<b>Aire en ${esc(l.nombre)}</b><small>Split de ${frigorias(A)} frigorías (≈ ${f(A)} m², estimación a validar)</small>`); }).join('')}</div>
 <div class="casa-lista">${btn('toggle', 'ventTecho', S.ventTecho, '<b>Ventiladores de techo</b><small>En los dormitorios, con su boca de luz</small>')}</div>
 <p class="casa-muted">Cada aire lleva su propio circuito de uso especial y su desagüe.</p>`]
 };
 const [tit3, html3] = OPC3[g3];
 const ley3 = { agua: '<span class="casa-ley-it"><span class="casa-sim chip agua">IN</span>Inodoro</span><span class="casa-ley-it"><span class="casa-sim chip agua">LV</span>Lavatorio</span><span class="casa-ley-it"><span class="casa-sim chip agua">DU</span>Ducha / BA bañera</span><span class="casa-ley-it"><span class="casa-sim chip agua">BI</span>Bidé</span><span class="casa-ley-it"><span class="casa-sim chip calor">TE</span>Agua caliente</span>', elec: '<span class="casa-ley-it"><span class="casa-sim iug"></span>Luz (IUG)</span><span class="casa-ley-it"><span class="casa-sim tug"></span>Toma (TUG)</span><span class="casa-ley-it"><span class="casa-sim mod"></span>Módulos cocina</span><span class="casa-ley-it"><span class="casa-sim chip aa">AA</span>Aire (uso especial)</span>', equipo: '<span class="casa-ley-it"><span class="casa-sim chip aa">AA</span>Aire acondicionado</span><span class="casa-ley-it"><span class="casa-sim chip vt">V</span>Ventilador de techo</span>' }[g3];
 cuerpo = `
 <div class="casa-layout v2${ancho >= 1500 ? ' ancha' : ''}">
 <div class="casa-visual">
 <section class="casa-card">
 <div class="casa-card-head"><h3>Instalaciones en planta</h3><span class="casa-muted casa-solo-esc">Grado ${esc(E.grado.toLowerCase())} · ${E.iug} luces · ${E.tug} tomas · ${E.cIug + E.cTug + E.tue} circuitos</span>${totalMovil}</div>
 <div class="casa-scroll">${Pi.html}</div>
 <p class="casa-muted casa-leyenda">${ley3}<span>Esquema orientativo, no es un plano de instalación.</span></p>
 </section>
 </div>
 <div class="casa-opciones">
 ${tabsGrupo('grupo3', G3, g3)}
 <section class="casa-card">
 <h3>${esc(tit3)}</h3>
 ${html3}
 ${seguir('grupo3', G3, g3)}
 </section>
 </div>
 </div>`;
 }
 else if (paso === 4) {
 const G4 = [['pisos', 'Pisos'], ['paredes', 'Paredes'], ['cielos', 'Cielorrasos'], ['muebles', 'Muebles fijos'], ['exterior', 'Exterior']];
 const g4 = G4.some(x => x[0] === S.grupo4) ? S.grupo4 : 'pisos';
 const Pt = plano(o, T, SC, 'term', E);
 const losa = S.techo === 'plana';
 const OPC4 = {
 pisos: ['Pisos', `
 <div class="casa-grid2">${[['ceramico', 'Cerámico', 'El más usado'], ['porcelanato', 'Porcelanato', 'Más duro, pieza grande'], ['flotante', 'Flotante', 'Locales secos; baños y cocina en cerámico'], ['alisado', 'Cemento alisado', 'O microcemento']].map(([k, n, d]) => btn('piso', k, S.piso === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <label class="casa-label">Galería, cochera y vereda</label>
 <div class="casa-grid2">${btn('pisoExt', 'alisado', S.pisoExt !== 'ceramico', '<b>Cemento alisado</b>')}${btn('pisoExt', 'ceramico', S.pisoExt === 'ceramico', '<b>Cerámico exterior</b><small>Antideslizante</small>')}</div>`, corteFundacion],
 paredes: ['Paredes', `
 <label class="casa-label">Baños</label>
 <div class="casa-grid3">${[['h150', 'Hasta 1,50 m'], ['h210', 'Hasta 2,10 m'], ['techo', 'Hasta el techo']].map(([k, n]) => btn('revBano', k, S.revBano === k, `<b>${n}</b>`)).join('')}</div>
 <label class="casa-label">Cocina</label>
 <div class="casa-grid2">${btn('revCocina', 'mesada', S.revCocina !== 'h150', '<b>Sobre la mesada</b><small>Franja de 0,60 m</small>')}${btn('revCocina', 'h150', S.revCocina === 'h150', '<b>Hasta 1,50 m</b>')}</div>
 <label class="casa-label">Material del revestimiento</label>
 <div class="casa-grid2">${btn('revMat', 'ceramico', S.revMat !== 'porcelanato', '<b>Cerámico</b>')}${btn('revMat', 'porcelanato', S.revMat === 'porcelanato', '<b>Porcelanato</b>')}</div>
 <label class="casa-label">Pintura interior</label>
 <div class="casa-grid2">${btn('pintura', 'latex', S.pintura !== 'enduido', '<b>Látex</b><small>Sobre revoque fino</small>')}${btn('pintura', 'enduido', S.pintura === 'enduido', '<b>Enduído y látex</b><small>Terminación más lisa</small>')}</div>
 <p class="casa-muted">La fachada se elige en Cómo se construye.</p>`, null],
 cielos: ['Cielorrasos', losa ? '<p class="casa-muted">Con techo plano, bajo la losa va yeso aplicado.</p>' : `
 <div class="casa-grid2">${[['pendiente', 'Sigue la pendiente', 'Bajo la estructura'], ['suspendido', 'Suspendido', 'Horizontal']].map(([k, n, d]) => btn('cielo', k, S.cielo === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <div class="casa-grid3">${[['machimbre', 'Machimbre', 'Madera'], ['pvc', 'PVC', 'Lama'], ['durlock', 'Placa de yeso', 'Tipo Durlock']].map(([k, n, d]) => btn('cieloMat', k, S.cieloMat === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 ${S.sistTecho === 'cerchas' ? '<p class="casa-muted">Con cerchas el cielorraso va horizontal, bajo el tirante inferior.</p>' : ''}`, corteTecho],
 muebles: ['Muebles fijos', `
 <label class="casa-label">Cocina <span class="casa-muted">· ≈ ${f(mlMuebleCocina(T), 2)} ml</span></label>
 <div class="casa-grid3">${[['no', 'Sin muebles', ''], ['bajo', 'Bajo mesada', 'Con mesada'], ['completo', 'Bajo y alacena', '']].map(([k, n, d]) => btn('mueblesCocina', k, S.mueblesCocina === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`)).join('')}</div>
 <label class="casa-label">Placards en los dormitorios</label>
 <div class="casa-grid3">${[['no', 'Sin placard', ''], ['frente', 'Frente e interior', 'Básico'], ['completo', 'Completo', 'Con cajonera']].map(([k, n, d]) => btn('placard', k, S.placard === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`)).join('')}</div>
 <p class="casa-muted">El vanitory del baño se elige en Instalaciones.</p>`, null],
 exterior: ['Exterior', `
 <label class="casa-label">Cerco de frente</label>
 <div class="casa-grid3">${[['no', 'Sin cerco'], ['reja', 'Reja'], ['muro', 'Muro bajo y reja']].map(([k, n]) => btn('cercoFrente', k, S.cercoFrente === k, `<b>${n}</b>`)).join('')}</div>
 <label class="casa-label">Laterales y fondo</label>
 <div class="casa-grid3">${[['no', 'Sin cerco'], ['tejido', 'Tejido'], ['muro', 'Muro de bloques']].map(([k, n]) => btn('cercoLat', k, S.cercoLat === k, `${iconoCerco(k)}<b>${n}</b>`)).join('')}</div>
 <div class="casa-grid2">${btn('toggle', 'porton', S.porton, `<b>Portón</b><small>${S.cochera ? 'Vehicular' : 'Peatonal'}</small>`)}${btn('toggle', 'parrilla', S.parrilla, '<b>Parrilla</b><small>De ladrillo con campana</small>')}</div>
 <p class="casa-muted">Los cercos, el portón y la parrilla se dibujan en la planta.</p>
 ${corteMedianera(o, T)}`, null]
 };
 const [tit4, html4, fig4] = OPC4[g4];
 cuerpo = `
 <div class="casa-layout v2${ancho >= 1500 ? ' ancha' : ''}">
 <div class="casa-visual">
 ${fig4 ? `<section class="casa-card casa-corte-card"><div class="casa-card-head"><h3>${esc(tit4)} · esquema</h3><span class="casa-muted casa-solo-esc">Cambia con lo que elegís a la derecha · orientativo</span>${totalMovil}</div>${fig4()}</section>` : ''}
 <section class="casa-card${fig4 ? ' casa-solo-esc casa-vista-chica' : ''}">
 <div class="casa-card-head"><h3>Planta en el lote</h3><span class="casa-muted casa-solo-esc">${esc(resumen)}</span>${totalMovil}</div>
 <div class="casa-scroll">${Pt.html}</div>
 </section>
 </div>
 <div class="casa-opciones">
 ${tabsGrupo('grupo4', G4, g4)}
 <section class="casa-card">
 <h3>${esc(tit4)}</h3>
 ${html4}
 ${seguir('grupo4', G4, g4)}
 </section>
 </div>
 </div>`;
 }
 else cuerpo = `
 <div class="casa-paso3">
 ${resumenElecciones}
 ${(() => {
 const CR = cronograma(lineas, K), maxMes = Math.max(...CR.porMes, 1);
 let acum = 0;
 return `
 <section class="casa-card casa-k">
 <div class="casa-card-head"><h3>Precio por m² con Factor K</h3><span class="casa-muted">Valores usuales, editables</span></div>
 <div class="casa-k-fila">
 <div class="casa-k-inputs">
 ${[['gg', 'Gastos generales'], ['ben', 'Beneficio'], ['iibb', 'Ingresos brutos'], ['iva', 'IVA']].map(([k2, n]) => `<label><span>${n}</span><span class="casa-k-in"><input type="number" inputmode="decimal" min="0" max="100" step="0.5" data-casa-k="${k2}" value="${esc(S.k[k2])}" aria-label="${n} (%)">%</span></label>`).join('')}
 <button type="button" class="casa-link" data-casa="kReset:1">Volver a los usuales</button>
 </div>
 <div class="casa-k-res">
 <div><span>Factor K</span><b>${f(K, 3)}</b></div>
 <div><span>Precio estimado</span><b>${money(c.total * K)}</b></div>
 <div class="casa-k-m2"><span>Por m²</span><b>${money(c.total * K / m2Eq)}</b><small>${f(m2Eq)} m² (semicubiertos al 50 %)</small></div>
 </div>
 </div>
 <p class="casa-muted">K = (1 + gastos generales) × (1 + beneficio) × (1 + IVA) + IIBB, igual que en la Calculadora. Los precios de NEXOBRA no tienen impuestos y la mano de obra no tiene cargas sociales: si corresponde, sumalas en gastos generales.</p>
 <p class="casa-aviso casa-alcance">Es una aproximación para tener un orden de magnitud del precio por m². No reemplaza el proyecto, el cálculo ni la dirección de obra de un profesional matriculado. Sin terreno, honorarios, conexiones ni trámites.</p>
 </section>
 <section class="casa-card casa-crono">
 <div class="casa-card-head"><h3>Cronograma y curva de inversión</h3><span class="casa-muted">≈ ${CR.total} días hábiles · ${CR.meses === 1 ? '1 mes' : CR.meses + ' meses'}</span></div>
 <div class="casa-grid3 casa-cuadrilla">${[[2, '2 personas'], [4, '4 personas'], [6, '6 personas']].map(([k2, n]) => btn('cuadrilla', k2, Number(S.cuadrilla) === k2, `<b>${n}</b><small>${k2 / 2} oficial${k2 > 2 ? 'es' : ''} y ${k2 / 2} ayudante${k2 > 2 ? 's' : ''}</small>`)).join('')}</div>
 <div class="casa-gantt" role="img" aria-label="Cronograma orientativo por etapas">
 ${CR.fases.map(x => `<div class="casa-gantt-fila"><span>${esc(x.n)}</span><i><em style="left:${(x.ini / CR.total * 100).toFixed(2)}%;width:${Math.max(0.8, x.dias / CR.total * 100).toFixed(2)}%"${x.horas ? '' : ' class="sin"'}></em></i><b>${x.horas ? `${x.dias} d` : 'sin APU'}</b></div>`).join('')}
 </div>
 <div class="casa-curva">${CR.porMes.map((v, i) => { acum += v; return `<div class="casa-curva-mes"><i><em style="height:${(v / maxMes * 100).toFixed(1)}%"></em></i><b>${money(v)}</b><span>Mes ${i + 1} · ${f(acum / (c.total * K || 1) * 100, 0)} %</span></div>`; }).join('')}</div>
 <p class="casa-muted">Días = horas de mano de obra de las APU ÷ (cuadrilla × 8 h). Las instalaciones corren en paralelo desde el techo y cada etapa se solapa un 20 % con la anterior. Las tareas sin APU no suman días. Es orientativo: el plan de trabajos real lo arma quien dirige la obra.</p>
 </section>`; })()}
 <section class="casa-card casa-costo">
 <h3>Costo directo con las APU del mes</h3>
 <div class="casa-costo-fila">
 <div><div class="casa-total">${money(c.total)}</div><div>${money(c.total / m2Eq)} por m² · ${f(m2Eq)} m² (semicubiertos al 50 %)</div></div>
 <div class="casa-costo-split">Materiales <b>${money(c.mat)}</b><br>Mano de obra <b>${money(c.mo)}</b><br>Equipos <b>${money(c.eq)}</b></div>
 </div>
 ${sinApu.length ? `<p class="casa-aviso">Incompleto: ${sinApu.length} línea${sinApu.length === 1 ? '' : 's'} sin APU no entra${sinApu.length === 1 ? '' : 'n'} en el costo.</p>` : ''}
 ${enCero.length ? `<p class="casa-aviso">${enCero.length} APU da${enCero.length === 1 ? '' : 'n'} $ 0: revisá sus componentes.</p>` : ''}
 <div class="casa-rubros">${rubrosOrden.map(([r, v]) => `<div class="casa-rubro"><span>${esc(r)}</span><i><em style="width:${(v / c.total * 100).toFixed(1)}%"></em></i><b>${f(v / c.total * 100)} %</b></div>`).join('')}</div>
 <button type="button" class="btn-computo" data-casa="calculadora:1">Abrir en la Calculadora</button>
 </section>

 <section class="casa-card">
 <div class="casa-card-head"><h3>Cómputo para revisar las APU</h3><span class="casa-muted">${lineas.length} líneas · tocá "Revisar" para editar la APU y después "Recalcular"</span></div>
 <div class="table-view-container casa-tabla-box">
 <table class="materials-table casa-tabla">
 <thead><tr><th>Rubro / tarea</th><th>Cantidad</th><th>Cómo se midió</th><th>APU</th><th style="text-align:right">$ unitario</th><th style="text-align:right">Subtotal</th></tr></thead>
 <tbody>
 ${lineas.map(l => `
 <tr class="${!l.item ? 'sin-apu' : !(l.total > 0) ? 'en-cero' : ''}">
 <td><small>${esc(l.rubro)}</small><br><b>${esc(l.tarea)}</b>${l.nota ? `<div class="casa-nota">${esc(l.nota)}</div>` : ''}${l.unidadDistinta ? `<div class="casa-nota">Unidad del APU: ${esc(l.apuUnidad)}</div>` : ''}${l.faltan ? `<div class="casa-nota">${l.faltan} componente${l.faltan === 1 ? '' : 's'} sin precio</div>` : ''}${l.vacia ? '<div class="casa-nota">El APU no tiene componentes</div>' : ''}</td>
 <td class="nw">${f(l.cantidad, 2)} ${esc(l.unidad)}</td>
 <td class="casa-med">${esc(l.medicion)}</td>
 <td class="casa-med">${l.item ? `${l.apuId} · ${esc(l.apuNombre)} <button type="button" class="casa-link" data-casa="apu:${l.apuId}">Revisar</button>` : esc(l.motivo)}</td>
 <td class="nw" style="text-align:right">${l.item ? money(l.unit) : '—'}</td>
 <td class="nw" style="text-align:right">${l.item ? money(l.total) : '—'}</td>
 </tr>`).join('')}
 </tbody>
 </table>
 </div>
 </section>
 </div>`;
 root.innerHTML = `
 <div class="casa-head">
 <div>
 <span class="soon-badge">Vista previa · solo administradores</span>
 <h2>Armá tu casa</h2>
 <p class="casa-muted">Aproximación del precio por m² con las APU y precios del mes. No reemplaza el trabajo de un profesional. Sin terreno ni honorarios.</p>
 </div>
 <div class="casa-head-acciones">
 <button type="button" class="btn-action-drawer btn-copy${S.verModelos ? ' on' : ''}" data-casa="modelos:1" aria-expanded="${S.verModelos ? 'true' : 'false'}">Mis casas${S.modelo ? ` · ${esc(S.modelo.nombre)}` : ''}</button>
 <button type="button" class="btn-action-drawer btn-copy" data-casa="recalcular:1">Recalcular con las APU actuales</button>
 <button type="button" class="btn-action-drawer btn-copy" data-casa="reset:1">Volver a la casa base</button>
 </div>
 </div>
 ${S.verModelos ? modelosHtml(c, K, m2Eq, resumen) : ''}
 ${stepper}
 ${cuerpo}
 ${navPie}`;
}
