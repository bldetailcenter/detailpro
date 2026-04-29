// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js
//  Paso 1: Autenticación + Módulo Almacén (Inventario + PMP)
// ═══════════════════════════════════════════════════════════

// ── SUPABASE CONFIG ──────────────────────────────────────────
const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── ESTADO GLOBAL ─────────────────────────────────────────────
let currentUser = null;
let productosCache = [];  // Cache local para no re-fetch constante

// ═══════════════════════════════════════════════════════════
//  UTILIDADES UI
// ═══════════════════════════════════════════════════════════

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || 'Guardar';
  }
}

function fmt(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Number(num).toFixed(decimals);
}

function fmtEur(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return `${fmt(num, 4)} €`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ═══════════════════════════════════════════════════════════
//  AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errDiv   = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errDiv.style.display = 'none';

  if (!email || !password) {
    errDiv.textContent = 'Por favor, introduce email y contraseña.';
    errDiv.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errDiv.textContent = 'Credenciales incorrectas. Verifica tu email y contraseña.';
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

// Entrada presionando Enter en el campo contraseña
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Fecha de hoy por defecto en pedidos
  const today = new Date().toISOString().split('T')[0];
  const fechaInput = document.getElementById('pedido-fecha');
  if (fechaInput) fechaInput.value = today;

  // Sesión activa al recargar
  db.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      currentUser = session.user;
      showApp();
    }
  });

  // Listener cambios de sesión
  db.auth.onAuthStateChange((_event, session) => {
    if (!session && currentUser) {
      handleLogout();
    }
  });
});

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('user-email-display').textContent = currentUser?.email || '';
  cargarProductos();
}

// ═══════════════════════════════════════════════════════════
//  MÓDULO: ALMACÉN
// ═══════════════════════════════════════════════════════════

// ── NAVEGACIÓN DE MÓDULOS ────────────────────────────────────
function switchModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`mod-${mod}`).classList.add('active');
  document.getElementById(`nav-${mod}`).classList.add('active');
}

// ── CREAR PRODUCTO ───────────────────────────────────────────
async function crearProducto() {
  const nombreInterno   = document.getElementById('prod-nombre-interno').value.trim();
  const nombreComercial = document.getElementById('prod-nombre-comercial').value.trim();
  const categoria       = document.getElementById('prod-categoria').value;
  const formato         = parseFloat(document.getElementById('prod-formato').value);
  const dosis           = parseFloat(document.getElementById('prod-dosis').value);
  const precioInicial   = parseFloat(document.getElementById('prod-precio-inicial').value);
  const stockInicial    = parseFloat(document.getElementById('prod-stock-inicial').value) || 0;

  if (!nombreInterno || !nombreComercial || !categoria || !formato || !dosis) {
    showToast('Rellena todos los campos obligatorios', 'error');
    return;
  }

  // PMP inicial = precio pagado / (ml comprados / 1000)
  let pmpLitro = 0;
  let precioDosis = 0;

  if (precioInicial > 0 && stockInicial > 0) {
    pmpLitro   = precioInicial / (stockInicial / 1000);
    precioDosis = pmpLitro * (dosis / 1000);
  }

  const btn = document.querySelector('[onclick="crearProducto()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  const { error } = await db.from('productos').insert([{
    nombre_interno:    nombreInterno,
    nombre_comercial:  nombreComercial,
    categoria,
    formato_ml:        formato,
    dosis_estandar_ml: dosis,
    precio_medio_litro: pmpLitro,
    precio_por_dosis:  precioDosis,
    stock_actual:      stockInicial
  }]);

  if (btn) { btn.disabled = false; btn.textContent = 'Guardar Producto'; }

  if (error) {
    console.error(error);
    showToast('Error al guardar el producto', 'error');
    return;
  }

  // Limpiar formulario
  ['prod-nombre-interno','prod-nombre-comercial','prod-formato',
   'prod-dosis','prod-precio-inicial','prod-stock-inicial'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('prod-categoria').value = '';

  showToast('✓ Producto creado correctamente');
  cargarProductos();
}

