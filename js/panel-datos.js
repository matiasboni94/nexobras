// js/panel-datos.js — (26/11, paquete 2) Tres páginas nuevas del Panel de Administración:
//  · Profesionales: verificar matrículas (con vencimiento) y aprobar acceso a la versión
//    profesional de la Calculadora.
//  · Rendimientos: rendimientos de mano de obra que usan los usuarios frente a la base de
//    NEXOBRA. Mediana, rango, alertas (±25 %), cortes por ciudad y rol, y decisiones
//    (adoptar como base, dejar como rango orientativo, ignorar).
//  · Historial: cada cambio en APU, jornales, equipos, materiales, precios base e índices,
//    con "Restaurar a como estaba antes".
// Base: migración 048 (funciones admin_*). Todo pasa por funciones que validan is_admin().
import * as ST from './state.js';

const esc = (t) => ST.escapeHtml(String(t ?? ''));
const num = (v, d = 2) => (v === null || v === undefined || v === '') ? '–' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: d });
const pct = (v) => (v === null || v === undefined) ? '–' : (v > 0 ? '+' : '') + Math.round(Number(v) * 100) + ' %';
const fecha = (t) => t ? new Date(t).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const dia = (d) => d ? String(d).slice(0, 10) : '';
const fechaCorta = (d) => d ? new Date(dia(d) + 'T12:00:00').toLocaleDateString('es-AR') : '';
const sinMigracion = (error) => error && ['PGRST202', '42883', 'PGRST205'].includes(error.code);
const MSG_048 = '<p class="admin-dash-note">Esta sección necesita la migración <b>048</b>. Corrila en el SQL Editor y volvé a entrar.</p>';
const PERFIL = { particular: 'Usuario', oficio: 'Oficio', profesional: 'Profesional', tecnico: 'Técnico (viejo)', servicios: 'Prestador (viejo)', materiales: 'Comercio' };
const CATEG = { oficial_especializado: 'Oficial especializado', oficial: 'Oficial', medio_oficial: 'Medio oficial', ayudante: 'Ayudante' };

let listo = false;
export function initPanelDatos() {
  if (listo) return; listo = true;
  document.getElementById('pd-prof-root')?.addEventListener('click', onProfClick);
  document.getElementById('pd-prof-root')?.addEventListener('change', (e) => { if (e.target.id === 'pd-prof-filtro') cargarProfesionales(); });
  document.getElementById('pd-rend-root')?.addEventListener('click', onRendClick);
  document.getElementById('pd-hist-root')?.addEventListener('click', onHistClick);
  document.getElementById('pd-hist-root')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.pd-filtros')) { e.preventDefault(); cargarHistorial(); } });
}

