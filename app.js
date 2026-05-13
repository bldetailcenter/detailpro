// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js  (Paso 7)
//  Auth + Almacén + Operaciones + Calidad + Fotos en PDF
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser   = null;
let productosCache = [];
let lineaCount     = 0;
let productoUsadoCount = 0;

// Variables globales para el Modo Edición
let intervencionEditando = null;
let productosEditandoStock = [];

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3500);
}

function fmt(num, dec = 2) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Number(num).toFixed(dec);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFecha(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function estadoBadge(estado) {
  const map = {
    abierta:    ['badge-orange', 'Abierta'],
    en_proceso: ['badge-blue',   'En Proceso'],
    finalizada: ['badge-green',  'Finalizada'],
    entregada:  ['badge-gray',   'Entregada'],
  };
  const [cls, label] = map[estado] || ['badge-gray', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

// Auxiliar para meter fotos en PDF
async function getDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error cargando imagen para PDF", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════════
function switchModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`mod-${mod}`).classList.add('active');
  document.getElementById(`nav-${mod}`).classList.add('active');
  if (mod === 'operaciones') { cargarIntervenciones(); cargarSelectorServicios(); }
  if (mod === 'calidad')     cargarCalidad();
  if (mod === 'dashboard')   cargarDashboard();
  if (mod === 'calendario')  iniciarCalendario();
  if (mod === 'historico')   resetHistorico();
  if (mod === 'servicios')   cargarServicios();
}

function switchTab(modulo, tab) {
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${modulo}-${tab}`).classList.add('active');
  event.target.classList.add('active');
  if (modulo === 'operaciones' && tab === 'lista') limpiarFormularioIntervencion();
}

function switchTabDirect(modulo, tab) {
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${modulo}-${tab}`).classList.add('active');
  const btns = document.querySelectorAll(`#mod-${modulo} .tab-btn`);
  if (tab === 'lista' && btns[0]) btns[0].classList.add('active');
  if (tab === 'nueva' && btns[1]) btns[1].classList.add('active');
  if (modulo === 'operaciones' && tab === 'lista') limpiarFormularioIntervencion();
}

function abrirModal(id) { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

// ═══════════════════════════════════════════════════════════
//  AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  const today = new Date().toISOString().split('T')[0];
  const fi = document.getElementById('compra-fecha');
  if (fi) fi.value = today;
  db.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) { currentUser = session.user; showApp(); }
  });
  db.auth.onAuthStateChange((_e, session) => {
    if (!session && currentUser) handleLogout();
  });
});

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errDiv = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  errDiv.style.display = 'none';
  if (!email || !password) { errDiv.textContent = 'Introduce email y contraseña.'; errDiv.style.display = 'block'; return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    errDiv.textContent = 'Credenciales incorrectas.';
    errDiv.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar al sistema';
    return;
  }
  currentUser = data.user;
  showApp();
}

