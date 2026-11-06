// NEXOBRA - apu.js
// Calculadora de Obra (APU) -- Fase 1. Motor de cálculo + estado del
// presupuesto en curso. La UI (vista, nav, drawer) se construye en un paso
// aparte sobre esta base -- ver claude/estado-proyecto.md.
//
// Resumen del modelo (ver migraciones 018 y 022):
// - apu_tasks / apu_task_components / apu_labor_rates / apu_equipment_rates:
// catálogo de referencia cargado por NEXOBRA (rendimientos técnicos).
// - Un "item" de este módulo (en memoria, antes de guardar) representa una
// tarea agregada al presupuesto con su cantidad -- al guardar pasa a ser
// una fila de apu_user_budget_items + varias de
// apu_user_budget_item_components.
// - "Herramientas Manuales" NUNCA se guarda como componente fijo: siempre se
// recalcula como herramientas_pct_mo × (suma de horas de mano de obra del
// item), multiplicado por el precio de referencia del equipo correspon-
// diente (ver calcHerramientasManuales más abajo).

import * as Auth from './auth.js';
import * as Main from './main.js';
import * as Pricing from './pricing.js';
import * as ST from './state.js';

// =========================================================
// Carga del catálogo de referencia (una vez por sesión)
// =========================================================

/**
 * Carga apu_tasks, apu_task_components, apu_labor_rates y apu_equipment_rates
 * desde Supabase y los deja cacheados en ST.apuCatalogState. Idempotente: si
 * ya está cargado (o cargando) no vuelve a pedir nada.
 */
export async function loadApuCatalog() {
 if (ST.apuCatalogState.loaded || ST.apuCatalogState.loading) return;
 if (!ST.supabaseClient) return;
 ST.apuCatalogState.loading = true;

 try {
 const [tasksRes, componentsRes, laborRes, equipmentRes] = await Promise.all([
 ST.supabaseClient.from('apu_tasks').select('*').order('rubro').order('nombre'),
 ST.supabaseClient.from('apu_task_components').select('*'),
 ST.supabaseClient.from('apu_labor_rates').select('*'),
 ST.supabaseClient.from('apu_equipment_rates').select('*')
 ]);

 if (tasksRes.error || componentsRes.error || laborRes.error || equipmentRes.error) {
 console.warn('[NEXOBRA] No se pudo cargar el catálogo de APU.',
 tasksRes.error || componentsRes.error || laborRes.error || equipmentRes.error);
 return;
 }

 ST.apuCatalogState.tasks = tasksRes.data || [];
 ST.apuCatalogState.laborRates = laborRes.data || [];
 ST.apuCatalogState.equipmentRates = equipmentRes.data || [];

 const byTask = {};
 (componentsRes.data || []).forEach(row => {
 if (!byTask[row.apu_task_id]) byTask[row.apu_task_id] = [];
 byTask[row.apu_task_id].push(row);
 });
 // Orden estable (materiales, luego mano de obra, luego equipos) para que
 // la UI no reordene sola cada vez que se vuelve a entrar a una tarea.
 const ordenTipo = { material: 0, mano_obra: 1, equipo: 2 };
 Object.values(byTask).forEach(list => list.sort((a, b) => (ordenTipo[a.tipo] - ordenTipo[b.tipo]) || (a.id - b.id)));
 ST.apuCatalogState.componentsByTask = byTask;

 // "Herramientas Manuales" se identifica por nombre, no por id fijo -- si
 // en algún momento se recarga apu_equipment_rates con otros ids, esto
 // sigue encontrándolo solo.
 const herramientas = ST.apuCatalogState.equipmentRates.find(r => normalizar(r.nombre) === 'herramientas manuales');
 ST.apuCatalogState.herramientasRateId = herramientas ? herramientas.id : null;
 if (!herramientas) {
 console.warn('[NEXOBRA] No se encontró la tarifa "Herramientas Manuales" en apu_equipment_rates -- ese recargo va a quedar en $0.');
 }

 ST.apuCatalogState.loaded = true;
 populateApuTaskRubroFilter();
 } finally {
 ST.apuCatalogState.loading = false;
 }
}

function normalizar(text) {
 return (text || '').toString().trim().toLowerCase();
}

/** Llena el <select> de rubro del buscador de tareas con los rubros reales del catálogo ya cargado -- se vuelve a llamar cada vez que se recarga el catálogo (ej. después de que el admin agrega un APU nuevo), preservando la selección actual si el rubro elegido sigue existiendo. */
function populateApuTaskRubroFilter() {
 if (!ST.apuTaskRubroFilter) return;
 const current = ST.apuTaskRubroFilter.value;
 const rubros = Object.keys(tasksByRubro()).sort((a, b) => a.localeCompare(b));
 ST.apuTaskRubroFilter.innerHTML = '<option value="">Todos los rubros</option>' +
 rubros.map(r => `<option value="${ST.escapeHtml(r)}">${ST.escapeHtml(r)}</option>`).join('');
 if (rubros.includes(current)) ST.apuTaskRubroFilter.value = current;
}

/** Lista de tareas de referencia, opcionalmente filtradas por texto libre (nombre o rubro) y/o por un rubro exacto elegido en el selector -- para el buscador de tareas de la UI. */
export function searchTasks(query, rubro) {
 let tasks = ST.apuCatalogState.tasks;
 if (rubro) tasks = tasks.filter(t => (t.rubro || 'Sin rubro') === rubro);
 if (!query || !query.trim()) return tasks;
 const q = ST.normalizeText(query);
 return tasks.filter(t =>ST.normalizeText(t.nombre).includes(q) || ST.normalizeText(t.rubro || '').includes(q));
}

/** Agrupa las tareas de referencia por rubro, para armar un selector tipo "Mampostería > ...". */
export function tasksByRubro() {
 const groups = {};
 ST.apuCatalogState.tasks.forEach(t => {
 const key = t.rubro || 'Sin rubro';
 if (!groups[key]) groups[key] = [];
 groups[key].push(t);
 });
 return groups;
}

export function getTask(apuTaskId) {
 return ST.apuCatalogState.tasks.find(t => t.id === apuTaskId) || null;
}

export function getLaborRate(id) {
 return ST.apuCatalogState.laborRates.find(r => r.id === id) || null;
}

export function getEquipmentRate(id) {
 return ST.apuCatalogState.equipmentRates.find(r => r.id === id) || null;
}

// =========================================================
// Variantes de material por generic_name (marca/presentación)
// =========================================================

/**
 * Dado el material_id "de fábrica" de un componente de APU, devuelve todas
 * las filas del catálogo (NEXOBRA_DATA, ya sincronizado con la base real por
 * Pricing.loadCatalogFromSupabase) que cubren la misma necesidad genérica
 * (mismo generic_name) -- para que el usuario elija marca/presentación. Si
 * el material no tiene generic_name (es un ítem sin variantes conocidas) o
 * no se encuentra, devuelve un array con ese único material (o vacío si ni
 * siquiera existe, caso borde de catálogo desactualizado).
 */
/**
 * Un grupo de "alternativas" (generic_name, migración 020/021) solo se
 * ofrece como selector si nexobra sabe que todas las variantes son, de
 * verdad, el mismo material en otra marca/envase -- variantGroupMode
 * 'direct' o 'net_qty' (migración 027). La mayoría de los 91 grupos de
 * generic_name agrupan variantes DIMENSIONALES/ESTRUCTURALES (Ø de barra de
 * acero, calibre de chapa, espesor de tabla, medida de ventana/puerta,
 * diámetro de caño, capacidad de un matafuego) que NO son intercambiables
 * entre sí -- para esos (variantGroupMode 'none', el default) no se ofrece
 * el selector, aunque el agrupador siga existiendo en la base para otros
 * usos (ej. búsqueda). Pedido del usuario, 05/11: "tenemos que revisar los
 * rendimientos para que aunque cambie la presentación... siga
 * representando la misma cantidad de material" -- para los grupos donde
 * eso NO se puede garantizar, la respuesta es no ofrecer el swap, no
 * ofrecerlo "a medias".
 */
export function getMaterialVariants(materialId) {
 if (!materialId || typeof NEXOBRA_DATA === 'undefined') return [];
 const base = NEXOBRA_DATA.find(m => m.id === materialId);
 if (!base) return [];
 if (!base.genericName || base.variantGroupMode === 'none' || !base.variantGroupMode) return [base];
 return NEXOBRA_DATA.filter(m => m.genericName === base.genericName);
}

function findMaterial(materialId) {
 if (typeof NEXOBRA_DATA === 'undefined') return null;
 return NEXOBRA_DATA.find(m => m.id === materialId) || null;
}

// =========================================================
// Armado de un "item" (tarea agregada al presupuesto) a partir del catálogo
// =========================================================

let nextLocalId = 1;
function localId(prefix) {
 return `${prefix}_${Date.now()}_${nextLocalId++}`;
}

/**
 * Crea un item nuevo (tarea + cantidad) con sus componentes clonados del
 * catálogo de referencia, listo para agregarse a ST.state.apuBudgetItems.
 * No toca el estado global -- quien llama decide si lo empuja al carrito
 * (modo "presupuesto") o lo usa suelto (modo "calculadora de una tarea").
 */
export function buildBudgetItem(apuTaskId, quantity) {
 const task = getTask(apuTaskId);
 if (!task) throw new Error('Tarea de APU no encontrada.');
 const refComponents = ST.apuCatalogState.componentsByTask[apuTaskId] || [];

 const components = refComponents.map(c => {
 const base = {
 localId: localId('comp'),
 apu_task_component_id: c.id,
 tipo: c.tipo,
 descripcion_snapshot: c.descripcion_original,
 unidad_snapshot: c.unidad,
 rendimiento_referencia: Number(c.rendimiento),
 rendimiento: Number(c.rendimiento),
 is_rendimiento_modificado: false,
 material_id: c.tipo === 'material' ? c.material_id : null,
 labor_rate_id: c.tipo === 'mano_obra' ? c.labor_rate_id : null,
 equipment_rate_id: c.tipo === 'equipo' ? c.equipment_rate_id : null,
 denomination_snapshot: c.descripcion_original,
 source_kind: 'reference',
 provider_offer_id: null,
 provider_branch_id: null,
 provider_business_name: null,
 provider_branch_name: null,
 provider_whatsapp: null,
 price_snapshot: null // se resuelve "en vivo" hasta el momento de guardar -- ver calcComponentCost
 };
 return base;
 });

 return {
 localId: localId('item'),
 apu_task_id: task.id,
 item_kind: 'apu',
 task_nombre_snapshot: task.nombre,
 task_unidad_snapshot: task.unidad,
 task_rubro_snapshot: task.rubro,
 quantity: Number(quantity),
 desperdicio_pct_snapshot: Number(task.desperdicio_pct || 0),
 herramientas_pct_mo_snapshot: Number(task.herramientas_pct_mo || 0),
 phase_id: null, // fase de obra asignada (localId de ST.state.apuPhases) -- null = sin fase, ver setApuItemPhase
 components
 };
}

// =========================================================
// Edición de un item ya agregado
// =========================================================

const EPSILON = 1e-9;

/** Pisa el rendimiento de un componente (material, mano de obra o herramientas) con un valor propio del usuario. */
export function setComponentRendimiento(item, componentLocalId, nuevoValor) {
 const comp = item.components.find(c => c.localId === componentLocalId);
 if (!comp) return;
 const valor = Number(nuevoValor);
 comp.rendimiento = valor;
 comp.is_rendimiento_modificado = Math.abs(valor - comp.rendimiento_referencia) >EPSILON;
}

/** Vuelve un componente puntual a su rendimiento de referencia (deshace el override). */
export function resetComponentRendimiento(item, componentLocalId) {
 const comp = item.components.find(c => c.localId === componentLocalId);
 if (!comp) return;
 comp.rendimiento = comp.rendimiento_referencia;
 comp.is_rendimiento_modificado = false;
}

/**
 * Cambia la marca/presentación elegida para un componente de tipo material
 * (debe ser una de getMaterialVariants del material original).
 *
 * Si la variante anterior y la nueva son la MISMA sustancia en distinto
 * envase (variantGroupMode 'net_qty', ej. cemento 50kg <-> 25kg), el
 * rendimiento (bolsas/m³, etc.) se reescala para que la cantidad REAL de
 * material siga siendo la misma -- si no, cambiar de bolsa "estira o
 * encoge" el cómputo sin que el usuario se dé cuenta. Pedido del usuario,
 * 05/11: "el rendimiento sí cambia, porque relaciona las bolsas de cemento
 * necesarias por m3 de hormigón". Cuando variantGroupMode es 'direct' (ej.
 * Pastina, measurement_unit ya en kg) no hace falta tocar nada: la cantidad
 * cargada ya está en una unidad neutra.
 */
export function setComponentMaterial(item, componentLocalId, materialId) {
 const comp = item.components.find(c => c.localId === componentLocalId);
 if (!comp || comp.tipo !== 'material') return;
 const prevMaterial = findMaterial(comp.material_id);
 comp.material_id = materialId;
 const material = findMaterial(materialId);
 if (material) comp.denomination_snapshot = material.denominacion;

 if (
 prevMaterial && material &&
 prevMaterial.genericName && material.genericName === prevMaterial.genericName &&
 prevMaterial.variantGroupMode === 'net_qty' && material.variantGroupMode === 'net_qty' &&
 Number(prevMaterial.packageNetQty) > 0 && Number(material.packageNetQty) > 0
 ) {
 const factor = Number(prevMaterial.packageNetQty) / Number(material.packageNetQty);
 comp.rendimiento = comp.rendimiento * factor;
 comp.is_rendimiento_modificado = Math.abs(comp.rendimiento - comp.rendimiento_referencia) >EPSILON;
 }

 // Cambiar de marca deja de tener sentido con una oferta de proveedor ya
 // elegida para la variante anterior.
 clearProviderOffer(comp);
}

/** Asocia una oferta de proveedor puntual (provider_offers) a un componente de tipo material -- mismo patrón que elegir proveedor en Mi Cómputo. */
export function setComponentProviderOffer(item, componentLocalId, offer) {
 const comp = item.components.find(c => c.localId === componentLocalId);
 if (!comp || comp.tipo !== 'material') return;
 comp.provider_offer_id = offer.id;
 comp.provider_branch_id = offer.branch_id;
 comp.provider_business_name = offer.provider_business_name || null;
 comp.provider_branch_name = offer.provider_branch_name || null;
 comp.provider_whatsapp = offer.provider_whatsapp || null;
 comp.source_kind = 'provider_offer';
 comp.price_snapshot = Number(offer.amount); // precio fijo del proveedor, no se recalcula contra el mes (igual criterio que cartItemToRow en computo.js)
}

export function clearProviderOffer(comp) {
 comp.provider_offer_id = null;
 comp.provider_branch_id = null;
 comp.provider_business_name = null;
 comp.provider_branch_name = null;
 comp.provider_whatsapp = null;
 comp.source_kind = 'reference';
 comp.price_snapshot = null;
}

// =========================================================
// Editar los componentes de un ítem YA agregado al presupuesto -- 04/11.
// A diferencia de buildBudgetItem/buildCustomBudgetItem (que arman los
// componentes de un ítem recién creado, clonando el catálogo o desde el
// draft del modal), estas son para modificar uno existente después del
// hecho: el usuario pidió poder editar un APU pre cargado, no solo sus
// rendimientos -- agregar o quitar materiales/mano de obra/equipos sueltos.
// apu_task_component_id queda null: no viene de ninguna fila de referencia
// real, es información que el usuario sumó a mano sobre esa tarea puntual
// (misma convención que ya usan los componentes de una tarea personalizada).
// =========================================================

function buildManualComponent(tipo, { descripcion, unidad, rendimiento, material_id, labor_rate_id, equipment_rate_id }) {
 return {
 localId: localId('comp'),
 apu_task_component_id: null,
 tipo,
 descripcion_snapshot: descripcion,
 unidad_snapshot: unidad,
 rendimiento_referencia: Number(rendimiento),
 rendimiento: Number(rendimiento),
 is_rendimiento_modificado: false,
 material_id: material_id || null,
 labor_rate_id: labor_rate_id || null,
 equipment_rate_id: equipment_rate_id || null,
 denomination_snapshot: descripcion,
 source_kind: 'reference',
 provider_offer_id: null,
 provider_branch_id: null,
 provider_business_name: null,
 provider_branch_name: null,
 provider_whatsapp: null,
 price_snapshot: null
 };
}

/** Agrega un material nuevo a un ítem ya agregado al presupuesto. Devuelve el componente creado, o null si el material no existe. */
export function addItemMaterialComponent(item, materialId, rendimiento) {
 const material = findMaterial(materialId);
 if (!material) return null;
 const comp = buildManualComponent('material', {
 descripcion: material.denominacion, unidad: material.unidadComputo, rendimiento, material_id: material.id
 });
 item.components.push(comp);
 return comp;
}

/** Agrega una mano de obra nueva a un ítem ya agregado al presupuesto. Devuelve el componente creado, o null si la tarifa no existe. */
export function addItemLaborComponent(item, laborRateId, rendimiento) {
 const rate = getLaborRate(laborRateId);
 if (!rate) return null;
 const comp = buildManualComponent('mano_obra', {
 descripcion: rate.nombre, unidad: 'hs', rendimiento, labor_rate_id: rate.id
 });
 item.components.push(comp);
 return comp;
}

/** Agrega un equipo nuevo a un ítem ya agregado al presupuesto. Devuelve el componente creado, o null si la tarifa no existe. */
export function addItemEquipmentComponent(item, equipmentRateId, rendimiento) {
 const rate = getEquipmentRate(equipmentRateId);
 if (!rate) return null;
 const comp = buildManualComponent('equipo', {
 descripcion: rate.nombre, unidad: 'hs', rendimiento, equipment_rate_id: rate.id
 });
 item.components.push(comp);
 return comp;
}

/** Quita un componente puntual de un ítem ya agregado al presupuesto (distinto de removeApuBudgetItem, que quita la tarea entera). Funciona igual para un componente de catálogo, uno de una tarea personalizada, o uno agregado a mano con las tres funciones de arriba. */
export function removeItemComponent(item, componentLocalId) {
 item.components = item.components.filter(c => c.localId !== componentLocalId);
}

// =========================================================
// Motor de cálculo
// =========================================================

/**
 * Precio unitario vigente de un componente (sin factor k todavía). Materiales
 * se resuelven contra el catálogo real en modo "cómputo" (precio por unidad
 * de medida, ej. $/kg -- es el que corresponde a un rendimiento tipo "250 kg
 * de cemento por m3", no el precio de venta por bolsa). Mano de obra y
 * equipos usan la tarifa de referencia fija cargada en 018 (no dependen del
 * mes elegido -- ver nota en estado-proyecto.md sobre por qué no están
 * atadas a la serie de IPC/UOCRA en esta fase).
 */
export function resolveComponentUnitPrice(comp, month) {
 if (comp.price_snapshot !== null && comp.price_snapshot !== undefined && comp.source_kind === 'provider_offer') {
 return { unitPrice: Number(comp.price_snapshot), disponible: true, isProviderSourced: true };
 }
 if (comp.tipo === 'material') {
 const material = findMaterial(comp.material_id);
 if (!material) return { unitPrice: 0, disponible: false };
 const trace = Pricing.getReferencePrice(material, 'computo', month || ST.state.apuMonth || ST.state.priceMonth);
 return { unitPrice: trace.currentPrice, disponible: true, basePrice: trace.basePrice, factor: trace.factor };
 }
 if (comp.tipo === 'mano_obra') {
 const rate = getLaborRate(comp.labor_rate_id);
 return { unitPrice: rate ? Number(rate.precio_referencia) : 0, disponible: Boolean(rate) };
 }
 if (comp.tipo === 'equipo') {
 const rate = getEquipmentRate(comp.equipment_rate_id);
 return { unitPrice: rate ? Number(rate.precio_referencia) : 0, disponible: Boolean(rate) };
 }
 return { unitPrice: 0, disponible: false };
}