// ===========================================================================
// Profesionales
// ===========================================================================
export async function cargarProfesionales() {
  initPanelDatos();
  const root = document.getElementById('pd-prof-root');
  if (!root) return;
  const filtro = document.getElementById('pd-prof-filtro')?.value || 'pendientes';
  if (!root.dataset.listo) {
    root.dataset.listo = '1';
    root.innerHTML = `
      <p class="admin-dash-note">La versión profesional de la Calculadora (rendimientos, desperdicio, Factor K, fases y rango de mercado) se habilita con la <b>matrícula verificada</b>, o con un <b>acceso aprobado</b> a mano (por ejemplo, un oficial con mucha experiencia o un MMO sin la matrícula al día). La verificación vence al año. Todo queda en el registro de auditoría.</p>
      <div class="pd-filtros"><label>Mostrar <select id="pd-prof-filtro" class="form-select">
        <option value="pendientes">Pendientes de revisar</option><option value="validados">Verificados o con acceso</option>
        <option value="vencidos">Matrícula vencida</option><option value="todos">Todos (oficio y profesionales)</option></select></label></div>
      <div id="pd-prof-lista"><p class="trb-muted">Cargando…</p></div>`;
  }
  const lista = document.getElementById('pd-prof-lista');
  const { data, error } = await ST.supabaseClient.rpc('admin_profesionales', { p_filtro: filtro });
  if (error) { lista.innerHTML = sinMigracion(error) ? MSG_048 : `<p class="trb-aviso">No se pudo cargar: ${esc(error.message)}</p>`; return; }
  if (!data || !data.length) { lista.innerHTML = '<p class="trb-muted">No hay cuentas en esta lista.</p>'; return; }
  const enUnAnio = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  lista.innerHTML = data.map(p => `
    <article class="pd-card" data-user="${esc(p.id)}">
      <div class="pd-card-head">
        <div><strong>${esc(p.nombre || 'Sin nombre')}</strong> <span class="pd-chip">${esc(PERFIL[p.perfil] || p.perfil || '–')}</span>
          <div class="pd-sub">${esc([p.rubro, CATEG[p.categoria_uocra], p.localidad].filter(Boolean).join(' · ') || 'Sin rubro')} · ${esc(p.email || '')}</div></div>
        <div class="pd-estado">
          ${p.matricula ? `<span class="pd-chip pd-${esc(p.matricula_estado)}">Matrícula: ${p.matricula_estado === 'validada' ? 'verificada' + (p.matricula_vence ? ' hasta ' + fechaCorta(p.matricula_vence) : '') : p.matricula_estado === 'rechazada' ? 'no verificada' : 'sin verificar'}</span>` : ''}
          ${p.acceso_pro !== 'ninguno' ? `<span class="pd-chip pd-acceso-${esc(p.acceso_pro)}">Acceso: ${esc(p.acceso_pro)}${p.acceso_pro_at ? ' · ' + fecha(p.acceso_pro_at) : ''}</span>` : ''}
        </div>
      </div>
      ${p.matricula ? `<p class="pd-sub"><b>Matrícula:</b> ${esc(p.matricula)} · <b>Colegio:</b> ${esc(p.colegio || 'no indicó')}${p.matricula_nota ? ' · <i>' + esc(p.matricula_nota) + '</i>' : ''}</p>` : '<p class="pd-sub">No cargó matrícula.</p>'}
      <div class="pd-acciones">
        ${p.matricula ? `<label>Vence <input type="date" class="form-select pd-vence" value="${esc(dia(p.matricula_vence) || enUnAnio)}"></label>
          <input type="text" class="form-select pd-nota" maxlength="300" placeholder="Nota (ej: padrón CPIM 26/11)">
          <button type="button" class="btn-computo" data-pd="mat-ok">Verificar matrícula</button>
          <button type="button" class="btn-action-drawer" data-pd="mat-no">No se pudo verificar</button>` : ''}
        ${p.acceso_pro === 'aprobado'
          ? '<button type="button" class="btn-action-drawer" data-pd="acc-baja">Dar de baja el acceso</button>'
          : `<button type="button" class="btn-action-drawer" data-pd="acc-ok">Aprobar acceso profesional</button>`}
      </div>
    </article>`).join('');
}

async function onProfClick(e) {
  const b = e.target.closest('[data-pd]');
  if (!b) return;
  const card = b.closest('[data-user]'); if (!card) return;
  const user = card.dataset.user;
  b.disabled = true;
  let r;
  if (b.dataset.pd === 'mat-ok' || b.dataset.pd === 'mat-no') {
    r = await ST.supabaseClient.rpc('admin_validar_matricula', {
      p_user: user, p_estado: b.dataset.pd === 'mat-ok' ? 'validada' : 'rechazada',
      p_vence: card.querySelector('.pd-vence')?.value || null, p_nota: card.querySelector('.pd-nota')?.value || null });
  } else {
    r = await ST.supabaseClient.rpc('admin_acceso_pro', { p_user: user, p_estado: b.dataset.pd === 'acc-ok' ? 'aprobado' : 'revocado' });
  }
  if (r.error) { ST.showToast('No se pudo guardar: ' + r.error.message); b.disabled = false; return; }
  ST.showToast('Guardado.');
  cargarProfesionales();
}

// ===========================================================================
// Rendimientos
// ===========================================================================
const R = { filas: [], abierto: null };
function filtroRend() {
  const v = (id) => document.getElementById(id);
  const perfiles = [...document.querySelectorAll('#pd-rend-root .pd-perfil:checked')].map(x => x.value);
  return {
    filtro: { localidad: (v('pd-rend-ciudad')?.value || '').trim(), perfiles, solo_validados: !!v('pd-rend-validados')?.checked },
    umbral: Math.max(0, Number(v('pd-rend-umbral')?.value || 25)) / 100,
    min: Math.max(1, parseInt(v('pd-rend-min')?.value || '5', 10)),
  };
}