// ── CARGAR PRODUCTOS ─────────────────────────────────────────
async function cargarProductos() {
  document.getElementById('productos-loading').style.display = 'block';
  document.getElementById('productos-table-wrap').style.display = 'none';
  document.getElementById('productos-empty').style.display = 'none';

  const { data, error } = await db
    .from('productos')
    .select('*')
    .order('nombre_comercial', { ascending: true });

  document.getElementById('productos-loading').style.display = 'none';

  if (error) {
    showToast('Error al cargar productos', 'error');
    return;
  }

  productosCache = data || [];
  renderProductosTable(productosCache);
  renderProductosStats(productosCache);
  populatePedidoSelect(productosCache);
}

function renderProductosTable(productos) {
  const tbody = document.getElementById('productos-tbody');
  const wrap  = document.getElementById('productos-table-wrap');
  const empty = document.getElementById('productos-empty');

  if (!productos.length) {
    empty.style.display = 'block';
    wrap.style.display  = 'none';
    return;
  }

  wrap.style.display = 'block';

  tbody.innerHTML = productos.map(p => {
    const categBadge = `<span class="badge badge-gray">${capitalize(p.categoria || '—')}</span>`;
    const stock = p.stock_actual ?? 0;
    const stockClass = stock < 200 ? 'color:var(--danger)' : 'color:var(--text-secondary)';
    return `
      <tr>
        <td>
          <div style="font-weight:600; color:var(--text-primary)">${p.nombre_comercial}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">${p.nombre_interno}</div>
        </td>
        <td>${categBadge}</td>
        <td><span style="${stockClass}">${fmt(stock, 0)} ml</span></td>
        <td class="highlight">${fmt(p.precio_medio_litro, 4)} €/L</td>
        <td>${fmtEur(p.precio_por_dosis)}</td>
      </tr>`;
  }).join('');
}

function renderProductosStats(productos) {
  document.getElementById('stat-total-productos').textContent = productos.length;
  const cats = new Set(productos.map(p => p.categoria).filter(Boolean));
  document.getElementById('stat-total-categorias').textContent = cats.size;
}