/**
 * Desglose completo de un item (tarea + cantidad): cada componente con su
 * cantidad necesaria y costo, más la línea de "Herramientas Manuales"
 * (siempre calculada, nunca un componente guardado -- ver cabecera del
 * archivo) y los subtotales por tipo. kFactor es opcional (del presupuesto,
 * no del item): si viene, se aplica multiplicando el precio unitario de
 * cada línea, incluida Herramientas Manuales.
 */
export function calcItemBreakdown(item, { month = null, kFactor = null } = {}) {
 const k = (kFactor && kFactor > 0) ? kFactor : 1;
 let horasManoObraTotal = 0;
 let materialesCost = 0, manoObraCost = 0, equiposCost = 0;

 const lineas = item.components.map(comp => {
 const precio = resolveComponentUnitPrice(comp, month);
 const unitPriceConK = precio.unitPrice * k;
 let cantidadNecesaria;
 if (comp.tipo === 'material') {
 cantidadNecesaria = comp.rendimiento * item.quantity * (1 + (item.desperdicio_pct_snapshot || 0) / 100);
 } else {
 // mano_obra / equipo: sin desperdicio, el rendimiento ya es "horas por unidad de tarea".
 cantidadNecesaria = comp.rendimiento * item.quantity;
 }
 if (comp.tipo === 'mano_obra') horasManoObraTotal += cantidadNecesaria;

 const costo = cantidadNecesaria * unitPriceConK;
 if (comp.tipo === 'material') materialesCost += costo;
 else if (comp.tipo === 'mano_obra') manoObraCost += costo;
 else if (comp.tipo === 'equipo') equiposCost += costo;

 return {
 ...comp,
 cantidadNecesaria,
 unitPrice: precio.unitPrice,
 unitPriceConK,
 disponible: precio.disponible !== false,
 isProviderSourced: Boolean(precio.isProviderSourced),
 costo
 };
 });

 const herramientas = calcHerramientasManuales(item, horasManoObraTotal, month, k);
 equiposCost += herramientas.costo;

 return {
 item,
 lineas,
 herramientas,
 materialesCost,
 manoObraCost,
 equiposCost,
 total: materialesCost + manoObraCost + equiposCost
 };
}

/**
 * "Herramientas Manuales": horas = % (herramientas_pct_mo_snapshot) × suma
 * de horas de mano de obra YA calculadas para este item (post-rendimiento,
 * post-cantidad -- así sigue siendo correcto si el usuario editó algún
 * rendimiento de mano de obra). Costo = esas horas × precio de referencia
 * del equipo "Herramientas Manuales". Devuelve una línea "virtual" para
 * mostrar/exportar -- nunca se guarda como fila de componente.
 */
export function calcHerramientasManuales(item, horasManoObraTotal, month, k = 1) {
 const pct = Number(item.herramientas_pct_mo_snapshot || 0) / 100;
 const horas = pct * horasManoObraTotal;
 const rate = ST.apuCatalogState.herramientasRateId ? getEquipmentRate(ST.apuCatalogState.herramientasRateId) : null;
 const unitPrice = rate ? Number(rate.precio_referencia) : 0;
 return {
 tipo: 'equipo',
 virtual: true,
 descripcion_snapshot: 'Herramientas Manuales',
 unidad_snapshot: rate ? rate.unidad : 'hs',
 cantidadNecesaria: horas,
 unitPrice,
 unitPriceConK: unitPrice * k,
 disponible: Boolean(rate),
 costo: horas * unitPrice * k
 };
}

/**
 * Desglose de TODO el presupuesto (varios items) + lista de materiales
 * consolidada (mismo material_id sumado entre tareas distintas, ej. cemento
 * usado en dos APU distintos). kFactor viene de ST.apuBudgetMeta.kFactor si
 * no se pasa explícito.
 */
/** Consolida los materiales (mismo material_id/descripción sumado) de un subconjunto de perItem -- extraído a función aparte (05/11) para poder reusar EXACTAMENTE el mismo cálculo tanto para el total del presupuesto (materialesConsolidados) como para cada fase por separado (materialesPorFase, "pedir materiales por fase"). */
function consolidateMaterialLineas(perItemSubset) {
 const consolidadoByMaterial = {};
 perItemSubset.forEach(({ lineas }) => {
 lineas.filter(l => l.tipo === 'material').forEach(l => {
 const key = l.material_id || l.descripcion_snapshot;
 if (!consolidadoByMaterial[key]) {
 consolidadoByMaterial[key] = {
 key, // mismo valor usado para agrupar -- lo reutiliza el registro de pedidos (apu_budget_purchases) para no recalcular distinto en dos lugares.
 material_id: l.material_id,
 denominacion: l.denomination_snapshot,
 unidad: l.unidad_snapshot,
 cantidad: 0,
 costo: 0
 };
 }
 consolidadoByMaterial[key].cantidad += l.cantidadNecesaria;
 consolidadoByMaterial[key].costo += l.costo;
 });
 });

 // Conversión a unidad de compra (04/11, a pedido del usuario): el catálogo
 // ya trae, por material, en qué se vende realmente (unidadVenta, ej.
 // "Bolsa") y cuántas unidades de cómputo trae ese envase (envase, ej. 50
 // si unidadComputo es "kg" -- o 1 si unidadComputo YA es la unidad de
 // compra, como pasa con el cemento en "bl"). "A pedir" es la cantidad
 // neta dividida por ese envase y redondeada hacia arriba -- no tiene
 // sentido pedir media bolsa.
 Object.values(consolidadoByMaterial).forEach(m => {
 const material = m.material_id ? findMaterial(m.material_id) : null;
 const envase = material && material.envase > 0 ? material.envase : 1;
 m.unidadCompra = material ? (material.unidadVenta || m.unidad) : m.unidad;
 m.envase = envase;
 m.cantidadAPedir = Math.ceil((m.cantidad / envase) - 1e-9); // tolerancia para no redondear de más por error de punto flotante
 });

 return Object.values(consolidadoByMaterial).sort((a, b) => a.denominacion.localeCompare(b.denominacion));
}

export function calcBudgetBreakdown(items, { month = null, kFactor = ST.apuBudgetMeta.kFactor } = {}) {
 const perItem = items.map(item => calcItemBreakdown(item, { month, kFactor }));

 const materialesConsolidados = consolidateMaterialLineas(perItem);

 // Lista de materiales agrupada por fase de obra (05/11, a pedido del
 // usuario: "para así pedir materiales por fase") -- mismo cálculo de
 // consolidación de arriba, pero aplicado solo a los items de CADA fase
 // por separado, para poder pedirle al proveedor/acopiar solo lo de esa
 // etapa. Los items sin fase asignada quedan agrupados aparte (phaseId null).
 const porFase = {};
 perItem.forEach(entry => {
 const key = entry.item.phase_id || '__sin_fase__';
 if (!porFase[key]) porFase[key] = [];
 porFase[key].push(entry);
 });
 const materialesPorFase = Object.entries(porFase).map(([key, entries]) => ({
 phaseId: key === '__sin_fase__' ? null : key,
 materiales: consolidateMaterialLineas(entries),
 total: entries.reduce((s, b) => s + b.total, 0)
 }));

 const total = perItem.reduce((sum, b) => sum + b.total, 0);
 return {
 perItem,
 materialesConsolidados,
 materialesPorFase,
 total
 };
}

// =========================================================
// Registro de pedidos (apu_budget_purchases, migración 025 -- 04/11).
// NEXOBRA no hace la compra en sí (eso sigue siendo por WhatsApp con el
// proveedor elegido): esto es solo un cuaderno de obra digital para que el
// usuario anote cada vez que efectivamente pide un material, y vea cuánto
// ya pidió vs. cuánto le falta de la cantidad "a pedir" (ya redondeada a
// bolsa/balde/caja más arriba). Solo existe para presupuestos YA GUARDADOS
// (necesitan un budget_id real) -- igual criterio que el logo del admin
// necesitando el proveedor guardado primero.
// =========================================================

let apuPurchasesCache = { budgetId: null, byKey: {} };