export async function cargarRendimientos() {
  initPanelDatos();
  const root = document.getElementById('pd-rend-root');
  if (!root) return;
  if (!root.dataset.listo) {
    root.dataset.listo = '1';
    root.innerHTML = `
      <p class="admin-dash-note">Cuando alguien guarda un presupuesto con un rendimiento de mano de obra cambiado, se anota de forma anónima (uno por persona y tarea; se descarta lo menor a un tercio o mayor al triple de la base). <b>La base nunca cambia sola</b>: la cambiás vos con "Adoptar". "Rango orientativo" lo muestra a los profesionales en la Calculadora. Nunca se ve quién cargó cada dato, y un corte con muy pocos datos no muestra valores.</p>
      <div class="pd-filtros">
        <label>Ciudad <input id="pd-rend-ciudad" class="form-select" type="text" placeholder="Todas"></label>
        <span class="pd-checks">${['profesional', 'oficio', 'particular'].map(k => `<label><input type="checkbox" class="pd-perfil" value="${k}"> ${esc(PERFIL[k])}</label>`).join('')}</span>
        <label><input type="checkbox" id="pd-rend-validados"> Solo matrícula verificada</label>
        <label>Alerta si se aleja más de <input id="pd-rend-umbral" class="form-select pd-corto" type="number" min="5" max="200" step="5" value="25"> %</label>
        <label>Mínimo <input id="pd-rend-min" class="form-select pd-corto" type="number" min="2" max="100" value="5"> usuarios</label>
        <button type="button" class="btn-computo" data-pdr="actualizar">Actualizar</button>
      </div>
      <div id="pd-rend-lista"><p class="trb-muted">Cargando…</p></div>`;
  }
  const lista = document.getElementById('pd-rend-lista');
  const f = filtroRend();
  const { data, error } = await ST.supabaseClient.rpc('admin_rendimientos', { p_filtro: f.filtro, p_umbral: f.umbral, p_min: f.min });
  if (error) { lista.innerHTML = sinMigracion(error) ? MSG_048 : `<p class="trb-aviso">No se pudo cargar: ${esc(error.message)}</p>`; return; }
  R.filas = data || [];
  if (!R.filas.length) { lista.innerHTML = '<p class="trb-muted">Todavía no hay rendimientos de mano de obra cambiados por usuarios (o ninguno cumple el filtro).</p>'; return; }
  const alertas = R.filas.filter(x => x.alerta).length;
  lista.innerHTML = `
    <p class="pd-sub">${R.filas.length} componentes con datos · <b>${alertas}</b> con alerta.</p>
    <div class="admin-table-wrap"><table class="pd-tabla">
      <thead><tr><th></th><th>Tarea · mano de obra</th><th>Base</th><th>Mediana</th><th>Rango (25–75)</th><th>Diferencia</th><th>Datos</th><th>Decisión</th></tr></thead>
      <tbody>${R.filas.map((x, i) => `
        <tr class="${x.alerta ? 'pd-alerta' : ''}">
          <td>${x.alerta ? '<span class="pd-chip pd-rechazada" title="La mediana se aleja más del umbral">Alerta</span>' : ''}</td>
          <td><b>${esc(x.tarea)}</b><div class="pd-sub">${esc(x.rubro || '')} · ${esc(x.componente || 'Mano de obra')} · por ${esc(x.unidad || 'unidad')}</div></td>
          <td>${num(x.base, 4)}</td><td>${num(x.mediana, 4)}</td>
          <td>${x.p25 !== null ? num(x.p25, 4) + ' – ' + num(x.p75, 4) : '–'}</td>
          <td>${pct(x.desvio)}</td><td>${x.n}</td>
          <td>${x.decision ? esc(x.decision) + (x.decision_at ? '<div class="pd-sub">' + fecha(x.decision_at) + '</div>' : '') : '–'}</td>
        </tr>
        <tr class="pd-fila-acciones"><td></td><td colspan="7"><button type="button" class="casa-link" data-pdr="abrir" data-i="${i}">${R.abierto === x.apu_task_component_id ? 'Cerrar' : 'Ver de dónde vienen y decidir'}</button>
          <div class="pd-detalle" id="pd-rend-det-${x.apu_task_component_id}"${R.abierto === x.apu_task_component_id ? '' : ' hidden'}></div></td></tr>`).join('')}
      </tbody></table></div>`;
  if (R.abierto) abrirDetalle(R.filas.find(x => x.apu_task_component_id === R.abierto));
}

