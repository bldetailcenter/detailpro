// ═══════════════════════════════════════════════════════════
//  DetailPro — app.js (VERSIÓN TOTAL RESTAURADA)
//  Todo operativo: Almacén, Calendario, Fotos, Edición y PDF
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://cshcvanmccdtdotfsrot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MGjrhOSj2DyrGl9SAdIYw_PF1sLZJf';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let productosCache = [];
let serviciosCache = [];
let lineaCount = 0;
let productoUsadoCount = 0;
let intervencionEditando = null;
let productosEditandoStock = [];
let serviciosSeleccionados = [];

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
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
        return new Promise(r => { const f = new FileReader(); f.onloadend = () => r(f.result); f.readAsDataURL(blob); });
    } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════
//  NAVEGACIÓN
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
    if (mod === 'calendario')  iniciarCalendario();
    if (mod === 'historico')   resetHistorico();
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

function abrirModal(id) { const m = document.getElementById(id); if(m) m.classList.add('open'); }
function cerrarModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('open'); }

// ═══════════════════════════════════════════════════════════
//  AUTENTICACIÓN
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
    if(!email || !pass) return;
    btn.disabled = true;
    const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) { showToast('Error de acceso', 'error'); btn.disabled = false; return; }
    currentUser = data.user;
    showApp();
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
                <td><span class="badge badge-gray">${p.categoria}</span></td>
                <td style="color:${s.color}; font-weight:bold">${fmt(p.stock_actual, 0)} ml</td>
                <td>${s.icon} ${s.label}</td>
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
        <p><b>Notas:</b> ${p.observaciones || 'Sin notas.'}</p>`;
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
        <select class="pu-producto" style="flex:1"><option value="">Producto...</option>${options}</select>
        <input type="number" class="pu-ml" placeholder="ml" style="width:70px"/>
        <button class="btn-remove" onclick="document.getElementById('pu-${productoUsadoCount}').remove()">✕</button>`;
    document.getElementById('productos-usados-container').appendChild(div);
}

function limpiarFormularioIntervencion() {
    ['int-matricula','int-cliente','int-horas','int-precio','int-incidentes'].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = '';
    });
    document.getElementById('productos-usados-container').innerHTML = '';
    resetMapaDanos();
    intervencionEditando = null;
    serviciosSeleccionados = [];
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

    if (!mat || !cli) { showToast('Datos incompletos', 'error'); return; }

    const productosUsados = [];
    document.querySelectorAll('.producto-usado-row').forEach(row => {
        const pid = row.querySelector('.pu-producto').value;
        const ml = parseFloat(row.querySelector('.pu-ml').value);
        if (pid && ml) {
            const prod = productosCache.find(x => x.id === pid);
            productosUsados.push({ id: pid, nombre_comercial: prod.nombre_comercial, ml_usados: ml, coste: (prod.precio_por_dosis * (ml / prod.dosis_estandar_ml)) });
        }
    });

    const mapa = damagePoints.map(d => ({ id: d.id, x: d.x, y: d.y, tipo: d.tipo, label: d.label }));

    if (intervencionEditando) {
        for (const old of productosEditandoStock) {
            const p = productosCache.find(x => x.id === old.id);
            if (p) await db.from('productos').update({ stock_actual: p.stock_actual + old.ml_usados }).eq('id', p.id);
        }
        await db.from('intervenciones').update({ matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre, estado: est, incidentes: inc, productos_usados: productosUsados, mapa_danos: mapa, servicios_ids: serviciosSeleccionados }).eq('id', intervencionEditando);
    } else {
        await db.from('intervenciones').insert([{ matricula: mat, cliente_nombre: cli, horas_reales: hor, precio_cobrado: pre, estado: est, incidentes: inc, productos_usados: productosUsados, mapa_danos: mapa, servicios_ids: serviciosSeleccionados }]);
    }

    for (const pu of productosUsados) {
        const p = productosCache.find(x => x.id === pu.id);
        if (p) await db.from('productos').update({ stock_actual: Math.max(0, p.stock_actual - pu.ml_usados) }).eq('id', p.id);
    }

    showToast('✓ Guardado correctamente');
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
            <div style="display:flex; justify-content:space-between"><b>${i.matricula}</b>${estadoBadge(i.estado)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary)">${i.cliente_nombre}</div>
        </div>`).join('');
}

async function verIntervencion(id) {
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    if (!i) return;
    document.getElementById('modal-int-titulo').innerHTML = i.matricula;
    document.getElementById('modal-int-contenido').innerHTML = `
        <div style="display:grid; gap:0.8rem">
            ${estadoBadge(i.estado)}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem">
                <div class="card" style="text-align:center; padding:0.5rem; background:var(--bg-input)">
                    <small>ANTES</small><br>
                    ${i.foto_antes ? `<img src="${i.foto_antes}" style="width:100%; border-radius:4px"/>` : `<input type="file" onchange="subirFoto(event,'${i.id}','foto_antes')" style="font-size:0.6rem; width:100%"/>`}
                </div>
                <div class="card" style="text-align:center; padding:0.5rem; background:var(--bg-input)">
                    <small>DESPUÉS</small><br>
                    ${i.foto_despues ? `<img src="${i.foto_despues}" style="width:100%; border-radius:4px"/>` : `<input type="file" onchange="subirFoto(event,'${i.id}','foto_despues')" style="font-size:0.6rem; width:100%"/>`}
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

