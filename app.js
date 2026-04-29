// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js  (Paso 3)
//  Auth + Almacén + Operaciones + Calidad (PDF)
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser   = null;
let productosCache = [];
let lineaCount     = 0;
let productoUsadoCount = 0;

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

// ═══════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════════
function switchModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`mod-${mod}`).classList.add('active');
  document.getElementById(`nav-${mod}`).classList.add('active');
  if (mod === 'operaciones') cargarIntervenciones();
  if (mod === 'calidad')     cargarCalidad();
  if (mod === 'dashboard')   cargarDashboard();
}

function switchTab(modulo, tab) {
  // Desactivar tabs del módulo
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  // Activar tab elegida
  document.getElementById(`tab-${modulo}-${tab}`).classList.add('active');
  // Activar botón correspondiente
  event.target.classList.add('active');
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
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errDiv   = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errDiv.style.display = 'none';
  if (!email || !password) {
    errDiv.textContent = 'Introduce email y contraseña.';
    errDiv.style.display = 'block';
    return;
  }

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
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('user-email-display').textContent = currentUser?.email || '';
  // Fecha en dashboard
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  const fechaEl = document.getElementById('dash-fecha');
  if (fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-ES', opts);
  cargarProductos();
  cargarDashboard();
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO ALMACÉN — PRODUCTOS
// ═══════════════════════════════════════════════════════════
async function crearProducto() {
  const nombreInterno   = document.getElementById('prod-nombre-interno').value.trim();
  const nombreComercial = document.getElementById('prod-nombre-comercial').value.trim();
  const categoria       = document.getElementById('prod-categoria').value;
  const formato         = parseFloat(document.getElementById('prod-formato').value);
  const dosis           = parseFloat(document.getElementById('prod-dosis').value);
  const precioInicial   = parseFloat(document.getElementById('prod-precio-inicial').value) || 0;
  const stockInicial    = parseFloat(document.getElementById('prod-stock-inicial').value)  || 0;

  if (!nombreInterno || !nombreComercial || !categoria || !formato || !dosis) {
    showToast('Rellena todos los campos obligatorios', 'error'); return;
  }

  let pmpLitro = 0, precioDosis = 0;
  if (precioInicial > 0 && stockInicial > 0) {
    pmpLitro   = precioInicial / (stockInicial / 1000);
    precioDosis = pmpLitro * (dosis / 1000);
  }

  const btn = document.querySelector('[onclick="crearProducto()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  const { error } = await db.from('productos').insert([{
    nombre_interno: nombreInterno, nombre_comercial: nombreComercial,
    categoria, formato_ml: formato, dosis_estandar_ml: dosis,
    precio_medio_litro: pmpLitro, precio_por_dosis: precioDosis,
    stock_actual: stockInicial
  }]);

  if (btn) { btn.disabled = false; btn.textContent = 'Guardar Producto'; }

  if (error) { showToast('Error al guardar el producto', 'error'); return; }

  ['prod-nombre-interno','prod-nombre-comercial','prod-formato','prod-dosis',
   'prod-precio-inicial','prod-stock-inicial'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prod-categoria').value = '';

  showToast('✓ Producto creado');
  cargarProductos();
}

async function cargarProductos() {
  document.getElementById('productos-loading').style.display = 'block';
  document.getElementById('productos-table-wrap').style.display = 'none';
  document.getElementById('productos-empty').style.display = 'none';

  const { data, error } = await db.from('productos').select('*').order('nombre_comercial');

  document.getElementById('productos-loading').style.display = 'none';
  if (error) { showToast('Error al cargar productos', 'error'); return; }

  productosCache = data || [];
  renderProductosTable(productosCache);

  const cats = new Set(productosCache.map(p => p.categoria).filter(Boolean));
  document.getElementById('stat-total-productos').textContent = productosCache.length;
  document.getElementById('stat-total-categorias').textContent = cats.size;
}

function stockStatus(stock, formato) {
  // Umbrales: crítico < 10% del formato, bajo < 25%
  const critico = (formato || 1000) * 0.10;
  const bajo    = (formato || 1000) * 0.25;
  if (stock <= 0)       return { color: 'var(--danger)',  icon: '🔴', label: 'Agotado' };
  if (stock < critico)  return { color: 'var(--danger)',  icon: '🔴', label: 'Crítico' };
  if (stock < bajo)     return { color: '#f59e0b',        icon: '🟡', label: 'Bajo' };
  return                       { color: 'var(--success)', icon: '🟢', label: 'OK' };
}

function renderProductosTable(productos) {
  const tbody = document.getElementById('productos-tbody');
  const wrap  = document.getElementById('productos-table-wrap');
  const empty = document.getElementById('productos-empty');

  if (!productos.length) { empty.style.display = 'block'; wrap.style.display = 'none'; return; }

  // Alertas stock bajo
  const alertas = productos.filter(p => {
    const s = stockStatus(p.stock_actual ?? 0, p.formato_ml);
    return s.label === 'Crítico' || s.label === 'Agotado' || s.label === 'Bajo';
  });
  renderAlertasStock(alertas);

  wrap.style.display = 'block';
  // Ordenar: primero los de stock crítico
  const sorted = [...productos].sort((a, b) => {
    const sa = stockStatus(a.stock_actual ?? 0, a.formato_ml);
    const sb = stockStatus(b.stock_actual ?? 0, b.formato_ml);
    const order = { 'Agotado': 0, 'Crítico': 1, 'Bajo': 2, 'OK': 3 };
    return (order[sa.label] ?? 3) - (order[sb.label] ?? 3);
  });

  tbody.innerHTML = sorted.map(p => {
    const stock  = p.stock_actual ?? 0;
    const status = stockStatus(stock, p.formato_ml);
    const dosisRestantes = p.dosis_estandar_ml > 0 ? Math.floor(stock / p.dosis_estandar_ml) : '—';
    return `<tr>
      <td>
        <div style="font-weight:600;">${p.nombre_comercial}</div>
        <div style="font-size:0.73rem;color:var(--text-muted);">${p.nombre_interno}</div>
      </td>
      <td><span class="badge badge-gray">${capitalize(p.categoria||'—')}</span></td>
      <td>
        <div style="color:${status.color};font-weight:600;">${fmt(stock,0)} ml</div>
        <div style="font-size:0.72rem;color:var(--text-muted);">${dosisRestantes} dosis</div>
      </td>
      <td><span style="font-size:0.9rem;">${status.icon}</span> <span style="font-size:0.72rem;color:${status.color};">${status.label}</span></td>
      <td class="highlight">${fmt(p.precio_medio_litro,4)} €</td>
      <td>${fmt(p.precio_por_dosis,4)} €</td>
    </tr>`;
  }).join('');
}

function renderAlertasStock(alertas) {
  // Eliminar alerta previa si existe
  document.getElementById('stock-alertas')?.remove();
  if (!alertas.length) return;

  const div = document.createElement('div');
  div.id = 'stock-alertas';
  div.style.cssText = 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:0.6rem;padding:0.85rem 1rem;margin-bottom:1rem;';

  const titulo = document.createElement('div');
  titulo.style.cssText = 'font-family:"Barlow Condensed",sans-serif;font-size:0.9rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#fca5a5;margin-bottom:0.5rem;';
  titulo.textContent = `⚠️ ${alertas.length} producto${alertas.length > 1 ? 's' : ''} con stock bajo`;
  div.appendChild(titulo);

  alertas.forEach(p => {
    const s = stockStatus(p.stock_actual ?? 0, p.formato_ml);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:0.82rem;padding:0.2rem 0;';
    row.innerHTML = `<span style="color:var(--text-secondary);">${s.icon} ${p.nombre_comercial}</span><span style="color:${s.color};font-weight:600;">${fmt(p.stock_actual??0,0)} ml — ${s.label}</span>`;
    div.appendChild(row);
  });

  // Insertar antes de la tabla
  const card = document.getElementById('productos-table-wrap').closest('.card');
  card.insertBefore(div, card.firstChild);
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO ALMACÉN — COMPRAS (PEDIDOS)
// ═══════════════════════════════════════════════════════════

// ── Líneas dinámicas ─────────────────────────────────────
function addLineaPedido() {
  lineaCount++;
  const id = lineaCount;
  const container = document.getElementById('lineas-pedido');

  const options = productosCache.map(p =>
    `<option value="${p.id}" data-pmp="${p.precio_medio_litro||0}" data-stock="${p.stock_actual||0}" data-dosis="${p.dosis_estandar_ml||0}">${p.nombre_comercial}</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'linea-pedido';
  div.id = `linea-${id}`;
  div.innerHTML = `
    <div class="field" style="margin:0;">
      <select class="lp-producto" onchange="actualizarResumenCompra()">
        <option value="">Producto...</option>
        ${options}
      </select>
    </div>
    <div class="field lp-ml" style="margin:0;">
      <input type="number" class="lp-cantidad" placeholder="ml" min="1" oninput="actualizarResumenCompra()" />
    </div>
    <div class="field lp-precio" style="margin:0;">
      <input type="number" class="lp-precio-val" placeholder="€" min="0" step="0.01" oninput="actualizarResumenCompra()" />
    </div>
    <button class="btn-remove" onclick="removeLinea('linea-${id}')">✕</button>
  `;
  container.appendChild(div);
  actualizarResumenCompra();
}

function removeLinea(id) {
  document.getElementById(id)?.remove();
  actualizarResumenCompra();
}

function actualizarResumenCompra() {
  const lineas = document.querySelectorAll('.linea-pedido');
  const gastoTotal = parseFloat(document.getElementById('compra-total').value) || 0;
  const resumen = document.getElementById('resumen-compra');

  if (lineas.length === 0 && gastoTotal === 0) { resumen.style.display = 'none'; return; }

  resumen.style.display = 'block';
  document.getElementById('res-num-productos').textContent = lineas.length;
  document.getElementById('res-gasto-total').textContent = `${fmt(gastoTotal, 2)} €`;
}

// ── Registrar Compra completa ─────────────────────────────
async function registrarCompra() {
  const proveedor   = document.getElementById('compra-proveedor').value.trim();
  const fecha       = document.getElementById('compra-fecha').value;
  const url         = document.getElementById('compra-url').value.trim();
  const gastoTotal  = parseFloat(document.getElementById('compra-total').value) || 0;
  const notas       = document.getElementById('compra-notas').value.trim();

  if (!proveedor) { showToast('Indica el proveedor / tienda', 'error'); return; }
  if (!fecha)     { showToast('Indica la fecha de compra', 'error'); return; }

  // Recoger líneas
  const lineas = [];
  let lineasValidas = true;
  document.querySelectorAll('.linea-pedido').forEach(row => {
    const productoId = row.querySelector('.lp-producto').value;
    const cantidad   = parseFloat(row.querySelector('.lp-cantidad').value);
    const precio     = parseFloat(row.querySelector('.lp-precio-val').value);
    if (!productoId || !cantidad || !precio) { lineasValidas = false; return; }
    lineas.push({ productoId, cantidad, precio });
  });

  if (!lineasValidas) { showToast('Completa todos los campos de cada producto', 'error'); return; }
  if (lineas.length === 0) { showToast('Añade al menos un producto', 'error'); return; }

  const btn = document.querySelector('[onclick="registrarCompra()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  // 1. Guardar cabecera de compra
  const { data: compraData, error: compraErr } = await db.from('compras').insert([{
    proveedor, url_web: url || null, fecha, gasto_total: gastoTotal, notas: notas || null
  }]).select().single();

  if (compraErr) {
    console.error(compraErr);
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Compra y Actualizar PMP'; }
    showToast('Error al registrar la compra', 'error'); return;
  }

  // 2. Para cada línea: guardar pedido + recalcular PMP
  for (const linea of lineas) {
    // Obtener datos actuales del producto
    const prod = productosCache.find(p => p.id === linea.productoId);
    if (!prod) continue;

    const stockActual = prod.stock_actual || 0;
    const pmpActual   = prod.precio_medio_litro || 0;
    const dosisStd    = prod.dosis_estandar_ml || 0;

    const precioMlNuevo = linea.precio / linea.cantidad;
    let nuevoPmpMl;
    if (stockActual === 0) {
      nuevoPmpMl = precioMlNuevo;
    } else {
      const pmpMlActual = pmpActual / 1000;
      nuevoPmpMl = ((stockActual * pmpMlActual) + (linea.cantidad * precioMlNuevo))
                   / (stockActual + linea.cantidad);
    }

    const nuevoPmpLitro    = nuevoPmpMl * 1000;
    const nuevoPrecioDosis = nuevoPmpMl * dosisStd;
    const nuevoStock       = stockActual + linea.cantidad;

    // Insertar en pedidos
    await db.from('pedidos').insert([{
      producto_id: linea.productoId,
      compra_id:   compraData.id,
      fecha,
      cantidad_ml: linea.cantidad,
      precio_total_pagado: linea.precio
    }]);

    // Actualizar producto
    await db.from('productos').update({
      precio_medio_litro: nuevoPmpLitro,
      precio_por_dosis:   nuevoPrecioDosis,
      stock_actual:       nuevoStock
    }).eq('id', linea.productoId);

    // Actualizar cache local
    prod.stock_actual        = nuevoStock;
    prod.precio_medio_litro  = nuevoPmpLitro;
    prod.precio_por_dosis    = nuevoPrecioDosis;
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Registrar Compra y Actualizar PMP'; }

  // Limpiar formulario
  document.getElementById('compra-proveedor').value = '';
  document.getElementById('compra-url').value       = '';
  document.getElementById('compra-total').value     = '';
  document.getElementById('compra-notas').value     = '';
  document.getElementById('lineas-pedido').innerHTML = '';
  document.getElementById('resumen-compra').style.display = 'none';
  lineaCount = 0;

  showToast(`✓ Compra registrada · ${lineas.length} producto(s) actualizados`);
  cargarProductos();
}

// ── Historial de Compras ──────────────────────────────────
async function cargarHistorial() {
  const loading   = document.getElementById('historial-loading');
  const container = document.getElementById('historial-container');
  const empty     = document.getElementById('historial-empty');

  loading.style.display = 'block';
  container.innerHTML   = '';
  empty.style.display   = 'none';

  // Traer compras con sus pedidos y productos
  const { data: compras, error } = await db
    .from('compras')
    .select(`*, pedidos(cantidad_ml, precio_total_pagado, productos(nombre_comercial))`)
    .order('fecha', { ascending: false });

  loading.style.display = 'none';

  if (error) { showToast('Error al cargar historial', 'error'); return; }
  if (!compras || compras.length === 0) { empty.style.display = 'block'; return; }

  container.innerHTML = compras.map(c => {
    const lineasHTML = (c.pedidos || []).map(p => `
      <div class="compra-linea-item">
        <span>${p.productos?.nombre_comercial || '—'}</span>
        <span>${fmt(p.cantidad_ml, 0)} ml · ${fmt(p.precio_total_pagado, 2)} €</span>
      </div>`).join('');

    const urlLink = c.url_web
      ? `<a href="${c.url_web}" target="_blank" style="color:var(--accent);font-size:0.78rem;text-decoration:none;">🔗 Ver web</a>`
      : '';

    return `
      <div class="compra-card">
        <div class="compra-card-header">
          <div>
            <div class="compra-proveedor">${c.proveedor}</div>
            <div class="compra-fecha">${formatFecha(c.fecha)} ${urlLink}</div>
            ${c.notas ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">${c.notas}</div>` : ''}
          </div>
          <div class="compra-total">${fmt(c.gasto_total, 2)} €</div>
        </div>
        ${lineasHTML ? `<div class="compra-lineas">${lineasHTML}</div>` : ''}
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO OPERACIONES
// ═══════════════════════════════════════════════════════════

// ── Productos usados dinámicos ────────────────────────────
function addProductoUsado() {
  productoUsadoCount++;
  const id = productoUsadoCount;
  const container = document.getElementById('productos-usados-container');

  const options = productosCache.map(p =>
    `<option value="${p.id}" data-nombre="${p.nombre_comercial}" data-dosis="${p.precio_por_dosis||0}">${p.nombre_comercial}</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'producto-usado-row';
  div.id = `pu-${id}`;
  div.innerHTML = `
    <div class="field" style="margin:0;">
      <select class="pu-producto">
        <option value="">Producto...</option>
        ${options}
      </select>
    </div>
    <div class="field" style="margin:0;">
      <input type="number" class="pu-ml" placeholder="ml" min="1" />
    </div>
    <button class="btn-remove" onclick="document.getElementById('pu-${id}').remove()">✕</button>
  `;
  container.appendChild(div);
}

// ── Crear Intervención ────────────────────────────────────
async function crearIntervencion() {
  const matricula  = document.getElementById('int-matricula').value.trim().toUpperCase();
  const cliente    = document.getElementById('int-cliente').value.trim();
  const servicio   = document.getElementById('int-servicio').value;
  const horas      = parseFloat(document.getElementById('int-horas').value) || null;
  const precio     = parseFloat(document.getElementById('int-precio').value) || null;
  const estado     = document.getElementById('int-estado').value;
  const incidentes = document.getElementById('int-incidentes').value.trim();

  if (!matricula) { showToast('Introduce la matrícula', 'error'); return; }
  if (!cliente)   { showToast('Introduce el nombre del cliente', 'error'); return; }

  // Recoger productos usados
  const productosUsados = [];
  document.querySelectorAll('.producto-usado-row').forEach(row => {
    const productoId = row.querySelector('.pu-producto').value;
    const ml = parseFloat(row.querySelector('.pu-ml').value);
    if (!productoId || !ml) return;
    const prod = productosCache.find(p => p.id === productoId);
    productosUsados.push({
      id: productoId,
      nombre: prod?.nombre_comercial || '',
      nombre_comercial: prod?.nombre_comercial || '',
      ml_usados: ml,
      coste: (prod?.precio_por_dosis || 0) * (ml / (prod?.dosis_estandar_ml || 1))
    });
  });

  // Recoger mapa de daños
  const mapaData = damagePoints.length ? damagePoints.map(d => ({
    id: d.id, x: Math.round(d.x), y: Math.round(d.y),
    tipo: d.tipo, label: DAMAGE_COLORS[d.tipo]?.label || d.tipo
  })) : null;

  const btn = document.querySelector('[onclick="crearIntervencion()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  const { error } = await db.from('intervenciones').insert([{
    matricula, cliente_nombre: cliente, servicio_id: null,
    horas_reales: horas, precio_cobrado: precio,
    productos_usados: productosUsados.length ? productosUsados : null,
    mapa_danos: mapaData,
    incidentes: incidentes || null, estado,
    nombre_servicio: servicio || null
  }]);

  if (btn) { btn.disabled = false; btn.textContent = 'Guardar Intervención'; }

  if (error) {
    console.error(error);
    showToast('Error al guardar la intervención', 'error'); return;
  }

  // ── Descontar stock automáticamente ──────────────────────
  for (const pu of productosUsados) {
    const prod = productosCache.find(p => p.id === pu.id);
    if (!prod) continue;
    const nuevoStock = Math.max(0, (prod.stock_actual || 0) - pu.ml_usados);
    await db.from('productos').update({ stock_actual: nuevoStock }).eq('id', pu.id);
    prod.stock_actual = nuevoStock; // actualizar cache local
  }
  if (productosUsados.length > 0) {
    cargarProductos(); // refrescar inventario en background
  }

  // Limpiar
  ['int-matricula','int-cliente','int-horas','int-precio','int-incidentes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('int-servicio').value = '';
  document.getElementById('int-estado').value   = 'abierta';
  document.getElementById('productos-usados-container').innerHTML = '';
  productoUsadoCount = 0;
  resetMapaDanos();

  showToast('✓ Intervención guardada · Stock actualizado');
  switchModule('operaciones');
  switchTabDirect('operaciones', 'lista');
}

function switchTabDirect(modulo, tab) {
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${modulo}-${tab}`).classList.add('active');
  // Activar el primer botón que corresponde al tab
  const btns = document.querySelectorAll(`#mod-${modulo} .tab-btn`);
  if (tab === 'lista' && btns[0]) btns[0].classList.add('active');
  if (tab === 'nueva' && btns[1]) btns[1].classList.add('active');
}

// ── Cargar Intervenciones ─────────────────────────────────
async function cargarIntervenciones() {
  const loading   = document.getElementById('intervenciones-loading');
  const container = document.getElementById('intervenciones-container');
  const empty     = document.getElementById('intervenciones-empty');

  loading.style.display = 'block';
  container.innerHTML   = '';
  empty.style.display   = 'none';

  const { data, error } = await db
    .from('intervenciones')
    .select('*')
    .order('created_at', { ascending: false });

  loading.style.display = 'none';

  if (error) { showToast('Error al cargar intervenciones', 'error'); return; }
  if (!data || data.length === 0) { empty.style.display = 'block'; return; }

  container.innerHTML = data.map(inv => {
    const productos = inv.productos_usados || [];
    const numProductos = productos.length;
    return `
      <div class="intervencion-card" onclick="verIntervencion('${inv.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div class="intervencion-matricula">${inv.matricula}</div>
            <div class="intervencion-cliente">${inv.cliente_nombre}</div>
          </div>
          ${estadoBadge(inv.estado)}
        </div>
        <div class="intervencion-meta">
          ${inv.nombre_servicio ? `<span class="badge badge-gray">${inv.nombre_servicio}</span>` : ''}
          ${inv.horas_reales ? `<span class="badge badge-blue">⏱ ${inv.horas_reales}h</span>` : ''}
          ${inv.precio_cobrado ? `<span class="badge badge-green">💰 ${fmt(inv.precio_cobrado,2)} €</span>` : ''}
          ${numProductos > 0 ? `<span class="badge badge-orange">🧴 ${numProductos} prod.</span>` : ''}
        </div>
        <div style="font-size:0.73rem;color:var(--text-muted);margin-top:0.5rem;">
          ${new Date(inv.created_at).toLocaleDateString('es-ES')}
        </div>
      </div>`;
  }).join('');
}

// ── Ver detalle Intervención ──────────────────────────────
async function verIntervencion(id) {
  const { data: inv, error } = await db
    .from('intervenciones').select('*').eq('id', id).single();
  if (error || !inv) return;

  const productos = inv.productos_usados || [];
  const costeMateriales = productos.reduce((s, p) => s + (p.coste || 0), 0);
  const rentabilidad = inv.precio_cobrado
    ? `${fmt(inv.precio_cobrado, 2)} € - ${fmt(costeMateriales, 2)} € = <span class="highlight">${fmt(inv.precio_cobrado - costeMateriales, 2)} €</span>`
    : '—';

  document.getElementById('modal-int-titulo').innerHTML =
    `<span>${inv.matricula}</span> — ${inv.cliente_nombre}`;

  document.getElementById('modal-int-contenido').innerHTML = `
    <div style="display:grid;gap:0.75rem;">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        ${estadoBadge(inv.estado)}
        ${inv.nombre_servicio ? `<span class="badge badge-gray">${inv.nombre_servicio}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">HORAS</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:700;">${inv.horas_reales || '—'} h</div>
        </div>
        <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">PRECIO COBRADO</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:700;color:var(--accent);">${inv.precio_cobrado ? fmt(inv.precio_cobrado,2)+' €' : '—'}</div>
        </div>
      </div>
      ${productos.length > 0 ? `
        <div>
          <div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.5rem;">Productos Usados</div>
          ${productos.map(p => `
            <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;">
              <span>${p.nombre_comercial || p.nombre}</span>
              <span style="color:var(--text-muted)">${p.ml_usados} ml · ${fmt(p.coste,4)} €</span>
            </div>`).join('')}
          <div style="display:flex;justify-content:space-between;padding:0.4rem 0;font-size:0.85rem;margin-top:0.25rem;">
            <span style="color:var(--text-secondary);">Coste total materiales</span>
            <span class="highlight">${fmt(costeMateriales,4)} €</span>
          </div>
        </div>` : ''}
      ${inv.mapa_danos && inv.mapa_danos.length > 0 ? `
        <div>
          <div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.5rem;">Mapa de Daños</div>
          <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:0.4rem;overflow:hidden;position:relative;">
            <svg viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
              <rect x="60" y="70" width="380" height="100" rx="18" fill="#222" stroke="#444" stroke-width="1.5"/>
              <rect x="140" y="45" width="200" height="75" rx="14" fill="#2a2a2a" stroke="#444" stroke-width="1.5"/>
              <path d="M148,48 L340,48 L325,95 L163,95 Z" fill="#1a1a2e" stroke="#555" stroke-width="1"/>
              <path d="M163,95 L325,95 L318,118 L170,118 Z" fill="#1a1a2e" stroke="#555" stroke-width="1" opacity="0.6"/>
              <ellipse cx="135" cy="175" rx="30" ry="14" fill="#111" stroke="#555" stroke-width="2"/>
              <ellipse cx="135" cy="175" rx="18" ry="8" fill="#1a1a1a" stroke="#666" stroke-width="1"/>
              <ellipse cx="365" cy="175" rx="30" ry="14" fill="#111" stroke="#555" stroke-width="2"/>
              <ellipse cx="365" cy="175" rx="18" ry="8" fill="#1a1a1a" stroke="#666" stroke-width="1"/>
              <ellipse cx="135" cy="55" rx="30" ry="14" fill="#111" stroke="#555" stroke-width="2"/>
              <ellipse cx="135" cy="55" rx="18" ry="8" fill="#1a1a1a" stroke="#666" stroke-width="1"/>
              <ellipse cx="365" cy="55" rx="30" ry="14" fill="#111" stroke="#555" stroke-width="2"/>
              <ellipse cx="365" cy="55" rx="18" ry="8" fill="#1a1a1a" stroke="#666" stroke-width="1"/>
              <rect x="62" y="78" width="28" height="20" rx="4" fill="#1a1a2e" stroke="#f97316" stroke-width="1"/>
              <rect x="410" y="78" width="28" height="20" rx="4" fill="#1a1a2e" stroke="#ef4444" stroke-width="1"/>
              <rect x="62" y="132" width="28" height="20" rx="4" fill="#1a1a2e" stroke="#f97316" stroke-width="1"/>
              <rect x="410" y="132" width="28" height="20" rx="4" fill="#1a1a2e" stroke="#ef4444" stroke-width="1"/>
              <text x="38" y="118" font-size="9" fill="#555" text-anchor="middle" font-family="sans-serif">DEL</text>
              <text x="462" y="118" font-size="9" fill="#555" text-anchor="middle" font-family="sans-serif">TRA</text>
              ${inv.mapa_danos.map(d => {
                const colors = { rayazo:'#ef4444', abollon:'#f59e0b', oxidacion:'#8b5cf6', otro:'#6b7280' };
                const strokes = { rayazo:'#fca5a5', abollon:'#fcd34d', oxidacion:'#c4b5fd', otro:'#9ca3af' };
                const c = colors[d.tipo] || '#ef4444';
                const s = strokes[d.tipo] || '#fca5a5';
                return `<circle cx="${d.x}" cy="${d.y}" r="10" fill="${c}" fill-opacity="0.75" stroke="${s}" stroke-width="2"/>
                        <text x="${d.x}" y="${d.y+4}" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">${d.id}</text>`;
              }).join('')}
            </svg>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem;">
            ${inv.mapa_danos.map(d => {
              const colors = { rayazo:'#ef4444', abollon:'#f59e0b', oxidacion:'#8b5cf6', otro:'#6b7280' };
              const c = colors[d.tipo] || '#ef4444';
              return `<span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:99px;background:${c}22;border:1px solid ${c}66;color:${c};">${d.id}. ${d.label}</span>`;
            }).join('')}
          </div>
        </div>` : ''}
      <div>
        <div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">Rentabilidad Bruta</div>
        <div style="font-size:0.9rem;">${rentabilidad}</div>
      </div>
      ${inv.incidentes ? `
        <div>
          <div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">Incidentes / Observaciones</div>
          <div style="font-size:0.85rem;color:var(--text-secondary);background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">${inv.incidentes}</div>
        </div>` : ''}
      <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
        <button class="btn-secondary" onclick="cerrarModal('modal-intervencion')">Cerrar</button>
        <button class="btn-action" onclick="cambiarEstado('${inv.id}', '${inv.estado}')">Cambiar Estado</button>
      </div>
    </div>
  `;

  abrirModal('modal-intervencion');
}

async function cambiarEstado(id, estadoActual) {
  const estados = ['abierta', 'en_proceso', 'finalizada', 'entregada'];
  const idx = estados.indexOf(estadoActual);
  const nuevoEstado = estados[(idx + 1) % estados.length];

  const { error } = await db.from('intervenciones').update({ estado: nuevoEstado }).eq('id', id);
  if (error) { showToast('Error al actualizar estado', 'error'); return; }

  cerrarModal('modal-intervencion');
  showToast(`✓ Estado actualizado: ${nuevoEstado}`);
  cargarIntervenciones();
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO CALIDAD
// ═══════════════════════════════════════════════════════════

let costeHoraConfig = 25; // €/hora por defecto, editable

async function cargarCalidad() {
  const sel = document.getElementById('calidad-intervencion-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Cargando...</option>';

  const { data, error } = await db
    .from('intervenciones')
    .select('id, matricula, cliente_nombre, nombre_servicio, estado')
    .order('created_at', { ascending: false });

  if (error || !data) { sel.innerHTML = '<option value="">Error al cargar</option>'; return; }

  sel.innerHTML = '<option value="">Selecciona una intervención...</option>';
  data.forEach(inv => {
    const opt = document.createElement('option');
    opt.value = inv.id;
    opt.textContent = `${inv.matricula} — ${inv.cliente_nombre} (${inv.nombre_servicio || 'Sin servicio'})`;
    sel.appendChild(opt);
  });
}

async function cargarVistaPrevia() {
  const id = document.getElementById('calidad-intervencion-sel').value;
  const preview = document.getElementById('calidad-preview');
  const empty   = document.getElementById('calidad-empty');
  const costeH  = parseFloat(document.getElementById('calidad-coste-hora').value) || 25;
  costeHoraConfig = costeH;

  if (!id) { preview.style.display = 'none'; empty.style.display = 'block'; return; }

  const { data: inv, error } = await db
    .from('intervenciones').select('*').eq('id', id).single();

  if (error || !inv) return;

  const productos = inv.productos_usados || [];
  const costeMat  = productos.reduce((s, p) => s + (p.coste || 0), 0);
  const costeHoras = (inv.horas_reales || 0) * costeH;
  const beneficio  = (inv.precio_cobrado || 0) - costeMat - costeHoras;

  // Vista previa cliente
  document.getElementById('prev-matricula').textContent   = inv.matricula;
  document.getElementById('prev-cliente').textContent     = inv.cliente_nombre;
  document.getElementById('prev-servicio').textContent    = inv.nombre_servicio || '—';
  document.getElementById('prev-fecha').textContent       = new Date(inv.created_at).toLocaleDateString('es-ES');
  document.getElementById('prev-estado').innerHTML        = estadoBadge(inv.estado);

  // Productos
  const prodHTML = productos.length
    ? productos.map(p => `
        <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;">
          <span>✓ ${p.nombre_comercial || p.nombre}</span>
          <span style="color:var(--text-muted)">${p.ml_usados} ml</span>
        </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:0.85rem;">Sin productos registrados</div>';
  document.getElementById('prev-productos').innerHTML = prodHTML;

  // Rentabilidad
  document.getElementById('prev-precio').textContent    = `${fmt(inv.precio_cobrado || 0, 2)} €`;
  document.getElementById('prev-coste-mat').textContent = `${fmt(costeMat, 2)} €`;
  document.getElementById('prev-coste-horas').textContent = `${fmt(costeHoras, 2)} € (${inv.horas_reales || 0}h × ${costeH} €/h)`;
  document.getElementById('prev-beneficio').textContent = `${fmt(beneficio, 2)} €`;
  document.getElementById('prev-beneficio').style.color = beneficio >= 0 ? 'var(--success)' : 'var(--danger)';

  // Incidentes
  document.getElementById('prev-incidentes').textContent = inv.incidentes || 'Sin observaciones';

  // Guardar id para PDF
  document.getElementById('calidad-preview').dataset.invId = id;
  document.getElementById('calidad-preview').dataset.costeH = costeH;

  preview.style.display = 'block';
  empty.style.display   = 'none';
}

// ── Generar PDF Cliente ───────────────────────────────────
async function generarPDFCliente() {
  const id = document.getElementById('calidad-preview').dataset.invId;
  if (!id) return;

  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  if (!inv) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const naranja = [249, 115, 22];
  const gris    = [30, 30, 30];
  const grisClaro = [60, 60, 60];
  const blanco  = [240, 240, 240];

  // Fondo negro
  doc.setFillColor(...gris);
  doc.rect(0, 0, 210, 297, 'F');

  // Cabecera naranja
  doc.setFillColor(...naranja);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILPRO', 15, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Informe de Calidad — Cliente', 15, 24);
  doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString('es-ES')}`, 150, 18);

  // Datos vehículo
  let y = 40;
  doc.setTextColor(...blanco);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL VEHÍCULO', 15, y); y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...[180, 180, 180]);
  doc.text(`Matrícula:`, 15, y);
  doc.setTextColor(...blanco);
  doc.setFont('helvetica', 'bold');
  doc.text(inv.matricula, 50, y); y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...[180, 180, 180]);
  doc.text(`Cliente:`, 15, y);
  doc.setTextColor(...blanco);
  doc.text(inv.cliente_nombre, 50, y); y += 6;

  doc.setTextColor(...[180, 180, 180]);
  doc.text(`Servicio:`, 15, y);
  doc.setTextColor(...naranja);
  doc.text(inv.nombre_servicio || '—', 50, y); y += 6;

  doc.setTextColor(...[180, 180, 180]);
  doc.text(`Estado:`, 15, y);
  doc.setTextColor(...blanco);
  doc.text(inv.estado?.toUpperCase() || '—', 50, y); y += 12;

  // Separador
  doc.setDrawColor(...naranja);
  doc.setLineWidth(0.5);
  doc.line(15, y, 195, y); y += 8;

  // Productos usados
  doc.setTextColor(...blanco);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('PRODUCTOS APLICADOS', 15, y); y += 8;

  const productos = inv.productos_usados || [];
  if (productos.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...[180, 180, 180]);
    doc.text('Sin productos registrados', 15, y); y += 8;
  } else {
    productos.forEach(p => {
      doc.setFillColor(45, 45, 45);
      doc.roundedRect(15, y - 4, 180, 8, 1, 1, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...naranja);
      doc.text('✓', 18, y);
      doc.setTextColor(...blanco);
      doc.setFont('helvetica', 'normal');
      doc.text(p.nombre_comercial || p.nombre, 25, y);
      doc.setTextColor(...[180, 180, 180]);
      doc.text(`${p.ml_usados} ml aplicados`, 155, y, { align: 'right' });
      y += 10;
    });
  }

  y += 4;
  doc.setDrawColor(...naranja);
  doc.line(15, y, 195, y); y += 8;

  // Observaciones
  doc.setTextColor(...blanco);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('OBSERVACIONES TÉCNICAS', 15, y); y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...[180, 180, 180]);
  const obs = inv.incidentes || 'Sin observaciones registradas.';
  const obsLines = doc.splitTextToSize(obs, 175);
  doc.text(obsLines, 15, y); y += obsLines.length * 5 + 8;

  // Footer
  doc.setFillColor(...naranja);
  doc.rect(0, 285, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('DetailPro — Sistema de Gestión de Calidad y Operaciones', 105, 292, { align: 'center' });

  doc.save(`informe_cliente_${inv.matricula}_${inv.created_at.split('T')[0]}.pdf`);
  showToast('✓ PDF cliente generado');
}

// ── Generar PDF Interno ───────────────────────────────────
async function generarPDFInterno() {
  const id     = document.getElementById('calidad-preview').dataset.invId;
  const costeH = parseFloat(document.getElementById('calidad-preview').dataset.costeH) || 25;
  if (!id) return;

  const { data: inv } = await db.from('intervenciones').select('*').eq('id', id).single();
  if (!inv) return;

  const productos    = inv.productos_usados || [];
  const costeMat     = productos.reduce((s, p) => s + (p.coste || 0), 0);
  const costeHoras   = (inv.horas_reales || 0) * costeH;
  const beneficio    = (inv.precio_cobrado || 0) - costeMat - costeHoras;
  const margen       = inv.precio_cobrado ? (beneficio / inv.precio_cobrado * 100) : 0;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const naranja   = [249, 115, 22];
  const gris      = [30, 30, 30];
  const blanco    = [240, 240, 240];
  const grisClaro = [180, 180, 180];

  doc.setFillColor(...gris);
  doc.rect(0, 0, 210, 297, 'F');

  // Cabecera
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(...naranja);
  doc.rect(0, 0, 4, 28, 'F');

  doc.setTextColor(...blanco);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME INTERNO DE RENTABILIDAD', 12, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grisClaro);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')} — USO INTERNO`, 12, 22);

  let y = 40;

  // Datos intervención
  const datosRows = [
    ['Matrícula', inv.matricula],
    ['Cliente', inv.cliente_nombre],
    ['Servicio', inv.nombre_servicio || '—'],
    ['Horas reales', `${inv.horas_reales || 0} h`],
    ['Estado', inv.estado?.toUpperCase()],
  ];
  datosRows.forEach(([k, v]) => {
    doc.setFontSize(9);
    doc.setTextColor(...grisClaro);
    doc.setFont('helvetica', 'normal');
    doc.text(k, 15, y);
    doc.setTextColor(...blanco);
    doc.setFont('helvetica', 'bold');
    doc.text(String(v || '—'), 70, y);
    y += 7;
  });

  y += 4;
  doc.setDrawColor(...naranja);
  doc.setLineWidth(0.3);
  doc.line(15, y, 195, y); y += 8;

  // Tabla rentabilidad
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...blanco);
  doc.text('DESGLOSE ECONÓMICO', 15, y); y += 8;

  const filas = [
    ['Precio Cobrado', `+ ${fmt(inv.precio_cobrado || 0, 2)} €`, naranja],
    ['Coste Materiales', `- ${fmt(costeMat, 2)} €`, [239, 68, 68]],
    [`Coste Mano de Obra (${inv.horas_reales || 0}h × ${costeH}€)`, `- ${fmt(costeHoras, 2)} €`, [239, 68, 68]],
  ];

  filas.forEach(([label, valor, color]) => {
    doc.setFillColor(40, 40, 40);
    doc.roundedRect(15, y - 5, 180, 9, 1, 1, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grisClaro);
    doc.text(label, 18, y);
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.text(valor, 192, y, { align: 'right' });
    y += 11;
  });

  // Resultado final
  doc.setFillColor(...naranja);
  doc.roundedRect(15, y - 5, 180, 12, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('BENEFICIO BRUTO', 18, y + 2);
  doc.text(`${fmt(beneficio, 2)} €  (${fmt(margen, 1)}%)`, 192, y + 2, { align: 'right' });
  y += 18;

  // Productos detalle
  if (productos.length > 0) {
    doc.setDrawColor(...naranja);
    doc.line(15, y, 195, y); y += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...blanco);
    doc.text('DETALLE DE MATERIALES', 15, y); y += 8;

    productos.forEach(p => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grisClaro);
      doc.text(`• ${p.nombre_comercial || p.nombre}`, 18, y);
      doc.setTextColor(...blanco);
      doc.text(`${p.ml_usados} ml`, 130, y);
      doc.setTextColor(...naranja);
      doc.text(`${fmt(p.coste, 4)} €`, 192, y, { align: 'right' });
      y += 6;
    });
  }

  // Footer
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 283, 210, 14, 'F');
  doc.setFillColor(...naranja);
  doc.rect(0, 283, 4, 14, 'F');
  doc.setTextColor(...grisClaro);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('DOCUMENTO DE USO INTERNO — DetailPro Sistema de Gestión', 12, 292);

  doc.save(`rentabilidad_interna_${inv.matricula}_${inv.created_at.split('T')[0]}.pdf`);
  showToast('✓ PDF interno generado');
}

// ═══════════════════════════════════════════════════════════
//  MAPA DE DAÑOS
// ═══════════════════════════════════════════════════════════

let damagePoints  = [];
let damageCounter = 0;
let currentDamageType = 'rayazo';

const DAMAGE_COLORS = {
  rayazo:    { fill: '#ef4444', stroke: '#fca5a5', label: 'Rayazo' },
  abollon:   { fill: '#f59e0b', stroke: '#fcd34d', label: 'Abollón' },
  oxidacion: { fill: '#8b5cf6', stroke: '#c4b5fd', label: 'Oxidación' },
  otro:      { fill: '#6b7280', stroke: '#9ca3af', label: 'Otro' },
};

function selectDamageType(btn) {
  document.querySelectorAll('.damage-type-btn').forEach(b => b.style.opacity = '0.45');
  btn.style.opacity = '1';
  currentDamageType = btn.dataset.type;
}

function addDamagePoint(event) {
  const svg    = document.getElementById('mapa-danos');
  const rect   = svg.getBoundingClientRect();
  const vb     = svg.viewBox.baseVal;

  // Convertir coordenadas pantalla → viewBox
  const scaleX = vb.width  / rect.width;
  const scaleY = vb.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top)  * scaleY;

  damageCounter++;
  const id    = damageCounter;
  const tipo  = currentDamageType;
  const color = DAMAGE_COLORS[tipo];

  damagePoints.push({ id, x, y, tipo, label: color.label });

  // Dibujar punto
  const g = document.getElementById('damage-points');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', '10');
  circle.setAttribute('fill', color.fill);
  circle.setAttribute('fill-opacity', '0.75');
  circle.setAttribute('stroke', color.stroke);
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('id', `dp-${id}`);
  circle.style.cursor = 'pointer';
  circle.setAttribute('onclick', `removeDamagePoint(${id}, event)`);
  circle.setAttribute('title', color.label);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', x);
  text.setAttribute('y', y + 4);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '9');
  text.setAttribute('fill', '#fff');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('pointer-events', 'none');
  text.setAttribute('id', `dt-${id}`);
  text.textContent = id;

  g.appendChild(circle);
  g.appendChild(text);

  renderDanosList();
}

function removeDamagePoint(id, event) {
  event.stopPropagation();
  damagePoints = damagePoints.filter(d => d.id !== id);
  document.getElementById(`dp-${id}`)?.remove();
  document.getElementById(`dt-${id}`)?.remove();
  renderDanosList();
}

function limpiarMapa() {
  damagePoints = [];
  damageCounter = 0;
  document.getElementById('damage-points').innerHTML = '';
  renderDanosList();
}

function renderDanosList() {
  const lista  = document.getElementById('danos-lista');
  const items  = document.getElementById('danos-lista-items');

  if (!damagePoints.length) { lista.style.display = 'none'; return; }

  lista.style.display = 'block';
  items.innerHTML = damagePoints.map(d => {
    const c = DAMAGE_COLORS[d.tipo];
    return `<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;border-radius:99px;font-size:0.72rem;font-weight:600;background:${c.fill}22;border:1px solid ${c.fill}66;color:${c.stroke};">
      ${d.id}. ${c.label}
    </span>`;
  }).join('');
}

function resetMapaDanos() {
  limpiarMapa();
  document.querySelectorAll('.damage-type-btn').forEach((b, i) => {
    b.style.opacity = i === 0 ? '1' : '0.45';
  });
  currentDamageType = 'rayazo';
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO DASHBOARD
// ═══════════════════════════════════════════════════════════

async function cargarDashboard() {
  const ahora   = new Date();
  const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0];
  const hoy       = ahora.toISOString().split('T')[0];

  // Lanzar todas las queries en paralelo
  const [
    { data: intervMes },
    { data: intervTotal },
    { data: productos },
    { data: tareas }
  ] = await Promise.all([
    db.from('intervenciones').select('precio_cobrado, productos_usados, horas_reales, estado').gte('created_at', primerDia),
    db.from('intervenciones').select('id, matricula, cliente_nombre, nombre_servicio, estado, created_at').order('created_at', { ascending: false }).limit(5),
    db.from('productos').select('*'),
    db.from('tareas').select('*').eq('completada', false).order('created_at', { ascending: false })
  ]);

  // ── Stats del mes ────────────────────────────────────────
  const totalIngresos  = (intervMes || []).reduce((s, i) => s + (i.precio_cobrado || 0), 0);
  const totalServicios = (intervMes || []).length;
  const pendientes     = (intervMes || []).filter(i => i.estado === 'abierta' || i.estado === 'en_proceso').length;

  document.getElementById('dash-ingresos').textContent   = `${fmt(totalIngresos, 2)} €`;
  document.getElementById('dash-servicios').textContent  = totalServicios;
  document.getElementById('dash-pendientes').textContent = pendientes;

  // ── Alertas stock ────────────────────────────────────────
  const stockAlertas = (productos || []).filter(p => {
    const s = stockStatus(p.stock_actual ?? 0, p.formato_ml);
    return s.label !== 'OK';
  });
  document.getElementById('dash-stock-critico').textContent = stockAlertas.length;

  const alertasContainer = document.getElementById('dash-alertas-lista');
  if (stockAlertas.length === 0) {
    alertasContainer.innerHTML = '<div style="color:var(--success);font-size:0.85rem;">✓ Todo el stock en niveles correctos</div>';
  } else {
    alertasContainer.innerHTML = stockAlertas.map(p => {
      const s = stockStatus(p.stock_actual ?? 0, p.formato_ml);
      return `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.83rem;">
        <span>${s.icon} ${p.nombre_comercial}</span>
        <span style="color:${s.color};font-weight:600;">${fmt(p.stock_actual??0,0)} ml · ${s.label}</span>
      </div>`;
    }).join('');
  }

  // ── Últimas intervenciones ───────────────────────────────
  const ultimasContainer = document.getElementById('dash-ultimas');
  if (!intervTotal || intervTotal.length === 0) {
    ultimasContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">Sin intervenciones aún</div>';
  } else {
    ultimasContainer.innerHTML = intervTotal.map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:700;">${i.matricula}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${i.cliente_nombre} · ${i.nombre_servicio || '—'}</div>
        </div>
        <div style="text-align:right;">
          ${estadoBadge(i.estado)}
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">${new Date(i.created_at).toLocaleDateString('es-ES')}</div>
        </div>
      </div>`).join('');
  }

  // ── Tareas ───────────────────────────────────────────────
  renderTareasDashboard(tareas || []);
}