async function abrirDetalle(x) {
  if (!x) return;
  const det = document.getElementById(`pd-rend-det-${x.apu_task_component_id}`);
  if (!det) return;
  det.hidden = false;
  det.innerHTML = '<p class="trb-muted">Cargando cortes…</p>';
  const f = filtroRend();
  const { data, error } = await ST.supabaseClient.rpc('admin_rendimientos_cortes', { p_comp: x.apu_task_component_id, p_filtro: f.filtro, p_min: 3 });
  if (error) { det.innerHTML = `<p class="trb-aviso">${esc(error.message)}</p>`; return; }
  const porCorte = {};
  (data || []).forEach(c => { (porCorte[c.corte] = porCorte[c.corte] || []).push(c); });
  det.innerHTML = `
    <div class="pd-cortes">${Object.entries(porCorte).map(([corte, filas]) => `
      <div><b>Por ${esc(corte)}</b><table class="pd-tabla pd-mini"><tbody>${filas.map(c => `<tr><td>${esc(c.valor)}</td><td>${c.n} datos</td><td>${c.mediana !== null ? 'mediana ' + num(c.mediana, 4) + ' (' + num(c.p25, 4) + '–' + num(c.p75, 4) + ')' : '<span class="pd-sub">pocos datos</span>'}</td></tr>`).join('')}</tbody></table></div>`).join('')}
    </div>
    <p class="pd-sub">Las decisiones usan el filtro de arriba (ciudad, perfiles, solo verificados). Si cambiás el filtro, tocá "Actualizar" antes de decidir.</p>
    <div class="pd-acciones" data-comp="${x.apu_task_component_id}">
      <label>Valor a adoptar <input type="number" class="form-select pd-valor" step="0.0001" min="0" value="${x.mediana ?? ''}"></label>
      <input type="text" class="form-select pd-motivo" maxlength="300" placeholder="Motivo (ej: mediana de MMO e ingenieros de Oberá)">
      <button type="button" class="btn-computo" data-pdr="adoptado">Adoptar como base</button>
      <button type="button" class="btn-action-drawer" data-pdr="orientativo">Dejar como rango orientativo</button>
      <button type="button" class="btn-action-drawer" data-pdr="ignorado">Ignorar</button>
      ${x.decision ? '<button type="button" class="casa-link" data-pdr="borrar">Quitar la decisión</button>' : ''}
    </div>`;
}

async function onRendClick(e) {
  const b = e.target.closest('[data-pdr]');
  if (!b) return;
  const accion = b.dataset.pdr;
  if (accion === 'actualizar') { cargarRendimientos(); return; }
  if (accion === 'abrir') {
    const x = R.filas[Number(b.dataset.i)];
    if (!x) return;
    if (R.abierto === x.apu_task_component_id) { R.abierto = null; document.getElementById(`pd-rend-det-${x.apu_task_component_id}`).hidden = true; b.textContent = 'Ver de dónde vienen y decidir'; return; }
    R.abierto = x.apu_task_component_id; b.textContent = 'Cerrar';
    abrirDetalle(x);
    return;
  }
  const box = b.closest('[data-comp]'); if (!box) return;
  const comp = Number(box.dataset.comp);
  const valor = box.querySelector('.pd-valor')?.value;
  if (accion === 'adoptado') {
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = `¿Seguro? La base pasa a ${num(valor, 4)} y cambia el precio de la tarea`; return; }
  }
  b.disabled = true;
  const { error } = await ST.supabaseClient.rpc('admin_rendimiento_decidir', {
    p_comp: comp, p_accion: accion, p_filtro: filtroRend().filtro,
    p_valor: accion === 'adoptado' && valor !== '' ? Number(valor) : null,
    p_motivo: box.querySelector('.pd-motivo')?.value || null });
  if (error) { ST.showToast('No se pudo guardar: ' + error.message); b.disabled = false; return; }
  ST.showToast(accion === 'adoptado' ? 'Base actualizada. Quedó en el historial.' : 'Decisión guardada.');
  cargarRendimientos();
}

// ===========================================================================
// Historial
// ===========================================================================
const TABLAS = [['', 'Todas'], ['apu_task_components', 'Componentes de APU (rendimientos)'], ['apu_tasks', 'Tareas APU'], ['apu_labor_rates', 'Jornales'],
  ['apu_equipment_rates', 'Equipos'], ['materials', 'Materiales'], ['material_price_bases', 'Precios base'], ['index_values', 'Valores de índices'], ['index_series', 'Series de índices']];
const H = { filas: [] };

