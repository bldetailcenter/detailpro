// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js (VERSIÓN INTEGRAL CORREGIDA)
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let productosCache = [];
let lineaCount = 0;
let productoUsadoCount = 0;
let intervencionEditando = null;
let productosEditandoStock = [];
let serviciosCache = [];
let serviciosSeleccionados = [];

// ═══════════════════════════════════════════════════════════
//  UTILIDADES BÁSICAS (Evitan errores de carga)
// ═══════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `show ${type}`;
    setTimeout(() => { t.className = ''; }, 3500);
}

function fmt(num, dec = 2) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toFixed(dec);
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

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

async function getDataUrl(url) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise(r => { 
            const f = new FileReader(); 
            f.onloadend = () => r(f.result); 
            f.readAsDataURL(blob); 
        });
    } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════
//  NAVEGACIÓN Y MODALES
// ═══════════════════════════════════════════════════════════
function switchModule(mod) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById(`mod-${mod}`);
    const nav = document.getElementById(`nav-${mod}`);
    if(target) target.classList.add('active');
    if(nav) nav.classList.add('active');
    
    if (mod === 'operaciones') { cargarIntervenciones(); cargarSelectorServicios(); }
    if (mod === 'dashboard')   cargarDashboard();
    if (mod === 'servicios')   cargarServicios();
    if (mod === 'calidad')     cargarCalidad();
}

function switchTab(modulo, tab) {
    document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
    const t = document.getElementById(`tab-${modulo}-${tab}`);
    if(t) t.classList.add('active');
    if(event && event.target) event.target.classList.add('active');
}

function switchTabDirect(modulo, tab) {
    document.querySelectorAll(`#mod-${modulo} .tab-btn`).forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`#mod-${modulo} .tab-panel`).forEach(p => p.classList.remove('active'));
    const t = document.getElementById(`tab-${modulo}-${tab}`);
    if(t) t.classList.add('active');
    const btns = document.querySelectorAll(`#mod-${modulo} .tab-btn`);
    if (tab === 'lista' && btns[0]) btns[0].classList.add('active');
    if (tab === 'nueva' && btns[1]) btns[1].classList.add('active');
}

function abrirModal(id) { 
    const m = document.getElementById(id);
    if(m) m.classList.add('open'); 
}
function cerrarModal(id) { 
    const m = document.getElementById(id);
    if(m) m.classList.remove('open'); 
}