function populatePedidoSelect(productos) {
  const sel = document.getElementById('pedido-producto');
  const current = sel.value;
  sel.innerHTML = '<option value="">Seleccionar producto...</option>';
  productos.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.nombre_comercial} (stock: ${fmt(p.stock_actual ?? 0, 0)} ml)`;
    opt.dataset.pmp   = p.precio_medio_litro || 0;
    opt.dataset.stock = p.stock_actual || 0;
    opt.dataset.dosis = p.dosis_estandar_ml || 0;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

// ── PEDIDO: PRODUCTO SELECCIONADO ────────────────────────────
function onPedidoProductoChange() {
  calcularPMPPreview();
}

// ── CALCULAR PMP PREVIEW ─────────────────────────────────────
// PMP = (Stock Actual * PMP Actual + Cantidad Nueva * Precio/ml Nueva)
//       / (Stock Actual + Cantidad Nueva)
function calcularPMPPreview() {
  const sel        = document.getElementById('pedido-producto');
  const cantidadEl = document.getElementById('pedido-cantidad');
  const precioEl   = document.getElementById('pedido-precio');
  const preview    = document.getElementById('pmp-preview');

  const selectedOpt = sel.options[sel.selectedIndex];
  if (!sel.value || !selectedOpt) { preview.classList.remove('visible'); return; }

  const pmpActual    = parseFloat(selectedOpt.dataset.pmp)   || 0;
  const stockActual  = parseFloat(selectedOpt.dataset.stock) || 0;
  const dosisStd     = parseFloat(selectedOpt.dataset.dosis) || 0;
  const cantidadNueva = parseFloat(cantidadEl.value) || 0;
  const precioNuevo   = parseFloat(precioEl.value)   || 0;

  if (!cantidadNueva || !precioNuevo) { preview.classList.remove('visible'); return; }

  // Precio por ml de la nueva compra
  const precioMlNuevo = precioNuevo / cantidadNueva;

  // PMP en €/ml
  let nuevoPmpMl;
  if (stockActual === 0) {
    nuevoPmpMl = precioMlNuevo;
  } else {
    const pmpActualMl = pmpActual / 1000;
    nuevoPmpMl = ((stockActual * pmpActualMl) + (cantidadNueva * precioMlNuevo))
                 / (stockActual + cantidadNueva);
  }

  const nuevoPmpLitro = nuevoPmpMl * 1000;
  const nuevoPrecioDosis = nuevoPmpMl * dosisStd;
  const nuevoStock = stockActual + cantidadNueva;

  document.getElementById('pmp-preview-litro').textContent = `${fmt(nuevoPmpLitro, 4)} €`;
  document.getElementById('pmp-preview-dosis').textContent = `${fmt(nuevoPrecioDosis, 4)} €`;
  document.getElementById('pmp-preview-stock').textContent = `${fmt(nuevoStock, 0)} ml`;

  preview.classList.add('visible');
}

// ── REGISTRAR PEDIDO ─────────────────────────────────────────
async function registrarPedido() {
  const productoId  = document.getElementById('pedido-producto').value;
  const fecha       = document.getElementById('pedido-fecha').value;
  const cantidadNueva = parseFloat(document.getElementById('pedido-cantidad').value);
  const precioNuevo   = parseFloat(document.getElementById('pedido-precio').value);

  if (!productoId) { showToast('Selecciona un producto', 'error'); return; }
  if (!fecha)      { showToast('Indica la fecha del pedido', 'error'); return; }
  if (!cantidadNueva || cantidadNueva <= 0) { showToast('Indica la cantidad en ml', 'error'); return; }
  if (!precioNuevo || precioNuevo <= 0)     { showToast('Indica el precio total pagado', 'error'); return; }

  // Obtener datos actuales del producto
  const { data: prod, error: prodErr } = await db
    .from('productos')
    .select('stock_actual, precio_medio_litro, dosis_estandar_ml')
    .eq('id', productoId)
    .single();

  if (prodErr || !prod) { showToast('Error al obtener datos del producto', 'error'); return; }

  const stockActual  = prod.stock_actual || 0;
  const pmpActual    = prod.precio_medio_litro || 0;
  const dosisStd     = prod.dosis_estandar_ml || 0;

  // Calcular nuevo PMP
  const precioMlNuevo = precioNuevo / cantidadNueva;
  let nuevoPmpMl;

  if (stockActual === 0) {
    nuevoPmpMl = precioMlNuevo;
  } else {
    const pmpActualMl = pmpActual / 1000;
    nuevoPmpMl = ((stockActual * pmpActualMl) + (cantidadNueva * precioMlNuevo))
                 / (stockActual + cantidadNueva);
  }

  const nuevoPmpLitro   = nuevoPmpMl * 1000;
  const nuevoPrecioDosis = nuevoPmpMl * dosisStd;
  const nuevoStock      = stockActual + cantidadNueva;

  const btn = document.querySelector('[onclick="registrarPedido()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  // 1) Insertar pedido
  const { error: pedidoErr } = await db.from('pedidos').insert([{
    producto_id:        productoId,
    fecha,
    cantidad_ml:        cantidadNueva,
    precio_total_pagado: precioNuevo
  }]);

  if (pedidoErr) {
    console.error(pedidoErr);
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Pedido'; }
    showToast('Error al registrar el pedido', 'error');
    return;
  }

  // 2) Actualizar producto con nuevo PMP y stock
  const { error: updateErr } = await db
    .from('productos')
    .update({
      precio_medio_litro: nuevoPmpLitro,
      precio_por_dosis:   nuevoPrecioDosis,
      stock_actual:       nuevoStock
    })
    .eq('id', productoId);

  if (btn) { btn.disabled = false; btn.textContent = 'Registrar Pedido'; }

  if (updateErr) {
    console.error(updateErr);
    showToast('Pedido guardado pero error al actualizar PMP', 'error');
    return;
  }

  // Limpiar formulario pedido
  document.getElementById('pedido-producto').value = '';
  document.getElementById('pedido-cantidad').value = '';
  document.getElementById('pedido-precio').value   = '';
  document.getElementById('pmp-preview').classList.remove('visible');

  showToast(`✓ Pedido registrado · Nuevo PMP: ${fmt(nuevoPmpLitro, 4)} €/L`);
  cargarProductos();
}