export async function cargarHistorial() {
  initPanelDatos();
  const root = document.getElementById('pd-hist-root');
  if (!root) return;
  if (!root.dataset.listo) {
    root.dataset.listo = '1';
    root.innerHTML = `
      <p class="admin-dash-note">Cada cambio en los datos de referencia queda acá, con la fila completa de antes y de después, quién lo hizo y por qué. "Restaurar" deja la fila como estaba <b>antes</b> de ese cambio, y también queda registrado.</p>
      <div class="pd-filtros">
        <label>Datos <select id="pd-hist-tabla" class="form-select">${TABLAS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
        <label>Id <input id="pd-hist-fila" class="form-select pd-corto" type="text" placeholder="Todos"></label>
        <label>Buscar <input id="pd-hist-buscar" class="form-select" type="text" placeholder="Ej: cemento, Oficial…"></label>
        <button type="button" class="btn-computo" data-pdh="buscar">Buscar</button>
      </div>
      <div id="pd-hist-lista"><p class="trb-muted">Cargando…</p></div>`;
  }
  const lista = document.getElementById('pd-hist-lista');
  const { data, error } = await ST.supabaseClient.rpc('admin_historial', {
    p_tabla: document.getElementById('pd-hist-tabla')?.value || null,
    p_fila: (document.getElementById('pd-hist-fila')?.value || '').trim() || null,
    p_buscar: (document.getElementById('pd-hist-buscar')?.value || '').trim() || null, p_limite: 150 });
  if (error) { lista.innerHTML = sinMigracion(error) ? MSG_048 : `<p class="trb-aviso">No se pudo cargar: ${esc(error.message)}</p>`; return; }
  H.filas = data || [];
  if (!H.filas.length) { lista.innerHTML = '<p class="trb-muted">Sin cambios registrados con este filtro (el historial empieza a contar desde que se corrió la 048).</p>'; return; }
  const nombreTabla = Object.fromEntries(TABLAS);
  lista.innerHTML = H.filas.map((h, i) => {
    const fila = h.despues || h.antes || {};
    const titulo = fila.nombre || fila.denomination || fila.descripcion_original || fila.code || '';
    const cambios = h.accion === 'UPDATE'
      ? (h.campos || []).map(c => `<li><b>${esc(c)}:</b> ${esc(corto(h.antes?.[c]))} → ${esc(corto(h.despues?.[c]))}</li>`).join('')
      : `<li>${h.accion === 'INSERT' ? 'Alta' : 'Baja'} de la fila</li>`;
    return `<article class="pd-card">
      <div class="pd-card-head"><div><strong>${esc(nombreTabla[h.tabla] || h.tabla)} #${esc(h.fila_id)}</strong> ${titulo ? '· ' + esc(corto(titulo, 60)) : ''}
        <div class="pd-sub">${fecha(h.at)} · ${esc(h.actor)} · ${esc(h.accion)}</div></div>
        <button type="button" class="btn-action-drawer" data-pdh="restaurar" data-i="${i}">Restaurar a como estaba antes</button></div>
      <ul class="pd-cambios">${cambios}</ul>
      ${h.motivo ? `<p class="pd-sub"><b>Motivo:</b> ${esc(h.motivo)}</p>` : ''}
    </article>`;
  }).join('');
}
function corto(v, n = 80) {
  if (v === null || v === undefined) return '(vacío)';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

async function onHistClick(e) {
  const b = e.target.closest('[data-pdh]');
  if (!b) return;
  if (b.dataset.pdh === 'buscar') { cargarHistorial(); return; }
  const h = H.filas[Number(b.dataset.i)];
  if (!h) return;
  if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = h.accion === 'INSERT' ? '¿Seguro? Se borra la fila' : '¿Seguro? Vuelve a como estaba'; return; }
  b.disabled = true;
  const { data, error } = await ST.supabaseClient.rpc('admin_restaurar', { p_evento: h.id, p_motivo: null });
  if (error) { ST.showToast('No se pudo restaurar: ' + error.message); b.disabled = false; return; }
  ST.showToast(`Listo: fila ${data}. Quedó en el historial.`);
  cargarHistorial();
}

// ===========================================================================
// Insignias del menú del panel
// ===========================================================================
export async function insigniasPanelDatos() {
  const set = (id, n) => { const el = document.getElementById(id); if (!el) return; el.hidden = !(n > 0); el.textContent = n > 99 ? '99+' : String(n); };
  try {
    const [p, r] = await Promise.all([
      ST.supabaseClient.rpc('admin_profesionales', { p_filtro: 'pendientes' }),
      ST.supabaseClient.rpc('admin_rendimientos', { p_filtro: {}, p_umbral: 0.25, p_min: 5 }),
    ]);
    set('admin-menu-badge-profesionales', p.error ? 0 : (p.data || []).length);
    set('admin-menu-badge-rendimientos', r.error ? 0 : (r.data || []).filter(x => x.alerta).length);
  } catch (e) { /* sin la 048 no hay insignias */ }
}