// ── TAREAS ────────────────────────────────────────────────
function renderTareasDashboard(tareas) {
  const container = document.getElementById('dash-tareas-lista');
  if (!tareas.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">No hay tareas pendientes 🎉</div>';
    return;
  }
  const prioColors = { alta: '#ef4444', normal: 'var(--accent)', baja: '#6b7280' };
  container.innerHTML = tareas.map(t => `
    <div style="display:flex;align-items:center;gap:0.65rem;padding:0.45rem 0;border-bottom:1px solid var(--border);">
      <button onclick="completarTarea('${t.id}')" style="width:18px;height:18px;border-radius:50%;border:2px solid ${prioColors[t.prioridad]||'var(--accent)'};background:transparent;cursor:pointer;flex-shrink:0;transition:all 0.2s;" onmouseover="this.style.background='${prioColors[t.prioridad]||'var(--accent)'}'" onmouseout="this.style.background='transparent'"></button>
      <span style="flex:1;font-size:0.85rem;">${t.texto}</span>
      <span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:99px;background:${prioColors[t.prioridad]||'var(--accent)'}22;color:${prioColors[t.prioridad]||'var(--accent)'};">${t.prioridad}</span>
    </div>`).join('');
}

async function agregarTarea() {
  const input    = document.getElementById('nueva-tarea-texto');
  const prioSel  = document.getElementById('nueva-tarea-prio');
  const texto    = input.value.trim();
  const prioridad = prioSel.value;

  if (!texto) { showToast('Escribe una tarea', 'error'); return; }

  const { error } = await db.from('tareas').insert([{ texto, prioridad }]);
  if (error) { showToast('Error al guardar tarea', 'error'); return; }

  input.value = '';
  showToast('✓ Tarea añadida');
  cargarDashboard();
}

async function completarTarea(id) {
  await db.from('tareas').update({ completada: true }).eq('id', id);
  showToast('✓ Tarea completada');
  cargarDashboard();
}
