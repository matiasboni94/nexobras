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
const DEFAULTS = {
 ciudad: 'Oberá', lote: 'a1', norte: 0,
 tipo: 'lineal', dorm: 2, galeria: true, cochera: false, bano2: false,
 techo: '1', techoMat: 'chapa', fachada: 'revoque',
 nivel: 'B', muro: 'eps2', aisTecho: 'lana5', piso: 'ceramico', abert: 'aluminio', dvh: false, solar: false
};
let S = { ...DEFAULTS };
let ultimo = null; // último cálculo (para "Abrir en la Calculadora")
let catalogoListo = false;

function cargarEstado() {
 try { const raw = localStorage.getItem(STORE_KEY); if (raw) S = { ...DEFAULTS, ...JSON.parse(raw) }; S.techo = String(S.techo); S.dorm = Number(S.dorm) || 2; } catch (e) { /* sin storage */ }
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
const MUROS = {
 base: { n: 'Ladrillo hueco 18 revocado', capas: [CAPA.revInt, CAPA.ladrillo, CAPA.revExt], eps: 0 },
 eps2: { n: '+ EPS 2 cm y placa de yeso', capas: [CAPA.yeso, eps(2), CAPA.ladrillo, CAPA.revExt], eps: 2 },
 eps5: { n: '+ EPS 5 cm y placa de yeso', capas: [CAPA.yeso, eps(5), CAPA.ladrillo, CAPA.revExt], eps: 5 },
 eps8: { n: '+ EPS 8 cm y placa de yeso', capas: [CAPA.yeso, eps(8), CAPA.ladrillo, CAPA.revExt], eps: 8 }
};
const kMuro = (id) => 1 / (RSI + RSE + MUROS[id].capas.reduce((t, c) => t + c.r, 0));
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
 const muro = ORDEN_MURO.find(id => kMuro(id) <= lim(mxM)) || 'eps8';
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
function tipologia(o) {
 const rooms = [], doors = [], wins = [];
 const R = (id, n, u0, u1, v0, v1, extra = {}) => rooms.push(Object.assign({ id, n, u0, u1, v0, v1, g: id }, extra));
 const winFrente = o.oeste ? 1.0 : 1.6;
 const ala = (a, W, P) => {
 const lado = [{ id: 'bano', n: 'Baño', len: 1.8, w: 0.7 }, { id: 'd1', n: 'Dormitorio 1', len: 2.8, w: 0.8 }];
 if (S.bano2) lado.push({ id: 'bano2', n: 'Baño 2', len: 1.6, w: 0.7 });
 if (S.dorm === 3) lado.push({ id: 'd2', n: 'Dormitorio 2', len: 2.7, w: 0.8 });
 let u = a;
 lado.forEach(z => {
 R(z.id, z.n, u, u + z.len, P, W, { banio: z.id.startsWith('bano') });
 doors.push({ r: z.id, e: 'v0', p: 0.2, w: z.w });
 wins.push({ r: z.id, e: 'v1', c: z.len / 2, w: z.id.startsWith('bano') ? 0.6 : 1.2 });
 u += z.len;
 });
 R('pas', '', a, u, 0, P, { g: 'social', noLabel: true });
 R('dl', S.dorm === 3 ? 'Dormitorio 3' : 'Dormitorio 2', u, u + 2.7, 0, W);
 doors.push({ r: 'dl', e: 'u0', p: 0.1, w: 0.8 });
 wins.push({ r: 'dl', e: 'u1', c: W / 2, w: 1.2 });
 };
 let Wf, texto;
 if (S.tipo === 'compacta') {
 Wf = 8.0;
 R('estar', 'Estar-comedor', 0, 4.4, 0, 4.9, { g: 'social' });
 R('coc', 'Cocina', 0, 4.4, 4.9, 8.0, { g: 'social', cocina: true });
 R('hall', '', 4.4, 5.5, 0, 8.0, { g: 'social', noLabel: true });
 R('d1', 'Dormitorio 1', 5.5, 8.6, 0, 3.3);
 R('bano', 'Baño', 5.5, 8.6, 3.3, 5.1, { banio: true });
 R('dl', 'Dormitorio 2', 5.5, 8.6, 5.1, 8.0);
 doors.push({ r: 'estar', e: 'u0', p: 0.4, w: 0.9 }, { r: 'd1', e: 'u0', p: 2.4, w: 0.8 }, { r: 'bano', e: 'u0', p: 0.5, w: 0.7 }, { r: 'dl', e: 'u0', p: 0.3, w: 0.8 });
 wins.push({ r: 'estar', e: 'u0', c: 3.1, w: winFrente }, { r: 'coc', e: 'u0', c: 1.6, w: 1.0 }, { r: 'coc', e: 'v1', c: 2.2, w: 1.0 },
 { r: 'd1', e: 'u1', c: 1.6, w: 1.2 }, { r: 'bano', e: 'u1', c: 0.9, w: 0.6 }, { r: 'dl', e: 'u1', c: 1.4, w: 1.2 }, { r: 'dl', e: 'v1', c: 1.5, w: 1.0 });
 if (S.galeria) R('gal', 'Galería', -1.8, 0, 0, 4.9, { semi: true });
 texto = 'Casi cuadrada: menos muro exterior por cada m², por eso es la más económica.';
 } else if (S.tipo === 'L') {
 Wf = 8.5;
 R('estar', 'Estar-comedor', 0, 4.0, 0, 5.0, { g: 'social' });
 R('coc', 'Cocina', 0, 4.0, 5.0, 8.5, { g: 'social', cocina: true });
 doors.push({ r: 'estar', e: 'u0', p: 0.5, w: 0.9 }, { r: 'coc', e: 'u1', p: 1.0, w: 0.8 });
 wins.push({ r: 'estar', e: 'u0', c: 2.6, w: winFrente }, { r: 'coc', e: 'u0', c: 1.75, w: 1.0 });
 ala(4.0, 4.3, 1.0);
 if (S.galeria) R('gal', 'Galería', 4.0, 6.4, 4.3, 8.5, { semi: true });
 texto = 'Dos alas alrededor de un patio con galería: separa la zona de día y de noche.';
 } else {
 Wf = 4.7;
 R('estar', 'Estar-comedor', 0, 4.2, 0, 4.7, { g: 'social' });
 R('coc', 'Cocina', 4.2, 6.0, 0, 4.7, { g: 'social', cocina: true });
 doors.push({ r: 'estar', e: 'u0', p: 0.3, w: 0.9 });
 wins.push({ r: 'estar', e: 'u0', c: 2.9, w: winFrente }, { r: 'estar', e: 'v1', c: 2.1, w: 1.6 }, { r: 'coc', e: 'v1', c: 0.9, w: 1.0 });
 ala(6.0, 4.7, 1.0);
 if (S.galeria) R('gal', 'Galería', -1.8, 0, 0, 4.7, { semi: true });
 texto = 'Angosta y larga, sobre una medianera, como el Prototipo A de IPRODHA.';
 }
 const solid = rooms.filter(r => !r.semi);
 const L = Math.max(...solid.map(r => r.u1));
 return { rooms, doors, wins, Wf, L, texto };
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
 const ABREV = { 'Estar-comedor': 'Estar', 'Galería': 'Gal.', 'Cochera': 'Coch.', 'Cocina': 'Coc.' };
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
 const Wf = T.Wf, AL = S.techo === 'plana' ? 0 : (o.oeste ? 0.8 : 0.5), HM = 2.6;
 const pend = pendienteTecho();
 const sube = S.techo === '1' ? Wf * pend : S.techo === 'plana' ? 0.5 : (Wf / 2) * pend;
 const k = Math.max(18, Math.min(40, (anchoDisp - 20) / (Wf + 2 * AL)));
 const W = (Wf + 2 * AL) * k + 20, H = (HM + sube + 0.9) * k + 16;
 const x = (v) => 10 + (AL + (o.medArriba ? v : Wf - v)) * k;
 const yS = H - 10, y = (h) => yS - h * k;
 const est = {
 revoque: { muro: '#EFE8DC', zocalo: '#C9BFB0', marco: '#9CA3AF', chapa: '#8A939E' },
 ladrillo: { muro: 'repeating-linear-gradient(0deg,#B5653A 0 7px,#E8D8C8 7px 8px)', zocalo: '#8F4E2C', marco: '#3A3F47', chapa: '#6B737D' },
 contemporanea: { muro: '#F7F7F5', zocalo: '#D9DCE1', marco: '#22262C', chapa: '#2F343B' }
 }[S.fachada];
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
 const HM = 2.6, W = T.Wf, L = M.L;
 const lineas = [];
 const add = (rubro, apuId, tarea, cantidad, unidad, medicion, nota = '') => {
 if (!(cantidad > 0)) return;
 lineas.push({ rubro, apuId, tarea, cantidad: Math.round(cantidad * 100) / 100, unidad, medicion, nota });
 };
 const pend = fach.pend;
 // Hastiales y parapetos (aprox. sobre el ancho del frente)
 let hastial = 0, medExtra = 0;
 if (S.techo === '2') hastial = 2 * (W * (W / 2 * pend) / 2);
 if (S.techo === '1') { hastial = 2 * (W * (W * pend) / 2); medExtra = L * W * pend; }
 const parapeto = S.techo === 'plana' ? 0.5 * (M.ext + M.medianera) : 0;
 const aberturasExt = M.ventanasArea + M.puertasExt * 0.9 * 2.05;
 const murExt = M.ext * HM + hastial + parapeto - aberturasExt;
 const murMed = M.medianera * HM + medExtra;
 const murInt = M.int * HM - M.puertasInt * 0.8 * 2.05;
 const revest = M.baniosPerim * 1.5 + 3 * 0.6;
 const pisoNeto = M.m2Cub * 0.92;
 const aislaMuro = S.muro !== 'base';

 add('Tareas preliminares', 12, 'Limpieza del terreno', (L + 2 + (S.galeria ? 1.8 : 0)) * (W + 2), 'm²', 'Huella de la casa + 1 m alrededor');
 add('Tareas preliminares', 6, 'Replanteo', M.m2Cub, 'm²', 'Superficie cubierta');
 add('Fundaciones', 14, 'Platea de fundación', M.m2Cub, 'm²', 'Superficie cubierta', 'El APU es de 0,15 m; el Prototipo A pide 0,10 m.');
 add('Mampostería', 10, 'Mampostería de ladrillo hueco 18 (exterior)', murExt, 'm²', `${f(M.ext)} ml × ${f(HM)} m${hastial ? ' + hastiales' : ''}${parapeto ? ' + parapeto' : ''} − aberturas ${f(aberturasExt)} m²`);
 add('Mampostería', 19, 'Mampostería de ladrillo hueco 12 (medianera)', murMed, 'm²', `${f(M.medianera)} ml × ${f(HM)} m${medExtra ? ' + subida del techo' : ''}`);
 add('Mampostería', 19, 'Mampostería de ladrillo hueco 12 (tabiques)', murInt, 'm²', `${f(M.int)} ml × ${f(HM)} m − ${pl(M.puertasInt, 'puerta')}`);
 add('Mampostería', 17, 'Refuerzos verticales', (M.tramosExt + 4) * 2.8, 'ml', `${M.tramosExt + 4} refuerzos × 2,8 m (esquinas y encuentros, aprox.)`);
 add('Mampostería', 18, 'Encadenado en muros de 18', M.ext, 'ml', 'Muros exteriores');
 add('Mampostería', 20, 'Encadenado en muros de 12', M.medianera + M.int, 'ml', 'Medianera + tabiques');
 if (S.fachada === 'ladrillo') add('Revoques', null, 'Ladrillo visto: tomado de juntas y protección (reemplaza al revoque exterior)', murExt, 'm²', 'Cara exterior de los muros de 18');
 else add('Revoques', 31, 'Revoque completo exterior', murExt, 'm²', 'Cara exterior de los muros de 18', 'Confirmar que incluye el azotado hidrófugo.');
 const revIntArea = murInt * 2 + murMed + (aislaMuro ? 0 : murExt) - revest;
 add('Revoques', 32, 'Revoque completo interior', revIntArea, 'm²', `Tabiques (2 caras) + medianera${aislaMuro ? '' : ' + cara interior de muros exteriores'} − revestimientos`);
 if (aislaMuro) add('Aislaciones', null, `Aislación interior: ${MUROS[S.muro].n.replace('+ ', '')}`, murExt, 'm²', 'Cara interior de los muros exteriores');
 add('Revestimientos', 45, 'Revestimiento cerámico (baños h 1,50 y cocina h 0,60)', revest, 'm²', `${M.banios} baño${M.banios === 1 ? '' : 's'} + mesada de cocina`);
 if (S.piso === 'porcelanato') add('Pisos', null, 'Piso de porcelanato', pisoNeto, 'm²', 'Superficie interior');
 else add('Pisos', 36, 'Piso cerámico', pisoNeto, 'm²', 'Superficie interior');
 add('Pisos', 77, 'Zócalos cerámicos', M.secosPerim * 0.85, 'ml', 'Perímetro de los locales secos − puertas');
 const vereda = 0.4 * M.ext;
 add('Pisos', 28, 'Contrapiso exterior: vereda perimetral, galería y cochera', vereda + M.galeria + M.cochera + 0.8 * 10, 'm²', 'Vereda 0,40 m + semicubiertos + vereda municipal 0,80 × 10 m');
 const fPend = Math.sqrt(1 + pend * pend);
 const planta = M.m2Cub + M.galeria + M.cochera;
 const aleroM2 = (2 * (L + W)) * fach.AL;
 const techoM2 = (planta + aleroM2) * fPend;
 if (S.techo === 'plana') {
 add('Cubierta', 23, 'Losa de hormigón maciza 12 cm', planta, 'm²', 'Superficie cubierta + semicubiertos');
 add('Cubierta', null, 'Membrana y carpeta de techo plano', planta, 'm²', 'Igual que la losa');
 } else if (S.techoMat === 'teja') {
 add('Cubierta', null, `Cubierta de teja cerámica ${{ '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas' }[S.techo]}`, techoM2, 'm²', `Planta ${f(planta)} m² + aleros, × ${f(fPend, 3)} por pendiente`);
 } else {
 add('Cubierta', 24, `Cubierta de chapa ${{ '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas' }[S.techo]} sobre correas metálicas`, techoM2, 'm²', `Planta ${f(planta)} m² + aleros, × ${f(fPend, 3)} por pendiente`, [S.techo === '4' ? 'Faltan limatesas en el APU.' : '', S.aisTecho === 'ais10' ? 'Se asume que incluye el aislante con aluminio del prototipo.' : ''].filter(Boolean).join(' '));
 }
 if (S.techo !== 'plana') {
 add('Cubierta', 25, 'Cielorraso de machimbre', pisoNeto, 'm²', 'Superficie interior');
 add('Cubierta', 37, 'Cenefas', 2 * (L + W) - (S.techo === '1' ? L : 0), 'ml', 'Bordes del techo');
 if (S.aisTecho !== 'sin' && S.aisTecho !== 'ais10') add('Aislaciones', null, `Aislación térmica de techo: ${TECHOS_AIS[S.aisTecho].n}`, pisoNeto, 'm²', 'Sobre el cielorraso');
 }
 add('Aberturas', S.abert === 'pvc' ? null : 41, S.abert === 'pvc' ? `Ventanas de PVC${S.dvh ? ' con DVH' : ''} (${M.ventanas})` : `Ventanas de aluminio${S.dvh ? ' con DVH' : ''} (${M.ventanas})`, 1, 'gl', `${pl(M.ventanas, 'ventana')}, ${f(M.ventanasArea)} m²`, 'APU en "gl": confirmar para qué vivienda.');
 if (S.dvh && S.abert !== 'pvc') add('Aberturas', null, 'Doble vidriado hermético (adicional)', M.ventanasArea, 'm²', 'Superficie de ventanas');
 add('Aberturas', 42, `Puertas placa interiores (${M.puertasInt})`, 1, 'gl', pl(M.puertasInt, 'puerta'), 'APU en "gl": confirmar cuántas puertas incluye.');
 add('Aberturas', 43, `Puertas exteriores de chapa (${M.puertasExt})`, 1, 'gl', pl(M.puertasExt, 'puerta'), 'APU en "gl": confirmar cuántas puertas incluye.');
 if (S.fachada !== 'ladrillo') add('Pinturas', 34, 'Látex exterior', murExt, 'm²', 'Igual que el revoque exterior');
 add('Pinturas', 33, 'Látex interior', revIntArea + (aislaMuro ? murExt : 0), 'm²', 'Revoques interiores y placas de yeso');
 if (S.techo !== 'plana') add('Pinturas', 26, 'Barniz de cielorraso', pisoNeto, 'm²', 'Igual que el cielorraso');
 if (S.fachada === 'contemporanea') add('Revestimientos', null, 'Revestimiento de listones de madera en la entrada', 2.2 * 2.25, 'm²', 'Paño junto a la puerta');
 add('Instalación sanitaria', 69, 'Distribución de agua', 1, 'gl', `${M.banios} baño${M.banios === 1 ? '' : 's'}, cocina y lavadero`);
 add('Instalación sanitaria', 68, 'Tanque de reserva', 1, 'un', '1 por vivienda');
 add('Instalación sanitaria', 51, 'Desagües cloacales', 1, 'gl', 'Vivienda completa');
 add('Instalación sanitaria', 55, 'Artefactos, griferías y accesorios', M.banios, 'gl', `${M.banios} baño${M.banios === 1 ? '' : 's'} completo${M.banios === 1 ? '' : 's'}`, 'Revisar si el APU incluye cocina y lavadero.');
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
 if (b.getAttribute('aria-disabled') === 'true') return;
 if (accion === 'toggle') S[valor] = !S[valor];
 else if (accion === 'girar') S.norte = norm(S.norte + Number(valor));
 else if (accion === 'nivel') { S.nivel = valor; Object.assign(S, recetaNivel(valor)); }
 else if (accion === 'apu') { window.nexoBraApp?.editAdminApuTask?.(Number(valor)); return; }
 else if (accion === 'recalcular') { recargarApus(); return; }
 else if (accion === 'calculadora') { abrirEnCalculadora(); return; }
 else if (accion === 'reset') { S = { ...DEFAULTS }; }
 else S[accion] = accion === 'dorm' ? Number(valor) : valor; // techo '1'/'2'/'4' queda como texto
 if (accion === 'tipo' && valor === 'compacta') { S.dorm = 2; S.bano2 = false; }
 if (accion === 'techo' && valor === 'plana') S.techoMat = 'chapa';
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

function render() {
 const root = document.getElementById('casa-root');
 if (!root) return;
 const ancho = root.clientWidth || 1100;
 const o = orientacion();
 const T = tipologia(o);
 const colDer = ancho >= 1000 ? ancho - 420 : ancho - 32;
 // en el celular la planta no baja de 13 px/m: si no entra, se desliza de costado (casa-scroll)
 const SC = Math.max(13, Math.min(22, (colDer - 80) / 25));
 const P = plano(o, T, SC);
 const fach = fachada(o, T, ancho >= 700 ? Math.min(colDer - 260, 420) : Math.min(colDer - 10, 420));
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
 <div class="casa-layout">
 <div class="casa-opciones">
 <section class="casa-card">
 <h3><span>1</span> Terreno</h3>
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
 </section>

 <section class="casa-card">
 <h3><span>2</span> Forma de la casa</h3>
 <div class="casa-grid3">
 ${[['lineal', 'Lineal', 'Lote angosto'], ['compacta', 'Compacta', 'La más económica'], ['L', 'En L', 'Con patio']].map(([k, n, d]) => btn('tipo', k, S.tipo === k, `<b>${n}</b><small>${d}</small>`)).join('')}
 </div>
 <p class="casa-muted">${esc(T.texto)}</p>
 <div class="casa-grid2">
 ${[2, 3].map(n => btn('dorm', n, S.dorm === n, `${n} dormitorios`, S.tipo === 'compacta' && n === 3 ? 'aria-disabled="true" title="No entra en la planta compacta"' : '')).join('')}
 </div>
 <div class="casa-lista">
 ${btn('toggle', 'galeria', S.galeria, '<b>Galería</b><small>Semicubierta</small>')}
 ${btn('toggle', 'cochera', S.cochera, '<b>Cochera</b><small>Semicubierta de 14,5 m²</small>')}
 ${btn('toggle', 'bano2', S.bano2 && S.tipo !== 'compacta', '<b>Segundo baño</b><small>Junto a los dormitorios</small>', S.tipo === 'compacta' ? 'aria-disabled="true"' : '')}
 </div>
 </section>

 <section class="casa-card">
 <h3><span>3</span> Techo y fachada</h3>
 <div class="casa-grid4">
 ${[['1', '1 agua'], ['2', '2 aguas'], ['4', '4 aguas'], ['plana', 'Plano']].map(([k, n]) => btn('techo', k, S.techo === k, n)).join('')}
 </div>
 <div class="casa-grid2">
 ${btn('techoMat', 'chapa', S.techoMat === 'chapa' && S.techo !== 'plana', '<b>Chapa</b><small>Desde 15 %</small>', S.techo === 'plana' ? 'aria-disabled="true"' : '')}
 ${btn('techoMat', 'teja', S.techoMat === 'teja' && S.techo !== 'plana', '<b>Teja cerámica</b><small>Desde 30 %</small>', S.techo === 'plana' ? 'aria-disabled="true"' : '')}
 </div>
 <div class="casa-grid3">
 ${[['revoque', 'Clásica', 'Revoque claro'], ['ladrillo', 'Ladrillo visto', 'Sin revoque'], ['contemporanea', 'Contemporánea', 'Madera y negro']].map(([k, n, d]) => btn('fachada', k, S.fachada === k, `<b>${n}</b><small>${d}</small>`)).join('')}
 </div>
 </section>

 <section class="casa-card">
 <h3><span>4</span> Confort y terminaciones</h3>
 <div class="casa-grid3">
 ${[['C', 'Mínimo'], ['B', 'Recomendado'], ['A', 'Óptimo']].map(([k, n]) => btn('nivel', k, S.nivel === k, `<b>${n}</b><small>Nivel ${k}</small>`)).join('')}
 </div>
 <label class="casa-label">Muros exteriores</label>
 <div class="casa-grid2">${ORDEN_MURO.map(id => btn('muro', id, S.muro === id, `<b>${esc(MUROS[id].n)}</b><small>K ${f(kMuro(id), 2)}</small>`)).join('')}</div>
 <label class="casa-label">Aislación del techo</label>
 <div class="casa-grid2">${ORDEN_TECHO.map(id => btn('aisTecho', id, S.aisTecho === id, `<b>${esc(TECHOS_AIS[id].n)}</b><small>K ${f(TECHOS_AIS[id].k, 2)} (a validar)</small>`)).join('')}</div>
 <label class="casa-label">Terminaciones</label>
 <div class="casa-grid2">
 ${btn('piso', 'ceramico', S.piso === 'ceramico', '<b>Piso cerámico</b>')}
 ${btn('piso', 'porcelanato', S.piso === 'porcelanato', '<b>Porcelanato</b>')}
 ${btn('abert', 'aluminio', S.abert === 'aluminio', '<b>Aberturas de aluminio</b>')}
 ${btn('abert', 'pvc', S.abert === 'pvc', '<b>Aberturas de PVC</b>')}
 </div>
 <div class="casa-lista">
 ${btn('toggle', 'dvh', S.dvh, '<b>Doble vidriado hermético</b><small>Menos pérdidas en invierno</small>')}
 ${btn('toggle', 'solar', S.solar, '<b>Termotanque solar</b><small>Agua caliente con energía renovable</small>')}
 </div>
 </section>
 </div>

 <div class="casa-resultados">
 <section class="casa-card">
 <div class="casa-card-head"><h3>Planta en el lote</h3><span class="casa-muted">${esc(resumen)}</span></div>
 <div class="casa-scroll">${P.html}</div>
 <div class="casa-consejo"><div class="casa-brujula chica" role="img" aria-label="Norte en la planta"><div class="casa-aguja" style="transform:rotate(${o.aguja}deg)"><i></i><b>N</b></div></div><div><b>${esc(o.titulo)}</b><br>${esc(o.texto)}</div></div>
 <p class="casa-muted casa-leyenda"><span class="ley muro"></span>Muros <span class="ley puerta"></span>Puertas <span class="ley ventana"></span>Ventanas <span class="ley semi"></span>Semicubierto · Esquema orientativo, no es un plano de obra.</p>
 </section>

 <section class="casa-card">
 <div class="casa-card-head"><h3>Fachada principal</h3><span class="casa-muted">Techo ${{ '1': 'a 1 agua', '2': 'a 2 aguas', '4': 'a 4 aguas', plana: 'plano' }[S.techo]} · pendiente ${Math.round(fach.pend * 100)} % · alero ${f(fach.AL, 2)} m</span></div>
 <div class="casa-fachada-fila">
 <div class="casa-scroll">${fach.html}</div>
 <div class="casa-verif">
 <b>Aislación · IRAM 11605 nivel ${S.nivel}</b>
 ${chk('Muros, invierno', km, mxM.inv)}${chk('Muros, verano', km, mxM.ver)}${chk('Techo, invierno', kt, mxT.inv)}${chk('Techo, verano', kt, mxT.ver)}
 <p class="casa-muted">${rFalta > 0 ? `Al muro le falta R ${f(rFalta, 2)} m²K/W (≈ ${f(rFalta * 3.5, 1)} cm de EPS).` : 'El muro cumple con margen.'} Absorción: muro ${f(ab.muro, 2)}, techo ${f(ab.techo, 2)}.</p>
 </div>
 </div>
 </section>

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
 </div>
 </div>`;
}
