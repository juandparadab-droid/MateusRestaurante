// ============================================================
// RESTAURANTE MATEUS — PANEL DE MESERO
// menu.js · Versión 7.7
//
// CAMBIOS v7.7 — PEDIDO POR PLATO (#5):
//  El almuerzo ahora se arma POR PLATO. Cada toque de una proteína
//  crea un plato independiente (3 pechugas = 3 platos). En la pantalla
//  de revisión, cada plato elige su PRINCIPIO (de los productos tipo
//  'side'), su NOTA y si va "para llevar". Los principios ya no se
//  muestran sueltos en el menú. Las bebidas, postres, a la carta y
//  menú ejecutivo siguen agregándose como ítems sueltos.
//  Cada plato se guarda como UNA línea de order_items: la proteína
//  (con precio), con el principio dentro del nombre y la nota del
//  plato en la nota del ítem → cocina lo ve junto ("Pechuga · Frijol —
//  sin ensalada"). El recargo de desechable aplica por plato para llevar.
//  Nuevo estado State.platos y controlador Platos.
//
// CAMBIOS v7.6:
//  [CAMBIO-10] Código secuencial diario LLV-### para pedidos PARA
//    LLEVAR / DOMICILIO (reinicia cada día). Los pedidos en mesa
//    conservan su número aleatorio. Ver _generarNumeroOrden().
//  [CAMBIO-11] Recargo de $1.000 por desechable a cada almuerzo
//    (proteína / menú ejecutivo) que va para llevar. Se carga dentro
//    del unit_price del ítem para que el total cuadre y se conserve
//    al editar. Se muestra como línea aparte en el resumen del pedido.
//    NOTA: lógica preparada para marcar ítems sueltos (#12) más adelante.
//
// CAMBIOS v7.5:
//  [CAMBIO-1] Al enviar un pedido se reinicia TODO el formulario
//    (mesa, nombre del cliente, notas, dirección) y la modalidad
//    vuelve a "mesa". Antes el número de mesa y el nombre quedaban
//    pegados del pedido anterior. Nuevo helper _resetFormularioPedido()
//    llamado desde Order._mostrarExito() y Order.nuevoPedido().
//    NO afecta la sesión del mesero.
//
// CAMBIOS v7.4.2 (patches aplicados sobre v7.4.1):
//  [FIX-PORCIONES-CRITICO]
//    Order.enviar(): el descuento de porciones ya NO depende
//    exclusivamente de MateusCore. Se agrega _descontarPorciones()
//    como función directa sobre Supabase (usando `db`) que se
//    ejecuta SIEMPRE después de insertar los order_items.
//    MateusCore sigue llamándose en paralelo si está disponible,
//    pero nunca es el único camino. Esto resuelve el escenario
//    donde menu.html no carga mateus-core.js.
//
//  [FIX-PORCIONES-FILTRO]
//    _descontarPorciones(): filtra correctamente por menuItemId
//    no-null Y disponibilidad del slot (porciones < 999).
//    Solo descuenta ítems que tienen control real de porciones
//    (portions_today != null en la BD). Usa UPDATE con
//    decrement seguro: portions_today - cantidad, con mínimo 0
//    via GREATEST(portions_today - cantidad, 0).
//
//  [FIX-PORCIONES-OPTIMISTIC]
//    Después del descuento en BD, actualiza State.slots en
//    memoria para que la UI refleje el nuevo stock sin esperar
//    el ciclo de realtime.
//
// CAMBIOS v7.4.1 (patches aplicados sobre v7.4):
//  [PATCH-1] Order.enviar(): llama MateusCore.descontarPorcionesOrden
//            y MateusCore.ajustarInventarioPorItems después de insertar
//            los order_items. Silencioso si MateusCore no está disponible.
//
//  [PATCH-2] init(): se suscribe a MateusCore.on('onMenuItemChange')
//            y MateusCore.on('onOrderChange') para actualizaciones
//            en tiempo real sin recargar todo el menú.
//
//  [PATCH-3] EditarPedido.guardar(): delega a MateusCore.guardarEdicionAdmin
//            para control de inventario consistente con admin.
//            Incluye _guardarLegacy() como fallback sin MateusCore.
//
// CAMBIOS v7.4:
//  [ADD-SESION]      Sesión de mesero por nombre (sessionStorage).
//  [ADD-MEDIANOCHE]  Reset automático del historial a las 00:00.
//  [DEL-VENTA]       Stats row solo muestra Total, Pendientes, Entregados.
//  [ADD-EDITAR]      Módulo EditarPedido completo.
//
// CAMBIOS v7.3:
//  [ADD-HISTORIAL] Módulo Hist integrado directamente en este archivo.
//
// CAMBIOS v7.2:
//  [ADD-DIRECCION] Campo de dirección en pedidos a domicilio.
//
// CAMBIOS v7.1:
//  [FIX-MESA] _resolverTableId sin fallback a Mesa 1.
// ============================================================

'use strict';

