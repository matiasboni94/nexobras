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
const DEFAULTS = {
 ciudad: 'Oberá', lote: 'a1', norte: 0,
 tipo: 'lineal', dorm: 2, galeria: true, cochera: false, bano2: 'no',
 techo: '1', techoMat: 'chapa', fachada: 'revoque',
 nivel: 'B', muro: 'eps2', aisTecho: 'lana5', piso: 'ceramico', abert: 'aluminio', dvh: false, solar: false,
 // (21/11-d) cómo se construye y medidas
 fundacion: 'platea', muroBase: 'lch18', tabique: 'ladrillo', estructTecho: 'metalica', cielo: 'pendiente', cieloMat: 'machimbre',
 altura: 2.6, dims: {}, paso: 1,
 // (21/11-j) solapa abierta de cada paso y local que se está editando en el croquis
 grupo1: 'terreno', grupo2: 'fund', local: ''
};
let S = { ...DEFAULTS };
let ultimo = null; // último cálculo (para "Abrir en la Calculadora")
let catalogoListo = false;

function cargarEstado() {
 try { const raw = localStorage.getItem(STORE_KEY); if (raw) S = { ...DEFAULTS, ...JSON.parse(raw) }; S.techo = String(S.techo); S.dorm = Number(S.dorm) || 2;
 if (S.bano2 === true) S.bano2 = 'pasillo'; else if (!['no', 'pasillo', 'suite'].includes(S.bano2)) S.bano2 = 'no';
 if (!S.dims || typeof S.dims !== 'object') S.dims = {};
 S.altura = Math.max(MIN_ALTURA, Number(S.altura) || 2.6); } catch (e) { /* sin storage */ }
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
 const add = (id, x, y, w, h, lado, esquina) => L.push({ id, x, y, w, h, lado, esquina });
 add('e1', A, A, P, P, 0, true); add('e2', A + 168, A, P, P, 0, true); add('e3', A + 168, A + 168, P, P, 180, true); add('e4', A, A + 168, P, P, 180, true);
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
 const bienIzq = puntajeMedianera(izq) >= puntajeMedianera(der);
 const medBien = bienIzq ? izq : der;
 const norteFrente = Math.cos(fb * Math.PI / 180); // >0: el norte entra por el frente
 const invertir = norteFrente < -0.3;
 const oeste = Math.sin(fb * Math.PI / 180) < -0.5;
 const i = idx8(fb);
 let titulo, texto;
 if (invertir) { titulo = 'Damos vuelta la casa'; texto = `El norte queda al fondo del lote: el estar y la galería van atrás y los dormitorios hacia la calle. La casa se apoya en la medianera ${SIG8[idx8(medBien)]}.`; }
 else if (norteFrente > 0.3) { titulo = 'Ideal: el estar al frente'; texto = `El sol del norte entra por el frente: ahí va el estar. La casa se apoya en la medianera ${SIG8[idx8(medBien)]} y se abre al ${NOM8[idx8(medBien + 180)]}.`; }
 else { titulo = 'Abrimos la casa hacia el norte'; texto = `El norte queda de costado: la casa se apoya en la medianera ${SIG8[idx8(medBien)]} para que las ventanas de los ambientes miren al ${NOM8[idx8(medBien + 180)]}.`; }
 if (oeste) texto += ' El frente recibe el sol de la tarde: alero más largo y ventana más chica.';
 const desfavorable = [2, 6].includes(i);
 return { lote, fb, i, nombre: NOM8[i], medArriba: bienIzq, invertir, oeste, medBien, titulo, texto, desfavorable,
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
const MIN = { dorm1: 2.8, dorm: 2.5, banoLado: 1.5, banoM2: 2.7, cocLado: 1.6, cocM2: 7, pas: 0.9, altura: 2.6 };
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
 return { rooms, doors, wins, Wf, L, texto };
}

// ¿La casa entra en el lote de 10 × 25 m? Devuelve el motivo si no entra.
function problemaLote(T) {
 const RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4;
 if (T.Wf > 10) return `La casa queda de ${f(T.Wf, 2)} m de ancho y el lote tiene 10 m.`;
 if (S.cochera && S.tipo === 'lineal' && T.Wf + 3.8 > 10) return 'Con cochera al costado, la casa no puede pasar de 6,20 m de ancho.';
 if (RET + T.L > 24) return `La casa queda de ${f(T.L, 2)} m de largo: con el retiro de ${f(RET, 1)} m no deja patio en el lote de 25 m.`;
 if (S.tipo === 'compacta' && T.Wf - D('estar', 4.9) < MIN.cocLado) return `La cocina queda de menos de ${f(MIN.cocLado, 2)} m: achicá el estar o agrandá los dormitorios.`;
 if (S.tipo === 'L' && D('ala', 4.3) > T.Wf - 1.2) return 'El ala de dormitorios queda más ancha que el frente: no queda patio.';
 return '';
}
// Avisos de superficie (no bloquean)
function avisosMedidas(T) {
 const av = [];
 T.rooms.forEach(r => {
 const a = (r.u1 - r.u0) * (r.v1 - r.v0), lmin = Math.min(r.u1 - r.u0, r.v1 - r.v0);
 if (r.banio && a < MIN.banoM2) av.push(`${r.n}: ${f(a)} m², el mínimo de referencia es ${f(MIN.banoM2)} m².`);
 if (r.cocina && a < MIN.cocM2) av.push(`${r.n}: ${f(a)} m², el mínimo de referencia (cocina y lavadero) es ${f(MIN.cocM2)} m².`);
 if (r.id === 'd1' && lmin < MIN.dorm1 - 0.001) av.push(`Dormitorio 1: lado de ${f(lmin, 2)} m, el mínimo es ${f(MIN.dorm1, 2)} m.`);
 });
 return av;
}

// ---------------------------------------------------------------------------
// Planta: muros (recorriendo los bordes), puertas, ventanas, rótulos y
// las mediciones que usa el cómputo.
// ---------------------------------------------------------------------------
function plano(o, T, S_px) {
 const SC = S_px, CALLE = 26, LX = CALLE + 8, LT = 14, LOTE_L = 25, LOTE_A = 10, FS = SC >= 18 ? 10 : 8;
 const RET = (S.cochera && S.tipo !== 'lineal') ? 5.5 : 4;
 const MURO = '#2B3038', FINO = '#7A8492';
 const { rooms, doors, wins, L } = T;
 const solid = rooms.filter(r => !r.semi);
 const at = (u, v) => solid.find(r => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1) || null;
 const byId = (id) => rooms.find(r => r.id === id);
 const su = o.invertir ? -1 : 1, sv = o.medArriba ? 1 : -1;
 const X0 = LX + RET * SC, loteAbajo = LT + LOTE_A * SC;
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
 if (g.du === 0) muros.push(rect(g.su - th / 2, g.su + th / 2, g.sv + a, g.sv + b));
 else muros.push(rect(g.su + a, g.su + b, g.sv - th / 2, g.sv + th / 2));
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
 med.ventanas++; med.ventanasArea += w.w * (w.w >= 1.5 ? 1.4 : w.w <= 0.6 ? 0.5 : 1.1);
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

 const html = `
 <div class="casa-plano" role="img" aria-label="Planta esquemática ${esc(S.tipo === 'L' ? 'en L' : S.tipo)} de ${S.dorm} dormitorios en un lote de 10 por 25 metros, frente al ${esc(o.nombre)}, con puertas y ventanas" style="width:${LX + LOTE_L * SC + 28}px;height:${LT + LOTE_A * SC + 34}px">
 <div class="casa-calle" style="top:${LT}px;width:${CALLE}px;height:${LOTE_A * SC}px">CALLE</div>
 <div class="casa-lote" style="left:${LX}px;top:${LT}px;width:${LOTE_L * SC}px;height:${LOTE_A * SC}px"></div>
 ${pisos.map(p => `<div class="casa-piso${p.semi ? ' semi' : ''}" style="${p.st}"></div>`).join('')}
 ${muros.map(m => `<div class="casa-muro" style="${m}"></div>`).join('')}
 ${huecos.map(h => `<div class="casa-hueco" style="${h}"></div>`).join('')}
 ${ventanas.map(v => `<div class="casa-ventana ${v.cls}" style="${v.st}"></div>`).join('')}
 ${puertas.map(p => `<div class="casa-puerta" style="${p}"></div>`).join('')}
 ${rooms.map(r => { const a = r.u1 - r.u0, b = r.v1 - r.v0, on = S.local === r.id; return `<button type="button" class="casa-local${on ? ' sel' : ''}" data-casa="local:${r.id}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(r.n || 'Pasillo')}: ${f(a, 2)} por ${f(b, 2)} m. Cambiar medidas" title="${esc(r.n || 'Pasillo')}: tocá para cambiar las medidas" style="${rect(r.u0, r.u1, r.v0, r.v1)}"></button>`; }).join('')}
 ${rot.map(ajustarRotulo).filter(r => !r.oculto).map(r => `<div class="casa-rotulo" style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;font-size:${r.fs}px"><b>${esc(r.n)}</b>${SC >= 18 ? `<span>${r.a}</span>` : ''}</div>`).join('')}
 <div class="casa-cota" style="left:${LX}px;top:${loteAbajo + 8}px;width:${LOTE_L * SC}px">25,00 m</div>
 <div class="casa-cota casa-cota-v" style="left:${LX + LOTE_L * SC + 6}px;top:${LT}px;height:${LOTE_A * SC}px">10,00 m</div>
 <div class="casa-cota casa-cota-casa ${o.medArriba ? 'arriba' : 'abajo'}" style="left:${Math.min(X(0), X(L)).toFixed(1)}px;top:${yCasa.toFixed(1)}px;width:${(L * SC).toFixed(1)}px">casa ${f(L, 2)} m</div>
 <div class="casa-sol" aria-hidden="true" style="left:${(sx - 12).toFixed(1)}px;top:${(sy - 12).toFixed(1)}px">${SOL_SVG}</div>
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
 const hgt = w.w >= 1.5 ? 1.4 : 1.1, alf = w.w >= 1.5 ? 0.8 : 1.0;
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
 const revest = M.baniosPerim * 1.5 + 3 * 0.6;
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
 add('Revestimientos', 45, 'Revestimiento cerámico (baños h 1,50 y cocina h 0,60)', revest, 'm²', `${pl(M.banios, 'baño')} + mesada de cocina`);

 // Pisos
 if (S.piso === 'porcelanato') add('Pisos', null, 'Piso de porcelanato', pisoNeto, 'm²', 'Superficie interior');
 else add('Pisos', 36, 'Piso cerámico', pisoNeto, 'm²', 'Superficie interior');
 add('Pisos', 77, 'Zócalos cerámicos', M.secosPerim * 0.85, 'ml', 'Perímetro de los locales secos − puertas');
 const vereda = 0.4 * M.ext;
 add('Pisos', 28, 'Contrapiso exterior: vereda perimetral, galería y cochera', vereda + M.galeria + M.cochera + 0.8 * 10, 'm²', 'Vereda 0,40 m + semicubiertos + vereda municipal 0,80 × 10 m');

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
 const estr = S.estructTecho === 'madera' ? 'estructura de madera (tirantes y clavaderas)' : 'correas metálicas';
 if (S.techoMat === 'teja') add('Cubierta', null, `Cubierta de teja cerámica ${aguas} sobre ${estr}`, techoM2, 'm²', medTecho);
 else if (S.estructTecho === 'madera') add('Cubierta', null, `Cubierta de chapa ${aguas} sobre ${estr}`, techoM2, 'm²', medTecho);
 else add('Cubierta', 24, `Cubierta de chapa ${aguas} sobre correas metálicas`, techoM2, 'm²', medTecho, [S.techo === '4' ? 'Faltan limatesas en el APU.' : '', S.aisTecho === 'ais10' ? 'Se asume que incluye el aislante con aluminio del prototipo.' : ''].filter(Boolean).join(' '));
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
 add('Pinturas', 33, 'Látex interior', revIntArea + (aislaMuro ? murExt : 0) + tabYeso + cieloLatex, 'm²', ['Revoques interiores', aislaMuro ? 'placas de yeso de los muros' : '', tabYeso ? 'tabiques de yeso (2 caras)' : '', cieloLatex ? 'cielorraso' : ''].filter(Boolean).join(' + '));
 if (!plano && S.cieloMat === 'machimbre') add('Pinturas', 26, 'Barniz de cielorraso', S.cielo === 'suspendido' ? pisoNeto : pisoNeto * fPend, 'm²', 'Igual que el cielorraso');
 if (S.tabique === 'madera') add('Pinturas', 26, 'Barniz de tabiques de madera', murInt * 2, 'm²', 'Tabiques (2 caras)', 'Usa el APU de barniz de cielorraso.');
 if (S.fachada === 'contemporanea') add('Revestimientos', null, 'Revestimiento de listones de madera en la entrada', 2.2 * 2.25, 'm²', 'Paño junto a la puerta');

 // Instalaciones
 add('Instalación sanitaria', 69, 'Distribución de agua', 1, 'gl', `${pl(M.banios, 'baño')}, cocina y lavadero`);
 add('Instalación sanitaria', 68, 'Tanque de reserva', 1, 'un', '1 por vivienda');
 add('Instalación sanitaria', 51, 'Desagües cloacales', 1, 'gl', 'Vivienda completa');
 add('Instalación sanitaria', 55, 'Artefactos, griferías y accesorios', M.banios, 'gl', `${pl(M.banios, 'baño')} completo${M.banios === 1 ? '' : 's'}`, 'Revisar si el APU incluye cocina y lavadero.');
 add('Instalación sanitaria', 53, 'Cámara séptica', 1, 'un', 'Si no hay red cloacal');
 add('Instalación sanitaria', 52, 'Pozo absorbente', 1, 'un', 'Si no hay red cloacal');
 add('Instalación sanitaria', 54, 'Cámara de inspección', 1, 'un', '1');
 if (S.solar) add('Instalación sanitaria', null, 'Termotanque solar con apoyo eléctrico', 1, 'un', '1');
 else add('Instalación sanitaria', 75, 'Termotanque eléctrico', 1, 'un', '1');
 add('Instalación eléctrica', 56, 'Tablero general', 1, 'gl', '1');
 add('Instalación eléctrica', 59, 'Circuitos de tomas (TUG)', 1, 'gl', 'Vivienda completa');
 add('Instalación eléctrica', 61, 'Circuitos de iluminación (IUG)', 1, 'gl', 'Vivienda completa');
 add('Instalación eléctrica', 62, 'Artefactos de iluminación', 1, 'gl', 'Vivienda completa');
 add('Instalación de gas', null, 'Instalación de gas (cocina)', 1, 'gl', '1');
 add('Equipamiento', 73, 'Mueble y mesada de cocina', 1, 'un', '1');
 add('Limpieza', 50, 'Limpieza periódica y final de obra', 1, 'gl', '1');
 return lineas;
}

// Costo de las líneas con las APU cargadas (costo directo, sin Factor K)
function costear(lineas) {
 const tasks = ST.apuCatalogState.tasks || [];
 let total = 0, mat = 0, mo = 0, eq = 0;
 lineas.forEach(l => {
 l.item = null; l.total = null; l.unit = null; l.faltan = 0;
 if (!l.apuId) { l.motivo = 'Sin APU todavía'; return; }
 const task = tasks.find(t => t.id === l.apuId);
 if (!task) { l.motivo = `No se encontró la tarea APU ${l.apuId}`; return; }
 try {
 const item = Apu.buildBudgetItem(l.apuId, l.cantidad);
 const b = Apu.calcItemBreakdown(item);
 l.item = item; l.total = b.total; l.unit = b.total / l.cantidad;
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
 window.addEventListener('resize', () => { if (!root.hidden && ST.state.currentView === 'costo-m2') render(); });
 }
 render();
}

function onClick(e) {
 const b = e.target.closest('[data-casa]');
 if (!b) return;
 const [accion, valor] = b.dataset.casa.split(':');
 if (b.getAttribute('aria-disabled') === 'true') { if (b.title && !['mínimo', 'máximo'].includes(b.title)) ST.showToast(b.title); return; }
 if (accion === 'apu') { window.nexoBraApp?.editAdminApuTask?.(Number(valor)); return; }
 if (accion === 'recalcular') { recargarApus(); return; }
 if (accion === 'calculadora') { abrirEnCalculadora(); return; }
 const antes = JSON.stringify(S);
 if (accion === 'toggle') S[valor] = !S[valor];
 else if (accion === 'girar') S.norte = norm(S.norte + Number(valor));
 else if (accion === 'paso') { S.paso = Number(valor) || 1; guardarEstado(); render(); document.getElementById('casa-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
 else if (accion === 'local') S.local = (valor && S.local !== valor) ? valor : '';
 else if (accion === 'nivel') { S.nivel = valor; Object.assign(S, recetaNivel(valor)); }
 else if (accion === 'reset') { S = { ...DEFAULTS, dims: {} }; }
 else if (accion === 'dim') {
 // dim:clave|±1 (pasos de 10 cm) · dim:base|0 vuelve a las medidas de la casa base
 const [k, paso] = valor.split('|');
 if (k === 'base') { const dims = { ...S.dims }; Object.keys(dims).filter(x => x.startsWith(S.tipo + '.')).forEach(x => delete dims[x]); S.dims = dims; S.altura = DEFAULTS.altura; }
 else if (k === 'altura') S.altura = r2(Math.min(3.2, Math.max(MIN_ALTURA, S.altura + Number(paso) * 0.05)));
 else {
 const p = paramsTipo().find(x => x.k === k);
 if (!p) return;
 const v = r2(Math.min(p.max, Math.max(p.min, D(k, p.def) + Number(paso) * 0.1)));
 S.dims = { ...S.dims, [`${S.tipo}.${k}`]: v };
 }
 }
 else S[accion] = accion === 'dorm' ? Number(valor) : valor; // techo '1'/'2'/'4' queda como texto
 if (accion === 'tipo' && valor === 'compacta') { S.dorm = 2; S.bano2 = 'no'; }
 if (accion === 'techo' && valor === 'plana') S.techoMat = 'chapa';
 if (accion === 'techoMat' && valor === 'teja') S.estructTecho = 'madera';
 if (accion === 'muroBase') S.muro = recetaNivel(S.nivel).muro; // la aislación se recalcula para el nivel elegido
 // Si con el cambio la casa no entra en el lote, se vuelve atrás y se avisa
 const problema = problemaLote(tipologia(orientacion()));
 if (problema) { S = JSON.parse(antes); ST.showToast(problema); return; }
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
 rev: '#E6DDCC', yeso: '#E4E6E8', eps: '#FFFFFF', lch: '#C8693E', hueco: '#F3E3D3', comun: '#B5532E', junta: '#BDB4A6',
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
 <pattern id="${p}-tierra" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${COL.tierra}"/><line x1="0" y1="0" x2="0" y2="8" stroke="#BFAF8E" stroke-width="1.4"/></pattern>
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
 // Ladrillos: hiladas con sus juntas; los huecos muestran los tubos cortados
 const hil = { lch18: [18, 3, 3], lch12: [18, 2, 3], lc15: [5.5, 0, 0], comun: [5.5, 0, 0], plaqueta: [5.5, 0, 0] }[t] || [18, 0, 0];
 const hc = hil[0] * PX, j = 1 * PX, cols = hil[1], filas = hil[2];
 const color = cols ? COL.lch : COL.comun;
 let s = '';
 for (let y = y0 - hc * 0.4; y < y1; y += hc + j) {
 const ya = Math.max(y, y0), yb = Math.min(y + hc, y1);
 if (yb > ya) s += rct(x, ya, w, yb - ya, color);
 if (cols) {
 const t0 = 0.9 * PX, hw = (w - (cols + 1) * t0) / cols, hh = (hc - (filas + 1) * t0) / filas;
 for (let c = 0; c < cols; c++) for (let r = 0; r < filas; r++) {
 const hy = y + t0 + r * (hh + t0);
 const a = Math.max(hy, y0), b = Math.min(hy + hh, y1);
 if (b > a) s += rct(x + t0 + c * (hw + t0), a, hw, b - a, COL.hueco);
 }
 }
 const ja = Math.max(y + hc, y0), jb = Math.min(y + hc + j, y1);
 if (jb > ja) s += rct(x, ja, w, jb - ja, COL.junta);
 }
 return s;
}
const SWATCH = { rev: COL.rev, yeso: COL.yeso, eps: '#E8EEF4', lch18: COL.lch, lch12: COL.lch, lc15: COL.comun, comun: COL.comun, plaqueta: COL.comun, mach: COL.madera, bastidor: COL.madera, cavidad: '#EDF0F3' };
const leyenda = (items) => `<ul class="casa-corte-ley">${items.map(it => `<li><i style="background:${it.c}"></i><span>${esc(it.n)}${it.e ? ` <em>${esc(it.e)}</em>` : ''}</span></li>`).join('')}</ul>`;
const ficha = (svg, items, pie = '') => `<figure class="casa-corte">${svg}<figcaption>${leyenda(items)}${pie ? `<p>${pie}</p>` : ''}</figcaption></figure>`;

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
 let yBaseMuro;
 if (S.fundacion === 'platea') {
 const ep = 15 * PX, yp = yf + 3 * PX; // piso + carpeta sobre la platea
 body += rct(0, yp, xe + 10 * PX, ep, `url(#${p}-horm)`);
 body += rct(xw - 5 * PX, yp + ep, espMuro * PX + 15 * PX, 25 * PX, `url(#${p}-horm)`); // viga de borde
 for (let xx = 8; xx < xe + 8 * PX; xx += 14) body += `<circle cx="${xx}" cy="${fx(yp + ep - 3 * PX)}" r="1.4" fill="#3A3F47"/>`;
 body += rct(0, yp + ep, xw - 5 * PX, 1.2, '#3A3F47'); // film de polietileno
 body += rct(0, yf + 1 * PX, xw, 2 * PX, `url(#${p}-rev)`) + rct(0, yf, xw, 1 * PX, piso);
 yBaseMuro = yp;
 items.push({ c: COL.horm, n: 'Platea de hormigón armado con viga de borde', e: '15 cm' }, { c: '#3A3F47', n: 'Film de polietileno', e: '' });
 } else {
 const yz0 = yg + 30 * PX, yz1 = yg + 60 * PX, cx = xw + espMuro * PX / 2;
 if (S.fundacion === 'zapataH') {
 body += rct(cx - 20 * PX, yz0, 40 * PX, yz1 - yz0, `url(#${p}-horm)`);
 for (let xx = cx - 16 * PX; xx <= cx + 16 * PX; xx += 8 * PX) body += `<circle cx="${fx(xx)}" cy="${fx(yz1 - 4 * PX)}" r="1.4" fill="#3A3F47"/>`;
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
 body += rct(xw, yA, espMuro * PX, 1.6, '#2B3038') + rct(xw, yB, espMuro * PX, 1.6, '#2B3038') + rct(xw - 1, yB, 1.6, yA - yB, '#2B3038') + rct(xe - 0.6, yB, 1.6, yA - yB, '#2B3038');
 yBaseMuro = yf + 5 * PX;
 items.push({ c: COL.comun, n: 'Muro de cimiento de ladrillo común', e: '' }, { c: '#D6D3CB', n: 'Contrapiso sobre terreno compactado', e: '10 cm' }, { c: '#2B3038', n: 'Capa aisladora horizontal (cajón)', e: '' });
 }
 // muro exterior con sus capas, desde la base hasta arriba
 let x = xw;
 capas.forEach(c => { body += capaVertical(c.t, x, c.cm * PX, 0, yBaseMuro, p, PX); x += c.cm * PX; });
 // vereda exterior
 body += rct(xe, yg - 8 * PX, W - xe, 8 * PX, `url(#${p}-pobre)`) + rct(xe, yg - 8 * PX, W - xe, 1.4, '#9A938A');
 items.push({ c: COL.rev, n: 'Carpeta', e: '2 cm' }, { c: piso, n: S.piso === 'porcelanato' ? 'Porcelanato' : 'Piso cerámico', e: '' });
 // juntas del piso
 for (let xx = 0; xx < xw; xx += S.piso === 'porcelanato' ? 60 * PX / 2 : 30 * PX / 2) body += lin(xx, yf, xx, yf + 1 * PX, '#FFFFFF', 0.8);
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
function editorLocal(T, o) {
 const r = S.local && T.rooms.find(x => x.id === S.local);
 if (!r) return `<p class="casa-local-hint">Tocá un local del croquis para cambiar sus medidas.</p>`;
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
 return `<div class="casa-local-ed" aria-live="polite">
 <div class="casa-local-tit"><div><b>${esc(nombreLocal(r))}</b><span>${f(a, 2)} × ${f(b, 2)} m · ${f(a * b)} m²${r.semi ? ' · semicubierto' : ''}</span></div><button type="button" class="casa-local-x" data-casa="local:" aria-label="Cerrar el editor de medidas">×</button></div>
 ${filas || '<p class="casa-muted">Este local se ajusta solo con las medidas de los locales vecinos.</p>'}
 ${av.length ? `<p class="casa-aviso">${av.map(esc).join('<br>')}</p>` : ''}
 <p class="casa-muted casa-medidas-nota">Mínimos de referencia: Res. 59/2019 (pliego Pro.Cre.Ar). Si el código municipal pide otros, rige el municipal: <b>a validar</b> con el de Oberá.</p>
 </div>`;
}

function render() {
 const root = document.getElementById('casa-root');
 if (!root) return;
 const ancho = root.clientWidth || 1100;
 const o = orientacion();
 const T = tipologia(o);
 // (21/11-j) el croquis va a la izquierda y las opciones en una columna de 380 px (desde 900 px)
 const colDer = ancho >= 900 ? ancho - 398 - 36 : ancho - 28;
 // en el celular la planta no baja de 13 px/m: si no entra, se desliza de costado (casa-scroll)
 const SC = Math.max(13, Math.min(30, (colDer - 64) / 25));
 const P = plano(o, T, SC);
 const fach = fachada(o, T, ancho >= 900 ? Math.max(260, Math.min(colDer - 260, 460)) : Math.min(colDer - 10, 420));
 const lineas = computo(o, T, P.med, fach);
 const c = costear(lineas);
 const C = CIUDADES[S.ciudad];
 const m2Eq = P.med.m2Cub + P.med.semi * 0.5;
 const tipoNombre = { lineal: 'Lineal', compacta: 'Compacta', L: 'En L' }[S.tipo];
 const resumen = `${tipoNombre} · ${S.dorm} dormitorios · ${f(P.med.m2Cub)} m² cubiertos${P.med.semi ? ' + ' + f(P.med.semi) + ' semicubiertos' : ''}`;
 ultimo = { lineas, resumen };

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
 const PASOS = [[1, 'Terreno y casa'], [2, 'Cómo se construye'], [3, 'Presupuesto']];
 const paso = [1, 2, 3].includes(S.paso) ? S.paso : 1;
 const stepper = `
 <nav class="casa-pasos" aria-label="Pasos de Armá tu casa">
 <div class="casa-pasos-tabs">${PASOS.map(([n, t]) => `<button type="button" class="casa-paso${n === paso ? ' on' : ''}${n < paso ? ' hecho' : ''}" data-casa="paso:${n}" aria-current="${n === paso ? 'step' : 'false'}"><span>${n}</span>${esc(t)}</button>`).join('')}</div>
 <div class="casa-pasos-total"><span>Costo directo estimado</span><strong>${money(c.total)}</strong><small>${money(c.total / m2Eq)} por m² · ${f(m2Eq)} m²</small></div>
 </nav>`;
 const navPie = `
 <div class="casa-pasos-pie">
 ${paso > 1 ? `<button type="button" class="btn-action-drawer btn-copy" data-casa="paso:${paso - 1}">← ${esc(PASOS[paso - 2][1])}</button>` : '<span></span>'}
 ${paso < 3 ? `<button type="button" class="btn-computo" data-casa="paso:${paso + 1}">Siguiente: ${esc(PASOS[paso][1])} →</button>` : '<span></span>'}
 </div>`;
 const nombreAguas = { '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas', plana: 'plano' }[S.techo];
 const fila = (k, v) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`;
 const banosTxt = { no: 'Un baño', pasillo: 'Dos baños (al pasillo)', suite: 'Dos baños (uno en suite)' }[S.bano2] || 'Un baño';
 const resumenElecciones = `
 <section class="casa-card casa-resumen">
 <div class="casa-card-head"><h3>Tu casa</h3><span class="casa-muted">${esc(resumen)}</span></div>
 <div class="casa-resumen-grid">
 <div><h4>Terreno y casa <button type="button" class="casa-link" data-casa="paso:1">Cambiar</button></h4><ul>
 ${fila('Ciudad', `${S.ciudad} · zona ${C.zona}`)}${fila('Lote', `Frente al ${o.nombre} · ${o.lote.esquina ? 'esquina' : 'intermedio'}`)}${fila('Forma', `${tipoNombre} · ${S.dorm} dormitorios`)}${fila('Baños', banosTxt)}${fila('Semicubiertos', [S.galeria ? 'galería' : '', S.cochera ? 'cochera' : ''].filter(Boolean).join(' y ') || 'ninguno')}${fila('Superficie', `${f(P.med.m2Cub)} m² cubiertos${P.med.semi ? ` + ${f(P.med.semi)} semicubiertos` : ''}`)}
 </ul></div>
 <div><h4>Cómo se construye <button type="button" class="casa-link" data-casa="paso:2">Cambiar</button></h4><ul>
 ${fila('Fundación', { platea: 'Platea', zapataH: 'Zapata corrida de hormigón', zapataL: 'Cimiento de ladrillo común' }[S.fundacion])}${fila('Muro exterior', `${BASES_MURO[S.muroBase].n} · ${AIS_MURO[S.muro].n.toLowerCase()}`)}${fila('Tabiques', { ladrillo: 'Ladrillo hueco 12', durlock: 'Placa de yeso', madera: 'Madera' }[S.tabique])}${fila('Techo', S.techo === 'plana' ? 'Losa plana' : `${S.techoMat === 'teja' ? 'Teja' : 'Chapa'} ${nombreAguas} · estructura ${S.estructTecho === 'madera' ? 'de madera' : 'metálica'}`)}${fila('Aislación del techo', TECHOS_AIS[S.aisTecho].n)}${fila('Cielorraso', S.techo === 'plana' ? 'Yeso aplicado' : `${{ machimbre: 'Machimbre', pvc: 'PVC', durlock: 'Placa de yeso' }[S.cieloMat]} · ${S.cielo === 'suspendido' ? 'suspendido' : 'sigue la pendiente'}`)}${fila('Carpinterías', `${{ aluminio: 'Aluminio', pvc: 'PVC', madera: 'Madera' }[S.abert]}${S.dvh ? ' con DVH' : ''}`)}${fila('Fachada', { revoque: 'Clásica', ladrillo: 'Ladrillo visto', contemporanea: 'Contemporánea' }[S.fachada])}${fila('Confort', `Nivel ${S.nivel} (IRAM 11605)`)}
 </ul></div>
 </div>
 </section>`;
 // (21/11-j) Croquis siempre a la vista + opciones en solapas cortas
 const tabsGrupo = (acc, items, act) => `<div class="casa-grupos" role="tablist" aria-label="Opciones de este paso">${items.map(([k, n], i) => `<button type="button" role="tab" class="casa-grupo${k === act ? ' on' : ''}" data-casa="${acc}:${k}" aria-selected="${k === act ? 'true' : 'false'}"><span>${i + 1}</span>${esc(n)}</button>`).join('')}</div>`;
 const seguir = (acc, items, act) => {
 const i = items.findIndex(x => x[0] === act);
 if (i < items.length - 1) return `<button type="button" class="casa-seguir" data-casa="${acc}:${items[i + 1][0]}">Seguir con ${esc(items[i + 1][1])} →</button>`;
 return paso < 3 ? `<button type="button" class="casa-seguir fin" data-casa="paso:${paso + 1}">Siguiente: ${esc(PASOS[paso][1])} →</button>` : '';
 };
 const consejo = `<div class="casa-consejo"><div class="casa-brujula chica" role="img" aria-label="Norte en la planta"><div class="casa-aguja" style="transform:rotate(${o.aguja}deg)"><i></i><b>N</b></div></div><div><b>${esc(o.titulo)}</b><br>${esc(o.texto)}</div></div>`;
 const totalMovil = `<span class="casa-vis-total casa-solo-movil">${money(c.total)} · ${f(m2Eq)} m²</span>`;
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
 <label class="casa-label">Medidas</label>
 <p class="casa-tip"><b>Tocá un local en el croquis</b> para cambiar sus medidas.</p>
 <div class="casa-medidas">
 ${filaDim('altura', 'Altura de los locales', S.altura, MIN_ALTURA, 3.2, '', S.altura !== DEFAULTS.altura)}
 <button type="button" class="casa-link" data-casa="dim:base|0"${nMod ? '' : ' hidden'}>Volver a las medidas de la casa base (${nMod === 1 ? '1 cambiada' : `${nMod} cambiadas`})</button>
 </div>
 ${seguir('grupo1', G1, g1)}
 </section>`;
 cuerpo = `
 <div class="casa-layout v2">
 <div class="casa-visual">
 <section class="casa-card">
 <div class="casa-card-head"><h3>Planta en el lote</h3><span class="casa-muted casa-solo-esc">${esc(resumen)}</span>${totalMovil}</div>
 <div class="casa-scroll">${P.html}</div>
 ${editorLocal(T, o)}
 <div class="casa-solo-esc">${consejo}</div>
 <p class="casa-muted casa-leyenda casa-solo-esc"><span class="casa-ley-it"><span class="ley muro"></span>Muros</span><span class="casa-ley-it"><span class="ley puerta"></span>Puertas</span><span class="casa-ley-it"><span class="ley ventana"></span>Ventanas</span><span class="casa-ley-it"><span class="ley semi"></span>Semicubierto</span><span>Esquema orientativo, no es un plano de obra.</span></p>
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
 const sinLosa = (extra = '') => S.techo === 'plana' ? `aria-disabled="true"${extra}` : '';
 const OPC = {
 fund: ['Fundación y piso', `
 <div class="casa-grid3">${[['platea', 'Platea', 'Como IPRODHA'], ['zapataH', 'Zapata corrida', 'De hormigón'], ['zapataL', 'Cimiento', 'De ladrillo común']].map(([k, n, d]) => btn('fundacion', k, S.fundacion === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <label class="casa-label">Piso</label>
 <div class="casa-grid2">
 ${btn('piso', 'ceramico', S.piso === 'ceramico', '<b>Cerámico</b>')}
 ${btn('piso', 'porcelanato', S.piso === 'porcelanato', '<b>Porcelanato</b>')}
 </div>`, corteFundacion],
 muro: ['Muro exterior', `
 <div class="casa-grid3">${ORDEN_BASE.map(k => { const kb = kMuro('base', k), ok = kb <= Math.min(kmax('muro', 'C').inv, kmax('muro', 'C').ver); return btn('muroBase', k, S.muroBase === k, `<b>${esc(BASES_MURO[k].n.replace('Ladrillo ', '').replace(/^./, ch => ch.toUpperCase()))}</b><small>Ladrillo · K ${f(kb, 2)}${ok ? '' : ' · no llega a C'}</small>`); }).join('')}</div>
 <label class="casa-label">Aislación</label>
 <div class="casa-grid2">${ORDEN_MURO.map(id => btn('muro', id, S.muro === id, `<b>${esc(AIS_MURO[id].n)}</b><small>K ${f(kMuro(id), 2)}${BASES_MURO[S.muroBase].capa.aValidar ? ' (a validar)' : ''}</small>`)).join('')}</div>
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
 <div class="casa-grid2">${[['metalica', 'Metálica', 'Correas de chapa'], ['madera', 'Madera', 'Tirantes y clavaderas']].map(([k, n, d]) => btn('estructTecho', k, S.estructTecho === k && S.techo !== 'plana', `<b>${n}</b><small>${d}</small>`, sinLosa(' title="El techo plano es una losa"'))).join('')}</div>
 <label class="casa-label">Aislación</label>
 <div class="casa-grid2">${ORDEN_TECHO.map(id => btn('aisTecho', id, S.aisTecho === id, `<b>${esc(TECHOS_AIS[id].n)}</b><small>K ${f(TECHOS_AIS[id].k, 2)} (a validar)</small>`)).join('')}</div>
 <label class="casa-label">Cielorraso${S.techo === 'plana' ? ' · bajo losa va yeso aplicado' : ''}</label>
 <div class="casa-grid2">${[['pendiente', 'Sigue la pendiente', 'Bajo la estructura'], ['suspendido', 'Suspendido', 'Horizontal']].map(([k, n, d]) => btn('cielo', k, S.cielo === k && S.techo !== 'plana', `<b>${n}</b><small>${d}</small>`, sinLosa())).join('')}</div>
 <div class="casa-grid3">${[['machimbre', 'Machimbre', 'Madera'], ['pvc', 'PVC', 'Lama'], ['durlock', 'Placa de yeso', 'Tipo Durlock']].map(([k, n, d]) => btn('cieloMat', k, S.cieloMat === k && S.techo !== 'plana', `<b>${n}</b><small>${d}</small>`, sinLosa())).join('')}</div>`, corteTecho],
 abert: ['Carpinterías', `
 <div class="casa-grid3">${[['aluminio', 'Aluminio', 'Puerta de chapa'], ['pvc', 'PVC', ''], ['madera', 'Madera', '']].map(([k, n, d]) => btn('abert', k, S.abert === k, `<b>${n}</b>${d ? `<small>${d}</small>` : ''}`)).join('')}</div>
 <div class="casa-lista">${btn('toggle', 'dvh', S.dvh, '<b>Doble vidriado hermético</b><small>Menos pérdidas en invierno</small>')}</div>`, corteCarpinteria],
 fachada: ['Fachada', `
 <div class="casa-grid3">${[['revoque', 'Clásica', 'Revoque claro'], ['ladrillo', 'Ladrillo visto', 'Sin revoque'], ['contemporanea', 'Contemporánea', 'Madera y negro']].map(([k, n, d]) => btn('fachada', k, S.fachada === k, `<b>${n}</b><small>${d}</small>`)).join('')}</div>
 <p class="casa-muted">El color de la fachada cambia cuánto sol absorben muros y techo (IRAM 11605).</p>`, null],
 confort: ['Confort térmico', `
 <div class="casa-grid3">${[['C', 'Mínimo'], ['B', 'Recomendado'], ['A', 'Óptimo']].map(([k, n]) => btn('nivel', k, S.nivel === k, `<b>${n}</b><small>Nivel ${k}</small>`)).join('')}</div>
 <p class="casa-muted">El nivel elige la aislación de muros y techo que hace falta en ${esc(S.ciudad)} (IRAM 11605). Después la podés ajustar en Muros y Techo.</p>
 <div class="casa-lista">${btn('toggle', 'solar', S.solar, '<b>Termotanque solar</b><small>Agua caliente con energía renovable</small>')}</div>
 <div class="casa-solo-movil casa-verif-movil">${verifHtml}</div>`, null]
 };
 const [titulo, html, corteFn] = OPC[g2];
 cuerpo = `
 <div class="casa-layout v2">
 <div class="casa-visual">
 <section class="casa-card${corteFn ? ' casa-solo-esc' : ''}">
 <div class="casa-card-head"><h3>Fachada principal</h3><span class="casa-muted casa-solo-esc">Techo ${nombreAguas} · pendiente ${Math.round(fach.pend * 100)} % · alero ${f(fach.AL, 2)} m</span>${totalMovil}</div>
 <div class="casa-fachada-fila">
 <div class="casa-scroll">${fach.html}</div>
${verifHtml}
 </div>
 </section>
 ${corteFn ? `<section class="casa-card casa-corte-card">
 <div class="casa-card-head"><h3>Corte · ${esc(titulo.toLowerCase())}</h3><span class="casa-muted casa-solo-esc">Esquema orientativo, no es un detalle de obra</span>${totalMovil}</div>
 ${corteFn()}
 </section>` : ''}
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
 else cuerpo = `
 <div class="casa-paso3">
 ${resumenElecciones}
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
 <p class="casa-muted">Costo directo con las APU y precios del mes (sin Factor K, terreno ni honorarios). Usalo para revisar las APU con una casa completa.</p>
 </div>
 <div class="casa-head-acciones">
 <button type="button" class="btn-action-drawer btn-copy" data-casa="recalcular:1">Recalcular con las APU actuales</button>
 <button type="button" class="btn-action-drawer btn-copy" data-casa="reset:1">Volver a la casa base</button>
 </div>
 </div>
 ${stepper}
 ${cuerpo}
 ${navPie}`;
}
