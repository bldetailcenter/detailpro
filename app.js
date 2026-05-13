// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js  (Paso 3)
//  Auth + Almacén + Operaciones + Calidad (PDF) + Fotos
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
  if (mod === 'operaciones') { cargarIntervenciones(); cargarSelectorServicios(); }
  if (mod === 'calidad')     cargarCalidad();
  if (mod === 'dashboard')   cargarDashboard();
  if (mod === 'calendario')  iniciarCalendario();
  if (mod === 'historico')   resetHistorico();
  if (mod === 'servicios')   cargarServicios();
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
  const observaciones   = document.getElementById('prod-observaciones').value.trim();

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
    stock_actual: stockInicial,
    observaciones: observaciones || null
  }]);

  if (btn) { btn.disabled = false; btn.textContent = 'Guardar Producto'; }

  if (error) { showToast('Error al guardar el producto', 'error'); return; }

  ['prod-nombre-interno','prod-nombre-comercial','prod-formato','prod-dosis',
   'prod-precio-inicial','prod-stock-inicial','prod-observaciones'].forEach(id => document.getElementById(id).value = '');
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
  const critico =
