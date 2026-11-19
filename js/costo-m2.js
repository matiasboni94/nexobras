/* ============================================================================
 * COSTO POR m² (18/11) -- borrador para validar.
 *
 * Cómputo de la vivienda tipo IPRODHA "Prototipo A 2021" (planta baja,
 * 2 dormitorios, 63,81 m²), medido a partir del plano que pasó el usuario
 * (planta, referencias y corte; calidad baja, cotas aproximadas). Cada línea
 * apunta a una tarea de APU de la Calculadora y el costo se calcula en vivo
 * con el mismo motor (precios de referencia del mes + UOCRA).
 *
 * Mientras la página pública siga en "Próximamente", el borrador solo lo ve
 * un administrador, para revisar cantidades y APUs antes de publicarlo.
 * Las líneas con apuId null son rubros del prototipo que todavía no tienen
 * APU: se listan aparte y NO entran en el costo (el total queda incompleto
 * hasta cargarlas).
 * ========================================================================== */
import * as Admin from './admin.js';
import * as Apu from './apu.js';
import * as ST from './state.js';

export const PROTOTIPO_A_2021 = {
 nombre: 'Vivienda IPRODHA Prototipo A 2021',
 descripcion: 'Planta baja, 2 dormitorios, estar-comedor, cocina, baño, lavadero y galería. Platea de H°A°, mampostería de cerámicos huecos, cubierta de chapa sobre estructura metálica.',
 superficie: 63.81,
 // Medidas tomadas para el cómputo (aprox., del plano): 4,70 m × 13,58 m
 // exterior (= 63,8 m²), perímetro 36,56 m; techo a un agua desde la
 // medianera (+3,33) hacia el frente libre (+2,64).
 items: [
 { rubro: 'Tareas preliminares', apuId: 12, tarea: 'Limpieza del terreno', cantidad: 104, unidad: 'm²', medicion: 'Huella + 1 m alrededor: 6,70 × 15,58' },
 { rubro: 'Tareas preliminares', apuId: 6, tarea: 'Replanteo', cantidad: 63.81, unidad: 'm²', medicion: 'Superficie cubierta' },
 { rubro: 'Fundaciones', apuId: 14, tarea: 'Platea de fundación', cantidad: 63.81, unidad: 'm²', medicion: 'Superficie cubierta', nota: 'El APU es de 0,15 m de espesor; el prototipo pide H-17 de 0,10 m con viga perimetral de 0,20 × 0,20. Revisar rendimientos.' },
 { rubro: 'Mampostería', apuId: 10, tarea: 'Mampostería de cerámicos huecos de 18 (exterior)', cantidad: 56, unidad: 'm²', medicion: 'Frente libre 13,58 × 2,64 + 2 testeros 4,70 × 2,95, menos aberturas (≈ 7,6 m²)' },
 { rubro: 'Mampostería', apuId: 19, tarea: 'Mampostería de cerámicos huecos de 12 (medianera)', cantidad: 43.5, unidad: 'm²', medicion: 'Medianera propia 13,58 × 3,20 (pared doble, cada vivienda la suya)' },
 { rubro: 'Mampostería', apuId: 19, tarea: 'Mampostería de cerámicos huecos de 12 (interior)', cantidad: 31, unidad: 'm²', medicion: '≈ 14 ml de tabiques × 2,60, menos 3 puertas' },
 { rubro: 'Mampostería', apuId: 17, tarea: 'Refuerzos verticales 18×18', cantidad: 22.4, unidad: 'ml', medicion: '8 refuerzos (esquinas y encuentros) × 2,80' },
 { rubro: 'Mampostería', apuId: 18, tarea: 'Encadenado superior en muros de 18', cantidad: 23, unidad: 'ml', medicion: 'Frente libre + 2 testeros' },
 { rubro: 'Mampostería', apuId: 20, tarea: 'Encadenado superior en muros de 12', cantidad: 27.6, unidad: 'ml', medicion: 'Medianera 13,58 + tabiques ≈ 14' },
 { rubro: 'Revoques', apuId: 31, tarea: 'Revoque completo exterior (azotado hidrófugo, grueso y fino)', cantidad: 56, unidad: 'm²', medicion: 'Cara exterior de los muros de 18', nota: 'Confirmar que el APU incluye el azotado hidrófugo (si no, sumar APU 30).' },
 { rubro: 'Revoques', apuId: 32, tarea: 'Revoque completo interior', cantidad: 90.5, unidad: 'm²', medicion: 'Tabiques (2 caras) 62 + medianera 43,5, menos revestimientos 15' },
 { rubro: 'Revestimientos', apuId: 45, tarea: 'Revestimiento cerámico (cocina h 0,60, lavadero h 0,60, baño h 1,50)', cantidad: 15, unidad: 'm²', medicion: 'Baño 8,5 ml × 1,50 − puerta + cocina/lavadero 4,65 ml × 0,60', nota: 'El APU es de azulejos 15×15; el prototipo dice cerámica esmaltada.' },
 { rubro: 'Pisos', apuId: 36, tarea: 'Piso cerámico esmaltado', cantidad: 52, unidad: 'm²', medicion: 'Superficie interior (cubierta menos muros y galería)' },
 { rubro: 'Pisos', apuId: 77, tarea: 'Zócalos cerámicos', cantidad: 50, unidad: 'ml', medicion: 'Perímetro de locales sin baño' },
 { rubro: 'Pisos', apuId: 28, tarea: 'Veredas y galería (contrapiso fratasado / barrido)', cantidad: 19.2, unidad: 'm²', medicion: 'Vereda perimetral 0,40 × 23 + galería ≈ 4 + vereda municipal 0,80 × 7,50', nota: 'APU de contrapiso de hormigón pobre de 5 cm como aproximación.' },
 { rubro: 'Cubierta', apuId: 24, tarea: 'Cubierta de chapa sinusoidal N° 25 sobre correas metálicas', cantidad: 76, unidad: 'm²', medicion: '(4,70 + 0,60) × (13,58 + 0,60), con aleros', nota: 'Confirmar si el APU incluye la doble aislación de 38 mm y la viga metálica apareada.' },
 { rubro: 'Cubierta', apuId: 25, tarea: 'Cielorraso de machimbre impregnado', cantidad: 52, unidad: 'm²', medicion: 'Superficie interior' },
 { rubro: 'Cubierta', apuId: 37, tarea: 'Cenefas de chapa', cantidad: 25, unidad: 'ml', medicion: 'Frente libre + 2 testeros, con aleros' },
 { rubro: 'Aberturas', apuId: 41, tarea: 'Ventanas de aluminio (V1 a V4)', cantidad: 1, unidad: 'gl', medicion: '5 ventanas', nota: 'Unidad "gl": confirmar para qué vivienda se armó el APU.' },
 { rubro: 'Aberturas', apuId: 42, tarea: 'Puertas placa interiores', cantidad: 1, unidad: 'gl', medicion: '3 puertas (P3)', nota: 'Unidad "gl": confirmar.' },
 { rubro: 'Aberturas', apuId: 43, tarea: 'Puertas de chapa exteriores', cantidad: 1, unidad: 'gl', medicion: '2 puertas (P1 y lavadero)', nota: 'Unidad "gl": confirmar.' },
 { rubro: 'Pinturas', apuId: 33, tarea: 'Látex interior', cantidad: 90.5, unidad: 'm²', medicion: 'Igual que el revoque interior' },
 { rubro: 'Pinturas', apuId: 34, tarea: 'Látex exterior', cantidad: 56, unidad: 'm²', medicion: 'Igual que el revoque exterior' },
 { rubro: 'Pinturas', apuId: 26, tarea: 'Barniz sobre cielorraso de madera', cantidad: 52, unidad: 'm²', medicion: 'Igual que el cielorraso' },
 { rubro: 'Instalación sanitaria', apuId: 69, tarea: 'Distribución de agua', cantidad: 1, unidad: 'gl', medicion: 'Baño, cocina y lavadero' },
 { rubro: 'Instalación sanitaria', apuId: 68, tarea: 'Tanque de reserva PVC 850 l (torre metálica)', cantidad: 1, unidad: 'un', medicion: '1 por vivienda', nota: 'En las referencias figura tachado: confirmar si va.' },
 { rubro: 'Instalación sanitaria', apuId: 51, tarea: 'Desagües cloacales', cantidad: 1, unidad: 'gl', medicion: 'Baño, cocina y lavadero' },
 { rubro: 'Instalación sanitaria', apuId: 55, tarea: 'Artefactos, griferías y accesorios', cantidad: 1, unidad: 'gl', medicion: 'Baño completo, pileta de cocina y de lavar' },
 { rubro: 'Instalación sanitaria', apuId: 53, tarea: 'Cámara séptica', cantidad: 1, unidad: 'un', medicion: '1', nota: 'Solo si no hay red cloacal.' },
 { rubro: 'Instalación sanitaria', apuId: 52, tarea: 'Pozo absorbente', cantidad: 1, unidad: 'un', medicion: '1', nota: 'Solo si no hay red cloacal.' },
 { rubro: 'Instalación sanitaria', apuId: 54, tarea: 'Cámara de inspección', cantidad: 1, unidad: 'un', medicion: '1' },
 { rubro: 'Instalación sanitaria', apuId: 75, tarea: 'Termotanque', cantidad: 1, unidad: 'un', medicion: '1', nota: 'El prototipo pide termotanque dual solar/eléctrico; el APU es eléctrico.' },
 { rubro: 'Instalación eléctrica', apuId: 56, tarea: 'Tablero general', cantidad: 1, unidad: 'gl', medicion: '1' },
 { rubro: 'Instalación eléctrica', apuId: 59, tarea: 'Circuitos de tomas (TUG)', cantidad: 1, unidad: 'gl', medicion: 'Vivienda completa' },
 { rubro: 'Instalación eléctrica', apuId: 61, tarea: 'Circuitos de iluminación (IUG)', cantidad: 1, unidad: 'gl', medicion: 'Vivienda completa' },
 { rubro: 'Instalación eléctrica', apuId: 62, tarea: 'Artefactos de iluminación', cantidad: 1, unidad: 'gl', medicion: 'Vivienda completa' },
 { rubro: 'Equipamiento', apuId: 73, tarea: 'Mesada y mueble de cocina', cantidad: 1, unidad: 'un', medicion: '1', nota: 'El prototipo pide mesada de acero inoxidable o granítico.' },
 { rubro: 'Limpieza', apuId: 50, tarea: 'Limpieza periódica y final de obra', cantidad: 1, unidad: 'gl', medicion: '1' },
 // Sin APU todavía (no entran en el costo):
 { rubro: 'Aislaciones', apuId: null, tarea: 'Aislación interior de muros exteriores: poliestireno expandido 15-20 mm + placa de yeso', cantidad: 56, unidad: 'm²', medicion: 'Cara interior de los muros de 18' },
 { rubro: 'Instalación de gas', apuId: null, tarea: 'Instalación de gas (cocina a gas)', cantidad: 1, unidad: 'gl', medicion: '1' },
 { rubro: 'Exteriores', apuId: null, tarea: 'Cerco perimetral: postes y 3 hilos de alambre galvanizado', cantidad: 40, unidad: 'ml', medicion: '2 × 16 + 7,50 (aprox.)' },
 { rubro: 'Cubierta', apuId: null, tarea: 'Aislación térmica de techo (doble aislación 38 mm)', cantidad: 76, unidad: 'm²', medicion: 'Igual que la cubierta', nota: 'Solo si el APU 24 no la incluye.' },
 ],
};

