// ═══════════════════════════════════════════════════════════
//  BL Detail Center — app.js
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser            = null;
let productosCache         = [];
let serviciosCache         = [];
let citasCache             = [];
let lineaCount             = 0;
let productoUsadoCount     = 0;
let serviciosSeleccionados = [];

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3500);
}
function fmt(num, dec = 2) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Number(num).toFixed(dec);
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function formatFecha(str) {
  if (!str) return '—';
  const [y,m,d] = str.split('-'); return `${d}/${m}/${y}`;
}
function estadoBadge(estado) {
  const map = { abierta:['badge-orange','Abierta'], en_proceso:['badge-blue','En Proceso'], finalizada:['badge-green','Finalizada'], entregada:['badge-gray','Entregada'] };
  const [cls, label] = map[estado] || ['badge-gray', estado||'—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ═══════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════════
function switchModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`mod-${mod}`)?.classList.add('active');
  document.getElementById(`nav-${mod}`)?.classList.add('active');
  if (mod === 'dashboard')   cargarDashboard();
  if (mod === 'almacen')     cargarProductos();
  if (mod === 'operaciones') { cargarIntervenciones(); cargarSelectorServicios(); }
  if (mod === 'calidad')     cargarCalidad();
  if (mod === 'calendario')  iniciarCalendario();
  if (mod === 'historico')   resetHistorico();
  if (mod === 'servicios')   cargarServicios();
}
function switchTab(modulo, tab) {
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${modulo}-${tab}`)?.classList.add('active');
  if (event?.target) event.target.classList.add('active');
  if (modulo === 'almacen' && tab === 'historial') cargarHistorial();
  if (modulo === 'operaciones' && tab === 'lista') cargarIntervenciones();
  if (modulo === 'calendario' && tab === 'lista') cargarCitas();
}
function switchTabDirect(modulo, tab) {
  document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${modulo}-${tab}`)?.classList.add('active');
  const btns = document.querySelectorAll(`#mod-${modulo} .tab-btn`);
  if (['lista','inventario','mes'].includes(tab)) btns[0]?.classList.add('active');
  if (['nueva','nuevo-producto'].includes(tab)) btns[1]?.classList.add('active');
}
function abrirModal(id) { document.getElementById(id)?.classList.add('open'); }
function cerrarModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ═══════════════════════════════════════════════════════════
//  AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-password')?.addEventListener('keydown', e => { if(e.key==='Enter') handleLogin(); });
  const today = new Date().toISOString().split('T')[0];
  ['compra-fecha','cita-fecha'].forEach(id => { const el=document.getElementById(id); if(el) el.value=today; });
  db.auth.getSession().then(({ data: { session } }) => { if(session?.user) { currentUser=session.user; showApp(); } });
  db.auth.onAuthStateChange((_e, session) => { if(!session && currentUser) handleLogout(); });
});

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errDiv = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  errDiv.style.display = 'none';
  if (!email || !password) { errDiv.textContent='Introduce email y contraseña.'; errDiv.style.display='block'; return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { errDiv.textContent='Credenciales incorrectas.'; errDiv.style.display='block'; btn.disabled=false; btn.textContent='Entrar al sistema'; return; }
  currentUser = data.user; showApp();
}