async function subirFoto(e, id, col) {
    const file = e.target.files[0];
    if (!file) return;
    showToast('Subiendo...', 'success');
    const name = `${id}_${col}_${Date.now()}.jpg`;
    await db.storage.from('fotos_vehiculos').upload(name, file, { contentType: file.type });
    const { data: { publicUrl } } = db.storage.from('fotos_vehiculos').getPublicUrl(name);
    await db.from('intervenciones').update({ [col]: publicUrl }).eq('id', id);
    verIntervencion(id);
}

async function prepararEdicion(id) {
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    intervencionEditando = id;
    productosEditandoStock = i.productos_usados || [];
    document.getElementById('int-matricula').value = i.matricula;
    document.getElementById('int-cliente').value = i.cliente_nombre;
    document.getElementById('int-horas').value = i.horas_reales;
    document.getElementById('int-precio').value = i.precio_cobrado;
    document.getElementById('int-estado').value = i.estado;
    document.getElementById('int-incidentes').value = i.incidentes;
    
    // Restaurar productos en el formulario
    document.getElementById('productos-usados-container').innerHTML = '';
    if(i.productos_usados) {
        i.productos_usados.forEach(p => {
            addProductoUsado();
            const row = document.getElementById(`pu-${productoUsadoCount}`);
            row.querySelector('.pu-producto').value = p.id;
            row.querySelector('.pu-ml').value = p.ml_usados;
        });
    }

    const btn = document.querySelector('[onclick="crearIntervencion()"]');
    btn.textContent = '💾 Actualizar'; btn.style.background = '#22c55e';
    cerrarModal('modal-intervencion');
    switchTabDirect('operaciones', 'nueva');
}

async function eliminarIntervencion(id) {
    if (!confirm('¿Borrar intervención?')) return;
    await db.from('intervenciones').delete().eq('id', id);
    cerrarModal('modal-intervencion');
    cargarIntervenciones();
}

// ═══════════════════════════════════════════════════════════
//  CALIDAD Y PDF
// ═══════════════════════════════════════════════════════════
async function cargarCalidad() {
    const { data } = await db.from('intervenciones').select('id, matricula, cliente_nombre').order('created_at', { ascending: false });
    const sel = document.getElementById('calidad-intervencion-sel');
    if (sel && data) sel.innerHTML = '<option value="">Seleccionar...</option>' + data.map(i => `<option value="${i.id}">${i.matricula} - ${i.cliente_nombre}</option>`).join('');
}

async function cargarVistaPrevia() {
    const id = document.getElementById('calidad-intervencion-sel').value;
    if (!id) return;
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    document.getElementById('prev-matricula').textContent = i.matricula;
    document.getElementById('prev-cliente').textContent = i.cliente_nombre;
    document.getElementById('calidad-preview').style.display = 'block';
    document.getElementById('calidad-preview').dataset.invId = id;
}

async function generarPDFCliente() {
    const id = document.getElementById('calidad-preview').dataset.invId;
    const { data: i } = await db.from('intervenciones').select('*').eq('id', id).single();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFillColor(30, 30, 30); doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(255, 255, 255); doc.text('INFORME DE CALIDAD', 15, 20);
    doc.text(`Vehículo: ${i.matricula}`, 15, 40);
    if (i.foto_antes || i.foto_despues) {
        doc.addPage();
        doc.text('REPORTE FOTOGRÁFICO', 15, 20);
        if (i.foto_antes) { const img = await getDataUrl(i.foto_antes); if(img) doc.addImage(img, 'JPEG', 15, 30, 180, 100); }
        if (i.foto_despues) { const img = await getDataUrl(i.foto_despues); if(img) doc.addImage(img, 'JPEG', 15, 140, 180, 100); }
    }
    doc.save(`Reporte_${i.matricula}.pdf`);
}