let lastResult = null;

/** Arma los ítems de la Calculadora para las líneas que tienen APU y calcula el costo. */
export async function computeCostoM2(proto = PROTOTIPO_A_2021) {
 await Apu.loadApuCatalog();
 const tasks = ST.apuCatalogState.tasks || [];
 const lines = proto.items.map(l => {
 const task = l.apuId ? tasks.find(t => t.id === l.apuId) : null;
 if (!task) return { ...l, item: null, total: null, motivo: l.apuId ? `No se encontró la tarea APU ${l.apuId}` : 'Sin APU todavía' };
 const item = Apu.buildBudgetItem(l.apuId, l.cantidad);
 item.task_nombre_snapshot = l.tarea;
 return { ...l, item, apuNombre: task.nombre, apuUnidad: task.unidad };
 });
 const items = lines.filter(l => l.item).map(l => l.item);
 // Costo puro, sin Factor K (el K de cada presupuesto lo pone cada uno).
 const breakdown = Apu.calcBudgetBreakdown(items, { kFactor: null });
 breakdown.perItem.forEach(b => {
 const line = lines.find(l => l.item === b.item);
 if (line) {
 line.total = b.total;
 line.materiales = b.materialesCost;
 line.manoObra = b.manoObraCost;
 line.equipos = b.equiposCost;
 }
 });
 const total = breakdown.total;
 lastResult = {
 proto, lines, total,
 porM2: total / proto.superficie,
 materiales: breakdown.perItem.reduce((s, b) => s + b.materialesCost, 0),
 manoObra: breakdown.perItem.reduce((s, b) => s + b.manoObraCost, 0),
 equipos: breakdown.perItem.reduce((s, b) => s + b.equiposCost, 0),
 sinApu: lines.filter(l => !l.item),
 };
 return lastResult;
}