function purchaseKeySafe(key) {
 return String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Recarga el caché de pedidos para el presupuesto actualmente abierto (ST.apuBudgetMeta.currentId). Se llama al abrir/guardar/vaciar un presupuesto y después de registrar o borrar un pedido -- renderConsolidated() solo LEE este caché, nunca pide a la base por sí mismo (para no volverse async). */
export async function loadApuPurchasesForCurrentBudget() {
 const budgetId = ST.apuBudgetMeta.currentId;
 apuPurchasesCache = { budgetId, byKey: {} };
 if (!budgetId) return;
 const { data, error } = await ST.supabaseClient
 .from('apu_budget_purchases')
 .select('*')
 .eq('budget_id', budgetId)
 .order('fecha', { ascending: false });
 if (error) { console.error('No se pudieron cargar los pedidos registrados:', error); return; }
 (data || []).forEach(row => {
 const key = row.material_id || row.denominacion_snapshot;
 if (!apuPurchasesCache.byKey[key]) apuPurchasesCache.byKey[key] = { total: 0, rows: [] };
 apuPurchasesCache.byKey[key].total += Number(row.cantidad);
 apuPurchasesCache.byKey[key].rows.push(row);
 });
}

/** Lo que ya se pidió de un material (mismo `key` que materialesConsolidados) dentro del presupuesto actualmente cacheado. {total:0, rows:[]} si todavía no hay ninguno. */
export function getApuPurchaseInfo(key) {
 return apuPurchasesCache.byKey[key] || { total: 0, rows: [] };
}

export async function registerApuPurchase(key) {
 const budgetId = ST.apuBudgetMeta.currentId;
 if (!budgetId) { ST.showToast('Primero guardá el presupuesto para poder registrar pedidos.'); return; }
 const safe = purchaseKeySafe(key);
 const qtyInput = document.getElementById(`apu-purchase-qty-${safe}`);
 const dateInput = document.getElementById(`apu-purchase-date-${safe}`);
 const noteInput = document.getElementById(`apu-purchase-note-${safe}`);
 const cantidad = qtyInput ? parseFloat(qtyInput.value) : 0;
 if (!cantidad || cantidad <= 0) { ST.showToast('Poné una cantidad válida para el pedido.'); return; }
 const fecha = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().slice(0, 10);
 const nota = (noteInput && noteInput.value.trim()) ? noteInput.value.trim() : null;

 const breakdown = calcBudgetBreakdown(ST.state.apuBudgetItems, { kFactor: ST.apuBudgetMeta.kFactor });
 const m = breakdown.materialesConsolidados.find(x => x.key === key);
 if (!m) return;

 const { error } = await ST.supabaseClient.from('apu_budget_purchases').insert({
 budget_id: budgetId,
 material_id: m.material_id || null,
 denominacion_snapshot: m.denominacion,
 unidad_compra_snapshot: m.unidadCompra,
 cantidad,
 fecha,
 nota
 });
 if (error) { ST.showToast('No se pudo registrar el pedido: ' + error.message); return; }
 ST.showToast('Pedido registrado.');
 await loadApuPurchasesForCurrentBudget();
 updateApuBudgetUI();
}

export async function deleteApuPurchase(purchaseId) {
 if (!confirm('¿Eliminar este registro de pedido? No se puede deshacer.')) return;
 const { error } = await ST.supabaseClient.from('apu_budget_purchases').delete().eq('id', purchaseId);
 if (error) { ST.showToast('No se pudo eliminar: ' + error.message); return; }
 await loadApuPurchasesForCurrentBudget();
 updateApuBudgetUI();
}

// =========================================================
// Carrito del presupuesto en curso (ST.state.apuBudgetItems)
// =========================================================

export function saveApuCart() {
 localStorage.setItem('nexobra_apu_budget', JSON.stringify(ST.state.apuBudgetItems));
}

export function addItemToBudget(apuTaskId, quantity) {
 const item = buildBudgetItem(apuTaskId, quantity);
 ST.state.apuBudgetItems.push(item);
 saveApuCart();
 return item;
}

export function removeItemFromBudget(itemLocalId) {
 ST.state.apuBudgetItems = ST.state.apuBudgetItems.filter(i => i.localId !== itemLocalId);
 saveApuCart();
}

export function clearBudget() {
 ST.state.apuBudgetItems = [];
 saveApuCart();
}

// =========================================================
// Fases de obra (05/11) -- agrupador propio del usuario DENTRO de un
// presupuesto, a pedido explícito: "que el usuario pueda crear fases de
// obra y poner qué items entran ahí, para así pedir materiales por fase".
// Viven en ST.state.apuPhases (igual patrón que apuBudgetItems: en memoria
// + espejadas en localStorage mientras no se guarda el presupuesto todavía
// en la base). Cada item referencia una fase por item.phase_id = fase.localId
// (nunca el id real de la base directo -- eso solo existe después del
// primer guardado, ver saveApuBudget/openApuBudget más abajo).
// =========================================================

export function saveApuPhases() {
 localStorage.setItem('nexobra_apu_phases', JSON.stringify(ST.state.apuPhases));
}

/** Nombre de una fase por su localId, para mostrar en la tarjeta de cada item y en "Materiales por fase". 'Sin fase' tanto si phaseLocalId es null como si apunta a una fase que ya no existe (se borró). */
export function getApuPhaseName(phaseLocalId) {
 if (!phaseLocalId) return 'Sin fase';
 const phase = ST.state.apuPhases.find(p => p.localId === phaseLocalId);
 return phase ? phase.nombre : 'Sin fase';
}

export function addApuPhase() {
 const input = document.getElementById('apu-new-phase-name');
 const nombre = input ? input.value.trim() : '';
 if (!nombre) { ST.showToast('Poné un nombre para la fase.'); return; }
 ST.state.apuPhases.push({
 localId: localId('phase'),
 dbId: null,
 nombre,
 orden: ST.state.apuPhases.length,
 fechaEstimada: null,
 estado: 'no_iniciada'
 });
 if (input) input.value = '';
 saveApuPhases();
 updateApuBudgetUI();
}

/** Borra una fase -- las tareas que tenía asignadas NO se borran, quedan "Sin fase" (mismo criterio que la base: phase_id con on delete set null). */
export function removeApuPhase(phaseLocalId) {
 if (!confirm('¿Eliminar esta fase? Las tareas que tenía asignadas no se borran, quedan sin fase.')) return;
 ST.state.apuPhases = ST.state.apuPhases.filter(p => p.localId !== phaseLocalId);
 ST.state.apuBudgetItems.forEach(item => { if (item.phase_id === phaseLocalId) item.phase_id = null; });
 saveApuPhases();
 saveApuCart();
 updateApuBudgetUI();
}

export function updateApuPhaseNombre(phaseLocalId, value) {
 const phase = ST.state.apuPhases.find(p => p.localId === phaseLocalId);
 if (!phase) return;
 phase.nombre = value.trim() || phase.nombre;
 saveApuPhases();
 updateApuBudgetUI();
}

export function updateApuPhaseFecha(phaseLocalId, value) {
 const phase = ST.state.apuPhases.find(p => p.localId === phaseLocalId);
 if (!phase) return;
 phase.fechaEstimada = value || null;
 saveApuPhases();
}

export function updateApuPhaseEstado(phaseLocalId, value) {
 const phase = ST.state.apuPhases.find(p => p.localId === phaseLocalId);
 if (!phase) return;
 phase.estado = value;
 saveApuPhases();
 updateApuBudgetUI();
}

/** Asigna (o quita, con '') la fase de UN item ya agregado al presupuesto -- select en la cabecera de cada tarjeta de tarea. */
export function setApuItemPhase(itemLocalId, phaseLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 item.phase_id = phaseLocalId || null;
 saveApuCart();
 updateApuBudgetUI();
}

/** Panel de gestión de fases (#apu-phases-list): una fila editable por fase -- nombre, fecha estimada, estado de avance, cantidad de tareas asignadas y borrar. Sin fases creadas todavía, solo un hint. */
export function renderApuPhasesPanel() {
 if (!ST.apuPhasesList) return;
 if (ST.state.apuPhases.length === 0) {
 ST.apuPhasesList.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">Todavía no creaste ninguna fase.</p>';
 return;
 }
 ST.apuPhasesList.innerHTML = ST.state.apuPhases.map(p => {
 const count = ST.state.apuBudgetItems.filter(i => i.phase_id === p.localId).length;
 return `
 <div class="apu-phase-row">
 <input type="text" class="form-select apu-phase-name-input" value="${ST.escAttr(p.nombre)}"
 onchange="window.nexoBraApp.updateApuPhaseNombre('${p.localId}', this.value)">
 <select class="form-select apu-phase-estado-select" onchange="window.nexoBraApp.updateApuPhaseEstado('${p.localId}', this.value)">
 <option value="no_iniciada" ${p.estado === 'no_iniciada' ? 'selected' : ''}>No iniciada</option>
 <option value="en_curso" ${p.estado === 'en_curso' ? 'selected' : ''}>En curso</option>
 <option value="terminada" ${p.estado === 'terminada' ? 'selected' : ''}>Terminada</option>
 </select>
 <input type="date" class="form-select apu-phase-fecha-input" value="${p.fechaEstimada || ''}"
 onchange="window.nexoBraApp.updateApuPhaseFecha('${p.localId}', this.value)">
 <span class="apu-phase-count">${count} tarea${count === 1 ? '' : 's'}</span>
 <button class="apu-item-remove" title="Eliminar fase" onclick="window.nexoBraApp.removeApuPhase('${p.localId}')">&times;</button>
 </div>`;
 }).join('');
}

// =========================================================
// Tareas personalizadas ("Crear tu propia APU") -- 05/11.
// A diferencia de buildBudgetItem (que clona un apu_task_components del
// catálogo), acá el usuario elige a mano cada material/mano de obra/equipo y
// su propio rendimiento. El item resultante tiene EXACTAMENTE la misma forma
// que uno armado desde el catálogo (mismos campos en item y en cada
// component), solo que con apu_task_id/apu_task_component_id en null -- la
// migración 022 ya los tiene nullable y task_nombre_snapshot/
// denomination_snapshot/etc. ya se guardan directo en la fila, así que
// calcBudgetBreakdown, saveApuBudget, rowToBudgetItem y duplicateApuBudget
// funcionan sin ningún cambio con una tarea personalizada (ver
// estado-proyecto.md, investigación de schema del 05/11).
// =========================================================

/**
 * Crea un item de presupuesto "a mano", sin referencia a apu_tasks. Cada
 * componente de `components` debe venir con { tipo, material_id|labor_rate_id|equipment_rate_id,
 * denominacion, unidad_snapshot, rendimiento } ya resueltos (ver
 * addApuCustomComponentDraft más abajo, que es quien los arma desde la UI).
 * rendimiento_referencia se fija igual a rendimiento al crear -- es "la
 * referencia" de esta tarea personalizada, contra la que se compara si el
 * usuario la retoca después en el carrito (mismo criterio que setComponentRendimiento).
 */
export function buildCustomBudgetItem({ nombre, unidad, rubro, desperdicio_pct, herramientas_pct_mo, quantity, components, kind = 'custom' }) {
 const builtComponents = (components || []).map(c => ({
 localId: localId('comp'),
 apu_task_component_id: null,
 tipo: c.tipo,
 descripcion_snapshot: c.denominacion,
 unidad_snapshot: c.unidad_snapshot,
 rendimiento_referencia: Number(c.rendimiento),
 rendimiento: Number(c.rendimiento),
 is_rendimiento_modificado: false,
 material_id: c.tipo === 'material' ? c.material_id : null,
 labor_rate_id: c.tipo === 'mano_obra' ? c.labor_rate_id : null,
 equipment_rate_id: c.tipo === 'equipo' ? c.equipment_rate_id : null,
 denomination_snapshot: c.denominacion,
 source_kind: 'reference',
 provider_offer_id: null,
 provider_branch_id: null,
 provider_business_name: null,
 provider_branch_name: null,
 provider_whatsapp: null,
 price_snapshot: null
 }));

 return {
 localId: localId('item'),
 apu_task_id: null,
 item_kind: kind,
 task_nombre_snapshot: nombre,
 task_unidad_snapshot: unidad,
 task_rubro_snapshot: rubro || null,
 quantity: Number(quantity),
 desperdicio_pct_snapshot: Number(desperdicio_pct || 0),
 herramientas_pct_mo_snapshot: Number(herramientas_pct_mo || 0),
 phase_id: null, // fase de obra asignada (localId de ST.state.apuPhases) -- null = sin fase, ver setApuItemPhase
 components: builtComponents
 };
}

export function addCustomItemToBudget(data) {
 const item = buildCustomBudgetItem(data);
 ST.state.apuBudgetItems.push(item);
 saveApuCart();
 return item;
}

// =========================================================
// Material suelto, sin tarea/APU (04/11) -- a pedido del usuario: poder
// agregar un material directo al presupuesto de una obra para pedirle
// precio a un proveedor, aunque ese material no venga de ninguna tarea
// técnica. Se guarda con el mismo molde que una tarea personalizada (un
// solo componente, rendimiento 1:1 -- ver 026_apu_item_kind.sql) para que
// el motor de cálculo (calcItemBreakdown/calcBudgetBreakdown) no necesite
// ningún caso especial: cantidadNecesaria = 1 × cantidad × (1+0%) = cantidad.
// =========================================================

/** Crea un ítem de "material suelto": nombre/unidad vienen del material elegido, cantidad es la que pidió el usuario (no 1 -- a diferencia de una tarea personalizada, acá la cantidad ES directamente la cantidad del material). */
export function buildMaterialDirectoItem(materialId, quantity) {
 const material = findMaterial(materialId);
 if (!material) throw new Error('Material no encontrado en el catálogo.');
 const unidad = material.unidadComputo || material.unidadVenta || '';
 return buildCustomBudgetItem({
 nombre: material.denominacion,
 unidad,
 rubro: material.rubro || null,
 desperdicio_pct: 0,
 herramientas_pct_mo: 0,
 quantity,
 kind: 'material_directo',
 components: [{
 tipo: 'material',
 material_id: material.id,
 denominacion: material.denominacion,
 unidad_snapshot: unidad,
 rendimiento: 1 // 1:1 -- la cantidad real la pone item.quantity, no el rendimiento (ver cabecera de esta sección)
 }]
 });
}

export function addMaterialDirectoToBudget(materialId, quantity) {
 const item = buildMaterialDirectoItem(materialId, quantity);
 ST.state.apuBudgetItems.push(item);
 saveApuCart();
 return item;
}

/** Busca en el catálogo real para el buscador de "Agregar material suelto" -- mismo criterio que searchMaterialsForCustomTask, reusado tal cual. */
function searchMaterialsForDirecto(query) {
 return searchMaterialsForCustomTask(query);
}

/** Vuelca searchMaterialsForDirecto(query) en #apu-direct-material-results. Cada resultado tiene su propio input de cantidad + botón "Agregar" -- a diferencia de renderTaskResults, acá no hace falta ningún panel extra (no hay descripción ni medidas que calcular para un material suelto). */
export function renderApuDirectMaterialResults(query) {
 if (!ST.apuDirectMaterialResults) return;
 if (!query || !query.trim()) {
 ST.apuDirectMaterialResults.innerHTML = '';
 return;
 }
 const results = searchMaterialsForDirecto(query);
 if (results.length === 0) {
 ST.apuDirectMaterialResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Ningún material coincide con esa búsqueda.</p>';
 return;
 }
 ST.apuDirectMaterialResults.innerHTML = results.map(m => `
 <div class="apu-task-row">
 <div class="apu-task-row-info">
 <strong>${ST.escapeHtml(m.denominacion)}</strong>
 <span>${ST.escapeHtml(m.rubro || '')} · unidad: ${ST.escapeHtml(m.unidadComputo || m.unidadVenta || '')}</span>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="apu-direct-mat-qty-${ST.escapeHtml(m.id)}" value="1" min="0.0001" step="0.0001">
 <button class="btn-computo" onclick="window.nexoBraApp.addApuDirectMaterial(${ST.escAttr(m.id)})">+ Agregar</button>
 </div>
 </div>
 `).join('');
}

/** Llamado desde el botón "+ Agregar" de cada resultado de renderApuDirectMaterialResults. */
export function addApuDirectMaterial(materialId) {
 const qtyInput = document.getElementById(`apu-direct-mat-qty-${materialId}`);
 const quantity = qtyInput ? Math.max(0.0001, parseFloat(qtyInput.value) || 0) : 0;
 if (quantity <= 0) { ST.showToast('Ingresá una cantidad válida.'); return; }
 const item = addMaterialDirectoToBudget(materialId, quantity);
 updateApuBudgetUI();
 ST.showToast(`+ Agregado: ${item.task_nombre_snapshot}`);
}

// --- Estado del borrador mientras el modal "Crear tu propia APU" está
// abierto -- nunca se persiste, solo vive en memoria durante la edición.
let apuCustomDraft = null;

function resetApuCustomDraft() {
 apuCustomDraft = { components: [] };
}

function searchMaterialsForCustomTask(query) {
 if (typeof NEXOBRA_DATA === 'undefined') return [];
 const tokens = ST.normalizeText(query || '').split(' ').filter(Boolean);
 if (tokens.length === 0) return [];
 return NEXOBRA_DATA.filter(item => {
 const haystack = ST.normalizeText([item.denominacion, item.id, item.rubro].filter(Boolean).join(' '));
 return tokens.every(t => haystack.includes(t));
 }).slice(0, 25);
}

/** Vuelca searchMaterialsForCustomTask(query) en #apu-custom-material-results -- mismo patrón que renderTaskResults. */
export function renderApuCustomMaterialResults(query) {
 if (!ST.apuCustomMaterialResults) return;
 if (!query || !query.trim()) {
 ST.apuCustomMaterialResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Escribí para buscar un material del catálogo de NEXOBRA.</p>';
 return;
 }
 const results = searchMaterialsForCustomTask(query);
 if (results.length === 0) {
 ST.apuCustomMaterialResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Ningún material coincide con esa búsqueda.</p>';
 return;
 }
 ST.apuCustomMaterialResults.innerHTML = results.map(m => `
 <div class="apu-task-row">
 <div class="apu-task-row-info">
 <strong>${ST.escapeHtml(m.denominacion)}</strong>
 <span>${ST.escapeHtml(m.rubro || '')} · unidad: ${ST.escapeHtml(m.unidadComputo || m.unidadVenta || '')}</span>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="apu-custom-mat-rend-${ST.escapeHtml(m.id)}" value="1" min="0.0001" step="0.0001" title="Cantidad de ${ST.escapeHtml(m.unidadComputo || '')} por unidad de tarea">
 <button class="btn-computo" onclick="window.nexoBraApp.addApuCustomComponentDraft('material', ${ST.escAttr(m.id)})">+ Agregar</button>
 </div>
 </div>
 `).join('');
}

/** Agrega un componente al borrador de la tarea personalizada -- llamado desde el buscador de materiales (inline) o desde los selects de mano de obra/equipo (listener en setupApuListeners). */
export function addApuCustomComponentDraft(tipo, idValue) {
 if (!apuCustomDraft) resetApuCustomDraft();

 if (tipo === 'material') {
 const material = findMaterial(idValue);
 if (!material) return;
 const rendInput = document.getElementById(`apu-custom-mat-rend-${idValue}`);
 const rendimiento = rendInput ? parseFloat(rendInput.value) || 0 : 0;
 apuCustomDraft.components.push({
 localId: localId('draft'), tipo: 'material', material_id: material.id,
 denominacion: material.denominacion, unidad_snapshot: material.unidadComputo || material.unidadVenta || '',
 rendimiento
 });
 } else if (tipo === 'mano_obra') {
 const rate = getLaborRate(Number(idValue));
 if (!rate) return;
 const rendimiento = ST.apuCustomLaborRend ? (parseFloat(ST.apuCustomLaborRend.value) || 0) : 0;
 apuCustomDraft.components.push({
 localId: localId('draft'), tipo: 'mano_obra', labor_rate_id: rate.id,
 denominacion: rate.nombre, unidad_snapshot: rate.unidad, rendimiento
 });
 } else if (tipo === 'equipo') {
 const rate = getEquipmentRate(Number(idValue));
 if (!rate) return;
 const rendimiento = ST.apuCustomEquipmentRend ? (parseFloat(ST.apuCustomEquipmentRend.value) || 0) : 0;
 apuCustomDraft.components.push({
 localId: localId('draft'), tipo: 'equipo', equipment_rate_id: rate.id,
 denominacion: rate.nombre, unidad_snapshot: rate.unidad, rendimiento
 });
 } else {
 return;
 }
 renderApuCustomDraftList();
}

export function removeApuCustomComponentDraft(draftLocalId) {
 if (!apuCustomDraft) return;
 apuCustomDraft.components = apuCustomDraft.components.filter(c => c.localId !== draftLocalId);
 renderApuCustomDraftList();
}

const TIPO_ICON = { material: '', mano_obra: '', equipo: '' };

function renderApuCustomDraftList() {
 if (!ST.apuCustomDraftList) return;
 const components = apuCustomDraft ? apuCustomDraft.components : [];
 if (components.length === 0) {
 ST.apuCustomDraftList.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Todavía no agregaste ningún componente.</p>';
 return;
 }
 ST.apuCustomDraftList.innerHTML = components.map(c => `
 <div class="apu-task-row">
 <div class="apu-task-row-info">
 <strong>${TIPO_ICON[c.tipo] || ''} ${ST.escapeHtml(c.denominacion)}</strong>
 <span>${c.rendimiento} ${ST.escapeHtml(c.unidad_snapshot)} por unidad de tarea</span>
 </div>
 <div class="apu-task-row-add">
 <button class="apu-item-remove" title="Quitar" onclick="window.nexoBraApp.removeApuCustomComponentDraft('${c.localId}')">&times;</button>
 </div>
 </div>
 `).join('');
}

/** Llena los <select> de mano de obra/equipo del modal con el catálogo ya cargado (excluye "Herramientas Manuales": nunca se agrega a mano, siempre se calcula sola -- ver cabecera del archivo). */
function populateApuCustomSelects() {
 if (ST.apuCustomLaborSelect) {
 ST.apuCustomLaborSelect.innerHTML = ST.apuCatalogState.laborRates
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
 if (ST.apuCustomEquipmentSelect) {
 ST.apuCustomEquipmentSelect.innerHTML = ST.apuCatalogState.equipmentRates
 .filter(r => r.id !== ST.apuCatalogState.herramientasRateId)
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
}

export function openApuCustomTaskModal() {
 if (!ST.apuCustomTaskModal || !ST.apuCustomTaskBackdrop) return;
 if (!ST.apuCatalogState.loaded) {
 ST.showToast('Esperá que termine de cargar el catálogo de NEXOBRA e intentá de nuevo.');
 return;
 }
 resetApuCustomDraft();
 if (ST.apuCustomNombre) ST.apuCustomNombre.value = '';
 if (ST.apuCustomUnidad) ST.apuCustomUnidad.value = '';
 if (ST.apuCustomRubro) ST.apuCustomRubro.value = '';
 if (ST.apuCustomDesperdicio) ST.apuCustomDesperdicio.value = '0';
 if (ST.apuCustomHerramientas) ST.apuCustomHerramientas.value = '0';
 if (ST.apuCustomMaterialSearch) ST.apuCustomMaterialSearch.value = '';
 if (ST.apuCustomMaterialResults) ST.apuCustomMaterialResults.innerHTML = '';
 if (ST.apuCustomQuantity) ST.apuCustomQuantity.value = '1';
 populateApuCustomSelects();
 renderApuCustomDraftList();
 ST.apuCustomTaskModal.classList.add('open');
 ST.apuCustomTaskBackdrop.classList.add('open');
 document.body.style.overflow = 'hidden';
}

export function closeApuCustomTaskModal() {
 if (!ST.apuCustomTaskModal || !ST.apuCustomTaskBackdrop) return;
 ST.apuCustomTaskModal.classList.remove('open');
 ST.apuCustomTaskBackdrop.classList.remove('open');
 document.body.style.overflow = '';
}

export function confirmApuCustomTask() {
 const nombre = ST.apuCustomNombre ? ST.apuCustomNombre.value.trim() : '';
 const unidad = ST.apuCustomUnidad ? ST.apuCustomUnidad.value.trim() : '';
 if (!nombre || !unidad) {
 ST.showToast('Completá al menos el nombre y la unidad de la tarea.');
 return;
 }
 if (!apuCustomDraft || apuCustomDraft.components.length === 0) {
 ST.showToast('Agregá al menos un material, mano de obra o equipo.');
 return;
 }
 const quantity = ST.apuCustomQuantity ? (Math.max(0.01, parseFloat(ST.apuCustomQuantity.value) || 1)) : 1;

 const item = addCustomItemToBudget({
 nombre, unidad,
 rubro: ST.apuCustomRubro ? ST.apuCustomRubro.value.trim() : '',
 desperdicio_pct: ST.apuCustomDesperdicio ? parseFloat(ST.apuCustomDesperdicio.value) || 0 : 0,
 herramientas_pct_mo: ST.apuCustomHerramientas ? parseFloat(ST.apuCustomHerramientas.value) || 0 : 0,
 quantity,
 components: apuCustomDraft.components
 });

 closeApuCustomTaskModal();
 updateApuBudgetUI();
 ST.showToast(`+ Agregada tu tarea personalizada: ${item.task_nombre_snapshot}`);
}

export function startNewBudget() {
 clearBudget();
 ST.state.apuPhases = [];
 saveApuPhases();
 ST.apuBudgetMeta.currentId = null;
 ST.apuBudgetMeta.name = 'Mi presupuesto de obra';
 ST.apuBudgetMeta.obraNombre = '';
 ST.apuBudgetMeta.obraUbicacion = '';
 ST.apuBudgetMeta.obraComitente = '';
 ST.apuBudgetMeta.obraReferencia = '';
 ST.apuBudgetMeta.kFactor = null;
 ST.apuBudgetMeta.kGastosGenerales = null;
 ST.apuBudgetMeta.kBeneficio = null;
 ST.apuBudgetMeta.kIibb = null;
 ST.apuBudgetMeta.kIva = null;
 apuPurchasesCache = { budgetId: null, byKey: {} }; // un presupuesto nuevo todavía no tiene pedidos propios
}

export function updateApuBudgetNameUI() {
 if (ST.btnSaveApuBudgetLabel) ST.btnSaveApuBudgetLabel.textContent = ST.apuBudgetMeta.currentId ? 'Actualizar' : 'Guardar';
}

/** Igual que Apu.startNewBudget() pero además sincroniza los inputs de la vista y vuelve a pintar todo -- lo que llaman los botones "+ Nuevo presupuesto". */
export function newApuBudget() {
 startNewBudget();
 if (ST.apuBudgetName) ST.apuBudgetName.value = ST.apuBudgetMeta.name;
 if (ST.apuObraNombre) ST.apuObraNombre.value = '';
 if (ST.apuObraUbicacion) ST.apuObraUbicacion.value = '';
 if (ST.apuObraComitente) ST.apuObraComitente.value = '';
 if (ST.apuObraReferencia) ST.apuObraReferencia.value = '';
 renderApuKCoefficientsUI();
 document.getElementById('share-link-box-apu')?.remove();
 updateApuBudgetNameUI();
 updateApuBudgetUI();
 ST.showToast('Empezaste un presupuesto de obra nuevo.');
}

export function clearApuBudgetWithConfirm() {
 if (ST.state.apuBudgetItems.length === 0) return;
 if (confirm('¿Deseas vaciar todo tu presupuesto de obra?')) {
 clearBudget();
 updateApuBudgetUI();
 ST.showToast('Presupuesto de obra vaciado.');
 }
}

// =========================================================
// UI: buscador de tareas
// =========================================================

/** Vuelca searchTasks(query) en #apu-task-results, con un input de cantidad y un botón "+ Agregar" por fila. */
// =========================================================
// Carga de cantidad "por medidas" + dibujos esquemáticos orientativos (04/11).
// A pedido del usuario, siguiendo el patrón de las calculadoras de
// materiales ya establecidas (Omni Calculator, BuildingClub, Rendair --
// ver benchmarking en estado-proyecto.md): en vez de escribir directo "20
// m2", se puede cargar alto/largo (o largo/ancho/espesor, o largo ×
// cantidad de tramos) y la cantidad se calcula sola. Es un modo
// ALTERNATIVO: solo completa el input de cantidad de siempre, nunca lo
// reemplaza ni agrega la tarea por su cuenta -- el usuario sigue tocando
// "+ Agregar" como siempre.
// =========================================================

/** A qué modo de carga por medidas corresponde la unidad de una tarea, o null si no aplica (ej. "un", "bl", "kg": no tiene sentido calcular esas por medidas). No usa ST.normalizeText -- esa función borra "²"/"³" en vez de convertirlos a "2"/"3", y acá sí importa la diferencia entre m2 y ml. */
function geometryModeForUnidad(unidad) {
 const u = (unidad || '').toString().trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3');
 if (u === 'm2') return 'area';
 if (u === 'm3') return 'volumen';
 if (u === 'ml' || u === 'm') return 'tramos';
 return null;
}

// Plantillas de diagrama SVG reusables -- UNA por tipo de geometría, no una
// por cada tarea del catálogo (sería carísimo de producir y no hace falta:
// "pared", "piso" y "revoque" se calculan todas igual, por alto × largo).
// `uid` evita que dos diagramas abiertos a la vez compartan el mismo id de
// <marker> en el HTML. Colores con variables de tema (se ven bien en modo
// oscuro sin duplicar código, ver advertencia #10 del proyecto).
function renderApuDiagramSVG(mode, uid) {
 const arrowId = `apu-arrow-${uid}`;
 const defs = `<defs><marker id="${arrowId}" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="var(--brand-yellow)"/></marker></defs>`;
 if (mode === 'area') {
 return `
 <svg viewBox="0 0 200 120" style="width:100%; max-width:200px; display:block; margin:0 auto 6px;">
 ${defs}
 <rect x="42" y="22" width="120" height="78" fill="var(--border-light)" stroke="var(--text-main)" stroke-width="1.5"/>
 <rect x="70" y="68" width="22" height="32" fill="var(--bg-card)" stroke="var(--text-main)" stroke-width="1"/>
 <line x1="42" y1="12" x2="162" y2="12" stroke="var(--brand-yellow)" stroke-width="2" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
 <text x="102" y="8" text-anchor="middle" font-size="10" fill="var(--text-main)">Largo</text>
 <line x1="30" y1="22" x2="30" y2="100" stroke="var(--brand-yellow)" stroke-width="2" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
 <text x="30" y="61" text-anchor="middle" font-size="10" fill="var(--text-main)" transform="rotate(-90 20 61)">Alto</text>
 <text x="81" y="90" text-anchor="middle" font-size="8" fill="var(--text-muted)">vano</text>
 </svg>`;
 }
 if (mode === 'volumen') {
 return `
 <svg viewBox="0 0 200 120" style="width:100%; max-width:200px; display:block; margin:0 auto 6px;">
 ${defs}
 <polygon points="40,70 130,70 150,50 60,50" fill="var(--border-light)" stroke="var(--text-main)" stroke-width="1.5"/>
 <rect x="40" y="70" width="90" height="22" fill="var(--bg-card)" stroke="var(--text-main)" stroke-width="1.5"/>
 <polygon points="130,70 150,50 150,72 130,92" fill="var(--border-light)" stroke="var(--text-main)" stroke-width="1.5"/>
 <line x1="40" y1="100" x2="130" y2="100" stroke="var(--brand-yellow)" stroke-width="2" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
 <text x="85" y="112" text-anchor="middle" font-size="10" fill="var(--text-main)">Largo</text>
 <line x1="20" y1="50" x2="20" y2="92" stroke="var(--brand-yellow)" stroke-width="2" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
 <text x="20" y="71" text-anchor="middle" font-size="10" fill="var(--text-main)" transform="rotate(-90 10 71)">Ancho</text>
 <text x="142" y="64" text-anchor="middle" font-size="9" fill="var(--text-main)">Espesor</text>
 </svg>`;
 }
 // tramos
 return `
 <svg viewBox="0 0 200 70" style="width:100%; max-width:200px; display:block; margin:0 auto 6px;">
 ${defs}
 <line x1="20" y1="35" x2="180" y2="35" stroke="var(--text-main)" stroke-width="2"/>
 <line x1="20" y1="24" x2="180" y2="24" stroke="var(--brand-yellow)" stroke-width="2" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
 <text x="100" y="16" text-anchor="middle" font-size="10" fill="var(--text-main)">Largo de un tramo</text>
 <text x="100" y="52" text-anchor="middle" font-size="9" fill="var(--text-muted)">× cantidad de tramos iguales</text>
 </svg>`;
}

function renderApuDimensionPanelContent(taskId, mode) {
 const diagram = renderApuDiagramSVG(mode, taskId);
 let fields = '';
 if (mode === 'area') {
 fields = `
 <div class="apu-dim-fields">
 <label>Alto (m)<input type="number" id="apu-dim-alto-${taskId}" min="0" step="0.01" placeholder="2.60"></label>
 <label>Largo (m)<input type="number" id="apu-dim-largo-${taskId}" min="0" step="0.01" placeholder="4.00"></label>
 </div>
 <div class="apu-dim-fields">
 <label title="Se restan 1.89 m² por puerta (0.90 × 2.10)">Puertas a restar<input type="number" id="apu-dim-puertas-${taskId}" min="0" step="1" value="0"></label>
 <label title="Se restan 1.20 m² por ventana (1.20 × 1.00)">Ventanas a restar<input type="number" id="apu-dim-ventanas-${taskId}" min="0" step="1" value="0"></label>
 </div>`;
 } else if (mode === 'volumen') {
 fields = `
 <div class="apu-dim-fields">
 <label>Largo (m)<input type="number" id="apu-dim-largo-${taskId}" min="0" step="0.01"></label>
 <label>Ancho (m)<input type="number" id="apu-dim-ancho-${taskId}" min="0" step="0.01"></label>
 <label>Espesor (cm)<input type="number" id="apu-dim-espesor-${taskId}" min="0" step="0.5"></label>
 </div>`;
 } else {
 fields = `
 <div class="apu-dim-fields">
 <label>Largo de un tramo (m)<input type="number" id="apu-dim-largo-${taskId}" min="0" step="0.01"></label>
 <label>Cantidad de tramos iguales<input type="number" id="apu-dim-cant-${taskId}" min="1" step="1" value="1"></label>
 </div>`;
 }
 return `
 <div class="apu-dim-panel-body">
 ${diagram}
 ${fields}
 <button class="btn-computo" type="button" onclick="window.nexoBraApp.applyApuDimensions(${taskId}, '${mode}')">Calcular y completar cantidad</button>
 </div>`;
}

export function toggleApuDimensionPanel(taskId, mode) {
 const panel = document.getElementById(`apu-dim-panel-${taskId}`);
 if (!panel) return;
 const open = panel.style.display === 'block';
 if (open) { panel.style.display = 'none'; return; }
 if (!panel.innerHTML.trim()) panel.innerHTML = renderApuDimensionPanelContent(taskId, mode);
 panel.style.display = 'block';
}

export function applyApuDimensions(taskId, mode) {
 const val = (id) => parseFloat(document.getElementById(id)?.value) || 0;
 let cantidad = 0;
 if (mode === 'area') {
 const alto = val(`apu-dim-alto-${taskId}`);
 const largo = val(`apu-dim-largo-${taskId}`);
 const puertas = val(`apu-dim-puertas-${taskId}`);
 const ventanas = val(`apu-dim-ventanas-${taskId}`);
 cantidad = Math.max(0, alto * largo - puertas * 1.89 - ventanas * 1.20);
 } else if (mode === 'volumen') {
 const largo = val(`apu-dim-largo-${taskId}`);
 const ancho = val(`apu-dim-ancho-${taskId}`);
 const espesorCm = val(`apu-dim-espesor-${taskId}`);
 cantidad = largo * ancho * (espesorCm / 100);
 } else {
 const largo = val(`apu-dim-largo-${taskId}`);
 const cant = Math.max(1, val(`apu-dim-cant-${taskId}`) || 1);
 cantidad = largo * cant;
 }
 if (cantidad <= 0) { ST.showToast('Completá las medidas para calcular la cantidad.'); return; }
 const qtyInput = document.getElementById(`apu-task-qty-${taskId}`);
 if (qtyInput) qtyInput.value = cantidad.toFixed(2);
 ST.showToast(`Cantidad calculada: ${cantidad.toFixed(2)}`);
 toggleApuDimensionPanel(taskId, mode);
}

/** Contenido del panel de "agregar esta tarea puntual" -- descripción + cantidad + (si aplica) el toggle de medidas con su diagrama, todo junto, para que solo se vea cuando el usuario elige agregar ESA tarea, no para las 40 tareas de la lista a la vez (pedido del usuario: "son demasiadas cosas en una pantalla"). */
function renderApuAddPanelContent(t, modo) {
 return `
 <div class="apu-add-panel-body">
 ${t.descripcion ? `<p style="margin:0 0 8px; font-size:0.82rem; color:var(--text-muted);">${ST.escapeHtml(t.descripcion)}</p>` : ''}
 <div class="apu-task-row-add" style="margin-bottom:8px;">
 <label style="font-size:0.78rem; color:var(--text-muted);">Cantidad (${ST.escapeHtml(t.unidad)})</label>
 <input type="number" id="apu-task-qty-${t.id}" value="1" min="0.01" step="0.01">
 </div>
 ${modo ? `<button type="button" class="apu-dim-toggle" onclick="window.nexoBraApp.toggleApuDimensionPanel(${t.id}, '${modo}')">Calcular por medidas</button>
 <div id="apu-dim-panel-${t.id}" class="apu-dim-panel" style="display:none;"></div>` : ''}
 <button class="btn-computo" style="margin-top:8px;" onclick="window.nexoBraApp.addApuTaskToBudget(${t.id})">Agregar al presupuesto</button>
 </div>`;
}

/** Abre/cierra el panel de agregar para UNA tarea puntual de la lista de resultados -- cierra cualquier otro que haya quedado abierto, para no volver a amontonar todo en una sola pantalla. */
export function toggleApuAddPanel(taskId) {
 const panel = document.getElementById(`apu-add-panel-${taskId}`);
 if (!panel) return;
 const open = panel.style.display === 'block';
 if (ST.apuTaskResults) {
 ST.apuTaskResults.querySelectorAll('[id^="apu-add-panel-"]').forEach(p => { if (p !== panel) p.style.display = 'none'; });
 }
 if (open) { panel.style.display = 'none'; return; }
 const t = getTask(taskId);
 if (!t) return;
 const modo = geometryModeForUnidad(t.unidad);
 panel.innerHTML = renderApuAddPanelContent(t, modo);
 panel.style.display = 'block';
}

/** Lista de resultados de búsqueda -- compacta a propósito (solo nombre + unidad + "Agregar"): la descripción, la cantidad y el cálculo por medidas quedan en el panel de toggleApuAddPanel, que se abre solo para la tarea puntual que se va a agregar (pedido del usuario, 04/11). No se muestra NADA hasta que el usuario busque por texto o elija un rubro -- mostrar las 80 tareas del catálogo de entrada es justo lo que se pidió sacar (pedido del usuario, 05/11: "no aparezca hasta que el usuario seleccione un rubro o escriba lo que anda buscando"). */
export function renderTaskResults(query) {
 if (!ST.apuTaskResults) return;
 if (!ST.apuCatalogState.loaded) {
 ST.apuTaskResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Cargando catálogo de tareas...</p>';
 return;
 }
 const rubro = ST.apuTaskRubroFilter ? ST.apuTaskRubroFilter.value : '';
 if ((!query || !query.trim()) && !rubro) {
 ST.apuTaskResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Escribí el nombre de una tarea o elegí un rubro para buscar.</p>';
 return;
 }
 const tasks = searchTasks(query, rubro);
 if (tasks.length === 0) {
 ST.apuTaskResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Ninguna tarea coincide con esa búsqueda.</p>';
 return;
 }
 // Tope de 40 resultados -- es un buscador, no un listado completo (mismo
 // criterio que otros buscadores del sitio con catálogos grandes).
 ST.apuTaskResults.innerHTML = tasks.slice(0, 40).map(t => `
 <div>
 <div class="apu-task-row">
 <div class="apu-task-row-info">
 <strong>${ST.escapeHtml(t.nombre)}</strong>
 <span>${ST.escapeHtml(t.rubro || 'Sin rubro')} · unidad: ${ST.escapeHtml(t.unidad)}</span>
 </div>
 <div class="apu-task-row-add">
 <button class="btn-computo" onclick="window.nexoBraApp.toggleApuAddPanel(${t.id})">+ Agregar</button>
 </div>
 </div>
 <div id="apu-add-panel-${t.id}" class="apu-dim-panel" style="display:none;"></div>
 </div>
 `).join('');
}

export function addApuTaskToBudget(apuTaskId) {
 const qtyInput = document.getElementById(`apu-task-qty-${apuTaskId}`);
 const qty = qtyInput ? Math.max(0.01, parseFloat(qtyInput.value) || 1) : 1;
 const item = addItemToBudget(apuTaskId, qty);
 updateApuBudgetUI();
 const panel = document.getElementById(`apu-add-panel-${apuTaskId}`);
 if (panel) panel.style.display = 'none';
 ST.showToast(`+ Agregado: ${item.task_nombre_snapshot}`);
}

// =========================================================
// UI: presupuesto en curso (items + componentes + totales)
// =========================================================

/** Recalcula todo el presupuesto en curso y vuelve a pintar items, consolidado y totales. Es el punto de entrada único después de cualquier cambio (cantidad, rendimiento, material, factor K, agregar/quitar tarea). */
export function updateApuBudgetUI() {
 if (!ST.apuBudgetItemsEl) return;

 const breakdown = calcBudgetBreakdown(ST.state.apuBudgetItems, { kFactor: ST.apuBudgetMeta.kFactor });
 renderBudgetItems(breakdown);
 renderConsolidated(breakdown);
 renderApuPhasesPanel();
 renderApuMaterialesPorFase(breakdown);

 const hasItems = ST.state.apuBudgetItems.length > 0;
 if (ST.apuBudgetEmpty) ST.apuBudgetEmpty.style.display = hasItems ? 'none' : 'block';
 if (ST.apuBudgetFooter) ST.apuBudgetFooter.style.display = hasItems ? 'block' : 'none';
 if (ST.apuConsolidatedSection) ST.apuConsolidatedSection.style.display = hasItems ? 'block' : 'none';
 // La sección "Materiales por fase" solo tiene sentido si el usuario ya
 // creó al menos una fase -- si no, sería una copia exacta de la tabla
 // consolidada de arriba (todo cae en "Sin fase asignada").
 if (ST.apuMaterialesPorFaseSection) ST.apuMaterialesPorFaseSection.style.display = (hasItems && ST.state.apuPhases.length > 0) ? 'block' : 'none';

 const totalMateriales = breakdown.perItem.reduce((s, b) => s + b.materialesCost, 0);
 const totalManoObra = breakdown.perItem.reduce((s, b) => s + b.manoObraCost, 0);
 const totalEquipos = breakdown.perItem.reduce((s, b) => s + b.equiposCost, 0);
 if (ST.apuTotalMateriales) ST.apuTotalMateriales.textContent = ST.formatMoney(totalMateriales);
 if (ST.apuTotalManoObra) ST.apuTotalManoObra.textContent = ST.formatMoney(totalManoObra);
 if (ST.apuTotalEquipos) ST.apuTotalEquipos.textContent = ST.formatMoney(totalEquipos);
 if (ST.apuTotalGeneral) ST.apuTotalGeneral.textContent = ST.formatMoney(breakdown.total);

 return breakdown;
}

function renderMaterialVariantSelect(item, l) {
 const variants = getMaterialVariants(l.material_id);
 if (variants.length <= 1) return ST.escapeHtml(l.denomination_snapshot);
 return `
 <select class="apu-material-select" onchange="window.nexoBraApp.changeApuComponentMaterial('${item.localId}', '${l.localId}', this.value)">
 ${variants.map(v => `<option value="${ST.escapeHtml(v.id)}" ${v.id === l.material_id ? 'selected' : ''}>${ST.escapeHtml(v.denominacion)}</option>`).join('')}
 </select>
 `;
}

/** Controles de "Precio de referencia NEXOBRA (el más actualizado) / Elegir proveedor" para un componente de tipo material -- ver openApuMaterialProviderPicker más abajo. No aplica a mano de obra ni equipos (esos solo tienen tarifa de referencia fija). */
function renderMaterialProviderControls(item, l) {
 if (l.tipo !== 'material') return '';
 if (l.isProviderSourced) {
 const nombreProveedor = [l.provider_business_name, l.provider_branch_name].filter(Boolean).join(' - ');
 return `
 <br><span class="cart-badge-provider"> ${ST.escapeHtml(nombreProveedor || 'Proveedor')}</span>
 <br><button class="apu-badge-reset" onclick="window.nexoBraApp.openApuMaterialProviderPicker('${item.localId}','${l.localId}')">Cambiar proveedor</button>
 <button class="apu-badge-reset" onclick="window.nexoBraApp.clearApuMaterialProviderOffer('${item.localId}','${l.localId}')">Usar precio de referencia</button>
 `;
 }
 return `
 <br><span style="font-size:0.68rem; color:var(--text-muted);">Precio de referencia NEXOBRA (el más actualizado)</span>
 <br><button class="apu-badge-reset" onclick="window.nexoBraApp.openApuMaterialProviderPicker('${item.localId}','${l.localId}')">Elegir un proveedor</button>
 `;
}

/** Un bloque del desglose de un ítem (Materiales / Equipos-Herramientas / Mano de obra) -- subtítulo + filas + subtotal, a pedido del usuario (05/11, referencia: planilla HIDEAR, que separa el análisis de precios de cada tarea en esos 3 bloques). `herramientas` solo se pasa para el bloque de Equipos: es la línea "virtual" de Herramientas Manuales (nunca se guarda como componente, ver calcHerramientasManuales) y siempre se muestra ahí, aunque no haya otros equipos cargados en la tarea. Los bloques de Materiales/Mano de obra sin ninguna línea cargada no se muestran (nada que agrupar). */
function renderApuComponentSection(titulo, lineas, subtotal, item, herramientas = null) {
 if (lineas.length === 0 && !herramientas) return '';
 const herramientasRow = herramientas ? `
 <tr class="apu-component-virtual">
 <td> ${ST.escapeHtml(herramientas.descripcion_snapshot)}</td>
 <td>-</td>
 <td>${herramientas.cantidadNecesaria.toFixed(3)} ${ST.escapeHtml(herramientas.unidad_snapshot)}</td>
 <td>${herramientas.disponible ? ST.formatMoney(herramientas.unitPriceConK) : '<span style="color:#b91c1c;">s/d</span>'}</td>
 <td style="text-align:right;">${ST.formatMoney(herramientas.costo)}</td>
 <td></td>
 </tr>` : '';
 return `
 <tr class="apu-component-section-title"><td colspan="6">${titulo}</td></tr>
 ${lineas.map(l => renderComponentRow(item, l)).join('')}
 ${herramientasRow}
 <tr class="apu-component-section-subtotal"><td colspan="4">Subtotal ${titulo}</td><td style="text-align:right;">${ST.formatMoney(subtotal)}</td><td></td></tr>
 `;
}

function renderComponentRow(item, l) {
 const tipoIcon = l.tipo === 'material' ? '' : (l.tipo === 'mano_obra' ? '' : '');
 const descripcion = l.tipo === 'material' ? renderMaterialVariantSelect(item, l) : ST.escapeHtml(l.denomination_snapshot);
 return `
 <tr>
 <td>
 ${tipoIcon} ${descripcion}
 ${renderMaterialProviderControls(item, l)}
 </td>
 <td>
 <input class="apu-rendimiento-input" type="number" step="0.0001" value="${l.rendimiento}"
 onchange="window.nexoBraApp.updateApuComponentRendimiento('${item.localId}', '${l.localId}', parseFloat(this.value) || 0)">
 ${l.is_rendimiento_modificado
 ? `<span class="apu-badge-modificado" title="Referencia NEXOBRA: ${l.rendimiento_referencia}">modificado</span><button class="apu-badge-reset" title="Volver al rendimiento de referencia" onclick="window.nexoBraApp.resetApuComponentRendimiento('${item.localId}', '${l.localId}')">↺</button>`
 : ''}
 </td>
 <td>${l.cantidadNecesaria.toFixed(3)} ${ST.escapeHtml(l.unidad_snapshot)}</td>
 <td>${l.disponible ? ST.formatMoney(l.unitPriceConK) : '<span style="color:#b91c1c;">s/d</span>'}</td>
 <td style="text-align:right;">${ST.formatMoney(l.costo)}</td>
 <td><button class="apu-item-remove" title="Quitar este componente" onclick="window.nexoBraApp.removeApuItemComponent('${item.localId}', '${l.localId}')">&times;</button></td>
 </tr>
 `;
}

/** Llena los <select> de mano de obra/equipo de la sección "Agregar material / mano de obra / equipo" de UN ítem puntual ya agregado al presupuesto -- se llama por cada tarjeta después de pintar renderBudgetItems, porque esos <select> se recrean de cero en cada repintado. */
function populateApuItemComponentSelects(itemLocalId) {
 const laborSelect = document.getElementById(`apu-item-labor-select-${itemLocalId}`);
 const equipmentSelect = document.getElementById(`apu-item-equipment-select-${itemLocalId}`);
 if (laborSelect) {
 laborSelect.innerHTML = (ST.apuCatalogState.laborRates || [])
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
 if (equipmentSelect) {
 equipmentSelect.innerHTML = (ST.apuCatalogState.equipmentRates || [])
 .filter(r => r.id !== ST.apuCatalogState.herramientasRateId)
 .map(r => `<option value="${r.id}">${ST.escapeHtml(r.nombre)}</option>`).join('');
 }
}

// Qué ítems están "desplegados" (mostrando el desglose completo de
// materiales/mano de obra/equipos) -- por default todos arrancan plegados,
// a pedido del usuario ("sino queda interminable esa pantalla"). Vive en
// memoria nomás (no se persiste): cada vez que se abre/reabre un presupuesto
// arranca con todo plegado de nuevo.
let expandedItemIds = new Set();

/** Pliega/despliega el desglose de un ítem puntual del presupuesto (no aplica a 'material_directo', que nunca tiene desglose). */
export function toggleApuItemExpanded(itemLocalId) {
 if (expandedItemIds.has(itemLocalId)) expandedItemIds.delete(itemLocalId);
 else expandedItemIds.add(itemLocalId);
 updateApuBudgetUI();
}

/** Fila resumen simple para un ítem de material suelto (sin tarea/APU) -- numeración, nombre, cantidad+unidad, precio unitario y subtotal nomás, sin tabla de componentes (el único componente ES el material). */
function renderMaterialDirectoCard(item, nro, lineas, total) {
 const l = lineas[0];
 const unitPrice = l ? l.unitPriceConK : 0;
 const disponible = l ? l.disponible : false;
 return `
 <div class="apu-item-card apu-item-card-simple">
 <div class="apu-item-header">
 <div class="apu-item-header-info">
 <span class="apu-item-nro">${nro}</span>
 <strong> ${ST.escapeHtml(item.task_nombre_snapshot)}</strong>
 <span>Material suelto (sin APU) · precio unit: ${disponible ? ST.formatMoney(unitPrice) : '<span style="color:#b91c1c;">s/d</span>'} · subtotal: ${ST.formatMoney(total)}</span>
 </div>
 <div class="apu-item-header-actions">
 <input type="number" value="${item.quantity}" min="0.0001" step="0.01"
 onchange="window.nexoBraApp.updateApuItemQuantity('${item.localId}', parseFloat(this.value) || 0.0001)">
 <span style="font-size:0.78rem; color:var(--text-muted);">${ST.escapeHtml(item.task_unidad_snapshot)}</span>
 <button class="apu-item-remove" title="Quitar material" onclick="window.nexoBraApp.removeApuBudgetItem('${item.localId}')">&times;</button>
 </div>
 </div>
 </div>`;
}

/** Pinta cada tarea del presupuesto. Fila resumen (número, nombre, cantidad, unidad, precio unitario, subtotal) colapsada por default -- el desglose completo de materiales/mano de obra/equipos de una tarea de APU o personalizada se ve solo al desplegarla (toggleApuItemExpanded). Un ítem de material suelto nunca tiene desglose: es, de por sí, una sola fila. */
/** Select de "Fase" de la cabecera de un item -- arma las <option> a partir de ST.state.apuPhases (más "Sin fase" primero). Sin ninguna fase creada todavía, no se muestra nada (nada para elegir). */
function renderApuItemPhaseSelect(item) {
 if (ST.state.apuPhases.length === 0) return '';
 return `
 <select class="form-select apu-item-phase-select" title="Fase de obra" onchange="window.nexoBraApp.setApuItemPhase('${item.localId}', this.value)">
 <option value="">Sin fase</option>
 ${ST.state.apuPhases.map(p => `<option value="${p.localId}" ${item.phase_id === p.localId ? 'selected' : ''}>${ST.escapeHtml(p.nombre)}</option>`).join('')}
 </select>`;
}

/** Tarjeta de UNA tarea del presupuesto (número, resumen, desglose plegable) -- separado de renderBudgetItems (05/11) para poder agrupar las tarjetas por rubro sin duplicar este template. */
function renderApuItemCard({ item, lineas, herramientas, materialesCost, manoObraCost, equiposCost, total }, nro) {
 if (item.item_kind === 'material_directo') {
 return renderMaterialDirectoCard(item, nro, lineas, total);
 }
 // La descripción no se guarda como snapshot en el item (no cambia el
 // cálculo, es solo informativa) -- se busca en vivo en el catálogo por
 // apu_task_id. Si la tarea es personalizada o ya no existe en el
 // catálogo, simplemente no se muestra nada.
 const catalogTask = item.apu_task_id ? getTask(item.apu_task_id) : null;
 const expanded = expandedItemIds.has(item.localId);
 const unitPrice = item.quantity > 0 ? total / item.quantity : 0;
 // Mano de obra "por unidad de medida" -- a pedido del usuario (05/11,
 // referencia: planilla HIDEAR, columnas M.O./MAT./P.U. por ítem): acá
 // además se divide por la cantidad del ítem porque fue lo que pidió
 // explícito ("cuanto de mano de obra por unidad de medida"), a
 // diferencia de materiales/equipos que se muestran en total como en
 // esa planilla.
 const manoObraUnit = item.quantity > 0 ? manoObraCost / item.quantity : 0;
 return `
 <div class="apu-item-card">
 <div class="apu-item-header">
 <div class="apu-item-header-info">
 <span class="apu-item-nro">${nro}</span>
 <strong>${ST.escapeHtml(item.task_nombre_snapshot)}</strong>
 <span>${ST.escapeHtml(item.task_rubro_snapshot || 'Sin rubro')} · cant: ${item.quantity} ${ST.escapeHtml(item.task_unidad_snapshot)} · precio unit: ${ST.formatMoney(unitPrice)} · subtotal: ${ST.formatMoney(total)}${item.item_kind === 'custom' ? ' · <span class="apu-badge-modificado">personalizada</span>' : ''}</span>
 <span style="display:block; margin-top:2px; font-size:0.78rem; color:var(--text-muted);">materiales: ${ST.formatMoney(materialesCost)} · mano de obra: ${ST.formatMoney(manoObraCost)} (${ST.formatMoney(manoObraUnit)}/${ST.escapeHtml(item.task_unidad_snapshot)}) · equipos/herramientas: ${ST.formatMoney(equiposCost)}</span>
 ${catalogTask && catalogTask.descripcion ? `<span style="display:block; margin-top:4px; white-space:pre-line;"><strong>Incluye:</strong> ${ST.escapeHtml(catalogTask.descripcion)}</span>` : ''}
 </div>
 <div class="apu-item-header-actions">
 <button class="apu-dim-toggle" onclick="window.nexoBraApp.toggleApuItemExpanded('${item.localId}')">${expanded ? '▾ Ocultar detalle' : '▸ Ver detalle'}</button>
 ${renderApuItemPhaseSelect(item)}
 <input type="number" value="${item.quantity}" min="0.01" step="0.01"
 onchange="window.nexoBraApp.updateApuItemQuantity('${item.localId}', parseFloat(this.value) || 0.01)">
 <span style="font-size:0.78rem; color:var(--text-muted);">${ST.escapeHtml(item.task_unidad_snapshot)}</span>
 <button class="btn-computo" style="padding:6px 10px; font-size:0.76rem;" onclick="window.nexoBraApp.exportApuItem('${item.localId}')">Excel</button>
 <button class="apu-item-remove" title="Quitar tarea" onclick="window.nexoBraApp.removeApuBudgetItem('${item.localId}')">&times;</button>
 </div>
 </div>
 ${expanded ? `
 <div class="apu-item-body">
 <table class="apu-component-table">
 <thead><tr><th>Componente</th><th>Rendimiento</th><th>Cant. necesaria</th><th>Precio unit.</th><th style="text-align:right;">Costo</th><th></th></tr></thead>
 <tbody>
 ${renderApuComponentSection('Materiales', lineas.filter(l => l.tipo === 'material'), materialesCost, item)}
 ${renderApuComponentSection('Equipos / Herramientas', lineas.filter(l => l.tipo === 'equipo'), equiposCost, item, herramientas)}
 ${renderApuComponentSection('Mano de obra', lineas.filter(l => l.tipo === 'mano_obra'), manoObraCost, item)}
 </tbody>
 </table>
 <details style="margin-top:10px;">
 <summary style="cursor:pointer; font-size:0.8rem; font-weight:700; color:var(--text-muted);">+ Agregar material / mano de obra / equipo a esta tarea</summary>
 <div style="margin-top:8px;">
 <input type="text" id="apu-item-material-search-${item.localId}" class="form-select" placeholder="Buscar material por nombre..." oninput="window.nexoBraApp.renderApuItemMaterialResults('${item.localId}', this.value)">
 <div id="apu-item-material-results-${item.localId}" class="apu-task-results" style="margin-top:6px;"></div>
 <div class="apu-task-row" style="margin-top:8px;">
 <div class="apu-task-row-info" style="flex:1;">
 <select id="apu-item-labor-select-${item.localId}" class="form-select"></select>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="apu-item-labor-rend-${item.localId}" value="1" min="0.0001" step="0.0001" title="Horas por unidad de tarea">
 <button class="btn-computo" onclick="window.nexoBraApp.addApuItemLaborComponentUI('${item.localId}')">+ Mano de obra</button>
 </div>
 </div>
 <div class="apu-task-row" style="margin-top:8px;">
 <div class="apu-task-row-info" style="flex:1;">
 <select id="apu-item-equipment-select-${item.localId}" class="form-select"></select>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="apu-item-equipment-rend-${item.localId}" value="1" min="0.0001" step="0.0001" title="Horas por unidad de tarea">
 <button class="btn-computo" onclick="window.nexoBraApp.addApuItemEquipmentComponentUI('${item.localId}')">+ Equipo</button>
 </div>
 </div>
 </div>
 </details>
 </div>` : ''}
 </div>
 `;
}

// Qué grupos de rubro están desplegados -- plegados por default, mismo
// criterio que expandedItemIds (05/11, a pedido del usuario: agrupar
// visualmente por rubro, en secciones plegables).
let expandedRubroGroups = new Set();

export function toggleApuRubroGroup(rubroKey) {
 if (expandedRubroGroups.has(rubroKey)) expandedRubroGroups.delete(rubroKey);
 else expandedRubroGroups.add(rubroKey);
 updateApuBudgetUI();
}

export function renderBudgetItems(breakdown) {
 if (!ST.apuBudgetItemsEl) return;

 // Agrupado visual por rubro (05/11, a pedido del usuario) -- la
 // numeración (nro) sigue siendo correlativa a todo el presupuesto, no se
 // reinicia por rubro, para no romper la referencia de "tarea 7" entre la
 // lista y el Excel exportado. El orden de los GRUPOS es el de primera
 // aparición de cada rubro en el presupuesto (no alfabético) para no
 // reordenar la obra a espaldas del usuario.
 const grupos = new Map();
 breakdown.perItem.forEach((entry, idx) => {
 const key = entry.item.task_rubro_snapshot || 'Sin rubro';
 if (!grupos.has(key)) grupos.set(key, []);
 grupos.get(key).push({ entry, nro: idx + 1 });
 });

 ST.apuBudgetItemsEl.innerHTML = Array.from(grupos.entries()).map(([rubro, entries]) => {
 const subtotal = entries.reduce((s, { entry }) => s + entry.total, 0);
 const rubroKey = ST.escAttr(rubro);
 const expanded = expandedRubroGroups.has(rubro);
 return `
 <div class="apu-rubro-group">
 <button type="button" class="apu-rubro-group-header" onclick="window.nexoBraApp.toggleApuRubroGroup('${rubroKey}')">
 <span>${expanded ? '▾' : '▸'} ${ST.escapeHtml(rubro)}</span>
 <span class="apu-rubro-group-meta">${entries.length} tarea${entries.length === 1 ? '' : 's'} · ${ST.formatMoney(subtotal)}</span>
 </button>
 ${expanded ? `<div class="apu-rubro-group-body">${entries.map(({ entry, nro }) => renderApuItemCard(entry, nro)).join('')}</div>` : ''}
 </div>`;
 }).join('');

 breakdown.perItem.forEach(({ item }) => {
 if (expandedItemIds.has(item.localId)) populateApuItemComponentSelects(item.localId);
 });
}

/** Lista de materiales consolidada (todas las tareas sumadas por material) -- tabla + export viven en la misma vista. */
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Celda "Pedido" de la lista consolidada: estado (ya pedido / pendiente) + un <details> con el historial y el form para registrar uno nuevo. Sin presupuesto guardado todavía (sin budget_id) no se puede registrar nada -- se avisa en vez de mostrar el form. */
function renderApuPurchaseCell(m) {
 if (!ST.apuBudgetMeta.currentId) {
 return `<span style="color:var(--text-muted); font-size:0.75rem;">Guardá el presupuesto para registrar pedidos</span>`;
 }
 const safe = purchaseKeySafe(m.key);
 const info = getApuPurchaseInfo(m.key);
 const pendiente = m.cantidadAPedir - info.total;
 const estadoColor = pendiente <= 0 && info.total > 0 ? 'var(--color-success)' : 'var(--text-muted)';
 const estadoTexto = info.total === 0
 ? 'Sin pedidos todavía'
 : (pendiente <= 0 ? `Pedido completo (${info.total} ${ST.escapeHtml(m.unidadCompra)})` : `Pedido: ${info.total} · Pendiente: ${pendiente.toFixed(2)} ${ST.escapeHtml(m.unidadCompra)}`);
 const historial = info.rows.length === 0 ? '' : `
 <div style="margin:8px 0; max-height:120px; overflow-y:auto;">
 ${info.rows.map(r => `
 <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.75rem; padding:3px 0; border-bottom:1px solid var(--border-color);">
 <span>${ST.escapeHtml(r.fecha)} · ${r.cantidad} ${ST.escapeHtml(r.unidad_compra_snapshot)}${r.nota ? ' · ' + ST.escapeHtml(r.nota) : ''}</span>
 <button class="apu-item-remove" title="Eliminar este registro" onclick="window.nexoBraApp.deleteApuPurchase('${r.id}')">&times;</button>
 </div>
 `).join('')}
 </div>
 `;
 return `
 <details class="apu-purchase-details">
 <summary style="color:${estadoColor}; font-size:0.78rem; cursor:pointer;">${estadoTexto}</summary>
 ${historial}
 <div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap;">
 <input type="number" id="apu-purchase-qty-${safe}" placeholder="Cantidad" min="0.01" step="0.01" style="width:80px;">
 <input type="date" id="apu-purchase-date-${safe}" value="${todayISO()}" style="width:120px;">
 <input type="text" id="apu-purchase-note-${safe}" placeholder="Nota (opcional)" style="flex:1; min-width:100px;">
 <button class="btn-computo" onclick="window.nexoBraApp.registerApuPurchase('${ST.escAttr(m.key)}')">+ Registrar pedido</button>
 </div>
 </details>
 `;
}

export function renderConsolidated(breakdown) {
 if (!ST.apuConsolidatedBody) return;
 if (breakdown.materialesConsolidados.length === 0) {
 ST.apuConsolidatedBody.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted);">Todavía no hay materiales.</td></tr>`;
 return;
 }
 ST.apuConsolidatedBody.innerHTML = breakdown.materialesConsolidados.map(m => `
 <tr>
 <td>${ST.escapeHtml(m.denominacion)}</td>
 <td>${m.cantidad.toFixed(2)} ${ST.escapeHtml(m.unidad)}</td>
 <td><strong>${m.cantidadAPedir}</strong> × ${ST.escapeHtml(m.unidadCompra)}</td>
 <td>${renderApuPurchaseCell(m)}</td>
 <td style="text-align:right;">${ST.formatMoney(m.costo)}</td>
 </tr>
 `).join('');
}

/** Lista de materiales agrupada por fase de obra (#apu-materiales-por-fase-body, 05/11) -- un mini-bloque por fase (más "Sin fase" si hay items sin asignar) con su propia tabla de materiales a pedir. Sin lectura/escritura de pedidos acá (eso sigue siendo solo en la tabla consolidada de arriba, para no duplicar ese estado en dos lugares) -- es una vista de referencia para ir a pedir la lista de esa etapa puntual. */
export function renderApuMaterialesPorFase(breakdown) {
 if (!ST.apuMaterialesPorFaseBody) return;
 const grupos = breakdown.materialesPorFase.filter(g => g.materiales.length > 0);
 if (grupos.length === 0) {
 ST.apuMaterialesPorFaseBody.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">Todavía no hay materiales para agrupar por fase.</p>';
 return;
 }
 // Orden: fases en el mismo orden que ST.state.apuPhases, "Sin fase" al final.
 const orderIndex = (phaseId) => {
 if (!phaseId) return Number.MAX_SAFE_INTEGER;
 const idx = ST.state.apuPhases.findIndex(p => p.localId === phaseId);
 return idx === -1 ? Number.MAX_SAFE_INTEGER - 1 : idx;
 };
 const ordenados = grupos.slice().sort((a, b) => orderIndex(a.phaseId) - orderIndex(b.phaseId));
 ST.apuMaterialesPorFaseBody.innerHTML = ordenados.map(g => `
 <div class="apu-fase-materiales-block">
 <h4>${g.phaseId ? ST.escapeHtml(getApuPhaseName(g.phaseId)) : 'Sin fase asignada'} <span style="font-weight:400; color:var(--text-muted); font-size:0.78rem;">· subtotal: ${ST.formatMoney(g.total)}</span></h4>
 <div class="table-view-container">
 <table class="materials-table">
 <thead><tr><th>Material</th><th>Cantidad neta</th><th>A pedir</th><th style="text-align:right;">Costo</th></tr></thead>
 <tbody>
 ${g.materiales.map(m => `
 <tr>
 <td>${ST.escapeHtml(m.denominacion)}</td>
 <td>${m.cantidad.toFixed(2)} ${ST.escapeHtml(m.unidad)}</td>
 <td><strong>${m.cantidadAPedir}</strong> × ${ST.escapeHtml(m.unidadCompra)}</td>
 <td style="text-align:right;">${ST.formatMoney(m.costo)}</td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 </div>
 </div>
 `).join('');
}

// =========================================================
// Handlers de edición (wrappean las funciones del motor + re-pintan)
// =========================================================

export function updateApuItemQuantity(itemLocalId, qty) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 item.quantity = Math.max(0.01, Number(qty) || 0.01);
 saveApuCart();
 updateApuBudgetUI();
}

export function updateApuComponentRendimiento(itemLocalId, componentLocalId, value) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 setComponentRendimiento(item, componentLocalId, value);
 saveApuCart();
 updateApuBudgetUI();
}

export function resetApuComponentRendimiento(itemLocalId, componentLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 resetComponentRendimiento(item, componentLocalId);
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast('Rendimiento vuelto a la referencia NEXOBRA.');
}

export function changeApuComponentMaterial(itemLocalId, componentLocalId, materialId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 setComponentMaterial(item, componentLocalId, materialId);
 saveApuCart();
 updateApuBudgetUI();
}

export function removeApuBudgetItem(itemLocalId) {
 removeItemFromBudget(itemLocalId);
 updateApuBudgetUI();
}

/**
 * Calcula el Factor K de resumen tal como la planilla de referencia del
 * usuario (Precios.xlsx, hoja "Índices"):
 * Subtotal 1 = 1 + Gastos Generales (%)
 * Subtotal 2 = Subtotal 1 × (1 + Beneficio %)
 * K = redondear(Subtotal 2 × (1 + IVA %) + Ingresos Brutos/IIBB (%), 3)
 * Devuelve null si falta alguno de los 4 coeficientes -- no se adivina
 * ningún valor por defecto, costo puro hasta que estén los 4 cargados.
 * Pedido del usuario, 05/11: "que el usuario pueda poner sus coeficientes y
 * nosotros le calculamos ese valor k, tal como hace el excel que te pasé".
 */
export function computeKFactor({ gastosGenerales, beneficio, iibb, iva } = {}) {
 const raw = [gastosGenerales, beneficio, iibb, iva];
 if (raw.some(v => v === null || v === undefined || v === '')) return null;
 const [gg, b, ii, iv] = raw.map(Number);
 if (![gg, b, ii, iv].every(n =>Number.isFinite(n) && n >= 0)) return null;
 const subtotal1 = 1 + gg / 100;
 const subtotal2 = subtotal1 * (1 + b / 100);
 const k = subtotal2 * (1 + iv / 100) + ii / 100;
 return Math.round(k * 1000) / 1000;
}

/** Lee los 4 inputs de coeficientes, recalcula el Factor K (computeKFactor) y lo refleja tanto en ST.apuBudgetMeta.kFactor (lo que usa todo el motor de cálculo, sin cambios) como en el campo de solo lectura "Factor K calculado". */
export function updateApuKCoefficients() {
 const read = (el) => (el && el.value !== '' ? Number(el.value) : null);
 ST.apuBudgetMeta.kGastosGenerales = read(ST.apuKGastosGenerales);
 ST.apuBudgetMeta.kBeneficio = read(ST.apuKBeneficio);
 ST.apuBudgetMeta.kIibb = read(ST.apuKIibb);
 ST.apuBudgetMeta.kIva = read(ST.apuKIva);

 const k = computeKFactor({
 gastosGenerales: ST.apuBudgetMeta.kGastosGenerales,
 beneficio: ST.apuBudgetMeta.kBeneficio,
 iibb: ST.apuBudgetMeta.kIibb,
 iva: ST.apuBudgetMeta.kIva
 });
 ST.apuBudgetMeta.kFactor = k;
 if (ST.apuKFactorDisplay) ST.apuKFactorDisplay.value = k != null ? k.toFixed(3) : '';
 updateApuBudgetUI();
}

/** Vuelca los 4 coeficientes guardados (o legacy: solo el kFactor final, sin coeficientes) en los inputs, al abrir un presupuesto. */
function renderApuKCoefficientsUI() {
 if (ST.apuKGastosGenerales) ST.apuKGastosGenerales.value = ST.apuBudgetMeta.kGastosGenerales ?? '';
 if (ST.apuKBeneficio) ST.apuKBeneficio.value = ST.apuBudgetMeta.kBeneficio ?? '';
 if (ST.apuKIibb) ST.apuKIibb.value = ST.apuBudgetMeta.kIibb ?? '';
 if (ST.apuKIva) ST.apuKIva.value = ST.apuBudgetMeta.kIva ?? '';
 if (ST.apuKFactorDisplay) {
 // Presupuesto viejo (de antes de esta migración): tiene kFactor cargado
 // a mano, pero ningún coeficiente -- se sigue mostrando ese K legacy en
 // el campo de solo lectura hasta que el usuario cargue los 4 coeficientes
 // (en ese momento se recalcula y reemplaza, ver updateApuKCoefficients).
 ST.apuKFactorDisplay.value = ST.apuBudgetMeta.kFactor != null ? Number(ST.apuBudgetMeta.kFactor).toFixed(3) : '';
 }
}

// --- Agregar/quitar componentes de un ítem ya agregado (pedido del usuario:
// poder editar un APU pre cargado, no solo sus rendimientos) -- 04/11 ---

/** Vuelca searchMaterialsForCustomTask(query) en la sección "Agregar material..." de UN ítem puntual del presupuesto -- mismo patrón que renderApuCustomMaterialResults, pero apuntando a ese ítem en vez de al draft de "Crear tu propia APU". */
export function renderApuItemMaterialResults(itemLocalId, query) {
 const resultsEl = document.getElementById(`apu-item-material-results-${itemLocalId}`);
 if (!resultsEl) return;
 const q = (query || '').trim();
 if (q.length < 2) { resultsEl.innerHTML = ''; return; }
 const results = searchMaterialsForCustomTask(q);
 if (results.length === 0) {
 resultsEl.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted);">Sin resultados.</p>';
 return;
 }
 resultsEl.innerHTML = results.map(m => `
 <div class="apu-task-row">
 <div class="apu-task-row-info" style="flex:1;">
 <strong>${ST.escapeHtml(m.denominacion)}</strong>
 <span>${ST.escapeHtml(m.unidadComputo || '')} · ${ST.escapeHtml(m.rubro || '')}</span>
 </div>
 <div class="apu-task-row-add">
 <input type="number" id="apu-item-material-rend-${itemLocalId}-${ST.escapeHtml(m.id)}" value="1" min="0.0001" step="0.0001" title="Cantidad por unidad de tarea">
 <button class="btn-computo" onclick="window.nexoBraApp.addApuItemMaterialComponentUI('${itemLocalId}','${m.id}')">+ Agregar</button>
 </div>
 </div>
 `).join('');
}

export function addApuItemMaterialComponentUI(itemLocalId, materialId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 const rendInput = document.getElementById(`apu-item-material-rend-${itemLocalId}-${materialId}`);
 const rendimiento = rendInput ? (parseFloat(rendInput.value) || 0) : 0;
 if (rendimiento <= 0) { ST.showToast('Poné una cantidad válida por unidad de tarea.'); return; }
 const comp = addItemMaterialComponent(item, materialId, rendimiento);
 if (!comp) { ST.showToast('No se encontró ese material.'); return; }
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast(`+ ${comp.denomination_snapshot.substring(0, 30)}`);
}

export function addApuItemLaborComponentUI(itemLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 const select = document.getElementById(`apu-item-labor-select-${itemLocalId}`);
 const rendInput = document.getElementById(`apu-item-labor-rend-${itemLocalId}`);
 if (!select || !select.value) { ST.showToast('Elegí una mano de obra.'); return; }
 const rendimiento = rendInput ? (parseFloat(rendInput.value) || 0) : 0;
 if (rendimiento <= 0) { ST.showToast('Poné un rendimiento válido.'); return; }
 const comp = addItemLaborComponent(item, Number(select.value), rendimiento);
 if (!comp) return;
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast(`+ ${comp.denomination_snapshot.substring(0, 30)}`);
}

export function addApuItemEquipmentComponentUI(itemLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 const select = document.getElementById(`apu-item-equipment-select-${itemLocalId}`);
 const rendInput = document.getElementById(`apu-item-equipment-rend-${itemLocalId}`);
 if (!select || !select.value) { ST.showToast('Elegí un equipo.'); return; }
 const rendimiento = rendInput ? (parseFloat(rendInput.value) || 0) : 0;
 if (rendimiento <= 0) { ST.showToast('Poné un rendimiento válido.'); return; }
 const comp = addItemEquipmentComponent(item, Number(select.value), rendimiento);
 if (!comp) return;
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast(`+ ${comp.denomination_snapshot.substring(0, 30)}`);
}

export function removeApuItemComponent(itemLocalId, componentLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 removeItemComponent(item, componentLocalId);
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast('Componente quitado.');
}

// =========================================================
// Persistencia (guardar / Mis Presupuestos / abrir / duplicar / eliminar)
// -- mismo patrón que computo.js, adaptado al modelo de 3 niveles
// (budget -> items -> components) de la migración 022.
// =========================================================

/** Arma la fila a insertar para un componente, congelando su precio unitario VIGENTE (igual que cartItemToRow en computo.js) -- salvo que ya venga con un precio de proveedor fijo, que se respeta tal cual. */
function buildComponentSaveRow(comp, sortOrder, budgetItemId) {
 const resolved = resolveComponentUnitPrice(comp, null);
 return {
 budget_item_id: budgetItemId,
 apu_task_component_id: comp.apu_task_component_id,
 tipo: comp.tipo,
 descripcion_snapshot: comp.descripcion_snapshot,
 unidad_snapshot: comp.unidad_snapshot,
 rendimiento_referencia: comp.rendimiento_referencia,
 rendimiento: comp.rendimiento,
 is_rendimiento_modificado: comp.is_rendimiento_modificado,
 material_id: comp.material_id,
 labor_rate_id: comp.labor_rate_id,
 equipment_rate_id: comp.equipment_rate_id,
 denomination_snapshot: comp.denomination_snapshot,
 price_snapshot: resolved.disponible ? Number(resolved.unitPrice) : null,
 pricing_mode: comp.tipo === 'material' ? 'computo' : null,
 source_kind: comp.source_kind,
 provider_offer_id: comp.provider_offer_id,
 provider_branch_id: comp.provider_branch_id,
 provider_business_name: comp.provider_business_name,
 provider_branch_name: comp.provider_branch_name,
 provider_whatsapp: comp.provider_whatsapp,
 sort_order: sortOrder
 };
}

export async function saveApuBudget() {
 if (!ST.authState.user) {
 Auth.showAuthTab('login');
 Auth.openAuthModal();
 Auth.showAuthError('Iniciá sesión para guardar tu presupuesto de obra.');
 return;
 }
 if (ST.state.apuBudgetItems.length === 0) {
 ST.showToast('Agregá al menos una tarea antes de guardar.');
 return;
 }

 const name = ST.apuBudgetName.value.trim() || 'Mi presupuesto de obra';
 // ST.apuBudgetMeta.kFactor ya está calculado (updateApuKCoefficients, en
 // cada cambio de cualquiera de los 4 coeficientes) -- se guardan los 4
 // coeficientes además del k_factor final, para poder redisplegarlos al
 // reabrir el presupuesto (antes solo se guardaba el k_factor final).
 const budgetFields = {
 name,
 locality: ST.authState.profile?.locality || null,
 obra_nombre: ST.apuObraNombre.value.trim() || null,
 obra_ubicacion: ST.apuObraUbicacion.value.trim() || null,
 obra_comitente: ST.apuObraComitente.value.trim() || null,
 obra_referencia: ST.apuObraReferencia.value.trim() || null,
 k_factor: (ST.apuBudgetMeta.kFactor && ST.apuBudgetMeta.kFactor > 0) ? ST.apuBudgetMeta.kFactor : null,
 k_gastos_generales: ST.apuBudgetMeta.kGastosGenerales,
 k_beneficio: ST.apuBudgetMeta.kBeneficio,
 k_iibb: ST.apuBudgetMeta.kIibb,
 k_iva: ST.apuBudgetMeta.kIva
 };
 ST.btnSaveApuBudget.disabled = true;

 try {
 let budgetId = ST.apuBudgetMeta.currentId;

 if (budgetId) {
 const { error } = await ST.supabaseClient.from('apu_user_budgets').update(budgetFields).eq('id', budgetId);
 if (error) throw error;
 // Igual que saveComputation: se borran los items viejos y se vuelven a
 // insertar todos de cero -- más simple que diffear, y acá el volumen
 // por presupuesto es chico (unas pocas tareas con sus componentes).
 const { error: deleteError } = await ST.supabaseClient.from('apu_user_budget_items').delete().eq('budget_id', budgetId);
 if (deleteError) throw deleteError;
 } else {
 const { data, error } = await ST.supabaseClient
 .from('apu_user_budgets')
 .insert({ ...budgetFields, user_id: ST.authState.user.id })
 .select('id')
 .single();
 if (error) throw error;
 budgetId = data.id;
 ST.apuBudgetMeta.currentId = budgetId;
 }

 // Fases de obra (migración 029, 05/11) -- mismo criterio que los items:
 // se borran las fases viejas de este presupuesto y se insertan de cero
 // las actuales, armando un mapa localId -> id real para poder guardar
 // el phase_id de cada item más abajo (los items referencian la fase por
 // su localId mientras están solo en memoria, ver setApuItemPhase).
 const { error: deletePhasesError } = await ST.supabaseClient.from('apu_budget_phases').delete().eq('budget_id', budgetId);
 if (deletePhasesError) throw deletePhasesError;
 const phaseIdMap = {};
 if (ST.state.apuPhases.length > 0) {
 const phaseRows = ST.state.apuPhases.map((p, i) => ({
 budget_id: budgetId,
 nombre: p.nombre,
 orden: i,
 fecha_estimada: p.fechaEstimada || null,
 estado: p.estado || 'no_iniciada'
 }));
 const { data: insertedPhases, error: phasesError } = await ST.supabaseClient
 .from('apu_budget_phases')
 .insert(phaseRows)
 .select('id');
 if (phasesError) throw phasesError;
 ST.state.apuPhases.forEach((p, i) => { phaseIdMap[p.localId] = insertedPhases[i].id; p.dbId = insertedPhases[i].id; });
 saveApuPhases();
 }

 for (let i = 0; i < ST.state.apuBudgetItems.length; i++) {
 const item = ST.state.apuBudgetItems[i];
 const { data: itemRow, error: itemError } = await ST.supabaseClient
 .from('apu_user_budget_items')
 .insert({
 budget_id: budgetId,
 apu_task_id: item.apu_task_id,
 item_kind: item.item_kind || 'apu',
 task_nombre_snapshot: item.task_nombre_snapshot,
 task_unidad_snapshot: item.task_unidad_snapshot,
 task_rubro_snapshot: item.task_rubro_snapshot,
 quantity: item.quantity,
 desperdicio_pct_snapshot: item.desperdicio_pct_snapshot,
 herramientas_pct_mo_snapshot: item.herramientas_pct_mo_snapshot,
 phase_id: item.phase_id ? (phaseIdMap[item.phase_id] || null) : null,
 sort_order: i
 })
 .select('id')
 .single();
 if (itemError) throw itemError;

 const componentRows = item.components.map((c, j) => buildComponentSaveRow(c, j, itemRow.id));
 if (componentRows.length > 0) {
 const { error: compError } = await ST.supabaseClient.from('apu_user_budget_item_components').insert(componentRows);
 if (compError) throw compError;
 }
 }

 updateApuBudgetNameUI();
 await loadApuPurchasesForCurrentBudget(); // primer guardado: ya tiene budget_id real, la fila "registrar pedido" puede aparecer
 updateApuBudgetUI();
 ST.showToast('Presupuesto de obra guardado.');
 } catch (err) {
 ST.showToast('No se pudo guardar: ' + err.message);
 } finally {
 ST.btnSaveApuBudget.disabled = false;
 }
}

export async function loadMyApuBudgets() {
 if (!ST.authState.user || !ST.myApuBudgetsList) return;
 ST.myApuBudgetsList.innerHTML = '<p style="color:var(--text-muted);">Cargando...</p>';

 const { data, error } = await ST.supabaseClient
 .from('apu_user_budgets')
 .select('id, name, locality, updated_at, apu_user_budget_items(count)')
 .eq('user_id', ST.authState.user.id)
 .order('updated_at', { ascending: false });

 if (error) {
 ST.myApuBudgetsList.innerHTML = `<p style="color:#b91c1c;">${ST.friendlyError(error, 'cargar Mis Presupuestos de Obra')}</p>`;
 return;
 }

 if (!data || data.length === 0) {
 ST.myApuBudgetsList.innerHTML = `
 <div class="computo-empty-state">
 <div class="empty-icon"></div>
 <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">Todavía no guardaste ningún presupuesto de obra</h4>
 <p style="font-size: 0.85rem; color: var(--text-muted);">Armalo desde la Calculadora de Obra y tocá "Guardar".</p>
 </div>
 `;
 return;
 }

 ST.myApuBudgetsList.innerHTML = data.map(b => {
 const count = b.apu_user_budget_items?.[0]?.count ?? 0;
 const fecha = new Date(b.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
 return `
 <div class="computation-row">
 <div class="computation-row-info">
 <h4>${ST.escapeHtml(b.name)}</h4>
 <span>${count} tarea${count === 1 ? '' : 's'} · actualizado el ${fecha}${b.locality ? ' · ' + b.locality : ''}</span>
 </div>
 <div class="computation-row-actions">
 <button onclick="window.nexoBraApp.openApuBudget('${b.id}')">Abrir</button>
 <button onclick="window.nexoBraApp.duplicateApuBudget('${b.id}')">Duplicar</button>
 <button class="danger" onclick="window.nexoBraApp.deleteApuBudget('${b.id}')">Eliminar</button>
 </div>
 </div>
 `;
 }).join('');
}

/** Convierte una fila guardada (con sus apu_user_budget_item_components anidados) de vuelta a un item "en memoria" editable -- análogo a rowToCartItem en computo.js. El precio sólo se mantiene congelado si viene de un proveedor puntual; el resto vuelve a resolverse en vivo (ver resolveComponentUnitPrice). */
function rowToBudgetItem(row) {
 const components = (row.apu_user_budget_item_components || [])
 .slice()
 .sort((a, b) => a.sort_order - b.sort_order)
 .map(c => ({
 localId: localId('comp'),
 apu_task_component_id: c.apu_task_component_id,
 tipo: c.tipo,
 descripcion_snapshot: c.descripcion_snapshot,
 unidad_snapshot: c.unidad_snapshot,
 rendimiento_referencia: Number(c.rendimiento_referencia),
 rendimiento: Number(c.rendimiento),
 is_rendimiento_modificado: Boolean(c.is_rendimiento_modificado),
 material_id: c.material_id,
 labor_rate_id: c.labor_rate_id,
 equipment_rate_id: c.equipment_rate_id,
 denomination_snapshot: c.denomination_snapshot,
 source_kind: c.source_kind,
 provider_offer_id: c.provider_offer_id,
 provider_branch_id: c.provider_branch_id,
 provider_business_name: c.provider_business_name,
 provider_branch_name: c.provider_branch_name,
 provider_whatsapp: c.provider_whatsapp,
 price_snapshot: c.source_kind === 'provider_offer' ? Number(c.price_snapshot) : null
 }));

 return {
 localId: localId('item'),
 apu_task_id: row.apu_task_id,
 item_kind: row.item_kind || (row.apu_task_id ? 'apu' : 'custom'), // fallback para filas guardadas antes de la migración 026
 task_nombre_snapshot: row.task_nombre_snapshot,
 task_unidad_snapshot: row.task_unidad_snapshot,
 task_rubro_snapshot: row.task_rubro_snapshot,
 quantity: Number(row.quantity),
 desperdicio_pct_snapshot: Number(row.desperdicio_pct_snapshot || 0),
 herramientas_pct_mo_snapshot: Number(row.herramientas_pct_mo_snapshot || 0),
 // row.phase_id acá todavía es el uuid REAL de apu_budget_phases (lo que
 // vino de la base) -- openApuBudget lo reescribe al localId de fase
 // correspondiente justo después de construir todos los items (ver ahí),
 // porque para eso hace falta primero tener armado ST.state.apuPhases.
 phase_id: row.phase_id || null,
 components
 };
}

export async function openApuBudget(id) {
 const [{ data: budget, error: budgetError }, { data: items, error: itemsError }, { data: phases, error: phasesError }] = await Promise.all([
 ST.supabaseClient.from('apu_user_budgets').select('*').eq('id', id).single(),
 ST.supabaseClient.from('apu_user_budget_items').select('*, apu_user_budget_item_components(*)').eq('budget_id', id).order('sort_order'),
 ST.supabaseClient.from('apu_budget_phases').select('*').eq('budget_id', id).order('orden')
 ]);

 if (budgetError || itemsError || phasesError) {
 ST.showToast('No se pudo abrir el presupuesto de obra.');
 return;
 }

 ST.apuBudgetMeta.currentId = budget.id;
 ST.apuBudgetMeta.name = budget.name;
 ST.apuBudgetMeta.locality = budget.locality;
 ST.apuBudgetMeta.obraNombre = budget.obra_nombre || '';
 ST.apuBudgetMeta.obraUbicacion = budget.obra_ubicacion || '';
 ST.apuBudgetMeta.obraComitente = budget.obra_comitente || '';
 ST.apuBudgetMeta.obraReferencia = budget.obra_referencia || '';
 ST.apuBudgetMeta.kFactor = budget.k_factor;
 // Coeficientes del Factor K (migración 028) -- un presupuesto guardado
 // antes de este cambio no los tiene (quedan null), y renderApuKCoefficientsUI
 // sigue mostrando el k_factor legacy hasta que se carguen los 4.
 ST.apuBudgetMeta.kGastosGenerales = budget.k_gastos_generales ?? null;
 ST.apuBudgetMeta.kBeneficio = budget.k_beneficio ?? null;
 ST.apuBudgetMeta.kIibb = budget.k_iibb ?? null;
 ST.apuBudgetMeta.kIva = budget.k_iva ?? null;

 // Fases de obra (migración 029) -- se arman ANTES que los items porque
 // rowToBudgetItem deja item.phase_id con el uuid real que vino de la
 // base (ver su comentario), y acá se reescribe al localId de la fase
 // correspondiente, para que el resto de la UI (selects, agrupado por
 // fase) trabaje siempre con localId, igual que con un presupuesto recién
 // armado en memoria.
 const dbIdToLocalPhase = {};
 ST.state.apuPhases = (phases || []).map(p => {
 const localPhaseId = localId('phase');
 dbIdToLocalPhase[p.id] = localPhaseId;
 return { localId: localPhaseId, dbId: p.id, nombre: p.nombre, orden: p.orden, fechaEstimada: p.fecha_estimada, estado: p.estado };
 });
 saveApuPhases();

 ST.state.apuBudgetItems = (items || []).slice().sort((a, b) => a.sort_order - b.sort_order).map(rowToBudgetItem);
 ST.state.apuBudgetItems.forEach(item => { item.phase_id = item.phase_id ? (dbIdToLocalPhase[item.phase_id] || null) : null; });
 saveApuCart();

 ST.apuBudgetName.value = budget.name;
 ST.apuObraNombre.value = budget.obra_nombre || '';
 ST.apuObraUbicacion.value = budget.obra_ubicacion || '';
 ST.apuObraComitente.value = budget.obra_comitente || '';
 ST.apuObraReferencia.value = budget.obra_referencia || '';
 renderApuKCoefficientsUI();
 document.getElementById('share-link-box-apu')?.remove();

 updateApuBudgetNameUI();
 await loadApuPurchasesForCurrentBudget();
 Main.switchView('apu');
 updateApuBudgetUI();
 ST.showToast(`Abriste "${budget.name}"`);
}

export async function duplicateApuBudget(id) {
 const [{ data: budget, error: budgetError }, { data: items, error: itemsError }, { data: phases, error: phasesError }] = await Promise.all([
 ST.supabaseClient.from('apu_user_budgets').select('name, locality, obra_nombre, obra_ubicacion, obra_comitente, obra_referencia, k_factor, k_gastos_generales, k_beneficio, k_iibb, k_iva').eq('id', id).single(),
 ST.supabaseClient.from('apu_user_budget_items').select('*, apu_user_budget_item_components(*)').eq('budget_id', id).order('sort_order'),
 ST.supabaseClient.from('apu_budget_phases').select('*').eq('budget_id', id).order('orden')
 ]);
 if (budgetError || itemsError || phasesError) {
 ST.showToast('No se pudo duplicar el presupuesto de obra.');
 return;
 }

 const { data: newBudget, error: insertError } = await ST.supabaseClient
 .from('apu_user_budgets')
 .insert({
 name: `${budget.name} (copia)`, user_id: ST.authState.user.id, locality: budget.locality,
 obra_nombre: budget.obra_nombre, obra_ubicacion: budget.obra_ubicacion,
 obra_comitente: budget.obra_comitente, obra_referencia: budget.obra_referencia,
 k_factor: budget.k_factor,
 k_gastos_generales: budget.k_gastos_generales, k_beneficio: budget.k_beneficio,
 k_iibb: budget.k_iibb, k_iva: budget.k_iva
 })
 .select('id')
 .single();
 if (insertError) {
 ST.showToast('No se pudo duplicar el presupuesto de obra.');
 return;
 }

 // Fases de obra -- se duplican antes que los items, armando un mapa de
 // id viejo -> id nuevo para poder apuntar el phase_id de cada item
 // duplicado a la fase correspondiente del presupuesto nuevo.
 const phaseIdMap = {};
 if ((phases || []).length > 0) {
 const { data: newPhases, error: newPhasesError } = await ST.supabaseClient
 .from('apu_budget_phases')
 .insert(phases.map(p => ({ budget_id: newBudget.id, nombre: p.nombre, orden: p.orden, fecha_estimada: p.fecha_estimada, estado: p.estado })))
 .select('id');
 if (!newPhasesError) {
 phases.forEach((p, i) => { phaseIdMap[p.id] = newPhases[i].id; });
 }
 }

 for (const item of (items || [])) {
 const { data: newItem, error: itemError } = await ST.supabaseClient
 .from('apu_user_budget_items')
 .insert({
 budget_id: newBudget.id,
 apu_task_id: item.apu_task_id,
 item_kind: item.item_kind || 'apu',
 task_nombre_snapshot: item.task_nombre_snapshot,
 task_unidad_snapshot: item.task_unidad_snapshot,
 task_rubro_snapshot: item.task_rubro_snapshot,
 quantity: item.quantity,
 desperdicio_pct_snapshot: item.desperdicio_pct_snapshot,
 herramientas_pct_mo_snapshot: item.herramientas_pct_mo_snapshot,
 phase_id: item.phase_id ? (phaseIdMap[item.phase_id] || null) : null,
 sort_order: item.sort_order
 })
 .select('id')
 .single();
 if (itemError || !(item.apu_user_budget_item_components || []).length) continue;

 const rows = item.apu_user_budget_item_components.map(c => ({
 ...c, id: undefined, budget_item_id: newItem.id, created_at: undefined, updated_at: undefined
 }));
 await ST.supabaseClient.from('apu_user_budget_item_components').insert(rows);
 }

 ST.showToast('Presupuesto de obra duplicado.');
 loadMyApuBudgets();
}

export async function deleteApuBudget(id) {
 if (!confirm('¿Eliminar este presupuesto de obra? Esta acción no se puede deshacer.')) return;
 const { error } = await ST.supabaseClient.from('apu_user_budgets').delete().eq('id', id);
 if (error) {
 ST.showToast('No se pudo eliminar: ' + error.message);
 return;
 }
 if (ST.apuBudgetMeta.currentId === id) newApuBudget();
 ST.showToast('Presupuesto de obra eliminado.');
 loadMyApuBudgets();
}

// =========================================================
// Compartir por link público (?apu_share=TOKEN) -- mismo patrón que
// shareComputation/unshareComputation/renderSharedComputation en computo.js.
// =========================================================

function showApuShareLinkBox(url) {
 document.getElementById('share-link-box-apu')?.remove();
 const box = document.createElement('div');
 box.id = 'share-link-box-apu';
 box.className = 'share-link-box';
 box.innerHTML = `
 <p style="font-size:0.78rem; font-weight:700; margin-bottom:6px;">Link para compartir (sin login, cualquiera puede verlo):</p>
 <div style="display:flex; gap:6px;">
 <input type="text" value="${ST.escapeHtml(url)}" readonly class="form-select" style="flex:1; min-width:0; font-size:0.78rem;" onclick="this.select()">
 <button class="btn-computo" style="flex-shrink:0;" onclick="navigator.clipboard.writeText('${url}'); window.nexoBraApp.showToast('Copiado.')">Copiar</button>
 </div>
 <button style="background:none; border:none; color:var(--text-subtle); font-size:0.72rem; text-decoration:underline; cursor:pointer; margin-top:6px;" onclick="window.nexoBraApp.unshareApuBudget()">Dejar de compartir</button>
 `;
 // Scopeado dentro del footer de ESTA vista (apu-budget-footer) -- a
 // diferencia de computo.js, acá "drawer-actions" no es única en la
 // página (el drawer de Mi Cómputo también usa esa clase), así que no se
 // puede buscar con un querySelector global.
 const actions = ST.apuBudgetFooter?.querySelector('.drawer-actions');
 if (actions) actions.insertAdjacentElement('afterend', box);
}

export async function shareApuBudget() {
 if (!ST.apuBudgetMeta.currentId) {
 ST.showToast('Guardá el presupuesto primero (arriba, con el botón "Guardar") para poder compartirlo.');
 return;
 }
 if (!ST.authState.user) {
 ST.showToast('Iniciá sesión para compartir un presupuesto de obra.');
 return;
 }

 const { data: existing } = await ST.supabaseClient
 .from('apu_user_budgets')
 .select('share_token, is_public')
 .eq('id', ST.apuBudgetMeta.currentId)
 .single();

 let token = existing?.share_token;
 if (!token) token = crypto.randomUUID();

 const { error } = await ST.supabaseClient
 .from('apu_user_budgets')
 .update({ share_token: token, is_public: true })
 .eq('id', ST.apuBudgetMeta.currentId);

 if (error) {
 ST.showToast('No se pudo generar el link: ' + error.message);
 return;
 }

 const url = `${window.location.origin}/?apu_share=${token}`;
 showApuShareLinkBox(url);
}

export async function unshareApuBudget() {
 if (!ST.apuBudgetMeta.currentId) return;
 const { error } = await ST.supabaseClient
 .from('apu_user_budgets')
 .update({ is_public: false })
 .eq('id', ST.apuBudgetMeta.currentId);
 if (error) {
 ST.showToast('No se pudo desactivar el link: ' + error.message);
 return;
 }
 ST.showToast('El link ya no muestra este presupuesto.');
 document.getElementById('share-link-box-apu')?.remove();
}

/**
 * Vista pública de solo lectura para un presupuesto de obra compartido por
 * link (?apu_share=TOKEN) -- análoga a renderSharedComputation. Usa los
 * valores "congelados" al momento de guardar (price_snapshot, rendimiento,
 * etc. -- ver get_shared_apu_budget en la migración 022/023), no un
 * recálculo contra el catálogo en vivo, así el link siempre muestra
 * exactamente lo que se compartió. La única excepción es el precio de
 * referencia de "Herramientas Manuales": apu_equipment_rates tiene lectura
 * pública (fix de la migración 022), así que se puede pedir directo acá en
 * vez de tener que guardarlo como snapshot aparte.
 */
export async function renderSharedApuBudget(token) {
 document.getElementById('shared-apu-budget-view').style.display = 'block';
 document.querySelectorAll('body > *:not(#shared-apu-budget-view)').forEach(el => {
 if (el.tagName !== 'SCRIPT') el.style.display = 'none';
 });

 const body = document.getElementById('shared-apu-budget-body');

 const [{ data, error }, { data: equipRates }] = await Promise.all([
 ST.supabaseClient.rpc('get_shared_apu_budget', { p_token: token }),
 ST.supabaseClient.from('apu_equipment_rates').select('*')
 ]);
 const budget = data?.[0];

 if (error || !budget) {
 body.innerHTML = `
 <div style="text-align:center; padding: 3rem 0;">
 <div style="font-size:2.5rem; margin-bottom:1rem;"></div>
 <h2 style="margin-bottom:8px;">Este link ya no está disponible</h2>
 <p style="color:var(--text-muted);">Puede que quien lo compartió haya dejado de compartirlo, o el link esté mal copiado.</p>
 <a href="/" class="btn-computo" style="display:inline-flex; margin-top:1.5rem; text-decoration:none;">Ir a NEXOBRA</a>
 </div>
 `;
 return;
 }

 const k = (budget.k_factor && budget.k_factor > 0) ? Number(budget.k_factor) : 1;
 const herramientasRate = (equipRates || []).find(r => (r.nombre || '').trim().toLowerCase() === 'herramientas manuales');
 const herramientasUnitPriceConK = (herramientasRate ? Number(herramientasRate.precio_referencia) : 0) * k;
 const herramientasUnidad = herramientasRate ? herramientasRate.unidad : 'hs';

 let total = 0;
 const itemsHtml = (budget.items || []).map(it => {
 let horasManoObraTotal = 0;
 const lineas = (it.components || []).map(c => {
 let cantidadNecesaria;
 if (c.tipo === 'material') {
 cantidadNecesaria = Number(c.rendimiento) * Number(it.quantity) * (1 + Number(it.desperdicio_pct_snapshot || 0) / 100);
 } else {
 cantidadNecesaria = Number(c.rendimiento) * Number(it.quantity);
 if (c.tipo === 'mano_obra') horasManoObraTotal += cantidadNecesaria;
 }
 const unitPriceConK = Number(c.price_snapshot || 0) * k;
 const costo = cantidadNecesaria * unitPriceConK;
 return { ...c, cantidadNecesaria, unitPriceConK, costo };
 });

 const herramientasHoras = (Number(it.herramientas_pct_mo_snapshot || 0) / 100) * horasManoObraTotal;
 const herramientasCosto = herramientasHoras * herramientasUnitPriceConK;
 const itemTotal = lineas.reduce((s, l) => s + l.costo, 0) + herramientasCosto;
 total += itemTotal;

 return `
 <div class="apu-item-card">
 <div class="apu-item-header">
 <div class="apu-item-header-info">
 <strong>${ST.escapeHtml(it.task_nombre_snapshot)}</strong>
 <span>${it.quantity} ${ST.escapeHtml(it.task_unidad_snapshot)} · ${ST.formatMoney(itemTotal)} total</span>
 </div>
 </div>
 <div class="apu-item-body">
 <table class="apu-component-table">
 <thead><tr><th>Componente</th><th>Cant.</th><th>Precio unit.</th><th style="text-align:right;">Costo</th></tr></thead>
 <tbody>
 ${lineas.map(l => `
 <tr>
 <td>${ST.escapeHtml(l.denomination_snapshot)}</td>
 <td>${l.cantidadNecesaria.toFixed(3)} ${ST.escapeHtml(l.unidad_snapshot)}</td>
 <td>${ST.formatMoney(l.unitPriceConK)}</td>
 <td style="text-align:right;">${ST.formatMoney(l.costo)}</td>
 </tr>
 `).join('')}
 <tr class="apu-component-virtual">
 <td>Herramientas Manuales</td>
 <td>${herramientasHoras.toFixed(3)} ${ST.escapeHtml(herramientasUnidad)}</td>
 <td>${ST.formatMoney(herramientasUnitPriceConK)}</td>
 <td style="text-align:right;">${ST.formatMoney(herramientasCosto)}</td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>
 `;
 }).join('');

 const obraCampos = [
 { label: 'Obra', value: budget.obra_nombre },
 { label: 'Ubicación', value: budget.obra_ubicacion },
 { label: 'Comitente', value: budget.obra_comitente },
 { label: 'Referencia', value: budget.obra_referencia }
 ].filter(c => c.value);

 body.innerHTML = `
 <div class="catalog-header-banner">
 <div>
 <h2 class="catalog-title">${ST.escapeHtml(budget.name)}</h2>
 <p class="catalog-subtitle">Presupuesto de obra compartido desde NEXOBRA · ${new Date(budget.created_at).toLocaleDateString('es-AR')}</p>
 </div>
 </div>
 ${obraCampos.length > 0 ? `
 <div class="about-origen-card" style="display:block;">
 ${obraCampos.map(c => `<p class="pilar-text" style="margin-bottom:6px;"><strong>${c.label}:</strong> ${ST.escapeHtml(c.value)}</p>`).join('')}
 </div>
 ` : ''}
 ${itemsHtml}
 <div class="summary-row total-row" style="margin-top: 1.5rem;">
 <span>Total Estimado</span>
 <span>${ST.formatMoney(total)}</span>
 </div>
 <p style="font-size:0.78rem; color:var(--text-muted); margin-top:8px;">Valores orientativos, calculados con precios de NEXOBRA al momento de compartir este presupuesto. No incluyen impuestos, cargas sociales ni fletes.
 </p>
 <div style="text-align:center; margin-top: 2.5rem; padding-top: 2rem; border-top: 1px solid var(--border-light);">
 <p style="margin-bottom:12px;">¿Necesitás armar tu propio presupuesto de obra?</p>
 <a href="/" class="btn-computo" style="display:inline-flex; text-decoration:none;">Armalo gratis en NEXOBRA →</a>
 </div>
 `;
}

// =========================================================
// Exports a Excel (presupuesto completo / un APU suelto / consolidado)
// -- mismo patrón que exportPresupuestoReferencia/exportListaDeCompra en
// computo.js (ST.ensureXlsxLoaded + XLSX + ST.sanitizeForExcel).
// =========================================================

export async function exportApuFull() {
 if (ST.state.apuBudgetItems.length === 0) {
 alert('No hay tareas en tu presupuesto de obra para exportar.');
 return;
 }
 try {
 await ST.ensureXlsxLoaded();
 } catch (err) {
 ST.showToast(err.message);
 return;
 }

 const breakdown = calcBudgetBreakdown(ST.state.apuBudgetItems, { kFactor: ST.apuBudgetMeta.kFactor });
 const nombre = ST.apuBudgetName.value.trim() || 'Mi presupuesto de obra';
 const periodo = ST.monthLabel(ST.state.apuMonth || ST.state.priceMonth);

 const exportData = [
 [`NEXOBRA - Presupuesto de Obra - ${nombre}`],
 [`Precios calculados a: ${periodo}`, `Generado: ${new Date().toLocaleDateString('es-AR')}`],
 [ST.apuBudgetMeta.kFactor ? `Factor K aplicado: × ${ST.apuBudgetMeta.kFactor}` : 'Sin factor K (costo puro)'],
 []
 ];

 breakdown.perItem.forEach(({ item, lineas, herramientas, total }) => {
 exportData.push([`TAREA: ${ST.sanitizeForExcel(item.task_nombre_snapshot)}`, `Cantidad: ${item.quantity} ${item.task_unidad_snapshot}`]);
 exportData.push(['Tipo', 'Descripción', 'Rendimiento', 'Cant. necesaria', 'Unidad', 'Precio Unit. (ARS)', 'Subtotal (ARS)']);
 lineas.forEach(l => {
 exportData.push([
 l.tipo, ST.sanitizeForExcel(l.denomination_snapshot), l.rendimiento,
 Number(l.cantidadNecesaria.toFixed(3)), l.unidad_snapshot,
 l.disponible ? l.unitPriceConK : 's/d', l.disponible ? Number(l.costo.toFixed(2)) : 's/d'
 ]);
 });
 exportData.push([
 'equipo (virtual)', ST.sanitizeForExcel(herramientas.descripcion_snapshot), '',
 Number(herramientas.cantidadNecesaria.toFixed(3)), herramientas.unidad_snapshot,
 herramientas.disponible ? herramientas.unitPriceConK : 's/d', Number(herramientas.costo.toFixed(2))
 ]);
 exportData.push(['', '', '', '', '', 'Subtotal tarea:', Number(total.toFixed(2))]);
 exportData.push([]);
 });

 exportData.push(['', '', '', '', '', 'TOTAL ESTIMADO:', Number(breakdown.total.toFixed(2))]);
 exportData.push([]);
 exportData.push(['Valores orientativos con precios de referencia NEXOBRA. No incluyen impuestos, cargas sociales ni fletes.']);

 const ws = XLSX.utils.aoa_to_sheet(exportData);
 ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto_de_Obra');
 const safeName = nombre.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'Presupuesto_Obra';
 XLSX.writeFile(wb, `${safeName}_Presupuesto_de_Obra.xlsx`);
 ST.showToast('Presupuesto de obra descargado.');
}

export async function exportApuItem(itemLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!item) return;
 try {
 await ST.ensureXlsxLoaded();
 } catch (err) {
 ST.showToast(err.message);
 return;
 }

 const { lineas, herramientas, total } = calcItemBreakdown(item, { kFactor: ST.apuBudgetMeta.kFactor });
 const periodo = ST.monthLabel(ST.state.apuMonth || ST.state.priceMonth);

 const exportData = [
 [`NEXOBRA - APU - ${item.task_nombre_snapshot}`],
 [`Cantidad: ${item.quantity} ${item.task_unidad_snapshot}`, `Precios a: ${periodo}`],
 [],
 ['Tipo', 'Descripción', 'Rendimiento', 'Cant. necesaria', 'Unidad', 'Precio Unit. (ARS)', 'Subtotal (ARS)']
 ];
 lineas.forEach(l => {
 exportData.push([
 l.tipo, ST.sanitizeForExcel(l.denomination_snapshot), l.rendimiento,
 Number(l.cantidadNecesaria.toFixed(3)), l.unidad_snapshot,
 l.disponible ? l.unitPriceConK : 's/d', l.disponible ? Number(l.costo.toFixed(2)) : 's/d'
 ]);
 });
 exportData.push([
 'equipo (virtual)', ST.sanitizeForExcel(herramientas.descripcion_snapshot), '',
 Number(herramientas.cantidadNecesaria.toFixed(3)), herramientas.unidad_snapshot,
 herramientas.disponible ? herramientas.unitPriceConK : 's/d', Number(herramientas.costo.toFixed(2))
 ]);
 exportData.push(['', '', '', '', '', 'TOTAL:', Number(total.toFixed(2))]);
 exportData.push([]);
 exportData.push(['Valores orientativos con precios de referencia NEXOBRA. No incluyen impuestos, cargas sociales ni fletes.']);

 const ws = XLSX.utils.aoa_to_sheet(exportData);
 ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws, 'APU');
 const safeName = item.task_nombre_snapshot.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'APU';
 XLSX.writeFile(wb, `${safeName}.xlsx`);
 ST.showToast('APU descargado.');
}

/** Agrupa las líneas de material de TODO el presupuesto por a quién se le va a comprar: una entrada por proveedor puntual elegido (ver setComponentProviderOffer) + una entrada final "sin proveedor asignado" con todo lo que quedó al precio de referencia NEXOBRA. Usado por la segunda hoja del Excel consolidado (exportApuConsolidated) -- pedido explícito: "lista de materiales ya discriminada por proveedor o el base". */
function consolidateMaterialsByProviderGroup(perItem) {
 const groups = {};
 perItem.forEach(({ lineas }) => {
 lineas.filter(l => l.tipo === 'material').forEach(l => {
 const groupKey = l.isProviderSourced ? (l.provider_branch_id || l.provider_business_name || 'proveedor') : 'reference';
 const groupLabel = l.isProviderSourced
 ? ([l.provider_business_name, l.provider_branch_name].filter(Boolean).join(' - ') || 'Proveedor')
 : 'Precio de referencia NEXOBRA (sin proveedor asignado)';
 if (!groups[groupKey]) groups[groupKey] = { label: groupLabel, rows: {} };
 const matKey = l.material_id || l.descripcion_snapshot;
 if (!groups[groupKey].rows[matKey]) {
 groups[groupKey].rows[matKey] = { denominacion: l.denomination_snapshot, unidad: l.unidad_snapshot, cantidad: 0, costo: 0 };
 }
 groups[groupKey].rows[matKey].cantidad += l.cantidadNecesaria;
 groups[groupKey].rows[matKey].costo += l.costo;
 });
 });
 const entries = Object.entries(groups);
 entries.sort((a, b) => {
 if (a[0] === 'reference') return 1;
 if (b[0] === 'reference') return -1;
 return a[1].label.localeCompare(b[1].label);
 });
 return entries.map(([, g]) => ({ label: g.label, rows: Object.values(g.rows).sort((a, b) => a.denominacion.localeCompare(b.denominacion)) }));
}

export async function exportApuConsolidated() {
 if (ST.state.apuBudgetItems.length === 0) {
 alert('No hay materiales para exportar.');
 return;
 }
 try {
 await ST.ensureXlsxLoaded();
 } catch (err) {
 ST.showToast(err.message);
 return;
 }

 const breakdown = calcBudgetBreakdown(ST.state.apuBudgetItems, { kFactor: ST.apuBudgetMeta.kFactor });
 const nombre = ST.apuBudgetName.value.trim() || 'Mi presupuesto de obra';

 const exportData = [
 [`NEXOBRA - Lista de Materiales Consolidada - ${nombre}`],
 [`Generado: ${new Date().toLocaleDateString('es-AR')}`],
 ['Suma de todos los materiales de todas las tareas del presupuesto, sin importar en qué tarea se usan.'],
 [],
 ['Material', 'Unidad', 'Cantidad neta', 'A pedir', 'Unidad de compra', 'Costo (ARS)']
 ];
 breakdown.materialesConsolidados.forEach(m => {
 exportData.push([ST.sanitizeForExcel(m.denominacion), m.unidad, Number(m.cantidad.toFixed(2)), m.cantidadAPedir, ST.sanitizeForExcel(m.unidadCompra), Number(m.costo.toFixed(2))]);
 });
 const totalMateriales = breakdown.materialesConsolidados.reduce((s, m) => s + m.costo, 0);
 exportData.push(['', '', '', '', 'Total Materiales:', Number(totalMateriales.toFixed(2))]);
 exportData.push([]);
 exportData.push(['"A pedir" ya está redondeado hacia arriba a la unidad en la que se compra (bolsa, balde, caja, etc). Valores orientativos con precios de referencia NEXOBRA. No incluyen impuestos, cargas sociales ni fletes.']);

 const ws = XLSX.utils.aoa_to_sheet(exportData);
 ws['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws, 'Materiales_Consolidado');

 // Segunda hoja: la misma lista, pero discriminada por proveedor elegido
 // (o "sin proveedor asignado" para lo que quedó a precio de referencia).
 const grupos = consolidateMaterialsByProviderGroup(breakdown.perItem);
 const sheet2 = [
 [`NEXOBRA - Materiales por proveedor - ${nombre}`],
 ['Los mismos materiales de la lista consolidada, agrupados según a quién se los vas a comprar.'],
 []
 ];
 grupos.forEach(g => {
 sheet2.push([g.label]);
 sheet2.push(['Material', 'Unidad', 'Cantidad', 'Costo (ARS)']);
 let subtotal = 0;
 g.rows.forEach(r => {
 sheet2.push([ST.sanitizeForExcel(r.denominacion), r.unidad, Number(r.cantidad.toFixed(2)), Number(r.costo.toFixed(2))]);
 subtotal += r.costo;
 });
 sheet2.push(['', '', 'Subtotal:', Number(subtotal.toFixed(2))]);
 sheet2.push([]);
 });
 const ws2 = XLSX.utils.aoa_to_sheet(sheet2);
 ws2['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
 XLSX.utils.book_append_sheet(wb, ws2, 'Por_Proveedor');

 const safeName = nombre.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'Materiales';
 XLSX.writeFile(wb, `${safeName}_Materiales_Consolidado.xlsx`);
 ST.showToast('Lista de materiales descargada.');
}

// =========================================================
// Elegir proveedor o precio de referencia PARA UN MATERIAL PUNTUAL de una
// tarea del presupuesto -- 05/11. Por defecto cada material usa el precio de
// referencia NEXOBRA (el más actualizado al mes elegido, vía
// resolveComponentUnitPrice); acá se puede en cambio fijarle el precio de
// una oferta concreta de provider_offers, igual que "Elegir proveedor" en Mi
// Cómputo (MapModule.openOfferPicker) pero SIN filtrar por radio geográfico
// -- esa función depende de un centro de mapa (lat/lng) que no tiene sentido
// pedir acá. En su lugar se traen TODAS las ofertas aprobadas de ese
// material y se ordenan dejando primero las de la localidad de la obra (si
// se cargó una en "Datos de la obra"), coincidencia de texto simple -- no es
// distancia real, es la opción que se eligió para esta fase (ver
// estado-proyecto.md).
// =========================================================

let apuMaterialOfferContext = null; // { itemLocalId, componentLocalId, offers: [...] }

function obraLocalityText() {
 const fromInput = ST.apuObraUbicacion ? ST.apuObraUbicacion.value : '';
 return ST.normalizeText(fromInput || ST.apuBudgetMeta.obraUbicacion || '');
}

function localityLooksNearObra(locality) {
 const obraText = obraLocalityText();
 if (!obraText || !locality) return false;
 const loc = ST.normalizeText(locality);
 return obraText.includes(loc) || loc.includes(obraText);
}

/** Trae todas las ofertas aprobadas de provider_offers para un material, de sucursales activas -- sin filtro geográfico (ver nota arriba). */
async function fetchOffersForMaterial(materialId) {
 if (!ST.supabaseClient) return [];
 const { data, error } = await ST.supabaseClient
 .from('provider_offers')
 .select('id, branch_id, amount, unit, provider_branches!inner(name, locality, whatsapp_phone, active, providers(business_name, active))')
 .eq('material_id', materialId)
 .eq('status', 'approved')
 .eq('provider_branches.active', true)
 .order('amount', { ascending: true });
 if (error) {
 console.warn('[NEXOBRA] No se pudieron cargar ofertas de proveedores para este material.', error);
 return [];
 }
 const offers = (data || [])
 .filter(row => row.provider_branches?.providers?.active !== false)
 .map(row => ({
 id: row.id,
 branch_id: row.branch_id,
 amount: Number(row.amount),
 unit: row.unit,
 locality: row.provider_branches?.locality || '',
 provider_business_name: row.provider_branches?.providers?.business_name || '',
 provider_branch_name: row.provider_branches?.name || '',
 provider_whatsapp: row.provider_branches?.whatsapp_phone || null
 }));
 // Primero las de la localidad de la obra (si hay una cargada), después el resto -- ya vienen ordenadas por precio dentro de cada grupo.
 offers.sort((a, b) =>Number(localityLooksNearObra(b.locality)) - Number(localityLooksNearObra(a.locality)));
 return offers;
}

export async function openApuMaterialProviderPicker(itemLocalId, componentLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 const comp = item?.components.find(c => c.localId === componentLocalId);
 if (!item || !comp || comp.tipo !== 'material') return;
 if (!ST.apuMaterialOfferModal || !ST.apuMaterialOfferBackdrop) return;

 const material = findMaterial(comp.material_id);
 if (ST.apuMaterialOfferSubtitle) ST.apuMaterialOfferSubtitle.textContent = material ? material.denominacion : comp.denomination_snapshot;
 if (ST.apuMaterialOfferResults) ST.apuMaterialOfferResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Buscando ofertas...</p>';
 ST.apuMaterialOfferModal.classList.add('open');
 ST.apuMaterialOfferBackdrop.classList.add('open');
 document.body.style.overflow = 'hidden';

 apuMaterialOfferContext = { itemLocalId, componentLocalId, offers: [] };
 const offers = await fetchOffersForMaterial(comp.material_id);
 apuMaterialOfferContext.offers = offers;

 if (!ST.apuMaterialOfferResults) return;
 if (offers.length === 0) {
 ST.apuMaterialOfferResults.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Todavía no hay ofertas cargadas de proveedores de NEXOBRA para este material.</p>';
 return;
 }
 ST.apuMaterialOfferResults.innerHTML = offers.map((offer, idx) => `
 <div class="offer-picker-row">
 <div class="offer-picker-row-info">
 <h5>${ST.escapeHtml(offer.provider_business_name)}</h5>
 <span>${ST.escapeHtml(offer.provider_branch_name)}${offer.locality ? ' · ' + ST.escapeHtml(offer.locality) : ''}${localityLooksNearObra(offer.locality) ? ' · <strong>cerca de tu obra</strong>' : ''}</span>
 </div>
 <div class="offer-picker-row-price">
 <strong>${ST.formatMoney(offer.amount)}</strong>
 <span style="font-size:0.72rem; color:var(--text-muted);">/ ${ST.escapeHtml(offer.unit)}</span>
 <button class="btn-computo" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 4px; display:block;" onclick="window.nexoBraApp.chooseApuMaterialOffer(${idx})">Elegir</button>
 </div>
 </div>
 `).join('');
}

export function closeApuMaterialProviderPicker() {
 if (!ST.apuMaterialOfferModal || !ST.apuMaterialOfferBackdrop) return;
 ST.apuMaterialOfferModal.classList.remove('open');
 ST.apuMaterialOfferBackdrop.classList.remove('open');
 document.body.style.overflow = '';
 apuMaterialOfferContext = null;
}

export function chooseApuMaterialOffer(offerIndex) {
 if (!apuMaterialOfferContext) return;
 const { itemLocalId, componentLocalId, offers } = apuMaterialOfferContext;
 const offer = offers[offerIndex];
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 if (!offer || !item) return;
 setComponentProviderOffer(item, componentLocalId, offer);
 saveApuCart();
 closeApuMaterialProviderPicker();
 updateApuBudgetUI();
 ST.showToast(`Precio fijado desde ${offer.provider_business_name}.`);
}

export function clearApuMaterialProviderOffer(itemLocalId, componentLocalId) {
 const item = ST.state.apuBudgetItems.find(i => i.localId === itemLocalId);
 const comp = item?.components.find(c => c.localId === componentLocalId);
 if (!comp) return;
 clearProviderOffer(comp);
 saveApuCart();
 updateApuBudgetUI();
 ST.showToast('Vuelto al precio de referencia NEXOBRA.');
}

// =========================================================
// "Compartir a un proveedor": elegir un proveedor de NEXOBRA (modal) y
// mandarle la lista de materiales consolidada por WhatsApp -- mismo patrón
// de link que buildProviderWhatsappUrl en computo.js, pero sobre TODO el
// presupuesto en vez de un grupo del carrito ya asignado a ese proveedor
// (acá el usuario recién está buscando presupuesto, todavía no elige precio
// de ese proveedor para cada material -- eso queda para una fase siguiente).
// =========================================================

let apuProviderPickerCache = null;

async function ensureApuProviderPickerCache() {
 if (apuProviderPickerCache !== null || !ST.supabaseClient) return;
 const { data, error } = await ST.supabaseClient
 .from('provider_branches')
 .select('id, name, locality, whatsapp_phone, provider_id, providers(business_name, active)')
 .eq('active', true);
 if (error) { apuProviderPickerCache = []; return; }
 apuProviderPickerCache = (data || []).filter(b => b.providers && b.providers.active !== false);
}

export async function openApuProviderPicker() {
 if (ST.state.apuBudgetItems.length === 0) {
 ST.showToast('Agregá al menos una tarea al presupuesto antes de compartir la lista de materiales.');
 return;
 }
 if (!ST.apuProviderPickerModal || !ST.apuProviderPickerBackdrop) return;
 ST.apuProviderPickerModal.classList.add('open');
 ST.apuProviderPickerBackdrop.classList.add('open');
 document.body.style.overflow = 'hidden';
 if (ST.apuProviderPickerSearch) ST.apuProviderPickerSearch.value = '';
 await ensureApuProviderPickerCache();
 renderApuProviderPickerResults('');
}

export function closeApuProviderPicker() {
 if (!ST.apuProviderPickerModal || !ST.apuProviderPickerBackdrop) return;
 ST.apuProviderPickerModal.classList.remove('open');
 ST.apuProviderPickerBackdrop.classList.remove('open');
 document.body.style.overflow = '';
}

export function renderApuProviderPickerResults(query) {
 if (!ST.apuProviderPickerResults) return;
 if (!apuProviderPickerCache) {
 ST.apuProviderPickerResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Cargando proveedores...</p>';
 return;
 }
 const tokens = ST.normalizeText(query || '').split(' ').filter(Boolean);
 const filtered = apuProviderPickerCache.filter(b => {
 const haystack = ST.normalizeText([b.providers?.business_name, b.name, b.locality].filter(Boolean).join(' '));
 return tokens.every(t => haystack.includes(t));
 });
 if (filtered.length === 0) {
 ST.apuProviderPickerResults.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Ningún proveedor coincide con esa búsqueda.</p>';
 return;
 }
 ST.apuProviderPickerResults.innerHTML = filtered.map(b => `
 <div class="apu-provider-result-row">
 <div>
 <strong>${ST.escapeHtml(b.providers?.business_name || '')}</strong>
 <span>${ST.escapeHtml(b.name || '')}${b.locality ? ' · ' + ST.escapeHtml(b.locality) : ''}</span>
 </div>
 <button class="btn-computo" onclick="window.nexoBraApp.shareApuListToProvider(${ST.escAttr(b.id)})">Elegir</button>
 </div>
 `).join('');
}

export function shareApuListToProvider(branchId) {
 const branch = (apuProviderPickerCache || []).find(b => b.id === branchId);
 if (!branch) return;
 // providers no tiene columna de teléfono propia -- el único teléfono de
 // contacto en toda esta cadena es provider_branches.whatsapp_phone (ver
 // corrección 05/11: el select anterior pedía providers.contact_phone, que
 // no existe en el schema real y rompía ensureApuProviderPickerCache entero).
 const whatsapp = branch.whatsapp_phone;
 if (!whatsapp) {
 ST.showToast('Ese proveedor todavía no cargó un WhatsApp de contacto.');
 return;
 }

 const breakdown = calcBudgetBreakdown(ST.state.apuBudgetItems, { kFactor: ST.apuBudgetMeta.kFactor });
 let text = `Hola! Te escribo desde NEXOBRA para pedirte presupuesto de estos materiales:\n\n`;
 breakdown.materialesConsolidados.forEach(m => {
 text += `• ${m.denominacion} — ${m.cantidad.toFixed(2)} ${m.unidad}\n`;
 });
 text += `\n¿Me pasás precio y disponibilidad? Gracias!`;

 const digits = whatsapp.replace(/\D/g, '');
 window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
 closeApuProviderPicker();
}

// =========================================================
// Listeners -- se llama una vez desde main.js (init()), mismo patrón que
// Computo.setupComputationListeners()/MapModule.setupOfferPickerListeners().
// =========================================================

export function setupApuListeners() {
 if (!ST.supabaseClient) return;

 if (ST.btnSaveApuBudget) ST.btnSaveApuBudget.addEventListener('click', saveApuBudget);

 const btnNewApuBudget = document.getElementById('btn-new-apu-budget');
 if (btnNewApuBudget) btnNewApuBudget.addEventListener('click', newApuBudget);
 const btnNewApuBudgetFromList = document.getElementById('btn-new-apu-budget-from-list');
 if (btnNewApuBudgetFromList) btnNewApuBudgetFromList.addEventListener('click', () => { newApuBudget(); Main.switchView('apu'); });
 const btnOpenMyApuBudgets = document.getElementById('btn-open-my-apu-budgets');
 if (btnOpenMyApuBudgets) btnOpenMyApuBudgets.addEventListener('click', () => {
 if (ST.authDropdown) ST.authDropdown.style.display = 'none';
 Main.switchView('my-apu-budgets');
 });

 if (ST.apuTaskSearch) ST.apuTaskSearch.addEventListener('input', (e) => renderTaskResults(e.target.value));
 if (ST.apuTaskRubroFilter) ST.apuTaskRubroFilter.addEventListener('change', () => renderTaskResults(ST.apuTaskSearch ? ST.apuTaskSearch.value : ''));
 [ST.apuKGastosGenerales, ST.apuKBeneficio, ST.apuKIibb, ST.apuKIva].forEach(el => {
 if (el) el.addEventListener('input', updateApuKCoefficients);
 });

 // "Agregar material suelto" (sin APU, para consulta de precio) -- 04/11
 if (ST.apuDirectMaterialSearch) ST.apuDirectMaterialSearch.addEventListener('input', (e) => renderApuDirectMaterialResults(e.target.value));

 const btnShareApuBudget = document.getElementById('btn-share-apu-budget');
 if (btnShareApuBudget) btnShareApuBudget.addEventListener('click', shareApuBudget);
 const btnExportApuFull = document.getElementById('btn-export-apu-full');
 if (btnExportApuFull) btnExportApuFull.addEventListener('click', exportApuFull);
 const btnExportApuConsolidated = document.getElementById('btn-export-apu-consolidated');
 if (btnExportApuConsolidated) btnExportApuConsolidated.addEventListener('click', exportApuConsolidated);
 const btnClearApuBudget = document.getElementById('btn-clear-apu-budget');
 if (btnClearApuBudget) btnClearApuBudget.addEventListener('click', clearApuBudgetWithConfirm);

 const btnShareApuProvider = document.getElementById('btn-share-apu-provider');
 if (btnShareApuProvider) btnShareApuProvider.addEventListener('click', openApuProviderPicker);
 const apuProviderPickerCloseBtn = document.getElementById('apu-provider-picker-close-btn');
 if (apuProviderPickerCloseBtn) apuProviderPickerCloseBtn.addEventListener('click', closeApuProviderPicker);
 if (ST.apuProviderPickerBackdrop) ST.apuProviderPickerBackdrop.addEventListener('click', closeApuProviderPicker);
 if (ST.apuProviderPickerSearch) ST.apuProviderPickerSearch.addEventListener('input', (e) => renderApuProviderPickerResults(e.target.value));

 // "Crear tu propia APU"
 if (ST.btnOpenApuCustomTask) ST.btnOpenApuCustomTask.addEventListener('click', openApuCustomTaskModal);
 if (ST.apuCustomTaskCloseBtn) ST.apuCustomTaskCloseBtn.addEventListener('click', closeApuCustomTaskModal);
 if (ST.apuCustomTaskBackdrop) ST.apuCustomTaskBackdrop.addEventListener('click', closeApuCustomTaskModal);
 if (ST.apuCustomMaterialSearch) ST.apuCustomMaterialSearch.addEventListener('input', (e) => renderApuCustomMaterialResults(e.target.value));
 if (ST.btnApuCustomAddLabor) ST.btnApuCustomAddLabor.addEventListener('click', () => {
 if (ST.apuCustomLaborSelect && ST.apuCustomLaborSelect.value) addApuCustomComponentDraft('mano_obra', ST.apuCustomLaborSelect.value);
 });
 if (ST.btnApuCustomAddEquipment) ST.btnApuCustomAddEquipment.addEventListener('click', () => {
 if (ST.apuCustomEquipmentSelect && ST.apuCustomEquipmentSelect.value) addApuCustomComponentDraft('equipo', ST.apuCustomEquipmentSelect.value);
 });
 if (ST.btnApuCustomConfirm) ST.btnApuCustomConfirm.addEventListener('click', confirmApuCustomTask);

 // Elegir proveedor para un material puntual dentro de una tarea del presupuesto
 const apuMaterialOfferCloseBtn = document.getElementById('apu-material-offer-close-btn');
 if (apuMaterialOfferCloseBtn) apuMaterialOfferCloseBtn.addEventListener('click', closeApuMaterialProviderPicker);
 if (ST.apuMaterialOfferBackdrop) ST.apuMaterialOfferBackdrop.addEventListener('click', closeApuMaterialProviderPicker);
}