// ═══════════════════════════════════════════════════════════
//  MAPA DE DAÑOS (SVG 4 VISTAS)
// ═══════════════════════════════════════════════════════════
let damagePoints = []; let damageCounter = 0; let currentDamageType = 'rayazo';
const DAMAGE_COLORS = { rayazo:{fill:'#ef4444',label:'Rayazo'}, abollon:{fill:'#f59e0b',label:'Abollón'}, oxidacion:{fill:'#8b5cf6',label:'Oxidación'}, otro:{fill:'#6b7280',label:'Otro'} };

function selectDamageType(btn) {
    document.querySelectorAll('.damage-type-btn').forEach(b => b.style.opacity = '0.4');
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
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '8');
    c.setAttribute('fill', col.fill); c.setAttribute('id', `dp-${damageCounter}`);
    c.setAttribute('onclick', `removeDamagePoint(${damageCounter}, event)`);
    g.appendChild(c);
    renderDanosList();
}

function removeDamagePoint(id, e) {
    if(e) e.stopPropagation();
    damagePoints = damagePoints.filter(d => d.id !== id);
    const el = document.getElementById(`dp-${id}`); if(el) el.remove();
    renderDanosList();
}

function renderDanosList() {
    const cont = document.getElementById('danos-lista-items');
    if(!cont) return;
    if(!damagePoints.length) { document.getElementById('danos-lista').style.display='none'; return; }
    document.getElementById('danos-lista').style.display='block';
    cont.innerHTML = damagePoints.map(d => `<span class="badge badge-gray">${d.id}. ${d.label}</span>`).join('');
}

function resetMapaDanos() {
    damagePoints = []; damageCounter = 0;
    const gp = document.getElementById('damage-points'); if(gp) gp.innerHTML = '';
    renderDanosList();
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD, SERVICIOS Y CALENDARIO
// ═══════════════════════════════════════════════════════════
async function cargarDashboard() {
    const { data } = await db.from('intervenciones').select('precio_cobrado');
    const total = (data || []).reduce((acc, curr) => acc + (curr.precio_cobrado || 0), 0);
    const el = document.getElementById('dash-ingresos');
    if(el) el.textContent = `${fmt(total, 0)}€`;
}

async function cargarServicios() {
    const { data } = await db.from('servicios').select('*').order('nombre');
    serviciosCache = data || [];
    const cont = document.getElementById('servicios-container');
    if(cont) cont.innerHTML = serviciosCache.map(s => `<div class="card" style="margin-bottom:0.5rem"><b>${s.nombre}</b> - ${fmt(s.precio_base,0)}€</div>`).join('');
}

async function cargarSelectorServicios() {
    if(!serviciosCache.length) { const { data } = await db.from('servicios').select('*').eq('activo', true); serviciosCache = data || []; }
    const cont = document.getElementById('int-servicios-selector');
    if(cont) cont.innerHTML = serviciosCache.map(s => `<button onclick="toggleServicio('${s.id}')" id="serv-btn-${s.id}" class="btn-secondary" style="font-size:0.7rem; margin:2px">${s.nombre}</button>`).join('');
}

function toggleServicio(id) {
    const idx = serviciosSeleccionados.indexOf(id);
    const btn = document.getElementById(`serv-btn-${id}`);
    if(idx === -1) { serviciosSeleccionados.push(id); if(btn) btn.style.background = 'var(--accent)'; } 
    else { serviciosSeleccionados.splice(idx, 1); if(btn) btn.style.background = 'transparent'; }
}

async function iniciarCalendario() {
    const { data } = await db.from('citas').select('*').order('fecha');
    const cont = document.getElementById('citas-lista-container');
    if(cont && data) cont.innerHTML = data.map(c => `<div class="card" style="margin-bottom:0.5rem">${formatFecha(c.fecha)}: ${c.cliente_nombre}</div>`).join('');
}

function resetHistorico() {
    document.getElementById('historico-lista').innerHTML = '';
}