/** Entrada a la vista "Costo por m²": el borrador solo para administradores. */
export async function loadCostoM2View() {
 const box = document.getElementById('costo-m2-draft');
 if (!box) return;
 if (!Admin.isAdmin()) { box.hidden = true; box.innerHTML = ''; return; }
 box.hidden = false;
 box.innerHTML = '<p class="material-muted">Calculando el borrador...</p>';
 try {
 const r = await computeCostoM2();
 renderCostoM2Draft(box, r);
 } catch (err) {
 box.innerHTML = `<p class="material-muted">No se pudo calcular el borrador: ${ST.escapeHtml(err.message)}</p>`;
 }
}

function renderCostoM2Draft(box, r) {
 const pct = (v) => r.total > 0 ? `${(v / r.total * 100).toFixed(1).replace('.', ',')} %` : '—';
 const rubros = [];
 r.lines.filter(l => l.item).forEach(l => {
 let g = rubros.find(x => x.rubro === l.rubro);
 if (!g) { g = { rubro: l.rubro, total: 0 }; rubros.push(g); }
 g.total += l.total || 0;
 });
 const mes = ST.state.priceMonth ? ST.monthLabel(ST.state.priceMonth) : 'el mes actual';
 box.innerHTML = `
 <div class="costo-m2-draft-head">
 <span class="soon-badge">Borrador · solo lo ven los administradores</span>
 <h3>${ST.escapeHtml(r.proto.nombre)} · ${ST.formatQty(r.proto.superficie)} m²</h3>
 <p class="material-muted">${ST.escapeHtml(r.proto.descripcion)} Costo directo (materiales, mano de obra UOCRA y equipos) con precios de ${ST.escapeHtml(mes)}, sin Factor K, sin terreno ni honorarios.</p>
 </div>
 <div class="costo-m2-kpis">
 <div><span>Costo por m²</span><strong>${ST.formatMoney(r.porM2)}</strong></div>
 <div><span>Total de la vivienda</span><strong>${ST.formatMoney(r.total)}</strong></div>
 <div><span>Materiales</span><strong>${pct(r.materiales)}</strong></div>
 <div><span>Mano de obra</span><strong>${pct(r.manoObra)}</strong></div>
 </div>
 ${r.sinApu.length ? `<div class="costo-m2-warn"><strong>Incompleto:</strong> ${r.sinApu.length} rubro${r.sinApu.length === 1 ? '' : 's'} del prototipo todavía no ${r.sinApu.length === 1 ? 'tiene' : 'tienen'} APU y no ${r.sinApu.length === 1 ? 'entra' : 'entran'} en el costo: ${r.sinApu.map(l => ST.escapeHtml(l.tarea.split(':')[0])).join(' · ')}.</div>` : ''}
 <h4 class="costo-m2-sub">Por rubro</h4>
 <div class="costo-m2-bars">
 ${rubros.sort((a, b) => b.total - a.total).map(g => `
 <div class="costo-m2-bar-row">
 <span>${ST.escapeHtml(g.rubro)}</span>
 <div class="costo-m2-bar"><i style="width:${r.total > 0 ? (g.total / r.total * 100).toFixed(1) : 0}%"></i></div>
 <strong>${pct(g.total)}</strong>
 </div>`).join('')}
 </div>
 <h4 class="costo-m2-sub">Cómputo (para revisar)</h4>
 <div class="table-view-container">
 <table class="materials-table costo-m2-table">
 <thead><tr><th>Rubro / tarea</th><th>Cantidad</th><th>Cómo se midió</th><th>APU</th><th style="text-align:right;">Subtotal</th></tr></thead>
 <tbody>
 ${r.lines.map(l => `
 <tr class="${l.item ? '' : 'costo-m2-missing'}">
 <td><span class="costo-m2-rubro">${ST.escapeHtml(l.rubro)}</span><br><strong>${ST.escapeHtml(l.tarea)}</strong>${l.nota ? `<div class="costo-m2-note-row">${ST.escapeHtml(l.nota)}</div>` : ''}${l.item && !(l.total > 0) ? '<div class="costo-m2-note-row">Este APU da $ 0: revisar sus componentes y precios.</div>' : ''}</td>
 <td style="white-space:nowrap;">${ST.formatQty(l.cantidad)} ${ST.escapeHtml(l.unidad)}</td>
 <td class="costo-m2-med">${ST.escapeHtml(l.medicion || '')}</td>
 <td class="costo-m2-med">${l.item ? `${l.apuId} · ${ST.escapeHtml(l.apuNombre)} (${ST.escapeHtml(l.apuUnidad || '')})` : ST.escapeHtml(l.motivo)}</td>
 <td style="text-align:right; white-space:nowrap;">${l.item ? ST.formatMoney(l.total) : '—'}</td>
 </tr>`).join('')}
 </tbody>
 </table>
 </div>
 <div class="costo-m2-actions">
 <button type="button" class="btn-computo" onclick="window.nexoBraApp.openCostoM2InCalculator()">Abrir en la Calculadora</button>
 </div>`;
}

/** Carga el cómputo del prototipo como presupuesto nuevo de la Calculadora (para revisar tarea por tarea). */
export async function openCostoM2InCalculator() {
 if (!lastResult) await computeCostoM2();
 if (ST.state.apuBudgetItems.length && !confirm('Esto reemplaza el presupuesto que tenés abierto en la Calculadora. ¿Seguimos?')) return;
 Apu.newApuBudget();
 ST.state.apuBudgetItems = lastResult.lines.filter(l => l.item).map(l => Apu.buildBudgetItem(l.apuId, l.cantidad));
 ST.apuBudgetMeta.name = lastResult.proto.nombre;
 if (ST.apuBudgetName) ST.apuBudgetName.value = lastResult.proto.nombre;
 Apu.saveApuCart();
 Apu.updateApuBudgetUI();
 window.nexoBraApp.openApuStep('presupuesto');
}