// ═══════════════════════════════════════════════════════════
//  AUTENTICACIÓN (handleLogin)
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    db.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) { currentUser = session.user; showApp(); }
    });
});

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');

    if(!email || !pass) { showToast('Rellena los campos', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = 'Entrando...';

    const { data, error } = await db.auth.signInWithPassword({ email, password: pass });

    if (error) {
        showToast('Credenciales incorrectas', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Entrar al sistema';
        return;
    }

    currentUser = data.user;
    showApp();
}

async function handleLogout() {
    await db.auth.signOut();
    location.reload();
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('user-email-display').textContent = currentUser?.email || '';
    cargarProductos();
    cargarDashboard();
}

// ═══════════════════════════════════════════════════════════
//  ALMACÉN
// ═══════════════════════════════════════════════════════════
async function cargarProductos() {
    const { data, error } = await db.from('productos').select('*').order('nombre_comercial');
    if (error) return;
    productosCache = data || [];
    const tbody = document.getElementById('productos-tbody');
    if (tbody) {
        tbody.innerHTML = productosCache.map(p => {
            const s = stockStatus(p.stock_actual, p.formato_ml);
            return `<tr onclick="verProducto('${p.id}')" style="cursor:pointer">
                <td><b>${p.nombre_comercial}</b><br><small>${p.nombre_interno}</small></td>
                <td>${p.categoria}</td>
                <td style="color:${s.color}">${fmt(p.stock_actual, 0)} ml</td>
                <td>${s.icon} ${s.label}</td>
                <td>${fmt(p.precio_medio_litro, 2)}€</td>
                <td>${fmt(p.precio_por_dosis, 2)}€</td>
            </tr>`;
        }).join('');
    }
}

function stockStatus(stock, form) {
    if (stock <= 0) return { color: '#ef4444', icon: '🔴', label: 'Agotado' };
    if (stock < form * 0.2) return { color: '#f59e0b', icon: '🟡', label: 'Bajo' };
    return { color: '#22c55e', icon: '🟢', label: 'OK' };
}

function verProducto(id) {
    const p = productosCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-prod-titulo').textContent = p.nombre_comercial;
    document.getElementById('modal-prod-contenido').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div class="card" style="padding:1rem; background:var(--bg-input)">Stock: ${fmt(p.stock_actual, 0)} ml</div>
            <div class="card" style="padding:1rem; background:var(--bg-input)">Precio/Dosis: ${fmt(p.precio_por_dosis, 2)}€</div>
        </div><br>
        <p><b>Notas:</b> ${p.observaciones || 'Sin notas adicionales.'}</p>`;
    abrirModal('modal-producto');
}

// ═══════════════════════════════════════════════════════════
//  OPERACIONES (Edición y Fotos)
// ═══════════════════════════════════════════════════════════
function addProductoUsado() {
    productoUsadoCount++;
    const options = productosCache.map(p => `<option value="${p.id}">${p.nombre_comercial}</option>`).join('');
    const div = document.createElement('div');
    div.className = 'producto-usado-row';
    div.id = `pu-${productoUsadoCount}`;
    div.innerHTML = `
        <select class="pu-producto" style="flex:1"><option value="">Seleccionar...</option>${options}</select>
        <input type="number" class="pu-ml" placeholder="ml" style="width:80px"/>
        <button class="btn-remove" onclick="document.getElementById('pu-${productoUsadoCount}').remove()">✕</button>`;
    document.getElementById('productos-usados-container').appendChild(div);
}

function limpiarFormularioIntervencion() {
    ['int-matricula','int-cliente','int-horas','int-precio','int-incidentes'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    document.getElementById('productos-usados-container').innerHTML = '';
    resetMapaDanos();
    intervencionEditando = null;
    const btn = document.querySelector('[onclick="crearIntervencion()"]');
    if(btn) { btn.textContent = 'Guardar Intervención'; btn.style.background = 'var(--accent)'; }
}

async function crearIntervencion() {
    const mat = document.getElementById('int-matricula').value.trim().toUpperCase();
    const cli = document.getElementById('int-cliente').value.trim();
    const hor = parseFloat(document.getElementById('int-horas').value) || 0;
    const pre = parseFloat(document.getElementById('int-precio').value) || 0;
    const est = document.getElementById('int-estado').value;
    const inc = document.getElementById('int-incidentes').value;

    if (!mat || !cli) { showToast('Matrícula y cliente requeridos', 'error'); return; }

    const productosUsados = [];
    document.querySelectorAll('.producto-usado-row').forEach(row => {
        const pid = row.querySelector('.pu-producto').value;
        const ml = parseFloat(row.querySelector('.pu-ml').value);
        if (pid && ml) {
            const prod = productosCache.find(x => x.id === pid);
            productosUsados.push({ 
                id: pid, 
                nombre_comercial: prod.nombre_comercial, 
                ml_usados: ml, 
                coste: (prod.precio_por_dosis * (ml / prod.dosis_estandar_ml)) 
            });
        }
    });

    const mapa = damagePoints.map(d => ({ id: d.id, x: d.x, y: d.y, tipo: d.tipo, label: d.label }));

    if (intervencionEditando) {
        // Devolver stock viejo
        for (const old of productosEditandoStock) {
            const p = productosCache.find(x => x.id === old.id);
            if (p) await db.from('productos').update({ stock_actual: p.stock_actual + old.ml_usados }).eq('id', p.id);
        }
        await db.from('intervenciones').update({ matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre, estado: est, incidentes: inc, productos_usados: productosUsados, mapa_danos: mapa }).eq('id', intervencionEditando);
    } else {
        await db.from('intervenciones').insert([{ matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre, estado: est, incidentes: inc, productos_usados: productosUsados, mapa_danos: mapa }]);
    }

    // Descontar nuevo stock
    for (const pu of productosUsados) {
        const p = productosCache.find(x => x.id === pu.id);
        if (p) await db.from('productos').update({ stock_actual: Math.max(0, p.stock_actual - pu.ml_usados) }).eq('id', p.id);
    }

    showToast('✓ Intervención guardada');
    limpiarFormularioIntervencion();
    cargarIntervenciones();
    cargarProductos();
    switchTabDirect('operaciones', 'lista');
}

async function cargarIntervenciones() {
    const { data } = await db.from('intervenciones').select('*').order('created_at', { ascending: false });
    const cont = document.getElementById('intervenciones-container');
    if (!data || !cont) return;
    cont.innerHTML = data.map(i => `
        <div class="intervencion-card" onclick="verIntervencion('${i.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center">
                <b>${i.matricula}</b>
                ${estadoBadge(i.estado)}
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary)">${i.cliente_nombre}</div>
        </div>`).join('');
}

async function verIntervencion(id) {
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    if (!i) return;
    document.getElementById('modal-int-titulo').innerHTML = `${i.matricula} — ${i.cliente_nombre}`;
    document.getElementById('modal-int-contenido').innerHTML = `
        <div style="display:grid; gap:1rem">
            ${estadoBadge(i.estado)}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem">
                <div class="card" style="text-align:center; padding:0.5rem; background:var(--bg-input)">
                    <small>ANTES</small><br>
                    ${i.foto_antes ? `<img src="${i.foto_antes}" style="width:100%; margin-top:0.5rem; border-radius:4px"/>` : `<input type="file" onchange="subirFoto(event,'${i.id}','foto_antes')" style="font-size:0.7rem; width:100%"/>`}
                </div>
                <div class="card" style="text-align:center; padding:0.5rem; background:var(--bg-input)">
                    <small>DESPUÉS</small><br>
                    ${i.foto_despues ? `<img src="${i.foto_despues}" style="width:100%; margin-top:0.5rem; border-radius:4px"/>` : `<input type="file" onchange="subirFoto(event,'${i.id}','foto_despues')" style="font-size:0.7rem; width:100%"/>`}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem">
                <button class="btn-secondary" style="flex:1" onclick="cerrarModal('modal-intervencion')">Cerrar</button>
                <button class="btn-secondary" onclick="prepararEdicion('${i.id}')" style="color:var(--accent)">✏️ Editar</button>
                <button class="btn-secondary" onclick="eliminarIntervencion('${i.id}')" style="color:#ef4444">🗑️</button>
            </div>
        </div>`;
    abrirModal('modal-intervencion');
}

async function prepararEdicion(id) {
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    if(!i) return;
    intervencionEditando = id;
    productosEditandoStock = i.productos_usados || [];
    document.getElementById('int-matricula').value = i.matricula;
    document.getElementById('int-