async function handleLogout() {
  await db.auth.signOut(); currentUser=null; productosCache=[]; serviciosCache=[]; citasCache=[];
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('user-email-display').textContent = currentUser?.email || '';
  const fechaEl = document.getElementById('dash-fecha');
  if (fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  cargarProductos(); cargarDashboard();
}

// ═══════════════════════════════════════════════════════════
//  ALMACÉN — PRODUCTOS
// ═══════════════════════════════════════════════════════════
function stockStatus(stock, formato) {
  const critico = (formato||1000)*0.10, bajo = (formato||1000)*0.25;
  if (stock <= 0)      return { color:'var(--danger)',  icon:'🔴', label:'Agotado' };
  if (stock < critico) return { color:'var(--danger)',  icon:'🔴', label:'Crítico' };
  if (stock < bajo)    return { color:'#f59e0b',        icon:'🟡', label:'Bajo' };
  return                      { color:'var(--success)', icon:'🟢', label:'OK' };
}

async function cargarProductos() {
  const loading = document.getElementById('productos-loading');
  const wrap    = document.getElementById('productos-table-wrap');
  const empty   = document.getElementById('productos-empty');
  if (loading) loading.style.display = 'block';
  if (wrap)    wrap.style.display    = 'none';
  if (empty)   empty.style.display   = 'none';
  const { data, error } = await db.from('productos').select('*').order('nombre_comercial');
  if (loading) loading.style.display = 'none';
  if (error) { showToast('Error al cargar productos','error'); return; }
  productosCache = data || [];
  renderProductosTable(productosCache);
  const cats = new Set(productosCache.map(p=>p.categoria).filter(Boolean));
  const sp=document.getElementById('stat-total-productos'); if(sp) sp.textContent=productosCache.length;
  const sc=document.getElementById('stat-total-categorias'); if(sc) sc.textContent=cats.size;
}

function renderProductosTable(productos) {
  const tbody=document.getElementById('productos-tbody');
  const wrap=document.getElementById('productos-table-wrap');
  const empty=document.getElementById('productos-empty');
  if (!tbody) return;
  if (!productos.length) { if(empty) empty.style.display='block'; if(wrap) wrap.style.display='none'; return; }
  const alertas = productos.filter(p => stockStatus(p.stock_actual??0, p.formato_ml).label !== 'OK');
  renderAlertasStock(alertas);
  if (wrap) wrap.style.display = 'block';
  const sorted = [...productos].sort((a,b) => {
    const order = {'Agotado':0,'Crítico':1,'Bajo':2,'OK':3};
    return (order[stockStatus(a.stock_actual??0,a.formato_ml).label]??3) - (order[stockStatus(b.stock_actual??0,b.formato_ml).label]??3);
  });
  tbody.innerHTML = sorted.map(p => {
    const stock=p.stock_actual??0, status=stockStatus(stock,p.formato_ml);
    const dosis=p.dosis_estandar_ml>0?Math.floor(stock/p.dosis_estandar_ml):'—';
    return `<tr style="cursor:pointer;" onclick="verProducto('${p.id}')">
      <td><div style="font-weight:600;">${p.nombre_comercial}</div><div style="font-size:0.73rem;color:var(--text-muted);">${p.nombre_interno}</div>${p.observaciones?`<div style="font-size:0.7rem;color:var(--accent);margin-top:0.1rem;">📝 Ver notas</div>`:''}</td>
      <td><span class="badge badge-gray">${capitalize(p.categoria||'—')}</span></td>
      <td><div style="color:${status.color};font-weight:600;">${fmt(stock,0)} ml</div><div style="font-size:0.72rem;color:var(--text-muted);">${dosis} dosis</div></td>
      <td>${status.icon} <span style="font-size:0.72rem;color:${status.color};">${status.label}</span></td>
      <td class="highlight">${fmt(p.precio_medio_litro,4)} €</td>
      <td>${fmt(p.precio_por_dosis,4)} €</td>
    </tr>`;
  }).join('');
}

function renderAlertasStock(alertas) {
  document.getElementById('stock-alertas')?.remove();
  if (!alertas.length) return;
  const div = document.createElement('div');
  div.id = 'stock-alertas';
  div.style.cssText = 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:0.6rem;padding:0.85rem 1rem;margin-bottom:1rem;';
  const titulo = document.createElement('div');
  titulo.style.cssText = 'font-family:"Barlow Condensed",sans-serif;font-size:0.9rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#fca5a5;margin-bottom:0.5rem;';
  titulo.textContent = `⚠️ ${alertas.length} producto${alertas.length>1?'s':''} con stock bajo`;
  div.appendChild(titulo);
  alertas.forEach(p => {
    const s=stockStatus(p.stock_actual??0,p.formato_ml);
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;font-size:0.82rem;padding:0.2rem 0;';
    row.innerHTML=`<span style="color:var(--text-secondary);">${s.icon} ${p.nombre_comercial}</span><span style="color:${s.color};font-weight:600;">${fmt(p.stock_actual??0,0)} ml — ${s.label}</span>`;
    div.appendChild(row);
  });
  const card=document.getElementById('productos-table-wrap')?.closest('.card');
  if (card) card.insertBefore(div, card.firstChild);
}

function verProducto(id) {
  const p = productosCache.find(p=>p.id===id);
  if (!p) return;
  const status = stockStatus(p.stock_actual??0, p.formato_ml);
  const tituloEl = document.getElementById('modal-prod-titulo');
  const contEl   = document.getElementById('modal-prod-contenido');
  if (!tituloEl || !contEl) return;
  tituloEl.innerHTML = `${p.nombre_comercial} <span style="font-size:1rem;color:var(--text-muted);">· ${capitalize(p.categoria)}</span>`;
  contEl.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;margin-bottom:1rem;">
      <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">STOCK ACTUAL</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:700;color:${status.color};">${fmt(p.stock_actual??0,0)} ml</div>
        <div style="font-size:0.72rem;color:var(--text-muted);">${status.icon} ${status.label}</div>
      </div>
      <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">PMP · €/DOSIS</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;color:var(--accent);">${fmt(p.precio_medio_litro,4)} €/L</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);">${fmt(p.precio_por_dosis,4)} € / ${p.dosis_estandar_ml} ml</div>
      </div>
      <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">FORMATO</div>
        <div style="font-size:0.9rem;font-weight:600;">${fmt(p.formato_ml,0)} ml</div>
      </div>
      <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">DOSIS RESTANTES</div>
        <div style="font-size:0.9rem;font-weight:600;">${p.dosis_estandar_ml>0?Math.floor((p.stock_actual??0)/p.dosis_estandar_ml):'—'}</div>
      </div>
    </div>
    ${p.observaciones?`<div style="margin-bottom:1rem;"><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.4rem;">📝 Observaciones / Modo de Uso</div><div style="background:var(--accent-dim);border:1px solid rgba(59,130,246,0.2);border-radius:0.4rem;padding:0.85rem;font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">${p.observaciones}</div></div>`:''}
    <div style="margin-bottom:1rem;"><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.25rem;">Nombre Interno</div><div style="font-size:0.85rem;color:var(--text-muted);">${p.nombre_interno}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
      <button class="btn-secondary" onclick="cerrarModal('modal-producto')">Cerrar</button>
      <button class="btn-action" onclick="editarProducto('${p.id}')">✏️ Editar</button>
    </div>`;
  abrirModal('modal-producto');
}

function editarProducto(id) {
  const p = productosCache.find(p=>p.id===id);
  if (!p) return;
  cerrarModal('modal-producto');
  const tituloEl = document.getElementById('modal-prod-titulo');
  const contEl   = document.getElementById('modal-prod-contenido');
  tituloEl.innerHTML = `Editando: <span style="color:var(--accent);">${p.nombre_comercial}</span>`;
  const cats = ['prelavado','desengrasante','shampoo','limpiallantas','pulido','sellado','interior','acondicionador','otro'];
  contEl.innerHTML = `
    <div style="display:grid;gap:0.75rem;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div class="field"><label>Nombre Interno</label><input type="text" id="edit-nombre-interno" value="${p.nombre_interno||''}" /></div>
        <div class="field"><label>Nombre Comercial</label><input type="text" id="edit-nombre-comercial" value="${p.nombre_comercial||''}" /></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;">
        <div class="field"><label>Categoría</label><select id="edit-categoria">${cats.map(c=>`<option value="${c}" ${p.categoria===c?'selected':''}>${capitalize(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Formato (ml)</label><input type="number" id="edit-formato" value="${p.formato_ml||''}" /></div>
        <div class="field"><label>Dosis Estándar (ml)</label><input type="number" id="edit-dosis" value="${p.dosis_estandar_ml||''}" step="0.1" /></div>
      </div>
      <div class="field"><label>Observaciones / Modo de Uso</label><textarea id="edit-observaciones">${p.observaciones||''}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <button class="btn-secondary" onclick="cerrarModal('modal-producto')">Cancelar</button>
        <button class="btn-action" onclick="guardarEdicionProducto('${p.id}')">Guardar Cambios</button>
      </div>
    </div>`;
  abrirModal('modal-producto');
}

async function guardarEdicionProducto(id) {
  const nombreInterno   = document.getElementById('edit-nombre-interno').value.trim();
  const nombreComercial = document.getElementById('edit-nombre-comercial').value.trim();
  const categoria       = document.getElementById('edit-categoria').value;
  const formato         = parseFloat(document.getElementById('edit-formato').value)||null;
  const dosis           = parseFloat(document.getElementById('edit-dosis').value)||null;
  const observaciones   = document.getElementById('edit-observaciones').value.trim();
  if (!nombreInterno||!nombreComercial) { showToast('Nombre obligatorio','error'); return; }
  const prod = productosCache.find(p=>p.id===id);
  let precioDosis = prod?.precio_por_dosis||0;
  if (dosis && prod?.precio_medio_litro) precioDosis = (prod.precio_medio_litro/1000)*dosis;
  const btn = document.querySelector('[onclick^="guardarEdicionProducto"]');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; }
  const { error } = await db.from('productos').update({ nombre_interno:nombreInterno, nombre_comercial:nombreComercial, categoria, formato_ml:formato, dosis_estandar_ml:dosis, precio_por_dosis:precioDosis, observaciones:observaciones||null }).eq('id',id);
  if (btn) { btn.disabled=false; btn.textContent='Guardar Cambios'; }
  if (error) { showToast('Error al guardar','error'); return; }
  cerrarModal('modal-producto');
  showToast('✓ Producto actualizado');
  cargarProductos();
}

async function crearProducto() {
  const nombreInterno   = document.getElementById('prod-nombre-interno').value.trim();
  const nombreComercial = document.getElementById('prod-nombre-comercial').value.trim();
  const categoria       = document.getElementById('prod-categoria').value;
  const formato         = parseFloat(document.getElementById('prod-formato').value);
  const dosis           = parseFloat(document.getElementById('prod-dosis').value);
  const precioInicial   = parseFloat(document.getElementById('prod-precio-inicial').value)||0;
  const stockInicial    = parseFloat(document.getElementById('prod-stock-inicial').value)||0;
  const observaciones   = document.getElementById('prod-observaciones')?.value.trim()||'';
  if (!nombreInterno||!nombreComercial||!categoria||!formato||!dosis) { showToast('Rellena todos los campos obligatorios','error'); return; }
  let pmpLitro=0, precioDosis=0;
  if (precioInicial>0&&stockInicial>0) { pmpLitro=precioInicial/(stockInicial/1000); precioDosis=pmpLitro*(dosis/1000); }
  const btn = document.querySelector('[onclick="crearProducto()"]');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; }
  const { error } = await db.from('productos').insert([{ nombre_interno:nombreInterno, nombre_comercial:nombreComercial, categoria, formato_ml:formato, dosis_estandar_ml:dosis, precio_medio_litro:pmpLitro, precio_por_dosis:precioDosis, stock_actual:stockInicial, observaciones:observaciones||null }]);
  if (btn) { btn.disabled=false; btn.textContent='Guardar Producto'; }
  if (error) { showToast('Error al guardar el producto','error'); return; }
  ['prod-nombre-interno','prod-nombre-comercial','prod-formato','prod-dosis','prod-precio-inicial','prod-stock-inicial','prod-observaciones'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('prod-categoria').value='';
  showToast('✓ Producto creado'); cargarProductos();
}

// ── Compras ───────────────────────────────────────────────
function addLineaPedido() {
  lineaCount++;
  const id=lineaCount, container=document.getElementById('lineas-pedido');
  if (!container) return;
  const options=productosCache.map(p=>`<option value="${p.id}">${p.nombre_comercial}</option>`).join('');
  const div=document.createElement('div'); div.className='linea-pedido'; div.id=`linea-${id}`;
  div.innerHTML=`
    <div class="field" style="margin:0;"><select class="lp-producto" onchange="actualizarResumenCompra()"><option value="">Producto...</option>${options}</select></div>
    <div class="field lp-ml" style="margin:0;"><input type="number" class="lp-cantidad" placeholder="ml" min="1" oninput="actualizarResumenCompra()" /></div>
    <div class="field lp-precio" style="margin:0;"><input type="number" class="lp-precio-val" placeholder="€" min="0" step="0.01" oninput="actualizarResumenCompra()" /></div>
    <button class="btn-remove" onclick="document.getElementById('linea-${id}').remove();actualizarResumenCompra()">✕</button>`;
  container.appendChild(div); actualizarResumenCompra();
}

function actualizarResumenCompra() {
  const lineas=document.querySelectorAll('.linea-pedido');
  const gastoTotal=parseFloat(document.getElementById('compra-total')?.value)||0;
  const resumen=document.getElementById('resumen-compra');
  if (!resumen) return;
  if (!lineas.length&&gastoTotal===0) { resumen.style.display='none'; return; }
  resumen.style.display='block';
  const rn=document.getElementById('res-num-productos'); if(rn) rn.textContent=lineas.length;
  const rg=document.getElementById('res-gasto-total'); if(rg) rg.textContent=`${fmt(gastoTotal,2)} €`;
}

async function registrarCompra() {
  const proveedor=document.getElementById('compra-proveedor')?.value.trim();
  const fecha=document.getElementById('compra-fecha')?.value;
  const url=document.getElementById('compra-url')?.value.trim();
  const gastoTotal=parseFloat(document.getElementById('compra-total')?.value)||0;
  const notas=document.getElementById('compra-notas')?.value.trim();
  if (!proveedor) { showToast('Indica el proveedor','error'); return; }
  if (!fecha)     { showToast('Indica la fecha','error'); return; }
  const lineas=[]; let validas=true;
  document.querySelectorAll('.linea-pedido').forEach(row => {
    const productoId=row.querySelector('.lp-producto')?.value;
    const cantidad=parseFloat(row.querySelector('.lp-cantidad')?.value);
    const precio=parseFloat(row.querySelector('.lp-precio-val')?.value);
    if (!productoId||!cantidad||!precio) { validas=false; return; }
    lineas.push({ productoId, cantidad, precio });
  });
  if (!validas) { showToast('Completa todos los campos de cada producto','error'); return; }
  if (!lineas.length) { showToast('Añade al menos un producto','error'); return; }
  const btn=document.querySelector('[onclick="registrarCompra()"]');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; }
  const { data:compraData, error:compraErr } = await db.from('compras').insert([{ proveedor, url_web:url||null, fecha, gasto_total:gastoTotal, notas:notas||null }]).select().single();
  if (compraErr) { if(btn){btn.disabled=false;btn.textContent='Registrar Compra y Actualizar PMP';} showToast('Error al registrar la compra','error'); return; }
  for (const linea of lineas) {
    const prod=productosCache.find(p=>p.id===linea.productoId); if(!prod) continue;
    const stockActual=prod.stock_actual||0, pmpActual=prod.precio_medio_litro||0, dosisStd=prod.dosis_estandar_ml||0;
    const precioMlNuevo=linea.precio/linea.cantidad;
    const nuevoPmpMl=stockActual===0?precioMlNuevo:((stockActual*(pmpActual/1000))+(linea.cantidad*precioMlNuevo))/(stockActual+linea.cantidad);
    const nuevoPmpLitro=nuevoPmpMl*1000, nuevoPrecioDosis=nuevoPmpMl*dosisStd, nuevoStock=stockActual+linea.cantidad;
    await db.from('pedidos').insert([{ producto_id:linea.productoId, compra_id:compraData.id, fecha, cantidad_ml:linea.cantidad, precio_total_pagado:linea.precio }]);
    await db.from('productos').update({ precio_medio_litro:nuevoPmpLitro, precio_por_dosis:nuevoPrecioDosis, stock_actual:nuevoStock }).eq('id',linea.productoId);
    prod.stock_actual=nuevoStock; prod.precio_medio_litro=nuevoPmpLitro; prod.precio_por_dosis=nuevoPrecioDosis;
  }
  if (btn) { btn.disabled=false; btn.textContent='Registrar Compra y Actualizar PMP'; }
  ['compra-proveedor','compra-url','compra-total','compra-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const lp=document.getElementById('lineas-pedido'); if(lp) lp.innerHTML='';
  const rc=document.getElementById('resumen-compra'); if(rc) rc.style.display='none';
  lineaCount=0;
  showToast(`✓ Compra registrada · ${lineas.length} producto(s) actualizados`); cargarProductos();
}

async function cargarHistorial() {
  const loading=document.getElementById('historial-loading');
  const container=document.getElementById('historial-container');
  const empty=document.getElementById('historial-empty');
  if(loading) loading.style.display='block';
  if(container) container.innerHTML='';
  if(empty) empty.style.display='none';
  const { data:compras, error } = await db.from('compras').select(`*, pedidos(cantidad_ml, precio_total_pagado, productos(nombre_comercial))`).order('fecha',{ascending:false});
  if(loading) loading.style.display='none';
  if(error){showToast('Error al cargar historial','error');return;}
  if(!compras||!compras.length){if(empty) empty.style.display='block';return;}
  container.innerHTML=compras.map(c=>{
    const lineasHTML=(c.pedidos||[]).map(p=>`<div class="compra-linea-item"><span>${p.productos?.nombre_comercial||'—'}</span><span>${fmt(p.cantidad_ml,0)} ml · ${fmt(p.precio_total_pagado,2)} €</span></div>`).join('');
    const urlLink=c.url_web?`<a href="${c.url_web}" target="_blank" style="color:var(--accent);font-size:0.78rem;text-decoration:none;">🔗 Ver web</a>`:'';
    return `<div class="compra-card"><div class="compra-card-header"><div><div class="compra-proveedor">${c.proveedor}</div><div class="compra-fecha">${formatFecha(c.fecha)} ${urlLink}</div>${c.notas?`<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">${c.notas}</div>`:''}</div><div class="compra-total">${fmt(c.gasto_total,2)} €</div></div>${lineasHTML?`<div class="compra-lineas">${lineasHTML}</div>`:''}</div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  OPERACIONES
// ═══════════════════════════════════════════════════════════
async function cargarSelectorServicios() {
  const container=document.getElementById('int-servicios-selector'); if(!container) return;
  if(!serviciosCache.length){const{data}=await db.from('servicios').select('*').eq('activo',true).order('nombre');serviciosCache=data||[];}
  serviciosSeleccionados=[];
  if(!serviciosCache.length){container.innerHTML=`<div style="color:var(--text-muted);font-size:0.82rem;">Sin servicios. <span style="color:var(--accent);cursor:pointer;" onclick="switchModule('servicios')">Crear →</span></div>`;return;}
  container.innerHTML=serviciosCache.map(s=>`<button onclick="toggleServicio('${s.id}',${s.precio_base||0},${s.duracion_horas||0})" id="serv-btn-${s.id}" style="padding:0.4rem 0.85rem;border-radius:99px;font-size:0.8rem;font-weight:600;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;transition:all 0.15s;white-space:nowrap;">${s.nombre}${s.precio_base?' · '+fmt(s.precio_base,0)+'€':''}</button>`).join('');
}

function toggleServicio(id) {
  const btn=document.getElementById(`serv-btn-${id}`), idx=serviciosSeleccionados.indexOf(id);
  if(idx===-1){serviciosSeleccionados.push(id);if(btn){btn.style.background='var(--accent)';btn.style.borderColor='var(--accent)';btn.style.color='#fff';}}
  else{serviciosSeleccionados.splice(idx,1);if(btn){btn.style.background='transparent';btn.style.borderColor='var(--border)';btn.style.color='var(--text-secondary)';}}
  let precioTotal=0, horasTotal=0;
  serviciosSeleccionados.forEach(sid=>{const s=serviciosCache.find(s=>s.id===sid);if(s){precioTotal+=s.precio_base||0;horasTotal+=s.duracion_horas||0;}});
  const sugerido=document.getElementById('int-precio-sugerido');
  const sugeridoVal=document.getElementById('int-precio-sugerido-val');
  if(sugerido) sugerido.style.display=serviciosSeleccionados.length>0?'block':'none';
  if(sugeridoVal) sugeridoVal.textContent=`${fmt(precioTotal,2)} €${horasTotal?' · '+horasTotal+'h est.':''}`;
}

function addProductoUsado() {
  productoUsadoCount++;
  const id=productoUsadoCount, container=document.getElementById('productos-usados-container'); if(!container) return;
  const options=productosCache.map(p=>`<option value="${p.id}">${p.nombre_comercial}</option>`).join('');
  const div=document.createElement('div'); div.className='producto-usado-row'; div.id=`pu-${id}`;
  div.innerHTML=`<div class="field" style="margin:0;"><select class="pu-producto"><option value="">Producto...</option>${options}</select></div><div class="field" style="margin:0;"><input type="number" class="pu-ml" placeholder="ml" min="1" /></div><button class="btn-remove" onclick="document.getElementById('pu-${id}').remove()">✕</button>`;
  container.appendChild(div);
}

async function crearIntervencion() {
  const matricula=document.getElementById('int-matricula')?.value.trim().toUpperCase();
  const cliente=document.getElementById('int-cliente')?.value.trim();
  const horas=parseFloat(document.getElementById('int-horas')?.value)||null;
  const precio=parseFloat(document.getElementById('int-precio')?.value)||null;
  const estado=document.getElementById('int-estado')?.value||'abierta';
  const incidentes=document.getElementById('int-incidentes')?.value.trim();
  if (!matricula){showToast('Introduce la matrícula','error');return;}
  if (!cliente){showToast('Introduce el nombre del cliente','error');return;}
  const serviciosNombres=serviciosSeleccionados.map(id=>serviciosCache.find(s=>s.id===id)?.nombre).filter(Boolean);
  const nombreServicio=serviciosNombres.join(' + ')||null;
  const productosUsados=[];
  document.querySelectorAll('.producto-usado-row').forEach(row=>{
    const productoId=row.querySelector('.pu-producto')?.value, ml=parseFloat(row.querySelector('.pu-ml')?.value);
    if(!productoId||!ml) return;
    const prod=productosCache.find(p=>p.id===productoId);
    productosUsados.push({id:productoId,nombre:prod?.nombre_comercial||'',nombre_comercial:prod?.nombre_comercial||'',ml_usados:ml,coste:(prod?.precio_por_dosis||0)*(ml/(prod?.dosis_estandar_ml||1))});
  });
  const mapaData=damagePoints.length?damagePoints.map(d=>({id:d.id,x:Math.round(d.x),y:Math.round(d.y),tipo:d.tipo,label:DAMAGE_COLORS[d.tipo]?.label||d.tipo,vista:d.vista})):null;
  const btn=document.querySelector('[onclick="crearIntervencion()"]');
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';}
  const{error}=await db.from('intervenciones').insert([{matricula,cliente_nombre:cliente,horas_reales:horas,precio_cobrado:precio,productos_usados:productosUsados.length?productosUsados:null,mapa_danos:mapaData,incidentes:incidentes||null,estado,nombre_servicio:nombreServicio,servicios_ids:serviciosSeleccionados.length?serviciosSeleccionados:null}]);
  if(btn){btn.disabled=false;btn.textContent='Guardar Intervención';}
  if(error){console.error(error);showToast('Error al guardar la intervención','error');return;}
  for(const pu of productosUsados){const prod=productosCache.find(p=>p.id===pu.id);if(!prod) continue;const nuevoStock=Math.max(0,(prod.stock_actual||0)-pu.ml_usados);await db.from('productos').update({stock_actual:nuevoStock}).eq('id',pu.id);prod.stock_actual=nuevoStock;}
  if(productosUsados.length>0) cargarProductos();
  ['int-matricula','int-cliente','int-horas','int-precio','int-incidentes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const estEl=document.getElementById('int-estado');if(estEl)estEl.value='abierta';
  const puCont=document.getElementById('productos-usados-container');if(puCont)puCont.innerHTML='';
  productoUsadoCount=0; resetMapaDanos(); serviciosSeleccionados=[];
  const ps=document.getElementById('int-precio-sugerido');if(ps)ps.style.display='none';
  cargarSelectorServicios();
  showToast('✓ Intervención guardada · Stock actualizado');
  switchModule('operaciones'); switchTabDirect('operaciones','lista');
}

async function cargarIntervenciones() {
  const loading=document.getElementById('intervenciones-loading');
  const container=document.getElementById('intervenciones-container');
  const empty=document.getElementById('intervenciones-empty');
  if(loading)loading.style.display='block';if(container)container.innerHTML='';if(empty)empty.style.display='none';
  const{data,error}=await db.from('intervenciones').select('*').order('created_at',{ascending:false});
  if(loading)loading.style.display='none';
  if(error){showToast('Error al cargar intervenciones','error');return;}
  if(!data||!data.length){if(empty)empty.style.display='block';return;}
  container.innerHTML=data.map(inv=>{
    const productos=inv.productos_usados||[];
    return `<div class="intervencion-card" onclick="verIntervencion('${inv.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div class="intervencion-matricula">${inv.matricula}</div><div class="intervencion-cliente">${inv.cliente_nombre}</div></div>${estadoBadge(inv.estado)}</div>
      <div class="intervencion-meta">${inv.nombre_servicio?`<span class="badge badge-gray">${inv.nombre_servicio}</span>`:''} ${inv.horas_reales?`<span class="badge badge-blue">⏱ ${inv.horas_reales}h</span>`:''} ${inv.precio_cobrado?`<span class="badge badge-green">💰 ${fmt(inv.precio_cobrado,2)} €</span>`:''} ${productos.length>0?`<span class="badge badge-orange">🧴 ${productos.length} prod.</span>`:''}</div>
      <div style="font-size:0.73rem;color:var(--text-muted);margin-top:0.5rem;">${new Date(inv.created_at).toLocaleDateString('es-ES')}</div>
    </div>`;
  }).join('');
}

async function verIntervencion(id) {
  const{data:inv,error}=await db.from('intervenciones').select('*').eq('id',id).single();
  if(error||!inv) return;
  const productos=inv.productos_usados||[];
  const costeMateriales=productos.reduce((s,p)=>s+(p.coste||0),0);
  const beneficio=inv.precio_cobrado?inv.precio_cobrado-costeMateriales:null;
  const vistaLabels={'frontal':'Frontal','trasera':'Trasera','lateral-izq':'Lat. Izq','lateral-der':'Lat. Der'};
  document.getElementById('modal-int-titulo').innerHTML=`<span>${inv.matricula}</span> — ${inv.cliente_nombre}`;
  document.getElementById('modal-int-contenido').innerHTML=`
    <div style="display:grid;gap:0.75rem;">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">${estadoBadge(inv.estado)}${inv.nombre_servicio?`<span class="badge badge-gray">${inv.nombre_servicio}</span>`:''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;"><div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">HORAS</div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:700;">${inv.horas_reales||'—'} h</div></div>
        <div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;"><div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.25rem;">PRECIO COBRADO</div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:700;color:var(--accent);">${inv.precio_cobrado?fmt(inv.precio_cobrado,2)+' €':'—'}</div></div>
      </div>
      ${productos.length>0?`<div><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.5rem;">Productos Usados</div>${productos.map(p=>`<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;"><span>${p.nombre_comercial||p.nombre}</span><span style="color:var(--text-muted)">${p.ml_usados} ml · ${fmt(p.coste,4)} €</span></div>`).join('')}<div style="display:flex;justify-content:space-between;padding:0.4rem 0;font-size:0.85rem;margin-top:0.25rem;"><span style="color:var(--text-secondary);">Coste total materiales</span><span class="highlight">${fmt(costeMateriales,4)} €</span></div></div>`:''}
      ${inv.mapa_danos&&inv.mapa_danos.length>0?`<div><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.5rem;">Mapa de Daños</div><div style="background:var(--bg-input);border:1px solid var(--border);border-radius:0.4rem;overflow:hidden;"><svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;"><rect x="40" y="55" width="220" height="115" rx="12" fill="#1e2030" stroke="#2a3550" stroke-width="2"/><path d="M78,55 L222,55 L242,25 L58,25 Z" fill="#1a2035" stroke="#2a3550" stroke-width="2"/><path d="M82,53 L218,53 L234,27 L66,27 Z" fill="#0d1525" stroke="#3b82f6" stroke-width="1.5" opacity="0.85"/><path d="M40,95 L260,95 L255,55 L45,55 Z" fill="#192030" stroke="#2a3550" stroke-width="1.5"/><path d="M42,68 L95,68 L95,92 L42,90 Z" fill="#1a2540" stroke="#3b82f6" stroke-width="1.5"/><path d="M258,68 L205,68 L205,92 L258,90 Z" fill="#1a2540" stroke="#3b82f6" stroke-width="1.5"/><path d="M40,151 Q40,165 52,167 L248,167 Q260,165 260,151 Z" fill="#192030" stroke="#2a3550" stroke-width="1.5"/><ellipse cx="74" cy="178" rx="26" ry="10" fill="#111" stroke="#3b82f6" stroke-width="1.5"/><ellipse cx="226" cy="178" rx="26" ry="10" fill="#111" stroke="#3b82f6" stroke-width="1.5"/>${inv.mapa_danos.map(d=>{const cols={rayazo:'#ef4444',abollon:'#f59e0b',oxidacion:'#8b5cf6',otro:'#6b7280'};const strs={rayazo:'#fca5a5',abollon:'#fcd34d',oxidacion:'#c4b5fd',otro:'#9ca3af'};return `<circle cx="${d.x}" cy="${d.y}" r="10" fill="${cols[d.tipo]||'#ef4444'}" fill-opacity="0.8" stroke="${strs[d.tipo]||'#fca5a5'}" stroke-width="2"/><text x="${d.x}" y="${d.y+4}" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">${d.id}</text>`;}).join('')}</svg></div><div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem;">${inv.mapa_danos.map(d=>{const cols={rayazo:'#ef4444',abollon:'#f59e0b',oxidacion:'#8b5cf6',otro:'#6b7280'};return `<span style="font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:99px;background:${cols[d.tipo]||'#ef4444'}22;border:1px solid ${cols[d.tipo]||'#ef4444'}66;color:${cols[d.tipo]||'#ef4444'};">${d.id}. ${d.label||d.tipo}${d.vista?' · '+(vistaLabels[d.vista]||d.vista):''}</span>`;}).join('')}</div></div>`:''}
      <div><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">Rentabilidad Bruta</div><div style="font-size:0.9rem;">${beneficio!==null?`${fmt(inv.precio_cobrado,2)} € - ${fmt(costeMateriales,2)} € = <span class="highlight">${fmt(beneficio,2)} €</span>`:'—'}</div></div>
      ${inv.incidentes?`<div><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">Incidentes / Observaciones</div><div style="font-size:0.85rem;color:var(--text-secondary);background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;">${inv.incidentes}</div></div>`:''}
      <div style="display:flex;gap:0.5rem;margin-top:0.25rem;"><button class="btn-secondary" onclick="cerrarModal('modal-intervencion')">Cerrar</button><button class="btn-action" onclick="cambiarEstado('${inv.id}','${inv.estado}')">Cambiar Estado</button></div>
    </div>`;
  abrirModal('modal-intervencion');
}

async function cambiarEstado(id, estadoActual) {
  const estados=['abierta','en_proceso','finalizada','entregada'];
  const nuevoEstado=estados[(estados.indexOf(estadoActual)+1)%estados.length];
  const{error}=await db.from('intervenciones').update({estado:nuevoEstado}).eq('id',id);
  if(error){showToast('Error al actualizar estado','error');return;}
  cerrarModal('modal-intervencion'); showToast(`✓ Estado: ${nuevoEstado}`); cargarIntervenciones();
}

// ═══════════════════════════════════════════════════════════
//  MAPA DE DAÑOS — 4 VISTAS
// ═══════════════════════════════════════════════════════════
let damagePoints=[], damageCounter=0, currentDamageType='rayazo', vistaActual='frontal';
const DAMAGE_COLORS={ rayazo:{fill:'#ef4444',stroke:'#fca5a5',label:'Rayazo'}, abollon:{fill:'#f59e0b',stroke:'#fcd34d',label:'Abollón'}, oxidacion:{fill:'#8b5cf6',stroke:'#c4b5fd',label:'Oxidación'}, otro:{fill:'#6b7280',stroke:'#9ca3af',label:'Otro'} };

function cambiarVista(vista, btn) {
  vistaActual=vista;
  document.querySelectorAll('.vista-svg').forEach(svg=>svg.style.display='none');
  const svgEl=document.getElementById(`vista-${vista}`); if(svgEl) svgEl.style.display='block';
  document.querySelectorAll('.vista-btn').forEach(b=>{b.style.background='transparent';b.style.color='var(--text-muted)';});
  if(btn){btn.style.background='var(--accent)';btn.style.color='#fff';}
}
function selectDamageType(btn) {
  document.querySelectorAll('.damage-type-btn').forEach(b=>b.style.opacity='0.45');
  if(btn) btn.style.opacity='1'; currentDamageType=btn?.dataset.type||'rayazo';
}
function addDamagePoint(event) {
  const svg=event.currentTarget, rect=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal;
  const x=(event.clientX-rect.left)*(vb.width/rect.width), y=(event.clientY-rect.top)*(vb.height/rect.height);
  damageCounter++; const id=damageCounter, color=DAMAGE_COLORS[currentDamageType], vista=svg.dataset.vista;
  damagePoints.push({id,x,y,tipo:currentDamageType,label:color.label,vista});
  const g=document.getElementById(`damage-points-${vista}`); if(!g) return;
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','10');
  circle.setAttribute('fill',color.fill);circle.setAttribute('fill-opacity','0.8');
  circle.setAttribute('stroke',color.stroke);circle.setAttribute('stroke-width','2');
  circle.setAttribute('id',`dp-${id}`);circle.style.cursor='pointer';
  circle.setAttribute('onclick',`removeDamagePoint(${id},event)`);
  const text=document.createElementNS('http://www.w3.org/2000/svg','text');
  text.setAttribute('x',x);text.setAttribute('y',y+4);text.setAttribute('text-anchor','middle');
  text.setAttribute('font-size','9');text.setAttribute('fill','#fff');text.setAttribute('font-weight','bold');
  text.setAttribute('pointer-events','none');text.setAttribute('id',`dt-${id}`);text.textContent=id;
  g.appendChild(circle);g.appendChild(text);renderDanosList();
}
function removeDamagePoint(id,event) {
  event.stopPropagation(); damagePoints=damagePoints.filter(d=>d.id!==id);
  document.getElementById(`dp-${id}`)?.remove(); document.getElementById(`dt-${id}`)?.remove(); renderDanosList();
}
function limpiarMapa() {
  damagePoints=[];damageCounter=0;
  ['frontal','trasera','lateral-izq','lateral-der'].forEach(v=>{const g=document.getElementById(`damage-points-${v}`);if(g)g.innerHTML='';});
  renderDanosList();
}
function renderDanosList() {
  const lista=document.getElementById('danos-lista'), items=document.getElementById('danos-lista-items');
  if(!lista||!items) return;
  if(!damagePoints.length){lista.style.display='none';return;}
  lista.style.display='block';
  const vl={'frontal':'Frontal','trasera':'Trasera','lateral-izq':'Lat. Izq','lateral-der':'Lat. Der'};
  items.innerHTML=damagePoints.map(d=>{const c=DAMAGE_COLORS[d.tipo];return `<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;border-radius:99px;font-size:0.72rem;font-weight:600;background:${c.fill}22;border:1px solid ${c.fill}66;color:${c.stroke};">${d.id}. ${c.label} · ${vl[d.vista]||d.vista}</span>`;}).join('');
}
function resetMapaDanos() {
  limpiarMapa();
  document.querySelectorAll('.damage-type-btn').forEach((b,i)=>b.style.opacity=i===0?'1':'0.45');
  currentDamageType='rayazo';vistaActual='frontal';
  document.querySelectorAll('.vista-svg').forEach(svg=>svg.style.display='none');
  const frontal=document.getElementById('vista-frontal');if(frontal)frontal.style.display='block';
  document.querySelectorAll('.vista-btn').forEach((b,i)=>{b.style.background=i===0?'var(--accent)':'transparent';b.style.color=i===0?'#fff':'var(--text-muted)';});
}

// ═══════════════════════════════════════════════════════════
//  CALIDAD
// ═══════════════════════════════════════════════════════════
let costeHoraConfig=25;
async function cargarCalidad() {
  const sel=document.getElementById('calidad-intervencion-sel'); if(!sel) return;
  sel.innerHTML='<option value="">Cargando...</option>';
  const{data,error}=await db.from('intervenciones').select('id,matricula,cliente_nombre,nombre_servicio,estado').order('created_at',{ascending:false});
  if(error||!data){sel.innerHTML='<option value="">Error al cargar</option>';return;}
  sel.innerHTML='<option value="">Selecciona una intervención...</option>';
  data.forEach(inv=>{const opt=document.createElement('option');opt.value=inv.id;opt.textContent=`${inv.matricula} — ${inv.cliente_nombre} (${inv.nombre_servicio||'Sin servicio'})`;sel.appendChild(opt);});
}
async function cargarVistaPrevia() {
  const id=document.getElementById('calidad-intervencion-sel')?.value;
  const preview=document.getElementById('calidad-preview'), empty=document.getElementById('calidad-empty');
  const costeH=parseFloat(document.getElementById('calidad-coste-hora')?.value)||25;
  costeHoraConfig=costeH;
  if(!id){if(preview)preview.style.display='none';if(empty)empty.style.display='block';return;}
  const{data:inv,error}=await db.from('intervenciones').select('*').eq('id',id).single();
  if(error||!inv) return;
  const productos=inv.productos_usados||[];
  const costeMat=productos.reduce((s,p)=>s+(p.coste||0),0);
  const costeHoras=(inv.horas_reales||0)*costeH;
  const beneficio=(inv.precio_cobrado||0)-costeMat-costeHoras;
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('prev-matricula',inv.matricula);set('prev-cliente',inv.cliente_nombre);set('prev-servicio',inv.nombre_servicio||'—');
  set('prev-fecha',new Date(inv.created_at).toLocaleDateString('es-ES'));
  const estadoEl=document.getElementById('prev-estado');if(estadoEl)estadoEl.innerHTML=estadoBadge(inv.estado);
  const prodEl=document.getElementById('prev-productos');
  if(prodEl)prodEl.innerHTML=productos.length?productos.map(p=>`<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;"><span>✓ ${p.nombre_comercial||p.nombre}</span><span style="color:var(--text-muted)">${p.ml_usados} ml</span></div>`).join(''):'<div style="color:var(--text-muted);font-size:0.85rem;">Sin productos registrados</div>';
  set('prev-precio',`${fmt(inv.precio_cobrado||0,2)} €`);set('prev-coste-mat',`${fmt(costeMat,2)} €`);
  set('prev-coste-horas',`${fmt(costeHoras,2)} € (${inv.horas_reales||0}h × ${costeH} €/h)`);set('prev-beneficio',`${fmt(beneficio,2)} €`);
  const benEl=document.getElementById('prev-beneficio');if(benEl)benEl.style.color=beneficio>=0?'var(--success)':'var(--danger)';
  set('prev-incidentes',inv.incidentes||'Sin observaciones');
  if(preview){preview.style.display='block';preview.dataset.invId=id;preview.dataset.costeH=costeH;}
  if(empty)empty.style.display='none';
}

async function generarPDFCliente() {
  const id=document.getElementById('calidad-preview')?.dataset.invId; if(!id) return;
  const{data:inv}=await db.from('intervenciones').select('*').eq('id',id).single(); if(!inv) return;
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const azul=[59,130,246],gris=[30,30,30],blanco=[240,240,240],grisClaro=[180,180,180];
  doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');
  doc.setFillColor(...azul);doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255);doc.setFontSize(22);doc.setFont('helvetica','bold');doc.text('BL DETAIL CENTER',15,18);
  doc.setFontSize(10);doc.setFont('helvetica','normal');doc.text('Informe de Calidad — Cliente',15,24);doc.text(`Fecha: ${new Date(inv.created_at).toLocaleDateString('es-ES')}`,150,18);
  let y=40;
  doc.setTextColor(...blanco);doc.setFontSize(14);doc.setFont('helvetica','bold');doc.text('DATOS DEL VEHÍCULO',15,y);y+=8;
  [['Matrícula',inv.matricula],['Cliente',inv.cliente_nombre],['Servicio',inv.nombre_servicio||'—'],['Estado',inv.estado?.toUpperCase()||'—']].forEach(([k,v])=>{
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(`${k}:`,15,y);doc.setTextColor(...blanco);doc.setFont('helvetica','bold');doc.text(String(v),50,y);y+=6;
  });
  y+=4;doc.setDrawColor(...azul);doc.setLineWidth(0.5);doc.line(15,y,195,y);y+=8;
  doc.setTextColor(...blanco);doc.setFontSize(13);doc.setFont('helvetica','bold');doc.text('PRODUCTOS APLICADOS',15,y);y+=8;
  const productos=inv.productos_usados||[];
  if(!productos.length){doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text('Sin productos registrados',15,y);y+=8;}
  else{productos.forEach(p=>{doc.setFillColor(45,45,45);doc.roundedRect(15,y-4,180,8,1,1,'F');doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(...azul);doc.text('✓',18,y);doc.setTextColor(...blanco);doc.setFont('helvetica','normal');doc.text(p.nombre_comercial||p.nombre,25,y);doc.setTextColor(...grisClaro);doc.text(`${p.ml_usados} ml`,155,y,{align:'right'});y+=10;});}
  y+=4;doc.setDrawColor(...azul);doc.line(15,y,195,y);y+=8;
  doc.setTextColor(...blanco);doc.setFontSize(13);doc.setFont('helvetica','bold');doc.text('OBSERVACIONES TÉCNICAS',15,y);y+=8;
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);
  const obsLines=doc.splitTextToSize(inv.incidentes||'Sin observaciones registradas.',175);doc.text(obsLines,15,y);
  doc.setFillColor(...azul);doc.rect(0,285,210,12,'F');doc.setTextColor(255,255,255);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text('BL Detail Center — Sistema de Gestión de Calidad y Operaciones',105,292,{align:'center'});
  doc.save(`informe_cliente_${inv.matricula}_${inv.created_at.split('T')[0]}.pdf`);showToast('✓ PDF cliente generado');
}

async function generarPDFInterno() {
  const id=document.getElementById('calidad-preview')?.dataset.invId;
  const costeH=parseFloat(document.getElementById('calidad-preview')?.dataset.costeH)||25;
  if(!id) return;
  const{data:inv}=await db.from('intervenciones').select('*').eq('id',id).single();if(!inv)return;
  const productos=inv.productos_usados||[];
  const costeMat=productos.reduce((s,p)=>s+(p.coste||0),0);
  const costeHoras=(inv.horas_reales||0)*costeH;
  const beneficio=(inv.precio_cobrado||0)-costeMat-costeHoras;
  const margen=inv.precio_cobrado?(beneficio/inv.precio_cobrado*100):0;
  const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const azul=[59,130,246],gris=[30,30,30],blanco=[240,240,240],grisClaro=[180,180,180],negro=[20,20,20];
  doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');
  doc.setFillColor(...negro);doc.rect(0,0,210,32,'F');doc.setFillColor(...azul);doc.rect(0,0,5,32,'F');
  doc.setTextColor(...blanco);doc.setFontSize(20);doc.setFont('helvetica','bold');doc.text('BL DETAIL CENTER — INFORME INTERNO',12,14);
  doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')} — USO INTERNO`,12,22);
  let y=42;
  [['Matrícula',inv.matricula],['Cliente',inv.cliente_nombre],['Servicio',inv.nombre_servicio||'—'],['Horas',`${inv.horas_reales||0} h`],['Estado',inv.estado?.toUpperCase()]].forEach(([k,v])=>{
    doc.setFontSize(9);doc.setTextColor(...grisClaro);doc.setFont('helvetica','normal');doc.text(k,15,y);doc.setTextColor(...blanco);doc.setFont('helvetica','bold');doc.text(String(v||'—'),70,y);y+=7;
  });
  y+=4;doc.setDrawColor(...azul);doc.setLineWidth(0.3);doc.line(15,y,195,y);y+=8;
  doc.setFontSize(12);doc.setFont('helvetica','bold');doc.setTextColor(...blanco);doc.text('DESGLOSE ECONÓMICO',15,y);y+=8;
  [[`Precio Cobrado`,`+ ${fmt(inv.precio_cobrado||0,2)} €`,azul],[`Coste Materiales`,`- ${fmt(costeMat,2)} €`,[239,68,68]],[`Mano de Obra (${inv.horas_reales||0}h × ${costeH}€)`,`- ${fmt(costeHoras,2)} €`,[239,68,68]]].forEach(([label,valor,color])=>{
    doc.setFillColor(40,40,40);doc.roundedRect(15,y-5,180,9,1,1,'F');doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(label,18,y);doc.setTextColor(...color);doc.setFont('helvetica','bold');doc.text(valor,192,y,{align:'right'});y+=11;
  });
  doc.setFillColor(...azul);doc.roundedRect(15,y-5,180,12,2,2,'F');doc.setFontSize(12);doc.setFont('helvetica','bold');doc.setTextColor(255,255,255);doc.text('BENEFICIO BRUTO',18,y+2);doc.text(`${fmt(beneficio,2)} € (${fmt(margen,1)}%)`,192,y+2,{align:'right'});y+=18;
  if(productos.length>0){doc.setDrawColor(...azul);doc.line(15,y,195,y);y+=8;doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(...blanco);doc.text('DETALLE DE MATERIALES',15,y);y+=8;productos.forEach(p=>{doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(`• ${p.nombre_comercial||p.nombre}`,18,y);doc.setTextColor(...blanco);doc.text(`${p.ml_usados} ml`,130,y);doc.setTextColor(...azul);doc.text(`${fmt(p.coste,4)} €`,192,y,{align:'right'});y+=6;});}
  doc.setFillColor(...negro);doc.rect(0,283,210,14,'F');doc.setFillColor(...azul);doc.rect(0,283,5,14,'F');doc.setTextColor(...grisClaro);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text('DOCUMENTO DE USO INTERNO — BL Detail Center',12,292);
  doc.save(`rentabilidad_${inv.matricula}_${inv.created_at.split('T')[0]}.pdf`);showToast('✓ PDF interno generado');
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
async function cargarDashboard() {
  const ahora=new Date(),primerDia=new Date(ahora.getFullYear(),ahora.getMonth(),1).toISOString().split('T')[0];
  const hoy=ahora.toISOString().split('T')[0],en7dias=new Date(ahora.getTime()+7*24*60*60*1000).toISOString().split('T')[0];
  const[{data:intervMes},{data:intervTotal},{data:productos},{data:tareas},{data:citasHoy},{data:citasProximas}]=await Promise.all([
    db.from('intervenciones').select('precio_cobrado,estado').gte('created_at',primerDia),
    db.from('intervenciones').select('id,matricula,cliente_nombre,nombre_servicio,estado,created_at').order('created_at',{ascending:false}).limit(5),
    db.from('productos').select('*'),
    db.from('tareas').select('*').eq('completada',false).order('created_at',{ascending:false}),
    db.from('citas').select('*').eq('fecha',hoy).neq('estado','cancelada').order('hora',{ascending:true}),
    db.from('citas').select('id').gt('fecha',hoy).lte('fecha',en7dias).neq('estado','cancelada')
  ]);
  const totalIngresos=(intervMes||[]).reduce((s,i)=>s+(i.precio_cobrado||0),0);
  const stockAlertas=(productos||[]).filter(p=>stockStatus(p.stock_actual??0,p.formato_ml).label!=='OK');
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('dash-ingresos',`${fmt(totalIngresos,2)} €`);
  set('dash-servicios',(intervMes||[]).length);
  set('dash-pendientes',(intervMes||[]).filter(i=>i.estado==='abierta'||i.estado==='en_proceso').length);
  set('dash-stock-critico',stockAlertas.length);
  set('dash-citas-hoy',(citasHoy||[]).length);
  set('dash-citas-proximas',(citasProximas||[]).length);
  const citasEl=document.getElementById('dash-citas-lista');
  if(citasEl){
    const citasData=citasHoy||[];
    const ec={pendiente:'#f59e0b',confirmada:'#22c55e',completada:'#6b7280',cancelada:'#ef4444'};
    citasEl.innerHTML=!citasData.length?'<div style="color:var(--text-muted);font-size:0.85rem;">Sin citas para hoy</div>':citasData.map(c=>`<div style="display:flex;gap:0.65rem;align-items:flex-start;padding:0.55rem 0;border-bottom:1px solid var(--border);"><div style="width:3px;border-radius:2px;background:${ec[c.estado]||'var(--accent)'};align-self:stretch;flex-shrink:0;"></div><div style="flex:1;"><div style="display:flex;justify-content:space-between;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:700;">${c.hora?c.hora.slice(0,5)+' · ':''}${c.matricula||c.cliente_nombre}</span><span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:99px;background:${ec[c.estado]||'var(--accent)'}22;color:${ec[c.estado]||'var(--accent)'};">${c.estado}</span></div><div style="font-size:0.78rem;color:var(--text-muted);">${c.cliente_nombre||''} ${c.servicio?'· '+c.servicio:''}</div></div></div>`).join('');
  }
  const alertasEl=document.getElementById('dash-alertas-lista');
  if(alertasEl)alertasEl.innerHTML=stockAlertas.length===0?'<div style="color:var(--success);font-size:0.85rem;">✓ Todo el stock en niveles correctos</div>':stockAlertas.map(p=>{const s=stockStatus(p.stock_actual??0,p.formato_ml);return `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.83rem;"><span>${s.icon} ${p.nombre_comercial}</span><span style="color:${s.color};font-weight:600;">${fmt(p.stock_actual??0,0)} ml · ${s.label}</span></div>`;}).join('');
  const ultimasEl=document.getElementById('dash-ultimas');
  if(ultimasEl)ultimasEl.innerHTML=(!intervTotal||!intervTotal.length)?'<div style="color:var(--text-muted);font-size:0.85rem;">Sin intervenciones aún</div>':intervTotal.map(i=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border);"><div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:700;">${i.matricula}</div><div style="font-size:0.75rem;color:var(--text-muted);">${i.cliente_nombre} · ${i.nombre_servicio||'—'}</div></div><div style="text-align:right;">${estadoBadge(i.estado)}<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">${new Date(i.created_at).toLocaleDateString('es-ES')}</div></div></div>`).join('');
  renderTareasDashboard(tareas||[]); cargarGrafica();
}

function renderTareasDashboard(tareas) {
  const container=document.getElementById('dash-tareas-lista');if(!container)return;
  const prioColors={alta:'#ef4444',normal:'var(--accent)',baja:'#6b7280'};
  container.innerHTML=!tareas.length?'<div style="color:var(--text-muted);font-size:0.85rem;">No hay tareas pendientes 🎉</div>':tareas.map(t=>`<div style="display:flex;align-items:center;gap:0.65rem;padding:0.45rem 0;border-bottom:1px solid var(--border);"><button onclick="completarTarea('${t.id}')" style="width:18px;height:18px;border-radius:50%;border:2px solid ${prioColors[t.prioridad]||'var(--accent)'};background:transparent;cursor:pointer;flex-shrink:0;" onmouseover="this.style.background='${prioColors[t.prioridad]||'var(--accent)'}'" onmouseout="this.style.background='transparent'"></button><span style="flex:1;font-size:0.85rem;">${t.texto}</span><span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:99px;background:${prioColors[t.prioridad]||'var(--accent)'}22;color:${prioColors[t.prioridad]||'var(--accent)'};">${t.prioridad}</span></div>`).join('');
}
async function agregarTarea() {
  const input=document.getElementById('nueva-tarea-texto'),prioSel=document.getElementById('nueva-tarea-prio');
  const texto=input?.value.trim(),prioridad=prioSel?.value||'normal';
  if(!texto){showToast('Escribe una tarea','error');return;}
  const{error}=await db.from('tareas').insert([{texto,prioridad}]);
  if(error){showToast('Error al guardar tarea','error');return;}
  if(input)input.value='';showToast('✓ Tarea añadida');cargarDashboard();
}
async function completarTarea(id) {
  await db.from('tareas').update({completada:true}).eq('id',id);showToast('✓ Tarea completada');cargarDashboard();
}

// ═══════════════════════════════════════════════════════════
//  SERVICIOS
// ═══════════════════════════════════════════════════════════
async function cargarServicios() {
  const loading=document.getElementById('servicios-loading'),container=document.getElementById('servicios-container'),empty=document.getElementById('servicios-empty');
  if(loading)loading.style.display='block';if(container)container.innerHTML='';if(empty)empty.style.display='none';
  const{data,error}=await db.from('servicios').select('*').order('nombre');
  if(loading)loading.style.display='none';
  if(error){showToast('Error al cargar servicios','error');return;}
  serviciosCache=data||[];
  if(!serviciosCache.length){if(empty)empty.style.display='block';return;}
  container.innerHTML=serviciosCache.map(s=>`<div class="compra-card" style="cursor:pointer;" onclick="verServicio('${s.id}')"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;"><div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;">${s.nombre}</span><span class="badge ${s.activo?'badge-green':'badge-gray'}">${s.activo?'Activo':'Inactivo'}</span></div>${s.descripcion?`<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.35rem;">${s.descripcion}</div>`:''} ${s.incluye?`<div style="font-size:0.78rem;color:var(--text-muted);">✓ ${s.incluye.replace(/\n/g,'  ·  ')}</div>`:''}</div><div style="text-align:right;flex-shrink:0;margin-left:0.75rem;">${s.precio_base?`<div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:800;color:var(--accent);">${fmt(s.precio_base,2)} €</div>`:''} ${s.duracion_horas?`<div style="font-size:0.78rem;color:var(--text-muted);">⏱ ${s.duracion_horas}h</div>`:''}</div></div></div>`).join('');
}
function verServicio(id) {
  const s=serviciosCache.find(s=>s.id===id);if(!s)return;
  const tituloEl=document.getElementById('modal-serv-titulo'),contEl=document.getElementById('modal-serv-contenido');if(!tituloEl||!contEl)return;
  tituloEl.textContent=s.nombre;
  contEl.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.65rem;margin-bottom:1rem;"><div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;"><div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">PRECIO BASE</div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;color:var(--accent);">${s.precio_base?fmt(s.precio_base,2)+' €':'—'}</div></div><div style="background:var(--bg-input);border-radius:0.4rem;padding:0.75rem;"><div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.2rem;">DURACIÓN EST.</div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;">${s.duracion_horas?s.duracion_horas+'h':'—'}</div></div></div>${s.descripcion?`<div style="margin-bottom:0.75rem;"><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">Descripción</div><div style="font-size:0.85rem;color:var(--text-secondary);">${s.descripcion}</div></div>`:''}${s.incluye?`<div style="margin-bottom:1rem;"><div style="font-size:0.72rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.35rem;">¿Qué incluye?</div><div style="background:var(--accent-dim);border:1px solid rgba(59,130,246,0.2);border-radius:0.4rem;padding:0.85rem;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${s.incluye}</div></div>`:''}<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;"><button class="btn-secondary" onclick="cerrarModal('modal-servicio')">Cerrar</button><button class="btn-danger" onclick="eliminarServicio('${s.id}')">Eliminar</button></div>`;
  abrirModal('modal-servicio');
}
async function crearServicio() {
  const nombre=document.getElementById('serv-nombre')?.value.trim();if(!nombre){showToast('El nombre es obligatorio','error');return;}
  const precio=parseFloat(document.getElementById('serv-precio')?.value)||null;
  const duracion=parseFloat(document.getElementById('serv-duracion')?.value)||null;
  const activo=document.getElementById('serv-activo')?.value==='true';
  const descripcion=document.getElementById('serv-descripcion')?.value.trim();
  const incluye=document.getElementById('serv-incluye')?.value.trim();
  const btn=document.querySelector('[onclick="crearServicio()"]');if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';}
  const{error}=await db.from('servicios').insert([{nombre,precio_base:precio,duracion_horas:duracion,activo,descripcion:descripcion||null,incluye:incluye||null}]);
  if(btn){btn.disabled=false;btn.textContent='Guardar Servicio';}
  if(error){showToast('Error al guardar servicio','error');return;}
  ['serv-nombre','serv-precio','serv-duracion','serv-descripcion','serv-incluye'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const saEl=document.getElementById('serv-activo');if(saEl)saEl.value='true';
  showToast('✓ Servicio creado');serviciosCache=[];cargarServicios();
  switchTabDirect('servicios','lista');
  document.querySelectorAll('#mod-servicios .tab-btn')[0]?.classList.add('active');
  document.querySelectorAll('#mod-servicios .tab-btn')[1]?.classList.remove('active');
}
async function eliminarServicio(id) {
  if(!confirm('¿Eliminar este servicio?'))return;
  await db.from('servicios').delete().eq('id',id);
  cerrarModal('modal-servicio');showToast('✓ Servicio eliminado');serviciosCache=[];cargarServicios();
}

// ═══════════════════════════════════════════════════════════
//  CALENDARIO
// ═══════════════════════════════════════════════════════════
let calMesActual=new Date().getMonth(),calAnoActual=new Date().getFullYear(),diaSeleccionado=null;
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ESTADO_CITA={pendiente:{color:'#f59e0b',label:'Pendiente'},confirmada:{color:'#22c55e',label:'Confirmada'},completada:{color:'#6b7280',label:'Completada'},cancelada:{color:'#ef4444',label:'Cancelada'}};

async function iniciarCalendario() {
  const hoy=new Date().toISOString().split('T')[0];
  const fc=document.getElementById('cita-fecha');if(fc&&!fc.value)fc.value=hoy;
  await cargarCitas();renderCalendario();
}
async function cargarCitas() {
  const{data,error}=await db.from('citas').select('*').order('fecha',{ascending:true}).order('hora',{ascending:true});
  if(!error)citasCache=data||[];renderListaCitas(citasCache);
}
function cambiarMes(dir) {
  calMesActual+=dir;if(calMesActual>11){calMesActual=0;calAnoActual++;}if(calMesActual<0){calMesActual=11;calAnoActual--;}
  diaSeleccionado=null;const det=document.getElementById('cal-dia-detalle');if(det)det.style.display='none';renderCalendario();
}
function renderCalendario() {
  const tituloEl=document.getElementById('cal-mes-titulo');if(tituloEl)tituloEl.textContent=`${MESES[calMesActual]} ${calAnoActual}`;
  const grid=document.getElementById('cal-grid');if(!grid)return;
  const primerDia=new Date(calAnoActual,calMesActual,1),ultimoDia=new Date(calAnoActual,calMesActual+1,0).getDate();
  let offset=primerDia.getDay()-1;if(offset<0)offset=6;
  const hoy=new Date(),esHoy=(d)=>d===hoy.getDate()&&calMesActual===hoy.getMonth()&&calAnoActual===hoy.getFullYear();
  const citasPorDia={};citasCache.forEach(c=>{if(!c.fecha)return;const[y,m,d]=c.fecha.split('-').map(Number);if(y===calAnoActual&&m-1===calMesActual){if(!citasPorDia[d])citasPorDia[d]=[];citasPorDia[d].push(c);}});
  let html='';for(let i=0;i<offset;i++)html+=`<div style="min-height:44px;"></div>`;
  for(let d=1;d<=ultimoDia;d++){
    const citas=citasPorDia[d]||[],activo=diaSeleccionado===d,today=esHoy(d);
    const dots=citas.slice(0,3).map(c=>`<div style="width:5px;height:5px;border-radius:50%;background:${ESTADO_CITA[c.estado]?.color||'var(--accent)'};flex-shrink:0;"></div>`).join('');
    html+=`<div onclick="seleccionarDia(${d})" style="min-height:44px;border-radius:0.4rem;padding:0.35rem 0.25rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;background:${activo?'var(--accent)':today?'rgba(59,130,246,0.12)':'var(--bg-input)'};border:1px solid ${activo?'var(--accent)':today?'rgba(59,130,246,0.4)':'transparent'};transition:all 0.15s;"><span style="font-size:0.82rem;font-weight:${today||activo?'700':'400'};color:${activo?'#fff':today?'var(--accent)':'var(--text-primary)'};">${d}</span><div style="display:flex;gap:2px;flex-wrap:wrap;justify-content:center;">${dots}</div></div>`;
  }
  grid.innerHTML=html;
}
function seleccionarDia(dia) {
  diaSeleccionado=dia;renderCalendario();
  const fecha=`${calAnoActual}-${String(calMesActual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
  const citas=citasCache.filter(c=>c.fecha===fecha);
  const detalle=document.getElementById('cal-dia-detalle'),titulo=document.getElementById('cal-dia-titulo'),cont=document.getElementById('cal-dia-citas');
  if(!detalle||!titulo||!cont)return;
  titulo.textContent=`${dia} DE ${MESES[calMesActual].toUpperCase()}`;
  if(!citas.length){cont.innerHTML=`<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Sin citas este día.</div><button class="btn-secondary" style="margin-top:0.5rem;font-size:0.82rem;" onclick="prepararNuevaCitaDia('${fecha}')">+ Añadir cita</button>`;}
  else{cont.innerHTML=citas.map(c=>{const ec=ESTADO_CITA[c.estado]||ESTADO_CITA.pendiente;return `<div style="display:flex;gap:0.75rem;align-items:flex-start;padding:0.65rem 0;border-bottom:1px solid var(--border);"><div style="width:3px;border-radius:2px;background:${ec.color};align-self:stretch;flex-shrink:0;"></div><div style="flex:1;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:700;">${c.hora?c.hora.slice(0,5)+' · ':''}${c.matricula||'—'}</span><span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:99px;background:${ec.color}22;color:${ec.color};">${ec.label}</span></div><div style="font-size:0.82rem;color:var(--text-secondary);">${c.cliente_nombre||'—'}</div><div style="font-size:0.78rem;color:var(--text-muted);">${c.servicio||'—'}</div>${c.notas?`<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;">${c.notas}</div>`:''}</div><button onclick="eliminarCita('${c.id}')" class="btn-remove">✕</button></div>`;}).join('');
  cont.innerHTML+=`<button class="btn-secondary" style="margin-top:0.75rem;font-size:0.82rem;width:100%;" onclick="prepararNuevaCitaDia('${fecha}')">+ Añadir otra cita</button>`;}
  detalle.style.display='block';detalle.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function prepararNuevaCitaDia(fecha) {
  const btns=document.querySelectorAll('#mod-calendario .tab-btn');
  document.querySelectorAll('#mod-calendario .tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#mod-calendario .tab-panel').forEach(p=>p.classList.remove('active'));
  btns[2]?.classList.add('active');document.getElementById('tab-calendario-nueva')?.classList.add('active');
  const fechaEl=document.getElementById('cita-fecha');if(fechaEl)fechaEl.value=fecha;
}
function renderListaCitas(citas) {
  const loading=document.getElementById('citas-loading'),container=document.getElementById('citas-lista-container'),empty=document.getElementById('citas-empty');
  if(loading)loading.style.display='none';if(!container)return;
  const hoy=new Date().toISOString().split('T')[0];
  const proximas=citas.filter(c=>c.fecha>=hoy&&c.estado!=='cancelada'&&c.estado!=='completada');
  const pasadas=citas.filter(c=>c.fecha<hoy||c.estado==='completada'||c.estado==='cancelada');
  if(!citas.length){if(empty)empty.style.display='block';container.innerHTML='';return;}
  if(empty)empty.style.display='none';
  const renderGrupo=(lista,titulo)=>{if(!lista.length)return'';return`<div style="font-family:'Barlow Condensed',sans-serif;font-size:0.85rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin:1rem 0 0.5rem;">${titulo}</div>${lista.map(c=>{const ec=ESTADO_CITA[c.estado]||ESTADO_CITA.pendiente;return`<div class="compra-card" style="position:relative;"><div style="position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0.6rem 0 0 0.6rem;background:${ec.color};"></div><div style="padding-left:0.5rem;"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;">${formatFecha(c.fecha)} ${c.hora?'· '+c.hora.slice(0,5):''}</div><div style="font-size:0.9rem;font-weight:600;">${c.matricula||'—'} · ${c.cliente_nombre||'—'}</div><div style="font-size:0.8rem;color:var(--text-muted);">${c.servicio||'—'}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem;"><span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:99px;background:${ec.color}22;color:${ec.color};">${ec.label}</span><button onclick="eliminarCita('${c.id}')" style="font-size:0.72rem;background:transparent;border:1px solid var(--border);border-radius:0.3rem;padding:0.2rem 0.5rem;color:var(--text-muted);cursor:pointer;">Eliminar</button></div></div></div></div>`;}).join('')}`;};
  container.innerHTML=renderGrupo(proximas,'📅 Próximas')+renderGrupo(pasadas,'✓ Pasadas / Completadas');
}
async function crearCita() {
  const fecha=document.getElementById('cita-fecha')?.value,hora=document.getElementById('cita-hora')?.value;
  const matricula=document.getElementById('cita-matricula')?.value.trim().toUpperCase(),cliente=document.getElementById('cita-cliente')?.value.trim();
  const servicio=document.getElementById('cita-servicio')?.value,estado=document.getElementById('cita-estado')?.value||'pendiente';
  const notas=document.getElementById('cita-notas')?.value.trim();
  if(!fecha){showToast('Indica la fecha','error');return;}
  if(!cliente&&!matricula){showToast('Indica al menos cliente o matrícula','error');return;}
  const btn=document.querySelector('[onclick="crearCita()"]');if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';}
  const{error}=await db.from('citas').insert([{fecha,hora:hora||null,matricula:matricula||null,cliente_nombre:cliente||null,servicio:servicio||null,estado,notas:notas||null}]);
  if(btn){btn.disabled=false;btn.textContent='Guardar Cita';}
  if(error){showToast('Error al guardar la cita','error');return;}
  ['cita-matricula','cita-cliente','cita-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const csEl=document.getElementById('cita-servicio');if(csEl)csEl.value='';
  const ceEl=document.getElementById('cita-estado');if(ceEl)ceEl.value='pendiente';
  showToast('✓ Cita guardada');await cargarCitas();renderCalendario();
  const btns=document.querySelectorAll('#mod-calendario .tab-btn');
  document.querySelectorAll('#mod-calendario .tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#mod-calendario .tab-panel').forEach(p=>p.classList.remove('active'));
  btns[0]?.classList.add('active');document.getElementById('tab-calendario-mes')?.classList.add('active');
}
async function eliminarCita(id) {
  if(!confirm('¿Eliminar esta cita?'))return;
  await db.from('citas').delete().eq('id',id);showToast('✓ Cita eliminada');
  await cargarCitas();renderCalendario();
  const det=document.getElementById('cal-dia-detalle');if(det)det.style.display='none';diaSeleccionado=null;
}

// ═══════════════════════════════════════════════════════════
//  HISTÓRICO / BÚSQUEDA
// ═══════════════════════════════════════════════════════════
function resetHistorico() {
  const bi=document.getElementById('busqueda-input');if(bi)bi.value='';
  const hr=document.getElementById('historico-resultado');if(hr)hr.style.display='none';
  const he=document.getElementById('historico-empty');if(he)he.style.display='none';
  const hi=document.getElementById('historico-inicial');if(hi)hi.style.display='block';
}
async function buscarHistorico() {
  const q=document.getElementById('busqueda-input')?.value.trim().toUpperCase();if(!q)return;
  const hi=document.getElementById('historico-inicial');if(hi)hi.style.display='none';
  const he=document.getElementById('historico-empty');if(he)he.style.display='none';
  const hr=document.getElementById('historico-resultado');if(hr)hr.style.display='none';
  const{data,error}=await db.from('intervenciones').select('*').or(`matricula.ilike.%${q}%,cliente_nombre.ilike.%${q}%`).order('created_at',{ascending:false});
  if(error||!data||!data.length){if(he)he.style.display='block';return;}
  const totalFacturado=data.reduce((s,i)=>s+(i.precio_cobrado||0),0);
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('hist-visitas',data.length);set('hist-facturado',`${fmt(totalFacturado,2)} €`);
  set('hist-ultimo',data[0]?new Date(data[0].created_at).toLocaleDateString('es-ES'):'—');
  const lista=document.getElementById('historico-lista');
  if(lista)lista.innerHTML=data.map(inv=>{
    const productos=inv.productos_usados||[],costeMat=productos.reduce((s,p)=>s+(p.coste||0),0);
    return `<div class="compra-card" style="margin-bottom:0.75rem;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;"><div><div style="font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:800;">${inv.matricula} · ${inv.cliente_nombre}</div><div style="font-size:0.8rem;color:var(--text-muted);">${new Date(inv.created_at).toLocaleDateString('es-ES')} · ${inv.nombre_servicio||'—'}</div></div><div style="text-align:right;">${estadoBadge(inv.estado)}${inv.precio_cobrado?`<div style="font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:800;color:var(--accent);margin-top:0.2rem;">${fmt(inv.precio_cobrado,2)} €</div>`:''}</div></div>${productos.length>0?`<div style="border-top:1px solid var(--border);padding-top:0.5rem;">${productos.map(p=>`<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:0.2rem 0;color:var(--text-secondary);"><span>🧴 ${p.nombre_comercial||p.nombre}</span><span>${p.ml_usados} ml</span></div>`).join('')}<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:0.3rem 0;color:var(--text-muted);border-top:1px solid var(--border);margin-top:0.25rem;"><span>Coste materiales</span><span>${fmt(costeMat,2)} €</span></div></div>`:''} ${inv.incidentes?`<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--text-muted);background:var(--bg-input);border-radius:0.35rem;padding:0.5rem;">📝 ${inv.incidentes}</div>`:''}</div>`;
  }).join('');
  window._historicoData={q,data,totalFacturado};if(hr)hr.style.display='block';
}
async function generarPDFHistorico() {
  const{q,data,totalFacturado}=window._historicoData||{};if(!data||!data.length)return;
  const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  const azul=[59,130,246],gris=[30,30,30],blanco=[240,240,240],grisClaro=[180,180,180],negro=[20,20,20];
  doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');
  doc.setFillColor(...negro);doc.rect(0,0,210,32,'F');doc.setFillColor(...azul);doc.rect(0,0,5,32,'F');
  doc.setTextColor(...blanco);doc.setFontSize(20);doc.setFont('helvetica','bold');doc.text('HISTORIAL DE VEHÍCULO',12,13);
  doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);
  doc.text(`Búsqueda: ${q}  ·  Generado: ${new Date().toLocaleDateString('es-ES')}`,12,22);
  doc.text(`${data.length} intervención(es)  ·  Total: ${fmt(totalFacturado,2)} €`,12,28);
  let y=42;
  data.forEach(inv=>{
    const productos=inv.productos_usados||[],costeMat=productos.reduce((s,p)=>s+(p.coste||0),0);
    if(y>250){doc.addPage();doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');y=20;}
    doc.setFillColor(40,40,40);doc.roundedRect(10,y-5,190,12,2,2,'F');doc.setFillColor(...azul);doc.rect(10,y-5,3,12,'F');
    doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(...blanco);doc.text(`${inv.matricula}  ·  ${inv.cliente_nombre}`,16,y+2);
    doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(`${new Date(inv.created_at).toLocaleDateString('es-ES')}  ·  ${inv.nombre_servicio||'—'}  ·  ${inv.estado?.toUpperCase()}`,16,y+7);
    if(inv.precio_cobrado){doc.setTextColor(...azul);doc.setFont('helvetica','bold');doc.text(`${fmt(inv.precio_cobrado,2)} €`,195,y+2,{align:'right'});}
    y+=16;
    productos.forEach(p=>{if(y>270){doc.addPage();doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');y=20;}doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...grisClaro);doc.text(`  ✓ ${p.nombre_comercial||p.nombre}`,15,y);doc.text(`${p.ml_usados} ml`,195,y,{align:'right'});y+=5;});
    if(inv.incidentes){if(y>265){doc.addPage();doc.setFillColor(...gris);doc.rect(0,0,210,297,'F');y=20;}const lines=doc.splitTextToSize(`  📝 ${inv.incidentes}`,175);doc.setFontSize(8);doc.setTextColor(...[120,120,120]);doc.text(lines,15,y);y+=lines.length*4+2;}
    doc.setDrawColor(50,50,50);doc.setLineWidth(0.3);doc.line(10,y,200,y);y+=6;
  });
  doc.setFillColor(...negro);doc.rect(0,283,210,14,'F');doc.setFillColor(...azul);doc.rect(0,283,5,14,'F');
  doc.setTextColor(...grisClaro);doc.setFontSize(8);doc.text('BL Detail Center — Historial de Vehículo',12,292);
  doc.save(`historial_${q.replace(/\s/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);showToast('✓ PDF historial generado');
}

// ═══════════════════════════════════════════════════════════
//  GRÁFICA DE INGRESOS — ÚLTIMOS 6 MESES
// ═══════════════════════════════════════════════════════════
let graficaInstance = null;

async function cargarGrafica() {
  const loading = document.getElementById('dash-grafica-loading');
  const canvas  = document.getElementById('dash-grafica');
  if (!canvas) return;

  // Calcular últimos 6 meses
  const meses = [];
  const ahora = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({
      label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      inicio: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      fin:    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
    });
  }

  // Query todas las intervenciones de los últimos 6 meses
  const { data, error } = await db
    .from('intervenciones')
    .select('precio_cobrado, created_at')
    .gte('created_at', meses[0].inicio)
    .not('precio_cobrado', 'is', null);

  if (loading) loading.style.display = 'none';
  if (error || !data) return;

  // Agrupar por mes
  const ingresosPorMes = meses.map(mes => {
    const total = data
      .filter(i => i.created_at >= mes.inicio && i.created_at <= mes.fin)
      .reduce((s, i) => s + (i.precio_cobrado || 0), 0);
    return total;
  });

  canvas.style.display = 'block';

  // Destruir gráfica anterior si existe
  if (graficaInstance) { graficaInstance.destroy(); graficaInstance = null; }

  const ctx = canvas.getContext('2d');
  graficaInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses.map(m => m.label),
      datasets: [{
        label: 'Ingresos (€)',
        data: ingresosPorMes,
        backgroundColor: 'rgba(59,130,246,0.25)',
        borderColor: 'rgba(59,130,246,0.9)',
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y.toFixed(2)} €`
          },
          backgroundColor: '#13181f',
          borderColor: '#1e2d45',
          borderWidth: 1,
          titleColor: '#e8eef5',
          bodyColor: '#3b82f6',
          padding: 10,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#7a8fa8', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#7a8fa8', font: { size: 11 },
            callback: val => `${val} €`
          },
          beginAtZero: true
        }
      }
    }
  });
}