async function handleLogout() {
  await db.auth.signOut();
  currentUser = null;
  productosCache = [];
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('user-email-display').textContent = currentUser?.email || '';
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  const fechaEl = document.getElementById('dash-fecha');
  if (fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-ES', opts);
  cargarProductos();
  cargarDashboard();
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO ALMACÉN
// ═══════════════════════════════════════════════════════════
async function crearProducto() {
  const ni = document.getElementById('prod-nombre-interno').value.trim();
  const nc = document.getElementById('prod-nombre-comercial').value.trim();
  const cat = document.getElementById('prod-categoria').value;
  const form = parseFloat(document.getElementById('prod-formato').value);
  const dos = parseFloat(document.getElementById('prod-dosis').value);
  const pi = parseFloat(document.getElementById('prod-precio-inicial').value) || 0;
  const si = parseFloat(document.getElementById('prod-stock-inicial').value) || 0;
  const obs = document.getElementById('prod-observaciones').value.trim();

  if (!ni || !nc || !cat || !form || !dos) { showToast('Rellena los campos obligatorios', 'error'); return; }

  let pmpL = 0, pDos = 0;
  if (pi > 0 && si > 0) { pmpL = pi / (si / 1000); pDos = pmpL * (dos / 1000); }

  const { error } = await db.from('productos').insert([{
    nombre_interno: ni, nombre_comercial: nc, categoria: cat, formato_ml: form, dosis_estandar_ml: dos,
    precio_medio_litro: pmpL, precio_por_dosis: pDos, stock_actual: si, observaciones: obs || null
  }]);

  if (error) { showToast('Error al guardar', 'error'); return; }
  showToast('✓ Producto creado');
  cargarProductos();
}

async function cargarProductos() {
  document.getElementById('productos-loading').style.display = 'block';
  const { data, error } = await db.from('productos').select('*').order('nombre_comercial');
  document.getElementById('productos-loading').style.display = 'none';
  if (error) return;
  productosCache = data || [];
  renderProductosTable(productosCache);
}

function renderProductosTable(productos) {
  const tbody = document.getElementById('productos-tbody');
  const wrap = document.getElementById('productos-table-wrap');
  if (!productos.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  tbody.innerHTML = productos.map(p => {
    const status = stockStatus(p.stock_actual, p.formato_ml);
    return `<tr style="cursor:pointer;" onclick="verProducto('${p.id}')">
      <td><div style="font-weight:600;">${p.nombre_comercial}</div><div style="font-size:0.7rem;color:var(--text-muted);">${p.nombre_interno}</div></td>
      <td><span class="badge badge-gray">${p.categoria}</span></td>
      <td style="color:${status.color};font-weight:600;">${fmt(p.stock_actual,0)} ml</td>
      <td>${status.icon} ${status.label}</td>
      <td class="highlight">${fmt(p.precio_medio_litro,4)}€</td>
      <td>${fmt(p.precio_por_dosis,4)}€</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO OPERACIONES
// ═══════════════════════════════════════════════════════════

function addProductoUsado() {
  productoUsadoCount++;
  const id = productoUsadoCount;
  const container = document.getElementById('productos-usados-container');
  const options = productosCache.map(p => `<option value="${p.id}">${p.nombre_comercial}</option>`).join('');
  const div = document.createElement('div');
  div.className = 'producto-usado-row';
  div.id = `pu-${id}`;
  div.innerHTML = `
    <div class="field" style="margin:0;"><select class="pu-producto"><option value="">Producto...</option>${options}</select></div>
    <div class="field" style="margin:0;"><input type="number" class="pu-ml" placeholder="ml" /></div>
    <button class="btn-remove" onclick="document.getElementById('pu-${id}').remove()">✕</button>
  `;
  container.appendChild(div);
}

function limpiarFormularioIntervencion() {
  ['int-matricula','int-cliente','int-horas','int-precio','int-incidentes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('productos-usados-container').innerHTML = '';
  productoUsadoCount = 0;
  resetMapaDanos();
  serviciosSeleccionados = [];
  intervencionEditando = null;
  const btn = document.querySelector('[onclick="crearIntervencion()"]');
  if(btn) { btn.textContent = 'Guardar Intervención'; btn.style.background = 'var(--accent)'; }
}

async function prepararEdicion(id) {
  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  if(!inv) return;
  intervencionEditando = id;
  productosEditandoStock = inv.productos_usados || [];
  document.getElementById('int-matricula').value = inv.matricula || '';
  document.getElementById('int-cliente').value = inv.cliente_nombre || '';
  document.getElementById('int-horas').value = inv.horas_reales || '';
  document.getElementById('int-precio').value = inv.precio_cobrado || '';
  document.getElementById('int-incidentes').value = inv.incidentes || '';
  document.getElementById('int-estado').value = inv.estado || 'abierta';

  document.getElementById('productos-usados-container').innerHTML = '';
  if(inv.productos_usados) {
    inv.productos_usados.forEach(p => {
      addProductoUsado();
      const row = document.getElementById(`pu-${productoUsadoCount}`);
      row.querySelector('.pu-producto').value = p.id;
      row.querySelector('.pu-ml').value = p.ml_usados;
    });
  }

  // Cargar Daños
  limpiarMapa();
  if(inv.mapa_danos) {
    inv.mapa_danos.forEach(d => {
      damageCounter = Math.max(damageCounter, d.id);
      const color = DAMAGE_COLORS[d.tipo];
      damagePoints.push({ id: d.id, x: d.x, y: d.y, tipo: d.tipo, label: color.label });
      const g = document.getElementById('damage-points');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', d.x); circle.setAttribute('cy', d.y); circle.setAttribute('r', '10');
      circle.setAttribute('fill', color.fill); circle.setAttribute('fill-opacity', '0.75');
      circle.setAttribute('stroke', color.stroke); circle.setAttribute('stroke-width', '2');
      circle.setAttribute('id', `dp-${d.id}`); circle.style.cursor = 'pointer';
      circle.setAttribute('onclick', `removeDamagePoint(${d.id}, event)`);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', d.x); text.setAttribute('y', d.y + 4);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '9');
      text.setAttribute('fill', '#fff'); text.setAttribute('font-weight', 'bold');
      text.setAttribute('pointer-events', 'none'); text.setAttribute('id', `dt-${d.id}`);
      text.textContent = d.id;
      g.appendChild(circle); g.appendChild(text);
    });
    renderDanosList();
  }

  const btn = document.querySelector('[onclick="crearIntervencion()"]');
  if(btn) { btn.innerHTML = '💾 Actualizar Intervención'; btn.style.background = '#22c55e'; }
  cerrarModal('modal-intervencion');
  switchTabDirect('operaciones', 'nueva');
}

async function crearIntervencion() {
  const mat = document.getElementById('int-matricula').value.trim().toUpperCase();
  const cli = document.getElementById('int-cliente').value.trim();
  const hor = parseFloat(document.getElementById('int-horas').value) || null;
  const pre = parseFloat(document.getElementById('int-precio').value) || null;
  const est = document.getElementById('int-estado').value;
  const inc = document.getElementById('int-incidentes').value.trim();

  if (!mat || !cli) { showToast('Matrícula y cliente obligatorios', 'error'); return; }

  const productosUsados = [];
  document.querySelectorAll('.producto-usado-row').forEach(row => {
    const pid = row.querySelector('.pu-producto').value;
    const ml = parseFloat(row.querySelector('.pu-ml').value);
    if (!pid || !ml) return;
    const prod = productosCache.find(p => p.id === pid);
    productosUsados.push({ id: pid, nombre_comercial: prod?.nombre_comercial, ml_usados: ml, coste: (prod?.precio_por_dosis || 0) * (ml / (prod?.dosis_estandar_ml || 1)) });
  });

  const mapaData = damagePoints.length ? damagePoints.map(d => ({ id: d.id, x: d.x, y: d.y, tipo: d.tipo, label: d.label })) : null;

  if (intervencionEditando) {
    // Restaurar stock viejo
    for (const old of productosEditandoStock) {
      const p = productosCache.find(x => x.id === old.id);
      if(p) {
        const r = (p.stock_actual || 0) + old.ml_usados;
        await db.from('productos').update({ stock_actual: r }).eq('id', old.id);
        p.stock_actual = r;
      }
    }
    await db.from('intervenciones').update({
      matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre,
      productos_usados: productosUsados, mapa_danos: mapaData, incidentes: inc, estado: est,
      servicios_ids: serviciosSeleccionados
    }).eq('id', intervencionEditando);
  } else {
    await db.from('intervenciones').insert([{
      matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre,
      productos_usados: productosUsados, mapa_danos: mapaData, incidentes: inc, estado: est,
      servicios_ids: serviciosSeleccionados
    }]);
  }

  // Descontar stock nuevo
  for (const pu of productosUsados) {
    const p = productosCache.find(x => x.id === pu.id);
    if(p) {
      const n = Math.max(0, (p.stock_actual || 0) - pu.ml_usados);
      await db.from('productos').update({ stock_actual: n }).eq('id', pu.id);
      p.stock_actual = n;
    }
  }

  limpiarFormularioIntervencion();
  switchTabDirect('operaciones', 'lista');
  cargarIntervenciones();
  cargarProductos();
}

async function cargarIntervenciones() {
  const { data } = await db.from('intervenciones').select('*').order('created_at', { ascending: false });
  const cont = document.getElementById('intervenciones-container');
  if(!data) return;
  cont.innerHTML = data.map(inv => `
    <div class="intervencion-card" onclick="verIntervencion('${inv.id}')">
      <div style="display:flex;justify-content:space-between;">
        <div><div class="intervencion-matricula">${inv.matricula}</div><div class="intervencion-cliente">${inv.cliente_nombre}</div></div>
        ${estadoBadge(inv.estado)}
      </div>
    </div>`).join('');
}

async function verIntervencion(id) {
  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  if(!inv) return;
  document.getElementById('modal-int-titulo').innerHTML = `${inv.matricula} — ${inv.cliente_nombre}`;
  document.getElementById('modal-int-contenido').innerHTML = `
    <div style="display:grid;gap:1rem;">
      <div style="display:flex;gap:0.5rem;">${estadoBadge(inv.estado)}</div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div style="background:var(--bg-input);padding:0.5rem;border-radius:0.4rem;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:0.4rem;">ANTES</div>
          ${inv.foto_antes ? `<img src="${inv.foto_antes}" style="width:100%;border-radius:0.2rem;"/>` : `<input type="file" onchange="subirFoto(event,'${inv.id}','foto_antes')" style="font-size:0.7rem;width:100%;"/>`}
        </div>
        <div style="background:var(--bg-input);padding:0.5rem;border-radius:0.4rem;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:0.4rem;">DESPUÉS</div>
          ${inv.foto_despues ? `<img src="${inv.foto_despues}" style="width:100%;border-radius:0.2rem;"/>` : `<input type="file" onchange="subirFoto(event,'${inv.id}','foto_despues')" style="font-size:0.7rem;width:100%;"/>`}
        </div>
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:1rem;">
        <button class="btn-secondary" onclick="cerrarModal('modal-intervencion')">Cerrar</button>
        <button class="btn-secondary" onclick="prepararEdicion('${inv.id}')" style="color:var(--accent);">✏️ Editar</button>
        <button class="btn-secondary" onclick="eliminarIntervencion('${inv.id}')" style="color:#ef4444;">🗑️ Borrar</button>
      </div>
    </div>`;
  abrirModal('modal-intervencion');
}

async function subirFoto(e, id, col) {
  const file = e.target.files[0];
  if(!file) return;
  showToast('Subiendo...', 'success');
  const name = `${id}_${col}_${Date.now()}.jpg`;
  await db.storage.from('fotos_vehiculos').upload(name, file);
  const { data: { publicUrl } } = db.storage.from('fotos_vehiculos').getPublicUrl(name);
  await db.from('intervenciones').update({ [col]: publicUrl }).eq('id', id);
  verIntervencion(id);
}

async function eliminarIntervencion(id) {
  if(!confirm('¿Borrar? Se restaurará el stock.')) return;
  const { data: inv } = await db.from('intervenciones').select('productos_usados').eq('id', id).single();
  if(inv?.productos_usados) {
    for (const p of inv.productos_usados) {
      const pr = productosCache.find(x => x.id === p.id);
      if(pr) {
        const n = (pr.stock_actual || 0) + p.ml_usados;
        await db.from('productos').update({ stock_actual: n }).eq('id', p.id);
        pr.stock_actual = n;
      }
    }
  }
  await db.from('intervenciones').delete().eq('id', id);
  cerrarModal('modal-intervencion');
  cargarIntervenciones();
  cargarProductos();
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO CALIDAD (PDF MEJORADO)
// ═══════════════════════════════════════════════════════════

async function cargarCalidad() {
  const sel = document.getElementById('calidad-intervencion-sel');
  const { data } = await db.from('intervenciones').select('id, matricula, cliente_nombre').order('created_at', { ascending: false });
  if(!data) return;
  sel.innerHTML = '<option value="">Selecciona...</option>' + data.map(i => `<option value="${i.id}">${i.matricula} - ${i.cliente_nombre}</option>`).join('');
}

async function cargarVistaPrevia() {
  const id = document.getElementById('calidad-intervencion-sel').value;
  if(!id) return;
  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  document.getElementById('prev-matricula').textContent = inv.matricula;
  document.getElementById('prev-cliente').textContent = inv.cliente_nombre;
  document.getElementById('calidad-preview').style.display = 'block';
  document.getElementById('calidad-preview').dataset.invId = id;
}

async function generarPDFCliente() {
  const id = document.getElementById('calidad-preview').dataset.invId;
  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  
  showToast('Generando PDF con fotos...', 'success');
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Colores BL Detail
  const naranja = [249, 115, 22];
  
  // PÁGINA 1: Informe
  doc.setFillColor(30, 30, 30); doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(...naranja); doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text('BL DETAIL CENTER', 15, 14);
  
  doc.setFontSize(10);
  doc.text(`Matrícula: ${inv.matricula}`, 15, 40);
  doc.text(`Cliente: ${inv.cliente_nombre}`, 15, 48);
  doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString()}`, 15, 56);
  
  doc.setDrawColor(...naranja); doc.line(15, 65, 195, 65);
  
  doc.text('PRODUCTOS UTILIZADOS:', 15, 75);
  let y = 85;
  if(inv.productos_usados) {
    inv.productos_usados.forEach(p => {
      doc.text(`- ${p.nombre_comercial} (${p.ml_usados}ml)`, 20, y);
      y += 7;
    });
  }

  // PÁGINA 2: Reporte Fotográfico (Solo si hay fotos)
  if (inv.foto_antes || inv.foto_despues) {
    doc.addPage();
    doc.setFillColor(30, 30, 30); doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(...naranja); doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.text('REPORTE FOTOGRÁFICO', 15, 14);
    
    if (inv.foto_antes) {
      doc.setFontSize(10); doc.text('ESTADO INICIAL (ANTES):', 15, 35);
      const imgData = await getDataUrl(inv.foto_antes);
      if (imgData) doc.addImage(imgData, 'JPEG', 15, 40, 180, 100);
    }
    
    if (inv.foto_despues) {
      doc.setFontSize(10); doc.text('RESULTADO FINAL (DESPUÉS):', 15, 155);
      const imgData = await getDataUrl(inv.foto_despues);
      if (imgData) doc.addImage(imgData, 'JPEG', 15, 160, 180, 100);
    }
  }
  
  doc.save(`Informe_${inv.matricula}.pdf`);
  showToast('✓ PDF descargado');
}

// ═══════════════════════════════════════════════════════════
//  MAPA DE DAÑOS
// ═══════════════════════════════════════════════════════════
let damagePoints = []; let damageCounter = 0; let currentDamageType = 'rayazo';
const DAMAGE_COLORS = { rayazo:{fill:'#ef4444',stroke:'#fca5a5',label:'Rayazo'}, abollon:{fill:'#f59e0b',stroke:'#fcd34d',label:'Abollón'}, oxidacion:{fill:'#8b5cf6',stroke:'#c4b5fd',label:'Oxidación'}, otro:{fill:'#6b7280',stroke:'#9ca3af',label:'Otro'} };

function selectDamageType(btn) {
  document.querySelectorAll('.damage-type-btn').forEach(b => b.style.opacity = '0.45');
  btn.style.opacity = '1';
  currentDamageType = btn.dataset.type;
}

function addDamagePoint(e) {
  const svg = document.getElementById('mapa-danos');
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x = (e.clientX - rect.left) * (vb.width / rect.width);
  const y = (e.clientY - rect.top) * (vb.height / rect.height);
  damageCounter++;
  const col = DAMAGE_COLORS[currentDamageType];
  damagePoints.push({ id: damageCounter, x, y, tipo: currentDamageType, label: col.label });
  const g = document.getElementById('damage-points');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '10');
  c.setAttribute('fill', col.fill); c.setAttribute('stroke', col.stroke); c.setAttribute('id', `dp-${damageCounter}`);
  c.setAttribute('onclick', `removeDamagePoint(${damageCounter}, event)`);
  g.appendChild(c);
  renderDanosList();
}

function removeDamagePoint(id, e) {
  e.stopPropagation();
  damagePoints = damagePoints.filter(d => d.id !== id);
  document.getElementById(`dp-${id}`)?.remove();
  renderDanosList();
}

function renderDanosList() {
  const cont = document.getElementById('danos-lista-items');
  if(!damagePoints.length) { document.getElementById('danos-lista').style.display='none'; return; }
  document.getElementById('danos-lista').style.display='block';
  cont.innerHTML = damagePoints.map(d => `<span class="badge badge-gray">${d.id}. ${d.label}</span>`).join('');
}

function resetMapaDanos() {
  damagePoints = []; damageCounter = 0;
  document.getElementById('damage-points').innerHTML = '';
  renderDanosList();
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD Y SERVICIOS (Lógica simplificada)
// ═══════════════════════════════════════════════════════════
async function cargarDashboard() {
  const { data: invMes } = await db.from('intervenciones').select('precio_cobrado');
  const total = (invMes || []).reduce((s, i) => s + (i.precio_cobrado || 0), 0);
  document.getElementById('dash-ingresos').textContent = `${fmt(total, 2)}€`;
}

function stockStatus(stock, form) {
  if (stock <= 0) return { color: '#ef4444', icon: '🔴', label: 'Agotado' };
  if (stock < form * 0.2) return { color: '#f59e0b', icon: '🟡', label: 'Bajo' };
  return { color: '#22c55e', icon: '🟢', label: 'OK' };
}

let serviciosCache = [];
let serviciosSeleccionados = [];

async function cargarSelectorServicios() {
  const { data } = await db.from('servicios').select('*').eq('activo', true);
  serviciosCache = data || [];
  const cont = document.getElementById('int-servicios-selector');
  if(!data) return;
  cont.innerHTML = data.map(s => `<button onclick="toggleServicio('${s.id}')" id="serv-btn-${s.id}" class="btn-secondary" style="font-size:0.7rem; padding:0.3rem 0.6rem; margin:2px;">${s.nombre}</button>`).join('');
}

function toggleServicio(id) {
  const idx = serviciosSeleccionados.indexOf(id);
  const btn = document.getElementById(`serv-btn-${id}`);
  if(idx === -1) {
    serviciosSeleccionados.push(id);
    btn.style.background = 'var(--accent)';
  } else {
    serviciosSeleccionados.splice(idx, 1);
    btn.style.background = 'transparent';
  }
}