// ============================================================
// CREDENCIALES SUPABASE
// ============================================================
const SUPABASE_URL      = "https://guqgyuefsdedstfbhxvo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zSGT_1Qr1QVI3aTPWOMwdQ_jqMqxnA-";
const RESTAURANT_SLUG   = "restaurante-mateus";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// CATEGORÍAS DE MENÚ
// ============================================================
const CATEGORIAS = {
    protein:        { label: 'Proteína con Salsa', icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M18 6c0-2.2-2.7-4-6-4S6 3.8 6 6c0 1.7 1 3.1 2.4 3.8L6 22h12l-2.4-12.2C16.9 9.1 18 7.7 18 6z"/></svg>', orden: 1 },
    side:           { label: 'Principio',          icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M12 2a10 10 0 0 1 10 10H2A10 10 0 0 1 12 2z"/><path d="M6 22h12"/><path d="M12 12v10"/></svg>', orden: 2 },
    drink:          { label: 'Bebida',             icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M8 2h8l1 10H7L8 2z"/><path d="M7 12c0 5 2 8 5 8s5-3 5-8"/></svg>', orden: 3 },
    a_la_carte:     { label: 'A la Carta',         icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', orden: 4 },
    executive_lunch:{ label: 'Menú Ejecutivo',     icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>', orden: 5 },
    dessert:        { label: 'Postre',             icono: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M6 2h12l2 6H4L6 2z"/><path d="M4 8c0 8 2 12 8 12s8-4 8-12"/></svg>', orden: 6 },
};

const ITEM_TYPES_VALIDOS = ['executive_lunch','a_la_carte','drink','dessert','side'];

// ============================================================
// [v7.6 · CAMBIO-11] RECARGO POR DESECHABLE (pedidos para llevar)
// ------------------------------------------------------------
// $1.000 por cada ALMUERZO/PROTEÍNA que se va para llevar
// (es el costo del empaque desechable). NO aplica a bebidas,
// principios incluidos, postres ni platos a la carta.
// ============================================================
const RECARGO_DESECHABLE = 1000;
const TIPOS_ALMUERZO     = ['protein', 'executive_lunch', 'a_la_carte'];

function _esAlmuerzo(slot) {
    return !!slot && TIPOS_ALMUERZO.includes(slot.itemType);
}

// Modalidad actualmente seleccionada en el formulario (default 'mesa')
function _modalidadActual() {
    const r = document.querySelector('input[name="form-modalidad"]:checked');
    return r?.value || 'mesa';
}

// ¿Un ítem del carrito viaja para llevar?
// - Si todo el pedido es 'llevar'/'domicilio' → sí.
// - Si el ítem fue marcado individualmente (item.paraLlevar) → sí. (#12, siguiente paso)
function _itemViajaParaLlevar(item, modalidad) {
    if (modalidad === 'llevar' || modalidad === 'domicilio') return true;
    return !!item.paraLlevar;
}

// Recargo total de empaque según la modalidad actual.
// Cuenta: (1) almuerzos sueltos del cart (ej. menú ejecutivo) para llevar,
//         (2) cada PLATO (proteína) que va para llevar — cada plato = 1 empaque.
function calcularRecargoEmpaque(modalidad = _modalidadActual()) {
    const esLlevarTodo = (modalidad === 'llevar' || modalidad === 'domicilio');

    const recargoCart = State.cart.reduce((acc, item) => {
        const slot = State.slots.find(s => s.id === item.slotId);
        if (!slot || !_esAlmuerzo(slot)) return acc;
        if (!_itemViajaParaLlevar(item, modalidad)) return acc;
        return acc + RECARGO_DESECHABLE * item.cantidad;
    }, 0);

    const recargoPlatos = State.platos.reduce((acc, p) => {
        const viaja = esLlevarTodo || !!p.paraLlevar;
        return acc + (viaja ? RECARGO_DESECHABLE : 0);
    }, 0);

    return recargoCart + recargoPlatos;
}

// Proteínas y principios disponibles (desde el menú real)
function _proteinas()  { return State.slots.filter(s => s.itemType === 'protein'); }
function _principios() { return State.slots.filter(s => s.itemType === 'side'); }

// ============================================================
// [v7.7] CONSTRUCTOR DE PLATOS (almuerzo = proteína + principio + nota)
// ------------------------------------------------------------
// Cada toque de una proteína crea un PLATO independiente. El principio
// y la nota se asignan por plato en la pantalla de revisión. Tres
// pechugas = tres platos (cada uno con su principio y su nota).
// ============================================================
let _platoSeq = 0;
const Platos = {
    agregar(proteinaSlotId) {
        const prot = State.slots.find(s => s.id === proteinaSlotId);
        if (!prot || !prot.disponible) return;
        const usados = State.platos.filter(p => p.proteinaSlotId === proteinaSlotId).length;
        if (prot.porciones < 999 && usados >= prot.porciones) {
            Toast.error(`Solo quedan ${prot.porciones} porciones de "${prot.nombre}".`);
            return;
        }
        State.platos.push({
            uid: `pl${++_platoSeq}`,
            proteinaSlotId,
            principioSlotId: null,
            nota: '',
            paraLlevar: false,
        });
        _refrescarTarjeta(proteinaSlotId);
        _actualizarCartBar();
        _refrescarSummarySiAbierto();
    },

    quitarUltimo(proteinaSlotId) {
        for (let i = State.platos.length - 1; i >= 0; i--) {
            if (State.platos[i].proteinaSlotId === proteinaSlotId) {
                State.platos.splice(i, 1);
                break;
            }
        }
        _refrescarTarjeta(proteinaSlotId);
        _actualizarCartBar();
        _refrescarSummarySiAbierto();
    },

    quitarPorUid(uid) {
        const idx = State.platos.findIndex(p => p.uid === uid);
        if (idx === -1) return;
        const protId = State.platos[idx].proteinaSlotId;
        State.platos.splice(idx, 1);
        _refrescarTarjeta(protId);
        _actualizarCartBar();
        Cart._renderSummary();
    },

    setPrincipio(uid, sideSlotId) {
        const p = State.platos.find(x => x.uid === uid);
        if (p) p.principioSlotId = sideSlotId || null;
    },

    setNota(uid, txt) {
        const p = State.platos.find(x => x.uid === uid);
        if (p) p.nota = txt;   // se guarda en cada tecla; sin re-render para no perder el foco
    },

    toggleLlevar(uid, checked) {
        const p = State.platos.find(x => x.uid === uid);
        if (!p) return;
        p.paraLlevar = !!checked;
        Cart._renderSummary();   // refresca recargo y total (la nota ya está guardada)
        _actualizarCartBar();
    },
};

function _refrescarSummarySiAbierto() {
    const modal = document.getElementById('order-modal');
    if (modal?.classList.contains('open')) Cart._renderSummary();
}

// Estados que permiten edición
const ESTADOS_EDITABLES = ['pending', 'preparing', 'confirmed'];
// Estados de ítem que NO se pueden eliminar
const ITEM_ESTADOS_NO_ELIMINABLES = ['preparing', 'delivered'];

// ============================================================
// ESTADO GLOBAL
// ============================================================
const State = {
    restaurantId:    null,
    slots:           [],
    cart:            [],   // ítems sueltos: bebidas, a la carta, postres, menú ejecutivo
    platos:          [],   // [v7.7] almuerzos armados por plato (proteína + principio + nota)
    adicionales:     [],   // porciones/adicionales libres: [{uid, nombre, precio}]
    filtro:          'todos',
    isSubmitting:    false,
    realtimeChannel: null,
};

// ============================================================
// ═══ MÓDULO ADICIONALES / PORCIONES ═══
// ============================================================
const Adicional = {
    abrir() {
        document.getElementById('adicional-modal').classList.add('open');
        document.getElementById('adicional-nombre').value = '';
        document.getElementById('adicional-precio').value = '';
        setTimeout(() => document.getElementById('adicional-nombre').focus(), 120);
    },
    cerrar() {
        document.getElementById('adicional-modal').classList.remove('open');
    },
    agregar() {
        const nombre = document.getElementById('adicional-nombre').value.trim();
        const precio = parseInt(document.getElementById('adicional-precio').value.replace(/\D/g,''), 10) || 0;
        if (!nombre) { Toast.error('Escribe el nombre del adicional.'); return; }
        State.adicionales.push({ uid: crypto.randomUUID(), nombre, precio });
        _actualizarCartBar();
        this.cerrar();
        Toast.ok(`✅ "${nombre}" agregado al pedido`);
    },
    quitar(uid) {
        State.adicionales = State.adicionales.filter(a => a.uid !== uid);
        _actualizarCartBar();
        Cart.abrir();
    },
};

// ============================================================
// ═══ SESIÓN DE MESERO ═══
// ============================================================
const Sesion = {
    KEY: 'mateus_mesero_nombre',

    obtener() {
        return sessionStorage.getItem(this.KEY) || null;
    },

    guardar(nombre) {
        const n = (nombre || '').trim();
        if (!n) return false;
        sessionStorage.setItem(this.KEY, n);
        return true;
    },

    cerrar() {
        sessionStorage.removeItem(this.KEY);
    },

    label() {
        const n = this.obtener();
        return n ? n : '—';
    },

    async requerir() {
        if (this.obtener()) {
            _actualizarBannerMesero();
            return;
        }
        await this._mostrarPrompt();
        _actualizarBannerMesero();
    },

    _mostrarPrompt() {
        return new Promise((resolve) => {
            const overlay = document.getElementById('sesion-overlay');
            const input   = document.getElementById('sesion-input');
            const btn     = document.getElementById('sesion-btn');
            const errEl   = document.getElementById('sesion-error');
            if (!overlay) { resolve(); return; }

            overlay.style.display = 'flex';
            if (input) { input.value = ''; setTimeout(() => input.focus(), 120); }
            if (errEl) errEl.style.display = 'none';

            const confirmar = () => {
                const val = (input?.value || '').trim();
                if (!val) {
                    if (errEl) { errEl.textContent = 'Ingresa tu nombre para continuar.'; errEl.style.display = 'block'; }
                    input?.focus();
                    return;
                }
                this.guardar(val);
                overlay.style.display = 'none';
                resolve();
            };

            if (btn) btn.onclick = confirmar;
            if (input) {
                input.onkeydown = (e) => { if (e.key === 'Enter') confirmar(); };
            }
        });
    },

    cambiar() {
        const overlay = document.getElementById('sesion-overlay');
        const input   = document.getElementById('sesion-input');
        const errEl   = document.getElementById('sesion-error');
        if (!overlay) return;
        this.cerrar();
        if (input) input.value = '';
        if (errEl) errEl.style.display = 'none';
        overlay.style.display = 'flex';
        setTimeout(() => input?.focus(), 120);

        const btn = document.getElementById('sesion-btn');
        if (btn) {
            btn.onclick = () => {
                const val = (input?.value || '').trim();
                if (!val) {
                    if (errEl) { errEl.textContent = 'Ingresa tu nombre para continuar.'; errEl.style.display = 'block'; }
                    input?.focus();
                    return;
                }
                this.guardar(val);
                overlay.style.display = 'none';
                _actualizarBannerMesero();
                HistState.cargado = false;
                HistState.pedidos = [];
                if (typeof Tabs !== 'undefined' && Tabs.actual === 'historial') {
                    Hist.cargar();
                }
            };
        }
    },
};

function _actualizarBannerMesero() {
    const el = document.getElementById('mesero-nombre-display');
    if (el) el.textContent = Sesion.label();
}

// ============================================================
// RESET AUTOMÁTICO A MEDIANOCHE
// ============================================================
function _programarResetMedianoche() {
    const ahora  = new Date();
    const manana = new Date(ahora);
    manana.setDate(manana.getDate() + 1);
    manana.setHours(0, 0, 5, 0);
    const ms = manana - ahora;

    setTimeout(() => {
        HistState.cargado = false;
        HistState.pedidos = [];
        if (typeof Tabs !== 'undefined' && Tabs.actual === 'historial') {
            Hist.cargar();
        }
        _programarResetMedianoche();
    }, ms);
}

// ============================================================
// TOAST
// ============================================================
const Toast = (function() {
    function show(msg, tipo = 'info', dur = 3800) {
        const wrap = document.getElementById('toast-wrap');
        if (!wrap) return;
        const c = {
            ok:    { bg:'#f5f7f0', border:'rgba(74,103,65,0.35)',  text:'#2e4028', dot:'#4a6741' },
            error: { bg:'#fdf5f3', border:'rgba(192,80,60,0.30)',  text:'#6b2a1e', dot:'#c0503c' },
            info:  { bg:'#f5f7f0', border:'rgba(74,103,65,0.25)',  text:'#3a4a38', dot:'#4a6741' },
        }[tipo] || {};

        const t = document.createElement('div');
        Object.assign(t.style, {
            display:'flex', alignItems:'center', gap:'9px',
            background:c.bg, border:`1.5px solid ${c.border}`,
            borderRadius:'999px', padding:'10px 20px 10px 14px',
            boxShadow:'0 4px 20px rgba(0,0,0,0.10)',
            fontSize:'13.5px', fontFamily:"'DM Sans',sans-serif",
            fontWeight:'500', color:c.text,
            pointerEvents:'auto', opacity:'0',
            transform:'translateY(-8px)',
            transition:'opacity .28s ease, transform .28s ease',
            maxWidth:'calc(100vw - 32px)',
        });
        const dot = document.createElement('span');
        Object.assign(dot.style,{ width:'7px',height:'7px',borderRadius:'50%',background:c.dot,flexShrink:'0',display:'block' });
        const txt = document.createElement('span');
        txt.textContent = msg;
        t.appendChild(dot); t.appendChild(txt);
        wrap.appendChild(t);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            t.style.opacity = '1'; t.style.transform = 'translateY(0)';
        }));
        const timer = setTimeout(() => {
            t.style.opacity = '0'; t.style.transform = 'translateY(-8px)';
            setTimeout(() => t.remove(), 300);
        }, dur);
        t.onclick = () => { clearTimeout(timer); t.remove(); };
    }
    return {
        ok:    (m,ms) => show(m,'ok',ms),
        error: (m,ms) => show(m,'error',ms),
        info:  (m,ms) => show(m,'info',ms),
    };
})();

// ============================================================
// HELPERS
// ============================================================
function formatCOP(v) {
    return '$' + Math.round(v || 0).toLocaleString('es-CO');
}
function todayISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
function generarNumeroOrden() {
    return `MATEUS-${Math.floor(10000000 + Math.random() * 89999999)}`;
}

// [v7.6 · CAMBIO-10] Código secuencial diario para pedidos PARA LLEVAR/DOMICILIO.
// Formato LLV-001, LLV-002… Reinicia cada día (cuenta desde las 00:00 Bogotá).
// Los pedidos en mesa conservan su número aleatorio normal.
async function _generarNumeroOrden(modalidad) {
    if (modalidad !== 'llevar' && modalidad !== 'domicilio') {
        return generarNumeroOrden();
    }
    try {
        const hoy    = todayISO();
        const manana = new Date(new Date(`${hoy}T05:00:00Z`).getTime() + 86400000)
                         .toISOString().slice(0, 10);
        let q = db.from('orders')
            .select('notes')
            .gte('created_at', `${hoy}T05:00:00Z`)
            .lt('created_at',  `${manana}T05:00:00Z`);
        if (State.restaurantId) q = q.eq('restaurant_id', State.restaurantId);
        const { data, error } = await q;
        if (error) throw error;
        const n = (data || []).filter(o =>
            /\[PARA LLEVAR\]|\[DOMICILIO\]/.test(o.notes || '')
        ).length + 1;
        const sufijo = Date.now().toString().slice(-4);
        return `LLV-${String(n).padStart(3, '0')}-${sufijo}`;
    } catch (err) {
        console.warn('[Mateus] No se pudo generar código de llevar, uso aleatorio:', err.message);
        return generarNumeroOrden();
    }
}

function calcularTotal() {
    const baseCart = State.cart.reduce((acc, item) => {
        const slot = State.slots.find(s => s.id === item.slotId);
        return acc + (slot ? slot.precio * item.cantidad : 0);
    }, 0);
    // [v7.7] Suma el precio de la proteína de cada plato
    const basePlatos = State.platos.reduce((acc, p) => {
        const prot = State.slots.find(s => s.id === p.proteinaSlotId);
        return acc + (prot ? prot.precio : 0);
    }, 0);
    const baseAdicionales = State.adicionales.reduce((acc, a) => acc + (a.precio || 0), 0);
    // [v7.6 · CAMBIO-11] + recargo por desechable de los almuerzos para llevar
    return baseCart + basePlatos + calcularRecargoEmpaque() + baseAdicionales;
}
function calcularCantidadTotal() {
    const qCart = State.cart.reduce((acc, item) => acc + item.cantidad, 0);
    return qCart + State.platos.length;   // [v7.7] cada plato cuenta como 1
}
function slotsFiltrados() {
    // [v7.7] Los principios (side) ya no se muestran sueltos en el menú:
    // se eligen por plato. Se ocultan de la grilla.
    const visibles = State.slots.filter(s => s.itemType !== 'side');
    if (State.filtro === 'todos') return visibles;
    return visibles.filter(s => s.itemType === State.filtro);
}

// ============================================================
// RESOLVER RESTAURANT_ID
// ============================================================
let _restaurantResolving = false;

async function _resolverRestaurant() {
    if (State.restaurantId || _restaurantResolving) return;
    _restaurantResolving = true;
    try {
        const { data: r1, error: e1 } = await db
            .from('restaurants').select('id')
            .eq('slug', RESTAURANT_SLUG).maybeSingle();
        if (e1) console.warn('[Mateus] restaurants query error:', e1.message);
        if (r1?.id) { State.restaurantId = r1.id; return; }

        const { data: r2 } = await db.from('restaurants').select('id').limit(1).maybeSingle();
        if (r2?.id) { State.restaurantId = r2.id; return; }

        const { data: r3 } = await db
            .from('restaurants')
            .insert([{ name: 'Restaurante Mateus', slug: RESTAURANT_SLUG }])
            .select('id').single();
        if (r3?.id) State.restaurantId = r3.id;
    } catch (err) {
        console.warn('[Mateus] Error resolviendo restaurant_id:', err);
    } finally {
        _restaurantResolving = false;
    }
}

// ============================================================
// RESOLVER TABLE_ID  (v7.1 — sin fallback a Mesa 1)
// ============================================================
async function _resolverTableId(modalidad, mesa) {
    if (!State.restaurantId) await _resolverRestaurant();
    if (!State.restaurantId) return null;

    if (modalidad === 'mesa') {
        const mesaNum = parseInt(mesa);

        if (!isNaN(mesaNum) && mesaNum > 0) {
            const { data: porNum } = await db.from('tables').select('id')
                .eq('restaurant_id', State.restaurantId).eq('number', mesaNum).maybeSingle();
            if (porNum?.id) return porNum.id;
        }

        if (mesa) {
            const { data: porLabel } = await db.from('tables').select('id')
                .eq('restaurant_id', State.restaurantId)
                .ilike('label', `%${mesa}%`)
                .not('label','ilike','%llevar%')
                .not('label','ilike','%domicilio%')
                .not('label','ilike','%takeaway%')
                .maybeSingle();
            if (porLabel?.id) return porLabel.id;
        }

        const mesaNumFinal = (!isNaN(parseInt(mesa)) && parseInt(mesa) > 0) ? parseInt(mesa) : null;
        if (mesaNumFinal) {
            try {
                const { data: nueva, error: errNueva } = await db.from('tables')
                    .insert([{
                        restaurant_id: State.restaurantId,
                        number: mesaNumFinal,
                        label: `Mesa ${mesaNumFinal}`,
                        qr_code: `MESA-${State.restaurantId}-${mesaNumFinal}-${Date.now()}`,
                        capacity: 4, status: 'available',
                    }]).select('id').single();
                if (nueva?.id) return nueva.id;
                if (errNueva?.code === '23505') {
                    const { data: reintento } = await db.from('tables').select('id')
                        .eq('restaurant_id', State.restaurantId).eq('number', mesaNumFinal).maybeSingle();
                    if (reintento?.id) return reintento.id;
                }
            } catch (e) {
                console.warn(`[Mateus] No se pudo crear Mesa ${mesaNumFinal}:`, e.message);
            }
        }
        return null;
    }

    // Para llevar / domicilio
    const { data: mv0 } = await db.from('tables').select('id')
        .eq('restaurant_id', State.restaurantId).eq('number', 0).maybeSingle();
    if (mv0?.id) return mv0.id;

    const { data: mvL } = await db.from('tables').select('id')
        .eq('restaurant_id', State.restaurantId).ilike('label','%para llevar%').maybeSingle();
    if (mvL?.id) return mvL.id;

    const { data: mn } = await db.from('tables').insert([{
        restaurant_id: State.restaurantId, number: 0,
        label: 'Para Llevar / Domicilio',
        qr_code: `VIRTUAL-TAKEAWAY-${State.restaurantId}-${Date.now()}`,
        capacity: 99, status: 'available',
    }]).select('id').single();
    return mn?.id || null;
}

// ============================================================
// MENÚ
// ============================================================
const Menu = {
    async cargar() {
        _mostrarEstado('loader');
        if (!State.restaurantId) await _resolverRestaurant();
        if (!State.restaurantId) {
            _mostrarEstado('error', 'No se pudo identificar el restaurante.');
            return;
        }
        try {
            const { data: dataRaw, error } = await db
                .from('menu_items')
                .select('id, name, price, item_type, is_active, description, portions_today')
                .eq('restaurant_id', State.restaurantId)
                .eq('is_active', true)
                .order('item_type', { ascending: true })
                .order('name',      { ascending: true });

            const TIPOS_ACEPTADOS = [...ITEM_TYPES_VALIDOS, 'protein'];
            const data = dataRaw ? dataRaw.filter(i => TIPOS_ACEPTADOS.includes(i.item_type)) : dataRaw;

            if (error) throw error;
            if (!data || data.length === 0) { _activarModoDemo(); return; }

            State.slots = data.map(item => {
                const tienePortions = item.portions_today !== null && item.portions_today !== undefined;
                const porciones     = tienePortions ? Number(item.portions_today) : 999;
                const disponible    = item.is_active === true && porciones > 0;
                return {
                    id: item.id, menuItemId: item.id,
                    nombre: item.name, precio: Number(item.price) || 0,
                    descripcion: item.description || '',
                    itemType: CATEGORIAS[item.item_type] ? item.item_type : 'a_la_carte',
                    porciones, disponible,
                    // [FIX-PORCIONES] Guardar si tiene control real de porciones
                    tieneControlPorciones: tienePortions,
                };
            });

            _renderizarMenu();
            _mostrarEstado('menu');
            _suscribirRealtimeMenu();
        } catch (err) {
            _mostrarEstado('error', `No se pudo cargar la carta: ${err.message || 'error de red'}`);
        }
    },
};

function _mostrarEstado(estado, msg = '') {
    const loader   = document.getElementById('app-loader');
    const error    = document.getElementById('app-error');
    const sections = document.getElementById('menu-sections');
    if (loader)   loader.style.display   = estado === 'loader' ? 'flex'  : 'none';
    if (error)    error.style.display    = estado === 'error'  ? 'flex'  : 'none';
    if (sections) sections.style.display = estado === 'menu'   ? 'block' : 'none';
    if (estado === 'error') {
        if (loader) loader.style.display = 'none';
        const el = document.getElementById('error-msg');
        if (el) el.textContent = msg || 'Error desconocido. Recarga la página.';
    }
}

function _activarModoDemo() {
    State.slots = [
        { id:'demo-p1', menuItemId:null, nombre:'Pechuga a la Plancha con Salsa Criolla', precio:16000, descripcion:'Pechuga jugosa bañada en salsa criolla.', itemType:'protein', porciones:12, disponible:true,  tieneControlPorciones:false },
        { id:'demo-p2', menuItemId:null, nombre:'Tilapia Frita con Salsa de Ajo',         precio:18000, descripcion:'Tilapia frita con salsa de ajo y limón.',  itemType:'protein', porciones:8,  disponible:true,  tieneControlPorciones:false },
        { id:'demo-p3', menuItemId:null, nombre:'Cerdo al Horno con Salsa BBQ',           precio:17000, descripcion:'Lomo de cerdo con salsa BBQ artesanal.',   itemType:'protein', porciones:0,  disponible:false, tieneControlPorciones:false },
        { id:'demo-s1', menuItemId:null, nombre:'Arroz Blanco',                           precio:0,     descripcion:'Acompañamiento del almuerzo.',             itemType:'side',    porciones:30, disponible:true,  tieneControlPorciones:false },
        { id:'demo-s2', menuItemId:null, nombre:'Fríjoles Rojos con Hogao',              precio:0,     descripcion:'Fríjoles cocinados a fuego lento.',         itemType:'side',    porciones:25, disponible:true,  tieneControlPorciones:false },
        { id:'demo-d1', menuItemId:null, nombre:'Jugo Natural del Día',                  precio:3000,  descripcion:'Fruta fresca de temporada.',                itemType:'drink',   porciones:30, disponible:true,  tieneControlPorciones:false },
        { id:'demo-d2', menuItemId:null, nombre:'Limonada de Panela',                    precio:3500,  descripcion:'Limón con panela orgánica.',                itemType:'drink',   porciones:25, disponible:true,  tieneControlPorciones:false },
    ];
    _renderizarMenu();
    _mostrarEstado('menu');
}

function _renderizarCatsBar() {
    const bar = document.getElementById('cats-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const btnTodos = document.createElement('button');
    btnTodos.className   = `cat-btn${State.filtro === 'todos' ? ' active' : ''}`;
    btnTodos.textContent = 'Todos';
    btnTodos.onclick     = () => _cambiarFiltro('todos');
    bar.appendChild(btnTodos);

    // [v7.7] 'side' (Principio) se elige por plato, no se muestra como filtro suelto
    const tipos = [...new Set(State.slots.map(s => s.itemType))].filter(t => CATEGORIAS[t] && t !== 'side');
    tipos.sort((a,b) => (CATEGORIAS[a]?.orden||99) - (CATEGORIAS[b]?.orden||99))
        .forEach(tipo => {
            const cfg = CATEGORIAS[tipo];
            const btn = document.createElement('button');
            btn.className   = `cat-btn${State.filtro === tipo ? ' active' : ''}`;
            btn.innerHTML   = `${cfg.icono} ${cfg.label}`;
            btn.onclick     = () => _cambiarFiltro(tipo);
            bar.appendChild(btn);
        });
}

function _cambiarFiltro(tipo) {
    State.filtro = tipo;
    _renderizarCatsBar();
    _renderizarMenu();
}

function _renderizarMenu() {
    _renderizarCatsBar();
    const sections = document.getElementById('menu-sections');
    if (!sections) return;
    sections.innerHTML = '';
    const lista = slotsFiltrados();
    if (!lista || lista.length === 0) {
        sections.innerHTML = `<div class="empty-state"><div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b4b4aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg></div><p>No hay platos disponibles<br>en esta categoría.</p></div>`;
        return;
    }
    const grupos = {};
    lista.forEach(slot => {
        const tipo = CATEGORIAS[slot.itemType] ? slot.itemType : 'a_la_carte';
        if (!grupos[tipo]) grupos[tipo] = [];
        grupos[tipo].push(slot);
    });
    Object.keys(grupos)
        .sort((a,b) => (CATEGORIAS[a]?.orden||99) - (CATEGORIAS[b]?.orden||99))
        .forEach((tipo, secIdx) => {
            const cfg = CATEGORIAS[tipo];
            const platos = grupos[tipo];
            if (!platos?.length) return;
            const sec = document.createElement('div');
            const header = document.createElement('div');
            header.className = 'section-label';
            header.innerHTML = `<h2>${cfg.icono} ${cfg.label}</h2>`;
            sec.appendChild(header);
            platos.forEach((slot, i) => {
                const t = _crearTarjeta(slot);
                t.style.animationDelay = `${secIdx * 0.06 + i * 0.05}s`;
                sec.appendChild(t);
            });
            sections.appendChild(sec);
        });
}

function _crearTarjeta(slot) {
    const disponible = slot.disponible && slot.porciones > 0;
    const pocas      = disponible && slot.porciones > 0 && slot.porciones < 999 && slot.porciones <= 5;
    const esProteina = slot.itemType === 'protein' || slot.itemType === 'executive_lunch';
    const enCarrito  = State.cart.find(c => c.slotId === slot.id);
    // [v7.7] Para proteínas, la "cantidad" es el número de platos con esa proteína
    const qty        = esProteina
        ? State.platos.filter(p => p.proteinaSlotId === slot.id).length
        : (enCarrito ? enCarrito.cantidad : 0);

    let badgeHTML = '';
    if (!disponible) badgeHTML = `<span class="badge-agotado">Agotado</span>`;
    else if (pocas)  badgeHTML = `<span class="badge-pocas">¡Solo quedan ${slot.porciones}!</span>`;

    const precioHTML = slot.precio > 0
        ? `<span class="plate-price">${formatCOP(slot.precio)}</span>`
        : `<span class="plate-price incluido">Incluido</span>`;

    let ctrlHTML = '';
    if (disponible) {
        // [v7.7] Proteínas → constructor de platos. Demás ítems → carrito normal.
        const fnAdd   = esProteina ? `Platos.agregar('${slot.id}')`      : `Cart.agregar('${slot.id}')`;
        const fnMenos = esProteina ? `Platos.quitarUltimo('${slot.id}')` : `Cart.cambiar('${slot.id}',-1)`;
        const fnMas   = esProteina ? `Platos.agregar('${slot.id}')`      : `Cart.cambiar('${slot.id}',+1)`;
        ctrlHTML = qty === 0
            ? `<button class="btn-add" onclick="${fnAdd}" aria-label="Agregar ${slot.nombre}">+</button>`
            : `<div class="qty-chip">
                   <button onclick="${fnMenos}" aria-label="Quitar">−</button>
                   <span>${qty}</span>
                   <button onclick="${fnMas}" aria-label="Agregar">+</button>
               </div>`;
    }

    const card = document.createElement('div');
    card.id        = `tarjeta-${slot.id}`;
    card.className = `plate-card${!disponible ? ' agotado' : ''} fade-up`;
    card.innerHTML = `
        <div class="plate-info">
            <p class="plate-name">${slot.nombre}</p>
            ${slot.descripcion ? `<p class="plate-desc">${slot.descripcion}</p>` : ''}
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px;">
                ${precioHTML}${badgeHTML}
            </div>
        </div>
        <div style="flex-shrink:0;">${ctrlHTML}</div>`;
    return card;
}

function _refrescarTarjeta(slotId) {
    const slot = State.slots.find(s => s.id === slotId);
    if (!slot) return;
    const vieja = document.getElementById(`tarjeta-${slotId}`);
    if (vieja) vieja.replaceWith(_crearTarjeta(slot));
}

// ============================================================
// CARRITO
// ============================================================
const Cart = {
    agregar(slotId) {
        const slot = State.slots.find(s => s.id === slotId);
        if (!slot || !slot.disponible) return;
        const existente = State.cart.find(c => c.slotId === slotId);
        if (existente) {
            if (slot.porciones < 999 && existente.cantidad >= slot.porciones) {
                Toast.error(`Solo quedan ${slot.porciones} porciones de "${slot.nombre}".`);
                return;
            }
            existente.cantidad++;
        } else {
            State.cart.push({ slotId, cantidad: 1, nota: '' });
        }
        _refrescarTarjeta(slotId);
        _actualizarCartBar();
    },

    setNotaCart(slotId, txt) {
        const item = State.cart.find(c => c.slotId === slotId);
        if (item) item.nota = txt;
    },

    cambiar(slotId, delta) {
        const slot = State.slots.find(s => s.id === slotId);
        if (!slot) return;
        const idx = State.cart.findIndex(c => c.slotId === slotId);
        if (idx === -1) return;
        if (delta > 0 && slot.porciones < 999 && State.cart[idx].cantidad + delta > slot.porciones) {
            Toast.error(`Solo quedan ${slot.porciones} porciones.`);
            return;
        }
        const nueva = State.cart[idx].cantidad + delta;
        if (nueva <= 0) State.cart.splice(idx, 1);
        else            State.cart[idx].cantidad = nueva;
        _refrescarTarjeta(slotId);
        _actualizarCartBar();
        const modal = document.getElementById('order-modal');
        if (modal?.classList.contains('open')) Cart._renderSummary();
    },

    abrir() {
        if (State.cart.length === 0 && State.platos.length === 0) return;
        this._renderSummary();
        document.getElementById('order-modal').classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    cerrar() {
        document.getElementById('order-modal').classList.remove('open');
        document.body.style.overflow = '';
    },

    _renderSummary() {
        const listEl  = document.getElementById('summary-items');
        const totalEl = document.getElementById('summary-total');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (State.cart.length === 0 && State.platos.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:36px 0;"><p style="font-size:13px;color:var(--ink-ghost);">Tu pedido está vacío.</p></div>`;
            if (totalEl) totalEl.textContent = '$0';
            return;
        }

        const principios    = _principios();
        const modLlevarTodo = ['llevar', 'domicilio'].includes(_modalidadActual());

        // ── [v7.8] PLATOS: vista en 3 pasos agrupados ──────────────────────
        if (State.platos.length > 0) {

            // ── Un card por plato con todo integrado ───────────────────
            State.platos.forEach((p, i) => {
                const prot      = State.slots.find(s => s.id === p.proteinaSlotId);
                if (!prot) return;
                const principio = principios.find(s => s.id === p.principioSlotId);
                const marcado   = modLlevarTodo || !!p.paraLlevar;

                const opciones = [`<option value="">— Elegir principio —</option>`]
                    .concat(principios.map(s =>
                        `<option value="${s.id}" ${p.principioSlotId === s.id ? 'selected' : ''}>${s.nombre}</option>`
                    )).join('');

                const seccionLlevar = modLlevarTodo
                    ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
                            background:rgba(180,83,9,0.06);border-radius:10px;
                            border:1px solid rgba(180,83,9,0.18);">
                           <span style="font-size:16px;">🛍️</span>
                           <span style="font-size:13px;font-weight:500;color:#92400e;">
                               Para llevar · +${formatCOP(RECARGO_DESECHABLE)} empaque
                           </span>
                       </div>`
                    : `<label style="display:flex;align-items:center;gap:10px;padding:11px 14px;
                            background:${marcado ? 'rgba(180,83,9,0.06)' : '#fafaf8'};
                            border-radius:10px;cursor:pointer;
                            border:1.5px solid ${marcado ? 'rgba(180,83,9,0.25)' : 'var(--border)'};">
                           <input type="checkbox" ${marcado ? 'checked' : ''}
                               onchange="Platos.toggleLlevar('${p.uid}', this.checked)"
                               style="width:18px;height:18px;flex-shrink:0;accent-color:var(--oliva);cursor:pointer;">
                           <span style="font-size:13px;font-weight:500;color:${marcado ? '#92400e' : 'var(--ink-muted)'};">
                               🛍️ Para llevar (+${formatCOP(RECARGO_DESECHABLE)})
                           </span>
                       </label>`;

                const card = document.createElement('div');
                card.className = 'plato-card';
                card.innerHTML = `
                    <div class="plato-card-head">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="plato-card-num">${i + 1}</span>
                            <div>
                                <div class="plato-card-nombre">${prot.nombre}</div>
                                <div class="plato-card-sub" style="color:${principio ? 'var(--oliva)' : 'var(--ink-ghost)'};">
                                    ${principio ? `con ${principio.nombre}` : 'sin principio aún'}
                                </div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            ${prot.precio > 0 ? `<span style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:600;color:var(--oliva);">${formatCOP(prot.precio)}</span>` : ''}
                            <button onclick="Platos.quitarPorUid('${p.uid}')" aria-label="Quitar"
                                style="width:30px;height:30px;border-radius:50%;background:rgba(184,50,50,0.10);color:#b83232;border:1px solid rgba(184,50,50,0.20);font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
                        </div>
                    </div>
                    <div class="plato-card-section">
                        <div class="plato-section-label">🥘 Principio</div>
                        <select class="plato-select" onchange="Platos.setPrincipio('${p.uid}', this.value)">
                            ${opciones}
                        </select>
                    </div>
                    <div class="plato-card-section">
                        <div class="plato-section-label">✏️ Nota del plato</div>
                        <input class="plato-input" type="text"
                            value="${(p.nota || '').replace(/"/g, '&quot;')}"
                            oninput="Platos.setNota('${p.uid}', this.value)"
                            placeholder="Ej: sin ensalada, sin cebolla…">
                    </div>
                    <div class="plato-card-section">
                        ${seccionLlevar}
                    </div>`;

                listEl.appendChild(card);
            });
        }

        // ── Ítems sueltos (bebidas, a la carta, postres, menú ejecutivo) ──
        if (State.cart.length > 0) {
            if (State.platos.length > 0) {
                const sep = document.createElement('div');
                sep.style.cssText = 'padding:12px 20px 8px;font-size:11px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.09em;';
                sep.textContent = 'Ítems adicionales';
                listEl.appendChild(sep);
            }
            State.cart.forEach(item => {
                const slot = State.slots.find(s => s.id === item.slotId);
                if (!slot) return;
                const esCartaNota = slot.itemType === 'a_la_carte';
                const row = document.createElement('div');
                row.className = 'summary-row';
                row.style.flexDirection = 'column';
                row.style.alignItems = 'stretch';
                row.style.gap = '6px';
                const notaEscapada = (item.nota || '').replace(/"/g, '&quot;');
                row.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;min-width:0;">
                            <p class="summary-name">${slot.nombre}</p>
                            <p class="summary-qty">${item.cantidad} × ${slot.precio > 0 ? formatCOP(slot.precio) : 'Incluido'}</p>
                        </div>
                        <span class="summary-price">${slot.precio > 0 ? formatCOP(slot.precio * item.cantidad) : '—'}</span>
                    </div>
                    ${esCartaNota ? `<input class="plato-input" type="text"
                        value="${notaEscapada}"
                        oninput="Cart.setNotaCart('${slot.id}', this.value)"
                        placeholder="Nota: sin cebolla, término…"
                        style="font-size:12px;">` : ''}`;
                listEl.appendChild(row);
            });
        }

        // Adicionales / Porciones libres
        if (State.adicionales.length > 0) {
            const sepA = document.createElement('div');
            sepA.style.cssText = 'padding:12px 20px 8px;font-size:11px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.09em;';
            sepA.textContent = 'Porciones / Adicionales';
            listEl.appendChild(sepA);
            State.adicionales.forEach(a => {
                const row = document.createElement('div');
                row.className = 'summary-row';
                row.innerHTML = `
                    <div style="flex:1;min-width:0;">
                        <p class="summary-name">🍽️ ${a.nombre}</p>
                        <p class="summary-qty">Porción / Adicional</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="summary-price">${a.precio > 0 ? formatCOP(a.precio) : '—'}</span>
                        <button onclick="Adicional.quitar('${a.uid}')" style="background:none;border:none;font-size:18px;color:#ef4444;cursor:pointer;line-height:1;padding:0 4px;">×</button>
                    </div>`;
                listEl.appendChild(row);
            });
        }

        // Línea del recargo por desechable
        const recargo = calcularRecargoEmpaque();
        if (recargo > 0) {
            const cantAlmuerzos = recargo / RECARGO_DESECHABLE;
            const rowR = document.createElement('div');
            rowR.className = 'summary-row';
            rowR.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <p class="summary-name">Empaque desechable</p>
                    <p class="summary-qty">${cantAlmuerzos} × ${formatCOP(RECARGO_DESECHABLE)} · para llevar</p>
                </div>
                <span class="summary-price">${formatCOP(recargo)}</span>`;
            listEl.appendChild(rowR);
        }

        if (totalEl) totalEl.textContent = formatCOP(calcularTotal());
    },
};

function _actualizarCartBar() {
    const qty     = calcularCantidadTotal();
    const bar     = document.getElementById('cart-bar');
    const btnAd   = document.getElementById('btn-adicional');
    const countEl = document.getElementById('cart-count');
    const totalEl = document.getElementById('cart-total');
    if (countEl) countEl.textContent = qty;
    if (totalEl) totalEl.textContent = formatCOP(calcularTotal());
    if (bar) {
        if (qty > 0) bar.classList.add('visible');
        else         bar.classList.remove('visible');
    }
    // El botón de adicional aparece cuando hay algo en el pedido
    if (btnAd) {
        if (qty > 0) btnAd.classList.add('visible');
        else         btnAd.classList.remove('visible');
    }
}

// ============================================================
// [v7.5 · CAMBIO-1] REINICIO DEL FORMULARIO TRAS UN PEDIDO
// ------------------------------------------------------------
// Deja mesa, nombre, notas y dirección en blanco, y vuelve la
// modalidad a "mesa". Se llama SIEMPRE que se confirma un pedido
// para que la siguiente comanda arranque limpia (antes el número
// de mesa y el nombre del cliente quedaban pegados del pedido
// anterior). NO toca la sesión del mesero.
// ============================================================
function _resetFormularioPedido() {
    const mesaEl      = document.getElementById('form-mesa');
    const nombreEl    = document.getElementById('form-nombre');
    const notasEl     = document.getElementById('form-notas');
    const direccionEl = document.getElementById('form-direccion');

    if (mesaEl)      { mesaEl.value      = ''; mesaEl.classList.remove('error'); }
    if (nombreEl)    nombreEl.value    = '';
    if (notasEl)     notasEl.value     = '';
    if (direccionEl) { direccionEl.value = ''; direccionEl.classList.remove('error'); }

    // Volver a la modalidad por defecto ("mesa")
    document.querySelectorAll('.modalidad-tab').forEach(tab => {
        const radio  = tab.querySelector('input[type="radio"]');
        const esMesa = radio && radio.value === 'mesa';
        tab.classList.toggle('active', !!esMesa);
        if (radio) radio.checked = !!esMesa;
    });
    const mesaWrap = document.getElementById('campo-mesa-wrapper');
    const dirWrap  = document.getElementById('campo-direccion-wrapper');
    if (mesaWrap) mesaWrap.style.display = 'block';
    if (dirWrap)  dirWrap.style.display  = 'none';
}

// ============================================================
// [FIX-PORCIONES-CRITICO] DESCUENTO DIRECTO DE PORCIONES
// ============================================================
// Esta función se ejecuta SIEMPRE después de confirmar una orden,
// independientemente de si MateusCore está disponible o no.
// Solo descuenta ítems que tienen control real de porciones
// (tieneControlPorciones === true, es decir portions_today != null en BD).
//
// Usa una actualización atómica segura:
//   portions_today = GREATEST(portions_today - cantidad, 0)
// para nunca ir a negativo.
// ============================================================
async function _descontarPorciones(cartSnapshot) {
    // cartSnapshot = copia del carrito en el momento de confirmar
    // [{slotId, cantidad}]

    const itemsConControl = cartSnapshot
        .map(item => {
            const slot = State.slots.find(s => s.id === item.slotId);
            if (!slot) return null;
            // Solo descuenta si tiene menuItemId real (no demo) y control de porciones
            if (!slot.menuItemId || !slot.tieneControlPorciones) return null;
            return { menuItemId: slot.menuItemId, cantidad: item.cantidad, slot };
        })
        .filter(Boolean);

    if (itemsConControl.length === 0) {
        // No hay ítems con control de porciones — no hay nada que descontar
        return;
    }

    // Agrupar por menuItemId por si el mismo ítem aparece dos veces en el carrito
    const agrupado = {};
    for (const it of itemsConControl) {
        if (!agrupado[it.menuItemId]) {
            agrupado[it.menuItemId] = { menuItemId: it.menuItemId, cantidad: 0, slot: it.slot };
        }
        agrupado[it.menuItemId].cantidad += it.cantidad;
    }

    const promesas = Object.values(agrupado).map(async ({ menuItemId, cantidad, slot }) => {
        try {
            // Leer el valor actual de portions_today primero
            const { data: actual, error: errLeer } = await db
                .from('menu_items')
                .select('portions_today')
                .eq('id', menuItemId)
                .single();

            if (errLeer || !actual) {
                console.warn(`[Mateus] No se pudo leer portions_today para ${slot.nombre}:`, errLeer?.message);
                return;
            }

            const porcionesActuales = Number(actual.portions_today) ?? 0;
            const nuevasPorciones   = Math.max(0, porcionesActuales - cantidad);

            const { error: errUpdate } = await db
                .from('menu_items')
                .update({
                    portions_today: nuevasPorciones,
                    // Si llega a 0, desactivar automáticamente
                    is_active: nuevasPorciones > 0,
                })
                .eq('id', menuItemId);

            if (errUpdate) {
                console.warn(`[Mateus] Error descontando porciones de "${slot.nombre}":`, errUpdate.message);
                return;
            }

            // [FIX-PORCIONES-OPTIMISTIC] Actualizar State.slots en memoria inmediatamente
            // para que la UI refleje el stock correcto sin esperar el ciclo de realtime
            const idxSlot = State.slots.findIndex(s => s.id === slot.id);
            if (idxSlot !== -1) {
                State.slots[idxSlot].porciones   = nuevasPorciones;
                State.slots[idxSlot].disponible  = nuevasPorciones > 0;
                // Si se agotó, refrescar la tarjeta en la UI
                if (nuevasPorciones === 0) {
                    _refrescarTarjeta(slot.id);
                } else if (nuevasPorciones <= 5) {
                    // Actualizar badge de "pocas" si corresponde
                    _refrescarTarjeta(slot.id);
                }
            }

            console.info(`[Mateus] ✓ Porciones descontadas: "${slot.nombre}" ${porcionesActuales} → ${nuevasPorciones}`);

        } catch (err) {
            // No cortar el flujo principal, solo loguear
            console.warn(`[Mateus] Excepción al descontar porciones de "${slot.nombre}":`, err.message);
        }
    });

    // Ejecutar todos los descuentos en paralelo
    await Promise.allSettled(promesas);
}

// ============================================================
// ENVÍO DEL PEDIDO
// [FIX-PORCIONES-CRITICO] Se llama _descontarPorciones() SIEMPRE
// después de insertar los order_items, con la copia del carrito.
// MateusCore sigue usándose como canal adicional si está disponible.
// ============================================================
const Order = {
    async enviar() {
        if (State.isSubmitting) return;
        if (State.cart.length === 0 && State.platos.length === 0) { Toast.error('Agrega al menos un plato al pedido.'); return; }

        const btnEl       = document.getElementById('btn-enviar');
        const mesaEl      = document.getElementById('form-mesa');
        const nombreEl    = document.getElementById('form-nombre');
        const notasEl     = document.getElementById('form-notas');
        const direccionEl = document.getElementById('form-direccion');
        const modalidadEl = document.querySelector('input[name="form-modalidad"]:checked');

        const mesa      = (mesaEl?.value      || '').trim();
        const nombre    = (nombreEl?.value    || '').trim();
        const notas     = (notasEl?.value     || '').trim();
        const direccion = (direccionEl?.value || '').trim();
        const modalidad = modalidadEl?.value || 'mesa';

        if (modalidad === 'mesa' && !mesa) {
            mesaEl?.classList.add('error'); mesaEl?.focus();
            Toast.error('Indica el número de mesa.'); return;
        }
        mesaEl?.classList.remove('error');

        if (modalidad === 'domicilio' && !direccion) {
            direccionEl?.classList.add('error'); direccionEl?.focus();
            Toast.error('Indica la dirección de entrega.'); return;
        }
        direccionEl?.classList.remove('error');

        State.isSubmitting = true;
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Enviando…'; }

        // [FIX-PORCIONES-CRITICO] Capturar snapshot del carrito ANTES de limpiarlo
        // para usarlo en _descontarPorciones() después de confirmar la orden.
        // [v7.7] Incluye también la proteína de cada plato (cada plato = 1 porción).
        const cartSnapshot = State.cart.map(item => ({ ...item }))
            .concat(State.platos.map(p => ({ slotId: p.proteinaSlotId, cantidad: 1 })));

        try {
            if (!State.restaurantId) await _resolverRestaurant();
            if (!State.restaurantId) throw new Error('No se pudo identificar el restaurante.');

            const tableId = await _resolverTableId(modalidad, mesa);
            let tableIdFinal = tableId;
            if (!tableIdFinal) {
                const { data: anyTable } = await db.from('tables').select('id')
                    .eq('restaurant_id', State.restaurantId).limit(1).maybeSingle();
                tableIdFinal = anyTable?.id || null;
            }
            if (!tableIdFinal) throw new Error('No hay mesas configuradas. Crea al menos una en el panel admin.');

            // Inyectar mesero en las notas
            const mesero = Sesion.obtener();
            let notaCocina = '';
            if (modalidad === 'mesa')           notaCocina = `[MESA] Mesa: ${mesa}`;
            else if (modalidad === 'llevar')    notaCocina = `[PARA LLEVAR] Cliente: ${nombre || 'Sin nombre'}`;
            else if (modalidad === 'domicilio') notaCocina = `[DOMICILIO] Cliente: ${nombre || 'Sin nombre'} | Dir: ${direccion}`;
            if (mesero) notaCocina += ` | Mesero: ${mesero}`;
            if (notas)  notaCocina += ` | Nota: ${notas}`;

            // [v7.6 · CAMBIO-10] Código diario LLV-### para llevar/domicilio; aleatorio para mesa
            const numeroOrden = await _generarNumeroOrden(modalidad);
            const total       = calcularTotal();

            const { data: orden, error: errOrd } = await db.from('orders').insert([{
                restaurant_id: State.restaurantId,
                table_id:      tableIdFinal,
                order_number:  numeroOrden,
                status:        'pending',
                customer_name: nombre || null,
                total_amount:  total,
                notes:         notaCocina || null,
            }]).select('id').single();
            if (errOrd) throw errOrd;

            const { data: todosItems } = await db.from('menu_items').select('id,name,item_type')
                .eq('restaurant_id', State.restaurantId).eq('is_active', true);
            const listaItems = todosItems || [];
            const fallbackId = listaItems[0]?.id || null;

            const payload = State.cart.map(item => {
                const slot = State.slots.find(s => s.id === item.slotId);
                if (!slot) return null;
                let menuItemId = slot.menuItemId;
                if (!menuItemId && listaItems.length > 0) {
                    const nb  = (slot.nombre || '').toLowerCase().trim();
                    const ex  = listaItems.find(m => m.name.toLowerCase().trim() === nb);
                    const par = !ex && listaItems.find(m => m.name.toLowerCase().includes(nb.split(' ')[0]));
                    menuItemId = ex?.id || par?.id || fallbackId;
                }
                // [v7.6 · CAMBIO-11] Cargar el desechable en el precio del almuerzo
                // si va para llevar. Va dentro del unit_price para que el total
                // cuadre con la suma de ítems y se mantenga al editar el pedido.
                const llevaEmpaque = _esAlmuerzo(slot) && _itemViajaParaLlevar(item, modalidad);
                const precioFinal  = slot.precio + (llevaEmpaque ? RECARGO_DESECHABLE : 0);
                return {
                    order_id: orden.id, menu_item_id: menuItemId,
                    quantity: item.cantidad, unit_price: precioFinal,
                    item_status: 'pending',
                    product_name: slot.nombre,
                    notes: `[nombre]${slot.nombre}${item.nota ? ' | ' + item.nota.trim() : ''}${llevaEmpaque ? ' | Empaque desechable incluido' : ''}`,
                };
            }).filter(Boolean);

            // [v7.7] PLATOS → una línea por plato (la proteína es la que tiene precio;
            // el principio va dentro del nombre y la nota del plato en la nota del ítem).
            const esLlevarTodo = (modalidad === 'llevar' || modalidad === 'domicilio');
            State.platos.forEach(p => {
                const prot = State.slots.find(s => s.id === p.proteinaSlotId);
                if (!prot) return;
                const sideSlot = p.principioSlotId ? State.slots.find(s => s.id === p.principioSlotId) : null;

                let menuItemId = prot.menuItemId;
                if (!menuItemId && listaItems.length > 0) {
                    const nb  = (prot.nombre || '').toLowerCase().trim();
                    const ex  = listaItems.find(m => m.name.toLowerCase().trim() === nb);
                    const par = !ex && listaItems.find(m => m.name.toLowerCase().includes(nb.split(' ')[0]));
                    menuItemId = ex?.id || par?.id || fallbackId;
                }

                const llevaEmpaque = esLlevarTodo || !!p.paraLlevar;
                const precioFinal  = (prot.precio || 0) + (llevaEmpaque ? RECARGO_DESECHABLE : 0);
                const nombrePlato  = prot.nombre + (sideSlot ? ` · ${sideSlot.nombre}` : '');

                const partesNota = [];
                if (p.nota && p.nota.trim()) partesNota.push(p.nota.trim());
                if (llevaEmpaque)            partesNota.push('Empaque desechable incluido');
                const notaItem = `[nombre]${nombrePlato}${partesNota.length ? ' | ' + partesNota.join(' · ') : ''}`;

                payload.push({
                    order_id: orden.id, menu_item_id: menuItemId,
                    quantity: 1, unit_price: precioFinal,
                    item_status: 'pending',
                    product_name: nombrePlato,
                    notes: notaItem,
                });
            });

            // Adicionales libres (porciones extra ingresadas por el mesero)
            State.adicionales.forEach(a => {
                payload.push({
                    order_id: orden.id, menu_item_id: fallbackId,
                    quantity: 1, unit_price: a.precio || 0,
                    item_status: 'pending',
                    product_name: a.nombre,
                    notes: `[adicional]${a.nombre}`,
                });
            });

            if (payload.length > 0) {
                const { error: errItems } = await db.from('order_items').insert(payload);
                if (errItems) {
                    if (errItems.code === '42703' || errItems.message?.includes('product_name')) {
                        const p2 = payload.map(({ product_name, ...rest }) => rest);
                        const { error: err2 } = await db.from('order_items').insert(p2);
                        if (err2) Toast.error('Pedido registrado pero ítems fallaron. Avisa al admin.', 6000);
                    } else {
                        Toast.error('Pedido registrado pero ítems fallaron. Avisa al admin.', 6000);
                    }
                }

                // ─────────────────────────────────────────────────────────
                // [FIX-PORCIONES-CRITICO] DESCUENTO DIRECTO — SIEMPRE corre
                // No depende de MateusCore. Usa `db` que ya está inicializado.
                // Ejecuta en background (no bloquea la pantalla de éxito).
                // ─────────────────────────────────────────────────────────
                _descontarPorciones(cartSnapshot).catch(err =>
                    console.warn('[Mateus] Error en descuento de porciones (background):', err.message)
                );

                // MateusCore solo para inventario de insumos — NO porciones
                // (porciones ya las maneja _descontarPorciones arriba)
                if (window.MateusCore) {
                    MateusCore.ajustarInventarioPorItems(
                        payload.map(p => ({ menu_item_id: p.menu_item_id, quantity: p.quantity, notes: p.notes })),
                        1
                    ).catch(e => console.warn('[menu.js] MateusCore.ajustarInventarioPorItems silencioso:', e.message));
                }
            }

            this._mostrarExito(numeroOrden);

        } catch (err) {
            console.error('[Mateus] Error enviando pedido:', err);
            Toast.error('No se pudo enviar el pedido. Verifica tu conexión.', 5000);
        } finally {
            State.isSubmitting = false;
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Enviar a cocina'; }
        }
    },

    _mostrarExito(numeroOrden) {
        Cart.cerrar();
        const el = document.getElementById('success-order-no');
        if (el) el.textContent = numeroOrden;
        document.getElementById('success-modal').classList.add('open');
        State.cart        = [];
        State.platos      = [];   // [v7.7] limpiar platos armados
        State.adicionales = [];
        _actualizarCartBar();
        // [v7.5 · CAMBIO-1] Dejar el formulario en blanco para el próximo pedido
        _resetFormularioPedido();
        if (HistState.cargado) Hist.cargar();
    },

    nuevoPedido() {
        document.getElementById('success-modal').classList.remove('open');
        // [v7.5 · CAMBIO-1] Reinicio completo del formulario (mesa, nombre, notas, dirección)
        _resetFormularioPedido();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        _renderizarMenu();
    },

    cerrarExito() {
        document.getElementById('success-modal').classList.remove('open');
    },
};

// ============================================================
// REALTIME — menu_items
// ============================================================
function _suscribirRealtimeMenu() {
    if (!State.restaurantId) return;
    if (State.realtimeChannel) { db.removeChannel(State.realtimeChannel); State.realtimeChannel = null; }

    State.realtimeChannel = db
        .channel(`mateus-menu-v742-${State.restaurantId}`)
        .on('postgres_changes',{ event:'UPDATE', schema:'public', table:'menu_items',
            filter:`restaurant_id=eq.${State.restaurantId}` },
            (payload) => _actualizarSlotDesdeRealtime(payload.new))
        .on('postgres_changes',{ event:'INSERT', schema:'public', table:'menu_items',
            filter:`restaurant_id=eq.${State.restaurantId}` },
            () => Menu.cargar())
        .on('postgres_changes',{ event:'DELETE', schema:'public', table:'menu_items' },
            () => Menu.cargar())
        .subscribe();
}

function _actualizarSlotDesdeRealtime(item) {
    if (!item?.id) return;
    const idx = State.slots.findIndex(s => s.id === item.id);
    if (idx === -1) { Menu.cargar(); return; }

    const tienePortions = item.portions_today !== null && item.portions_today !== undefined;
    const porciones     = tienePortions ? Number(item.portions_today) : 999;
    const disponible    = item.is_active === true && porciones > 0;

    State.slots[idx] = {
        ...State.slots[idx],
        nombre:    item.name,
        precio:    Number(item.price) || 0,
        porciones,
        disponible,
        tieneControlPorciones: tienePortions,
    };
    _refrescarTarjeta(item.id);

    if (!disponible) {
        const idx2 = State.cart.findIndex(c => c.slotId === item.id);
        if (idx2 !== -1) {
            const nombre = State.slots[idx].nombre;
            State.cart.splice(idx2, 1);
            _actualizarCartBar();
            Toast.error(`"${nombre}" se agotó y fue removido de tu pedido.`, 5000);
        }
        // [v7.7] También quitar los platos que usaban esta proteína
        const platosAntes = State.platos.length;
        State.platos = State.platos.filter(p => p.proteinaSlotId !== item.id);
        if (State.platos.length !== platosAntes) {
            _actualizarCartBar();
            _refrescarSummarySiAbierto();
            Toast.error(`"${State.slots[idx].nombre}" se agotó y se quitó de tus platos.`, 5000);
        }
    }
}

// ============================================================
// ═══ MÓDULO HISTORIAL (v7.4) ═══
// ============================================================

const HistState = {
    pedidos:         [],
    filtro:          'todos',
    cargado:         false,
    cargando:        false,   // <-- agregar esta línea
    realtimeChannel: null,
};

function _parsearNota(notes) {
    const n = notes || '';
    let tipo = 'mesa', destino = '', cliente = '', direccion = '', nota = '', mesero = '';

    if (n.startsWith('[MESA]')) {
        tipo = 'mesa';
        const m = n.match(/Mesa:\s*([^|]+)/);
        destino = m ? `Mesa ${m[1].trim()}` : 'Mesa';
    } else if (n.startsWith('[PARA LLEVAR]')) {
        tipo = 'llevar'; destino = 'Para Llevar';
        const m = n.match(/Cliente:\s*([^|]+)/);
        cliente = m ? m[1].trim() : '';
    } else if (n.startsWith('[DOMICILIO]')) {
        tipo = 'domicilio'; destino = 'Domicilio';
        const mc = n.match(/Cliente:\s*([^|]+)/);
        const md = n.match(/Dir:\s*([^|]+)/);
        cliente   = mc ? mc[1].trim() : '';
        direccion = md ? md[1].trim() : '';
    } else {
        tipo = 'mesa'; destino = n || 'Sin datos';
    }

    const mm = n.match(/Mesero:\s*([^|]+)/);
    mesero = mm ? mm[1].trim() : '';

    const mn = n.match(/Nota:\s*(.+)$/);
    nota = mn ? mn[1].trim() : '';
    return { tipo, destino, cliente, direccion, nota, mesero };
}

function _horaCorta(isoStr) {
    if (!isoStr) return '';
    try {
        return new Date(isoStr).toLocaleTimeString('es-CO',
            { hour:'2-digit', minute:'2-digit', timeZone:'America/Bogota' });
    } catch { return ''; }
}

const Hist = {

    async cargar() {
        if (HistState.cargando) return;   // semáforo — evita concurrencia
        HistState.cargando = true;
        _histSetLoader(true);
        if (!State.restaurantId) await _resolverRestaurant();
        if (!State.restaurantId) {
            _histSetError('No se pudo identificar el restaurante.');
            HistState.cargando = false;
            return;
        }
        try {
            const hoy = todayISO();
            const manana = new Date(new Date(`${hoy}T05:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
            const { data: ordenes, error } = await db
                .from('orders')
                .select(`
                    id, order_number, status, customer_name,
                    total_amount, notes, created_at,
                    order_items (
                        id, quantity, unit_price, notes, item_status,
                        menu_items ( name )
                    )
                `)
                .eq('restaurant_id', State.restaurantId)
                .gte('created_at', `${hoy}T05:00:00Z`)
                .lt('created_at', `${manana}T05:00:00Z`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            HistState.pedidos = ordenes || [];

            HistState.cargado = true;
            this._render();
            this._suscribirRealtime();
        } catch (err) {
            console.error('[Hist] Error:', err);
            _histSetError(`No se pudo cargar el historial: ${err.message}`);
        } finally {
            HistState.cargando = false;   // liberar semáforo siempre
        }
    },

    cargarSiNecesario() {
        if (HistState.cargado) {
            this._render();
        } else {
            this.cargar();
        }
    },

    async recargar() {
        const btn = document.getElementById('btn-refresh-hist');
        btn?.classList.add('spinning');
        await this.cargar();
        btn?.classList.remove('spinning');
        Toast.ok('Historial actualizado');
    },

    filtrar(valor, btnEl) {
        HistState.filtro = valor;
        document.querySelectorAll('.hfilt-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
        this._render();
    },

    _pedidosFiltrados() {
        if (HistState.filtro === 'todos') return HistState.pedidos;
        return HistState.pedidos.filter(p => _parsearNota(p.notes).tipo === HistState.filtro);
    },

    _render() {
        const total      = HistState.pedidos.length;
        const pendientes = HistState.pedidos.filter(p => p.status === 'pending' || p.status === 'preparing').length;
        const entregados = HistState.pedidos.filter(p => p.status === 'delivered').length;

        const set = (id,v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
        set('st-total',      total);
        set('st-pendientes', pendientes);
        set('st-entregados', entregados);

        const badge = document.getElementById('badge-pendientes');
        if (badge) {
            badge.textContent = pendientes;
            badge.classList.toggle('visible', pendientes > 0);
        }

        const fechaEl = document.getElementById('hist-fecha');
        if (fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-CO',
            { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/Bogota' });

        const lista = document.getElementById('hist-lista');
        if (!lista) return;
        lista.innerHTML = '';

        const items = this._pedidosFiltrados();

        if (items.length === 0) {
            lista.innerHTML = `
                <div class="empty-state" style="padding:56px 28px;">
                    <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b4b4aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg></div>
                    <p>${HistState.pedidos.length === 0
                        ? 'Aún no hay pedidos hoy.'
                        : 'No hay pedidos en esta categoría.'}</p>
                </div>`;
            return;
        }

        items.forEach((pedido, i) => {
            const card = _crearTarjetaPedido(pedido, i);
            lista.appendChild(card);
        });
    },

    _suscribirRealtime() {
        if (!State.restaurantId) return;

        // No recrear el canal si ya está activo — evita duplicados
        if (HistState.realtimeChannel) return;

        HistState.realtimeChannel = db
            .channel(`mateus-hist-v742-${State.restaurantId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'orders',
                filter: `restaurant_id=eq.${State.restaurantId}`,
            }, (payload) => {
                // Ignorar si ya hay una carga en curso
                if (HistState.cargando) return;

                const esNueva = payload.eventType === 'INSERT';
                Hist.cargar().then(() => {
                    if (esNueva) Toast.ok('Nuevo pedido registrado');
                });
            })
            .subscribe();
    },
};

function _histSetLoader(activo) {
    const lista = document.getElementById('hist-lista');
    if (activo && lista) {
        lista.innerHTML = `<div class="hist-loader"><div class="spinner-sm"></div><p>Cargando pedidos…</p></div>`;
    }
}

function _histSetError(msg) {
    const lista = document.getElementById('hist-lista');
    if (lista) lista.innerHTML = `
        <div class="empty-state" style="padding:56px 28px;">
            <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            <p>${msg}</p>
            <button onclick="Hist.recargar()"
                style="margin-top:12px;padding:11px 24px;border-radius:9999px;
                       background:var(--oliva);color:#fff;border:none;
                       font-family:'DM Sans',sans-serif;font-size:13px;
                       font-weight:500;cursor:pointer;">
                Reintentar
            </button>
        </div>`;
}

function _crearTarjetaPedido(pedido, idx) {
    const { tipo, destino, cliente, direccion, nota } = _parsearNota(pedido.notes);

    const tipoIcons  = { mesa:'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>', llevar:'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>', domicilio:'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1d5fa8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' };
    const tipoLabels = { mesa:'Mesa', llevar:'Para Llevar', domicilio:'Domicilio' };
    const statusLabels = {
        pending:'Pendiente', preparing:'En cocina',
        ready:'Listo', delivered:'Entregado', cancelled:'Cancelado',
    };

    const statusClass = pedido.status || 'pending';
    const nombreMostrar = pedido.customer_name || cliente || '';
    const editable = ESTADOS_EDITABLES.includes(pedido.status);

    const items = pedido.order_items || [];
    const itemsHTML = items.length > 0
        ? items.map(it => {
            // Formato: [nombre]Proteína · Principio | Nota  o  [adicional]Nombre
            let nombreCompleto = it.menu_items?.name || '';
            let notaItem = '';
            let esAdicional = false;
            if (it.notes && it.notes.startsWith('[adicional]')) {
                nombreCompleto = it.notes.slice(11).trim();
                esAdicional = true;
            } else if (it.notes && it.notes.startsWith('[nombre]')) {
                const sinPrefijo = it.notes.slice(8);
                const partes     = sinPrefijo.split(' | ');
                nombreCompleto   = partes[0] || nombreCompleto;
                notaItem         = partes.slice(1).join(' · ').trim();
            } else if (!nombreCompleto && it.notes) {
                nombreCompleto = it.notes;
            }
            if (!nombreCompleto) nombreCompleto = 'Ítem';

            if (esAdicional) {
                const precio = Number(it.unit_price) || 0;
                return `<div class="item-row" style="flex-direction:column;align-items:flex-start;gap:2px;padding-bottom:8px;border-bottom:1px solid var(--border-lt);margin-bottom:4px;">
                    <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:10px;font-weight:700;background:#22c55e;color:#fff;border-radius:999px;padding:2px 7px;">PORCIÓN</span>
                            <span class="item-name">${nombreCompleto}</span>
                        </div>
                        <span class="item-price">${precio > 0 ? formatCOP(precio) : '—'}</span>
                    </div>
                </div>`;
            }

            // Separar proteína y principio (guardados como "Proteína · Principio")
            const parteNombre = nombreCompleto.split(' · ');
            const proteina    = parteNombre[0];
            const principio   = parteNombre.slice(1).join(' · ');

            const precio = Number(it.unit_price) || 0;
            return `<div class="item-row" style="flex-direction:column;align-items:flex-start;gap:2px;padding-bottom:8px;border-bottom:1px solid var(--border-lt);margin-bottom:4px;">
                <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div class="item-qty">${it.quantity}</div>
                        <span class="item-name">${proteina}</span>
                    </div>
                    <span class="item-price">${precio > 0 ? formatCOP(precio * it.quantity) : '—'}</span>
                </div>
                ${principio ? `<div style="font-size:12px;color:var(--oliva);padding-left:28px;">🥘 ${principio}</div>` : ''}
                ${notaItem  ? `<div style="font-size:12px;color:#b45309;padding-left:28px;">✏️ ${notaItem}</div>`  : ''}
            </div>`;
        }).join('')
        : `<p style="font-size:12.5px;color:var(--ink-ghost);padding:4px 0;">Sin detalle de ítems.</p>`;

    const direccionHTML = (tipo === 'domicilio' && direccion)
        ? `<div class="card-direccion">
               <span style="display:inline-flex;flex-shrink:0;margin-top:1px;"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d5fa8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
               <span class="card-direccion-text">${direccion}</span>
           </div>` : '';

    const notaHTML = nota
        ? `<div class="card-nota">
               <span style="display:inline-flex;flex-shrink:0;margin-top:1px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
               <span class="card-nota-text">${nota}</span>
           </div>` : '';

    const editarBtnHTML = editable
        ? `<button class="btn-editar-pedido" onclick="EditarPedido.abrir('${pedido.id}')" title="Editar este pedido">
               <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar pedido
           </button>`
        : '';

    const bodyId = `hbody-${pedido.id}`;
    const chevId = `hchev-${pedido.id}`;

    const card = document.createElement('div');
    card.className = 'order-card';
    card.style.animationDelay = `${idx * 0.04}s`;

    card.innerHTML = `
        <div class="card-head" onclick="toggleHistCard('${bodyId}','${chevId}')">
            <div class="card-head-left">
                <div class="card-tipo">
                    <span style="font-size:13px;">${tipoIcons[tipo]||'<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>'}</span>
                    <span class="tipo-text ${tipo}">${tipoLabels[tipo]||tipo}</span>
                </div>
                <p class="card-destino">${destino}</p>
                ${nombreMostrar ? `<p class="card-cliente"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#78786e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${nombreMostrar}</p>` : ''}
                <p class="card-hora"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b4b4aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${_horaCorta(pedido.created_at)}</p>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <span class="status-badge ${statusClass}">${statusLabels[statusClass]||statusClass}</span>
                <span class="card-chevron" id="${chevId}">▼</span>
            </div>
        </div>
        <div class="card-body" id="${bodyId}">
            ${direccionHTML}
            ${notaHTML}
            <div>${itemsHTML}</div>
            <div class="card-total-row">
                <span class="card-total-label">Total</span>
                <span class="card-total-monto">${formatCOP(pedido.total_amount)}</span>
            </div>
            <p class="card-order-no"># ${pedido.order_number || '—'}</p>
            ${editarBtnHTML}
        </div>`;

    return card;
}

function toggleHistCard(bodyId, chevId) {
    const body = document.getElementById(bodyId);
    const chev = document.getElementById(chevId);
    if (!body) return;
    const abierto = body.classList.toggle('open');
    if (chev) chev.classList.toggle('open', abierto);
}

// ============================================================
// ═══ MÓDULO EDITAR PEDIDO (v7.4) ═══
// ============================================================

const EditarPedido = {
    _pedidoId:    null,
    _pedido:      null,
    _itemsEdit:   [],
    _notaEdit:    '',
    _guardando:   false,
    _tablas:      [],

    async abrir(pedidoId) {
        this._pedidoId  = pedidoId;
        this._guardando = false;

        const modal = document.getElementById('edit-modal');
        if (!modal) return;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        _editSetLoader(true);

        try {
            const { data: pedido, error } = await db
                .from('orders')
                .select(`
                    id, order_number, status, notes, total_amount,
                    order_items (
                        id, quantity, unit_price, notes, item_status,
                        menu_item_id,
                        menu_items ( name )
                    )
                `)
                .eq('id', pedidoId)
                .single();

            if (error) throw error;
            if (!pedido) throw new Error('Pedido no encontrado.');

            if (!ESTADOS_EDITABLES.includes(pedido.status)) {
                _editSetError(`Este pedido no se puede editar (estado: ${pedido.status}).`);
                return;
            }

            this._pedido = pedido;

            // Cargar lista de mesas para el selector
            const { data: tablasData } = await db.from('tables')
                .select('id, label, number').order('number', { ascending: true });
            this._tablas = (tablasData || []).map(t => ({ id: t.id, label: t.label || String(t.number || '') }));

            const parsed = _parsearNota(pedido.notes);
            this._notaEdit = parsed.nota;

            this._itemsEdit = (pedido.order_items || []).map(it => {
                let nombre = it.menu_items?.name || '';
                if (!nombre && it.notes) {
                    const m = it.notes.match(/\[nombre\](.+)/);
                    nombre = m ? m[1] : 'Ítem';
                }
                return {
                    id:          it.id,
                    menuItemId:  it.menu_item_id,
                    nombre:      nombre || 'Ítem',
                    precio:      Number(it.unit_price) || 0,
                    cantidad:    it.quantity,
                    item_status: it.item_status || 'pending',
                    esNuevo:     false,
                    eliminado:   false,
                };
            });

            this._renderEditor();

        } catch (err) {
            console.error('[EditarPedido] Error al abrir:', err);
            _editSetError(`No se pudo cargar el pedido: ${err.message}`);
        }
    },

    cerrar() {
        const modal = document.getElementById('edit-modal');
        if (modal) modal.classList.remove('open');
        document.body.style.overflow = '';
        this._pedidoId  = null;
        this._pedido    = null;
        this._itemsEdit = [];
        this._notaEdit  = '';
        this._guardando = false;
    },

    _renderEditor() {
        const contenedor = document.getElementById('edit-modal-body');
        if (!contenedor) return;

        const parsed  = _parsearNota(this._pedido.notes);
        const statusLabels = {
            pending:'Pendiente', preparing:'En cocina',
            ready:'Listo', delivered:'Entregado', cancelled:'Cancelado', confirmed:'Confirmado',
        };

        const tituloHTML = `
            <div class="edit-pedido-titulo">
                <span class="edit-order-no"># ${this._pedido.order_number || '—'}</span>
                <span class="status-badge ${this._pedido.status}">${statusLabels[this._pedido.status] || this._pedido.status}</span>
            </div>
            <p class="edit-destino-label">${parsed.destino}${parsed.cliente ? ` · ${parsed.cliente}` : ''}</p>`;

        const itemsHTML = this._itemsEdit
            .filter(it => !it.eliminado)
            .map((it, i) => this._renderItemRow(it, i))
            .join('');

        const slotsDisponibles = State.slots.filter(s => s.disponible);
        const opcionesSlots = slotsDisponibles.map(s =>
            `<option value="${s.id}">${s.nombre}${s.precio > 0 ? ' — ' + formatCOP(s.precio) : ' (Incluido)'}</option>`
        ).join('');

        contenedor.innerHTML = `
            ${tituloHTML}

            <div class="edit-section">
                <p class="edit-section-title">Ítems del pedido</p>
                <div id="edit-items-list">
                    ${itemsHTML || '<p class="edit-empty-items">Sin ítems.</p>'}
                </div>
            </div>

            <div class="edit-section">
                <p class="edit-section-title">Agregar ítem</p>
                <div class="edit-agregar-row">
                    <select id="edit-slot-select" class="form-input edit-select" onchange="EditarPedido._onSlotChange()">
                        <option value="">— Selecciona un plato o bebida —</option>
                        ${opcionesSlots}
                    </select>
                </div>
                <div id="edit-proteina-extra" style="display:none;margin-top:10px;background:var(--oliva-pale);border:1.5px solid var(--oliva-bd);border-radius:14px;padding:14px 16px;display:none;flex-direction:column;gap:10px;">
                    <div>
                        <div class="plato-section-label">🥘 Principio</div>
                        <select id="edit-principio-select" class="plato-select">
                            <option value="">— Sin principio —</option>
                            ${State.slots.filter(s => s.itemType === 'side' && s.disponible).map(s =>
                                `<option value="${s.id}">${s.nombre}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <div class="plato-section-label">✏️ Nota del plato</div>
                        <input id="edit-nota-plato" class="plato-input" type="text" placeholder="Ej: sin ensalada, sin cebolla…">
                    </div>
                </div>
                <div class="edit-qty-row" style="margin-top:10px;">
                    <button class="edit-qty-btn" onclick="EditarPedido._decrementarNuevo()">−</button>
                    <span id="edit-nueva-qty" class="edit-qty-num">1</span>
                    <button class="edit-qty-btn" onclick="EditarPedido._incrementarNuevo()">+</button>
                    <button class="btn-agregar-item" onclick="EditarPedido._agregarItem()">Agregar</button>
                </div>
            </div>

            <div class="edit-section">
                <p class="edit-section-title">Agregar porción / adicional</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <input id="edit-adicional-nombre" class="form-input" type="text"
                        placeholder="Ej: Porción de pollo"
                        style="flex:2;min-width:130px;">
                    <input id="edit-adicional-precio" class="form-input" type="number" min="0" step="500"
                        placeholder="Precio"
                        style="flex:1;min-width:90px;">
                    <button class="btn-agregar-item" onclick="EditarPedido._agregarAdicional()">Agregar</button>
                </div>
            </div>

            ${(this._pedido.notes || '').includes('[MESA]') ? `
            <div class="edit-section">
                <p class="edit-section-title">Cambiar mesa</p>
                <input id="edit-inp-mesa" type="text" class="form-input" placeholder="Ej: 1, 2, 5…">
            </div>` : ''}

            <div class="edit-section">
                <p class="edit-section-title">Nota del pedido</p>
                <textarea id="edit-nota-input" class="form-input" rows="2"
                    placeholder="Sin picante, sin cebolla, alergia a…">${this._notaEdit}</textarea>
            </div>

            <div class="edit-total-preview">
                <span class="edit-total-label">Total estimado</span>
                <span id="edit-total-monto" class="edit-total-monto">${formatCOP(this._calcularTotalEdit())}</span>
            </div>`;

        this._nuevaQty = 1;
        _editSetLoader(false);
    },

    _renderItemRow(it, i) {
        const noEliminable = ITEM_ESTADOS_NO_ELIMINABLES.includes(it.item_status) && !it.esNuevo;
        const precioStr    = it.precio > 0 ? formatCOP(it.precio) : 'Incl.';
        const subtotalStr  = it.precio > 0 ? formatCOP(it.precio * it.cantidad) : '—';

        return `
            <div class="edit-item-row" id="edit-item-row-${it.id || 'new-'+i}">
                <div class="edit-item-info">
                    <span class="edit-item-nombre">${it.nombre}</span>
                    <span class="edit-item-precio">${precioStr} c/u</span>
                </div>
                <div class="edit-item-ctrl">
                    <button class="edit-qty-btn" onclick="EditarPedido._cambiarCantidad('${it.id || 'new-'+i}', -1)"
                        ${it.cantidad <= 1 && noEliminable ? 'disabled title="No se puede reducir: ítem en cocina"' : ''}>−</button>
                    <span class="edit-qty-num">${it.cantidad}</span>
                    <button class="edit-qty-btn" onclick="EditarPedido._cambiarCantidad('${it.id || 'new-'+i}', +1)">+</button>
                    <span class="edit-item-subtotal">${subtotalStr}</span>
                    ${noEliminable
                        ? `<span class="edit-item-lock" title="En cocina, no se puede eliminar"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>`
                        : `<button class="edit-item-del" onclick="EditarPedido._eliminarItem('${it.id || 'new-'+i}')" title="Eliminar">✕</button>`
                    }
                </div>
            </div>`;
    },

    _nuevaQty: 1,

    _onSlotChange() {
        const select = document.getElementById('edit-slot-select');
        const extra  = document.getElementById('edit-proteina-extra');
        if (!select || !extra) return;
        const slot = State.slots.find(s => s.id === select.value);
        const esProteina = slot && (slot.itemType === 'protein' || slot.itemType === 'executive_lunch');
        extra.style.display = esProteina ? 'flex' : 'none';
        if (!esProteina) {
            const ps = document.getElementById('edit-principio-select');
            const np = document.getElementById('edit-nota-plato');
            if (ps) ps.value = '';
            if (np) np.value = '';
        }
    },

    _decrementarNuevo() {
        if (this._nuevaQty > 1) {
            this._nuevaQty--;
            const el = document.getElementById('edit-nueva-qty');
            if (el) el.textContent = this._nuevaQty;
        }
    },

    _incrementarNuevo() {
        this._nuevaQty++;
        const el = document.getElementById('edit-nueva-qty');
        if (el) el.textContent = this._nuevaQty;
    },

    _agregarItem() {
        const select = document.getElementById('edit-slot-select');
        const slotId = select?.value;
        if (!slotId) { Toast.error('Selecciona un plato o bebida.'); return; }

        const slot = State.slots.find(s => s.id === slotId);
        if (!slot) return;

        const esProteina = slot.itemType === 'protein' || slot.itemType === 'executive_lunch';
        let principioNombre = '';
        let notaPlato       = '';
        if (esProteina) {
            const ps = document.getElementById('edit-principio-select');
            const np = document.getElementById('edit-nota-plato');
            const sidId = ps?.value;
            if (sidId) {
                const side = State.slots.find(s => s.id === sidId);
                if (side) principioNombre = side.nombre;
            }
            notaPlato = (np?.value || '').trim();
        }

        const nombreCompleto = principioNombre
            ? `${slot.nombre} · ${principioNombre}`
            : slot.nombre;
        const partesNota = [];
        if (notaPlato) partesNota.push(notaPlato);
        const notesItem = `[nombre]${nombreCompleto}${partesNota.length ? ' | ' + partesNota.join(' · ') : ''}`;

        this._itemsEdit.push({
            id:          `new-${Date.now()}`,
            menuItemId:  slot.menuItemId,
            nombre:      nombreCompleto,
            notesItem,
            precio:      slot.precio,
            cantidad:    this._nuevaQty,
            item_status: 'pending',
            esNuevo:     true,
            eliminado:   false,
        });

        if (select) select.value = '';
        const extra = document.getElementById('edit-proteina-extra');
        if (extra) extra.style.display = 'none';
        const ps2 = document.getElementById('edit-principio-select');
        const np2 = document.getElementById('edit-nota-plato');
        if (ps2) ps2.value = '';
        if (np2) np2.value = '';
        this._nuevaQty = 1;
        const qtyEl = document.getElementById('edit-nueva-qty');
        if (qtyEl) qtyEl.textContent = '1';

        this._refrescarListaItems();
        this._actualizarTotalPreview();
        Toast.ok(`"${nombreCompleto}" agregado al pedido.`);
    },

    _agregarAdicional() {
        const nombreEl = document.getElementById('edit-adicional-nombre');
        const precioEl = document.getElementById('edit-adicional-precio');
        const nombre   = (nombreEl?.value || '').trim();
        const precio   = Number(precioEl?.value) || 0;
        if (!nombre) { Toast.error('Escribe el nombre de la porción o adicional.'); return; }

        this._itemsEdit.push({
            id:          `new-${Date.now()}`,
            menuItemId:  null,
            nombre:      nombre,
            notesItem:   `[adicional]${nombre}`,
            precio:      precio,
            cantidad:    1,
            item_status: 'pending',
            esNuevo:     true,
            eliminado:   false,
        });

        if (nombreEl) nombreEl.value = '';
        if (precioEl) precioEl.value = '';
        this._refrescarListaItems();
        this._actualizarTotalPreview();
        Toast.ok(`"${nombre}" agregado como porción/adicional.`);
    },

    _cambiarCantidad(itemId, delta) {
        const it = this._itemsEdit.find(i => i.id === itemId);
        if (!it || it.eliminado) return;

        const noEliminable = ITEM_ESTADOS_NO_ELIMINABLES.includes(it.item_status) && !it.esNuevo;
        const nueva = it.cantidad + delta;

        if (nueva <= 0) {
            if (noEliminable) {
                Toast.error(`No se puede eliminar "${it.nombre}": ya está en cocina.`);
                return;
            }
            it.eliminado = true;
        } else {
            it.cantidad = nueva;
        }

        this._refrescarListaItems();
        this._actualizarTotalPreview();
    },

    _eliminarItem(itemId) {
        const it = this._itemsEdit.find(i => i.id === itemId);
        if (!it) return;

        const noEliminable = ITEM_ESTADOS_NO_ELIMINABLES.includes(it.item_status) && !it.esNuevo;
        if (noEliminable) {
            Toast.error(`No se puede eliminar "${it.nombre}": ya está en cocina.`);
            return;
        }

        it.eliminado = true;
        this._refrescarListaItems();
        this._actualizarTotalPreview();
    },

    _refrescarListaItems() {
        const lista = document.getElementById('edit-items-list');
        if (!lista) return;
        const activos = this._itemsEdit.filter(it => !it.eliminado);
        if (activos.length === 0) {
            lista.innerHTML = '<p class="edit-empty-items">Sin ítems.</p>';
            return;
        }
        lista.innerHTML = activos.map((it, i) => this._renderItemRow(it, i)).join('');
    },

    _calcularTotalEdit() {
        return this._itemsEdit
            .filter(it => !it.eliminado)
            .reduce((acc, it) => acc + it.precio * it.cantidad, 0);
    },

    _actualizarTotalPreview() {
        const el = document.getElementById('edit-total-monto');
        if (el) el.textContent = formatCOP(this._calcularTotalEdit());
    },

    async guardar() {
        if (this._guardando) return;
        if (!this._pedidoId || !this._pedido) return;

        const btnGuardar = document.getElementById('edit-btn-guardar');
        this._guardando = true;
        if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando…'; }

        try {
            // Cambio de mesa (solo órdenes de mesa)
            const inpMesa = document.getElementById('edit-inp-mesa');
            if (inpMesa && inpMesa.value.trim()) {
                const labelDigitado = inpMesa.value.trim();
                const mesaEncontrada = this._tablas.find(t => t.label === labelDigitado || t.label === String(parseInt(labelDigitado)));
                if (!mesaEncontrada) {
                    alert(`Mesa "${labelDigitado}" no existe. Verifica el número.`);
                    this._guardando = false;
                    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar'; }
                    return;
                }
                const nuevaTableId = mesaEncontrada.id;
                const nuevaLabel   = mesaEncontrada.label;
                const notasMesa    = (this._pedido.notes || '')
                    .replace(/(\[MESA\]\s*Mesa:\s*)[^|]*/i, `$1${nuevaLabel} `).trim();
                await db.from('orders')
                    .update({ table_id: nuevaTableId, notes: notasMesa })
                    .eq('id', this._pedidoId);
                this._pedido.notes = notasMesa;
            }

            const notaInput = document.getElementById('edit-nota-input');
            const nuevaNota = (notaInput?.value || '').trim();

            const parsed = _parsearNota(this._pedido.notes);
            let notaBase = this._pedido.notes || '';
            notaBase = notaBase.replace(/\s*\|\s*Nota:\s*.+$/, '');
            if (nuevaNota) notaBase += ` | Nota: ${nuevaNota}`;
            const notaFinal = notaBase.trim();

            if (window.MateusCore) {
                const resultado = await MateusCore.guardarEdicionAdmin(
                    this._pedidoId,
                    this._itemsEdit,
                    notaFinal,
                    State.restaurantId
                );
                if (!resultado.ok) {
                    Toast.error(resultado.error || 'No se pudo guardar.');
                    return;
                }
            } else {
                await this._guardarLegacy(notaFinal);
            }

            Toast.ok('Pedido actualizado correctamente.');
            this.cerrar();
            await Hist.cargar();

        } catch (err) {
            console.error('[EditarPedido] Error al guardar:', err);
            Toast.error('No se pudo guardar. Verifica tu conexión.', 5000);
        } finally {
            this._guardando = false;
            const btn = document.getElementById('edit-btn-guardar');
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
        }
    },

    async _guardarLegacy(notaFinal) {
        const pedidoId        = this._pedidoId;
        const pedido          = this._pedido;
        const itemsOriginales = pedido.order_items || [];
        const idsOriginales   = new Set(itemsOriginales.map(i => i.id));

        const aEliminar  = this._itemsEdit.filter(it => it.eliminado && !it.esNuevo && idsOriginales.has(it.id));
        const aActualizar = this._itemsEdit.filter(it => !it.eliminado && !it.esNuevo && idsOriginales.has(it.id));
        const aNuevos    = this._itemsEdit.filter(it => it.esNuevo && !it.eliminado);

        for (const it of aEliminar) {
            const { error } = await db.from('order_items').delete().eq('id', it.id);
            if (error) console.warn('[EditarPedido] Error eliminando ítem:', error.message);
        }

        for (const it of aActualizar) {
            const original = itemsOriginales.find(o => o.id === it.id);
            if (original && original.quantity !== it.cantidad) {
                const { error } = await db.from('order_items')
                    .update({ quantity: it.cantidad })
                    .eq('id', it.id);
                if (error) console.warn('[EditarPedido] Error actualizando cantidad:', error.message);
            }
        }

        if (aNuevos.length > 0) {
            const { data: todosMenuItems } = await db.from('menu_items')
                .select('id,name').eq('restaurant_id', State.restaurantId).eq('is_active', true);
            const listaMenu = todosMenuItems || [];

            const payloadNuevos = aNuevos.map(it => {
                let menuItemId = it.menuItemId;
                if (!menuItemId && listaMenu.length > 0) {
                    const nb = (it.nombre || '').toLowerCase().trim();
                    const ex = listaMenu.find(m => m.name.toLowerCase().trim() === nb);
                    menuItemId = ex?.id || listaMenu[0]?.id || null;
                }
                return {
                    order_id:     pedidoId,
                    menu_item_id: menuItemId,
                    quantity:     it.cantidad,
                    unit_price:   it.precio,
                    item_status:  'pending',
                    product_name: it.nombre,
                    notes:        it.notesItem || `[nombre]${it.nombre}`,
                };
            });

            const { error: errNuevos } = await db.from('order_items').insert(payloadNuevos);
            if (errNuevos) {
                if (errNuevos.code === '42703' || errNuevos.message?.includes('product_name')) {
                    const p2 = payloadNuevos.map(({ product_name, ...rest }) => rest);
                    const { error: err2 } = await db.from('order_items').insert(p2);
                    if (err2) console.warn('[EditarPedido] Error insertando nuevos ítems:', err2.message);
                } else {
                    console.warn('[EditarPedido] Error insertando nuevos ítems:', errNuevos.message);
                }
            }
        }

        const nuevoTotal = this._calcularTotalEdit();
        const { error: errUpdate } = await db.from('orders')
            .update({
                total_amount: nuevoTotal,
                notes:        notaFinal,
                updated_at:   new Date().toISOString(),
            })
            .eq('id', pedidoId);
        if (errUpdate) console.warn('[EditarPedido] Error actualizando orden:', errUpdate.message);
    },
};

function _editSetLoader(activo) {
    const body   = document.getElementById('edit-modal-body');
    const footer = document.getElementById('edit-modal-footer');
    if (activo) {
        if (body) body.innerHTML = `
            <div class="hist-loader" style="padding:60px 0;">
                <div class="spinner-sm"></div>
                <p>Cargando pedido…</p>
            </div>`;
        if (footer) footer.style.display = 'none';
    } else {
        if (footer) footer.style.display = 'flex';
    }
}

function _editSetError(msg) {
    const body   = document.getElementById('edit-modal-body');
    const footer = document.getElementById('edit-modal-footer');
    if (body) body.innerHTML = `
        <div class="empty-state" style="padding:56px 28px;">
            <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            <p>${msg}</p>
        </div>`;
    if (footer) footer.style.display = 'none';
}

// ============================================================
// VERIFICAR SI EL SISTEMA ESTÁ HABILITADO
// ============================================================
async function _verificarSistemaHabilitado() {
    try {
        const { data, error } = await db
            .from('system_settings')
            .select('value')
            .eq('key', 'orders_enabled')
            .maybeSingle();

        if (error || !data) return true;

        const habilitado = data.value === 'true';
        if (!habilitado) _mostrarPantallaFueraDeServicio();
        return habilitado;
    } catch (_) {
        return true;
    }
}

function _mostrarPantallaFueraDeServicio() {
    const carta     = document.getElementById('vista-carta');
    const historial = document.getElementById('vista-historial');
    const cartBar   = document.getElementById('cart-bar');
    const catsBar   = document.getElementById('cats-bar');
    if (carta)     carta.style.display     = 'none';
    if (historial) historial.style.display = 'none';
    if (cartBar)   cartBar.style.display   = 'none';
    if (catsBar)   catsBar.style.display   = 'none';

    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = `
            <div style="text-align:center;padding:40px 20px;max-width:300px;">
                <div style="margin-bottom:20px;display:flex;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d94e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;
                           font-weight:400;color:var(--ink);margin-bottom:12px;line-height:1.2;">
                    Sistema fuera<br>de servicio
                </h2>
                <p style="font-size:13px;color:var(--ink-muted);line-height:1.65;">
                    El restaurante no está recibiendo pedidos en este momento.<br>
                    Consulta con el administrador.
                </p>
            </div>`;
    }
}

// ============================================================
// INIT
// ============================================================
(async function init() {
    try {
        _programarResetMedianoche();
        await Sesion.requerir();

        // ── Verificar si el sistema está habilitado ──
        const _sistemaHabilitado = await _verificarSistemaHabilitado();
        if (!_sistemaHabilitado) return;

        await _resolverRestaurant();
        await Menu.cargar();

        // MateusCore como canal adicional de realtime si está disponible
        if (window.MateusCore && State.restaurantId) {
            MateusCore.suscribirRealtime(State.restaurantId);

            MateusCore.on('onMenuItemChange', ({ payload }) => {
                const item = payload?.new;
                if (!item?.id) return;
                _actualizarSlotDesdeRealtime(item);
            });

            MateusCore.on('onOrderChange', () => {
                if (HistState.cargado) {
                    setTimeout(() => Hist.cargar(), 600);
                }
            });
        }

        // ── Notificaciones de despacho desde cocina ──────────
        _suscribirNotificacionesCocina();
        // ─────────────────────────────────────────────────────

    } catch (err) {
        console.error('[Mateus] Error crítico en init:', err);
        _mostrarEstado('error', `Error al iniciar la carta: ${err.message}`);
    }
})();

// ============================================================
// NOTIFICACIONES DE DESPACHO PARA EL MESERO
// ============================================================
let _ultimaNotifId = null;

function _suscribirNotificacionesCocina() {
    // ── 1. Realtime (principal) ──────────────────────────
    db.channel('waiter-notif-v1')
        .on('postgres_changes', {
            event:  'INSERT',
            schema: 'public',
            table:  'waiter_notifications',
        }, (payload) => {
            const n = payload.new;
            if (!n) return;
            _ultimaNotifId = n.id;
            _mostrarNotificacionDespacho(n);
        })
        .subscribe((status) => {
            console.info('[Mateus] Canal notif mesero:', status);
        });

    // ── 2. Polling fallback (cada 5 s) ──────────────────
    setInterval(async () => {
        try {
            const { data, error } = await db
                .from('waiter_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(3);

            if (error) { console.warn('[Notif mesero] polling error:', error.message); return; }
            if (!data || data.length === 0) return;

            // Mostrar solo notifs no leídas y no mostradas aún
            for (const n of data) {
                if (n.leida) continue;
                if (n.id === _ultimaNotifId) continue;
                _ultimaNotifId = n.id;
                // Marcar como leída PRIMERO para que no se repita aunque falle el display
                await db.from('waiter_notifications').update({ leida: true }).eq('id', n.id);
                _mostrarNotificacionDespacho(n);
                break; // una a la vez
            }
        } catch(e) { console.warn('[Notif mesero] polling excepción:', e); }
    }, 5000);
}

function _mostrarNotificacionDespacho(n) {
    // Vibración en móvil
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 400]);
    }

    // Sonido de notificación
    _sonarNotificacionMesero();

    // Toast visual con los platos
    const platosTexto = Array.isArray(n.platos) && n.platos.length > 0
        ? n.platos.join(', ')
        : 'Pedido listo';

    const mesa = n.mesa || 'Mesa';

    // Banner grande visible
    _mostrarBannerDespacho(mesa, platosTexto, n.order_number);
}

function _sonarNotificacionMesero() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        // Tres tonos ascendentes más llamativos que los de cocina
        [[880, 0], [1047, 0.18], [1318, 0.36]].forEach(([freq, offset]) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + offset);
            gain.gain.setValueAtTime(0,    now + offset);
            gain.gain.linearRampToValueAtTime(0.22, now + offset + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.45);
            osc.start(now + offset);
            osc.stop(now  + offset + 0.5);
        });
    } catch(e) { /* silencioso si no hay contexto de audio */ }
}

function _mostrarBannerDespacho(mesa, platos, orderNumber) {
    // Crear o reutilizar el banner de despacho
    let banner = document.getElementById('banner-despacho-mesero');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'banner-despacho-mesero';
        Object.assign(banner.style, {
            position:     'fixed',
            top:          '0',
            left:         '0',
            right:        '0',
            zIndex:       '99999',
            background:   'linear-gradient(135deg,#4a6741,#2e4028)',
            color:        '#fff',
            padding:      '18px 20px 14px',
            boxShadow:    '0 6px 32px rgba(0,0,0,0.28)',
            fontFamily:   "'DM Sans',sans-serif",
            display:      'none',
            flexDirection:'column',
            gap:          '6px',
            borderBottom: '3px solid #a3c96e',
            animation:    'slideDownBanner .35s ease',
        });
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                @keyframes slideDownBanner {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                #banner-despacho-mesero .bd-title {
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: .2px;
                }
                #banner-despacho-mesero .bd-platos {
                    font-size: 13px;
                    opacity: .88;
                    font-weight: 500;
                }
                #banner-despacho-mesero .bd-dismiss {
                    position:absolute; top:10px; right:14px;
                    background:rgba(255,255,255,.18); border:none;
                    color:#fff; border-radius:50%; width:26px; height:26px;
                    font-size:14px; cursor:pointer; line-height:1;
                    display:flex; align-items:center; justify-content:center;
                }
            </style>
        `);
        document.body.appendChild(banner);
    }

    const numText = orderNumber ? ` · ${orderNumber}` : '';
    banner.innerHTML = `
        <div class="bd-title">🍽️ Pedido listo para entregar — ${_esc(mesa)}${_esc(numText)}</div>
        <div class="bd-platos">📋 ${_esc(platos)}</div>
        <button class="bd-dismiss" onclick="document.getElementById('banner-despacho-mesero').style.display='none'">✕</button>
    `;
    banner.style.display      = 'flex';
    banner.style.animation    = 'none';
    banner.offsetHeight; // reflow
    banner.style.animation    = 'slideDownBanner .35s ease';

    // Toast adicional
    // Auto-ocultar después de 12 segundos
    clearTimeout(banner._autoHide);
    banner._autoHide = setTimeout(() => {
        banner.style.display = 'none';
    }, 12000);
}

// Helper local de escape (igual al de app.js)
function _esc(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}