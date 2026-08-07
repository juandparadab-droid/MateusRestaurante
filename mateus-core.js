// ============================================================
// RESTAURANTE MATEUS — mateus-core.js · Versión 1.0
//
// MÓDULO CENTRAL DE LÓGICA COMPARTIDA
// Gestiona: descuento de porciones, descuento de inventario,
// eventos Supabase Realtime y suscripciones cross-pantalla.
//
// Importado por: menu.js, admin.js, app.js
// NO modifica diseño, estilos ni animaciones existentes.
//
// OBJETIVOS QUE RESUELVE:
//  [OBJ-1] Descuento automático de porciones al crear pedido
//  [OBJ-2] Realtime en todas las pantallas (una sola fuente)
//  [OBJ-3] Lógica de edición admin con control de inventario
//
// Bucaramanga, Santander — Colombia
// ============================================================

'use strict';

// ── Asegura disponibilidad global del cliente Supabase ──────
// admin.js y menu.js ya crean `supabaseClient` / `db` antes
// de cargar este módulo. MateusCore los re-usa.
const MateusCore = (function () {

  // ──────────────────────────────────────────────────────────
  // UTILIDADES INTERNAS
  // ──────────────────────────────────────────────────────────
  function _getDB() {
    // Compatibilidad: admin.js usa `supabaseClient`, menu.js usa `db`
    return (typeof supabaseClient !== 'undefined' && supabaseClient)
      || (typeof db !== 'undefined' && db)
      || null;
  }

  function _fmt(v) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(v || 0);
  }

  function _toast(msg, tipo) {
    if (typeof Toast !== 'undefined') {
      if (tipo === 'ok')    Toast.ok(msg);
      if (tipo === 'error') Toast.error(msg);
      if (tipo === 'info')  Toast.info(msg);
    } else {
      console.log(`[MateusCore] [${tipo}] ${msg}`);
    }
  }

  // ──────────────────────────────────────────────────────────
  // OBJ-1 · DESCUENTO AUTOMÁTICO DE PORCIONES
  // ──────────────────────────────────────────────────────────
  // Llamado desde menu.js justo después de insertar la orden.
  // Recibe el array de items del carrito con {menuItemId, cantidad}.
  // Descuenta `cantidad` de `portions_today` en menu_items.
  // Si portions_today llega a 0, is_active → false.
  // ──────────────────────────────────────────────────────────
  async function descontarPorcionesOrden(itemsCarrito) {
    const db = _getDB();
    if (!db || !itemsCarrito || itemsCarrito.length === 0) return;

    const menuItemIds = itemsCarrito
      .map(i => i.menuItemId || i.menu_item_id)
      .filter(Boolean);

    if (menuItemIds.length === 0) return;

    try {
      const { data: platosBD, error } = await db
        .from('menu_items')
        .select('id, name, portions_today, is_active')
        .in('id', menuItemIds);

      if (error) {
        console.warn('[MateusCore] Error leyendo porciones:', error.message);
        return;
      }

      for (const plato of (platosBD || [])) {
        // Solo descontar si la columna existe y tiene valor numérico
        if (plato.portions_today === null || plato.portions_today === undefined) continue;

        const itemPedido = itemsCarrito.find(
          i => (i.menuItemId || i.menu_item_id) === plato.id
        );
        if (!itemPedido) continue;

        const cantVendida = itemPedido.cantidad || itemPedido.quantity || 1;
        const nuevasPorciones = Math.max(0, plato.portions_today - cantVendida);
        const nuevoEstado    = nuevasPorciones > 0 ? plato.is_active : false;

        const payload = { portions_today: nuevasPorciones };
        if (nuevasPorciones === 0) payload.is_active = false;

        const { error: errUp } = await db
          .from('menu_items')
          .update(payload)
          .eq('id', plato.id);

        if (errUp) {
          // Columna portions_today puede no existir en instancias antiguas
          if (errUp.code === '42703') {
            console.warn('[MateusCore] portions_today no existe. SQL: ALTER TABLE menu_items ADD COLUMN portions_today INTEGER;');
          } else {
            console.warn('[MateusCore] Error descontando porciones de', plato.name, ':', errUp.message);
          }
        } else if (nuevasPorciones === 0) {
          console.info(`[MateusCore] "${plato.name}" agotado → is_active=false`);
        }
      }
    } catch (err) {
      console.warn('[MateusCore] descontarPorcionesOrden error:', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────
  // OBJ-1 · DESCUENTO / DEVOLUCIÓN DE INVENTARIO POR PEDIDO
  // ──────────────────────────────────────────────────────────
  // Recibe order_items (lista de ítems) y la dirección
  // (+1 para descontar al vender, -1 para devolver al cancelar/editar).
  // Busca recetas en production_recipes y descuenta insumos.
  // ──────────────────────────────────────────────────────────
  async function ajustarInventarioPorItems(orderItems, direccion = 1) {
    const db = _getDB();
    if (!db || !orderItems || orderItems.length === 0) return;

    try {
      const { data: recetas } = await db
        .from('production_recipes')
        .select(`name, recipe_ingredients (
          supply_id, supply_name, quantity_per_dish, quantity_required, unit
        )`);

      if (!recetas || recetas.length === 0) return;

      const menuItemIds = orderItems
        .map(i => i.menu_item_id || i.menuItemId)
        .filter(Boolean);

      let menuMap = {};
      if (menuItemIds.length > 0) {
        const { data: mis } = await db
          .from('menu_items').select('id, name').in('id', menuItemIds);
        (mis || []).forEach(m => { menuMap[m.id] = m.name; });
      }

      const descuentos = {};

      orderItems.forEach(item => {
        let nombrePlato = menuMap[item.menu_item_id || item.menuItemId] || '';
        if (!nombrePlato && (item.notes || '').includes('[nombre]')) {
          nombrePlato = item.notes.split('[nombre]')[1].split('|')[0].trim();
        }
        if (!nombrePlato && item.nombre) nombrePlato = item.nombre;
        if (!nombrePlato) return;

        const receta = recetas.find(r =>
          r.name.toLowerCase().trim() === nombrePlato.toLowerCase().trim() ||
          nombrePlato.toLowerCase().includes(r.name.toLowerCase().split(' ')[0])
        );
        if (!receta?.recipe_ingredients?.length) return;

        const qty = item.quantity || item.cantidad || 1;
        receta.recipe_ingredients.forEach(ing => {
          if (!ing.supply_id) return;
          const qpd = ing.quantity_per_dish ?? ing.quantity_required ?? 0;
          descuentos[ing.supply_id] = (descuentos[ing.supply_id] || 0) + qpd * qty;
        });
      });

      if (Object.keys(descuentos).length === 0) return;

      const supplyIds = Object.keys(descuentos);
      const { data: stocks } = await db
        .from('inventory_supplies')
        .select('id, current_stock')
        .in('id', supplyIds);

      for (const s of (stocks || [])) {
        const delta = (descuentos[s.id] || 0) * direccion;
        const nuevo = Math.max(0, (parseFloat(s.current_stock) || 0) - delta);
        await db
          .from('inventory_supplies')
          .update({ current_stock: nuevo, updated_at: new Date().toISOString() })
          .eq('id', s.id);
      }
    } catch (err) {
      console.warn('[MateusCore] ajustarInventarioPorItems error:', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────
  // OBJ-4 · EDICIÓN ADMIN CON CONTROL DE INVENTARIO
  // Recibe:
  //   orderId       - UUID de la orden en Supabase
  //   itemsEditados - Array de {id?, menuItemId?, nombre, precio, cantidad, esNuevo, eliminado}
  //   notaFinal     - String del campo notes reconstruido
  //
  // Lógica:
  //   1. Elimina items marcados como eliminados
  //   2. Actualiza cantidades de items existentes
  //   3. Inserta items nuevos
  //   4. Recalcula total
  //   5. Actualiza orders.total_amount y notes
  //   6. Ajusta inventario: descuenta nuevos, devuelve eliminados,
  //      descuenta/devuelve diferencias en cantidades
  //
  // Retorna { ok: boolean, nuevoTotal: number, error?: string }
  // ──────────────────────────────────────────────────────────
  async function guardarEdicionAdmin(orderId, itemsEditados, notaFinal, restaurantId) {
    const db = _getDB();
    if (!db) return { ok: false, error: 'Sin conexión a base de datos.' };

    try {
      // ── Cargar estado actual de la orden ──────────────────
      const { data: ordenActual, error: errOrd } = await db
        .from('orders')
        .select(`id, total_amount, notes, order_items (
          id, menu_item_id, quantity, unit_price, item_status, notes
        )`)
        .eq('id', orderId)
        .single();

      if (errOrd || !ordenActual) {
        return { ok: false, error: 'No se encontró la orden.' };
      }

      const itemsOriginales = ordenActual.order_items || [];

      // ── Validar stock para items nuevos y aumentos ────────
      for (const it of itemsEditados.filter(i => !i.eliminado && i.esNuevo)) {
        const stockOk = await _validarStockItem(it, db);
        if (!stockOk) {
          return {
            ok: false,
            error: `No hay suficientes porciones disponibles de "${it.nombre}".`
          };
        }
      }

      // Items con cantidad aumentada
      for (const it of itemsEditados.filter(i => !i.eliminado && !i.esNuevo)) {
        const original = itemsOriginales.find(o => o.id === it.id);
        if (original && it.cantidad > original.quantity) {
          const diff = it.cantidad - original.quantity;
          const stockOk = await _validarStockItem({ ...it, cantidad: diff }, db);
          if (!stockOk) {
            return {
              ok: false,
              error: `Stock insuficiente para aumentar "${it.nombre}".`
            };
          }
        }
      }

      // ── Cargar menu_items para fallback de ID ─────────────
      let listaMenuItems = [];
      if (restaurantId) {
        const { data: mis } = await db
          .from('menu_items').select('id, name')
          .eq('restaurant_id', restaurantId).eq('is_active', true);
        listaMenuItems = mis || [];
      }

      const itemsParaAjusteInventario = [];

      // ── 1. Eliminar items ─────────────────────────────────
      const aEliminar = itemsEditados.filter(
        i => i.eliminado && !i.esNuevo && itemsOriginales.some(o => o.id === i.id)
      );
      for (const it of aEliminar) {
        const { error } = await db.from('order_items').delete().eq('id', it.id);
        if (error) console.warn('[MateusCore] Error eliminando item:', error.message);
        else {
          // Devolver al inventario (dirección = -1 → suma stock)
          itemsParaAjusteInventario.push({ item: it, delta: -1 });
        }
      }

      // ── 2. Actualizar cantidades existentes ───────────────
      const aActualizar = itemsEditados.filter(
        i => !i.eliminado && !i.esNuevo && itemsOriginales.some(o => o.id === i.id)
      );
      for (const it of aActualizar) {
        const original = itemsOriginales.find(o => o.id === it.id);
        if (!original || original.quantity === it.cantidad) continue;
        const { error } = await db
          .from('order_items')
          .update({ quantity: it.cantidad })
          .eq('id', it.id);
        if (error) console.warn('[MateusCore] Error actualizando cantidad:', error.message);
        else {
          const diff = it.cantidad - original.quantity;
          // diff > 0: descuento adicional; diff < 0: devolución
          itemsParaAjusteInventario.push({ item: { ...it, cantidad: Math.abs(diff) }, delta: diff > 0 ? 1 : -1 });
        }
      }

      // ── 3. Insertar items nuevos ──────────────────────────
      const aNuevos = itemsEditados.filter(i => i.esNuevo && !i.eliminado);
      if (aNuevos.length > 0) {
        const payload = aNuevos.map(it => {
          let menuItemId = it.menuItemId || null;
          if (!menuItemId && listaMenuItems.length > 0) {
            const nb = (it.nombre || '').toLowerCase().trim();
            const ex = listaMenuItems.find(m => m.name.toLowerCase().trim() === nb);
            menuItemId = ex?.id || listaMenuItems[0]?.id || null;
          }
          return {
            order_id:     orderId,
            menu_item_id: menuItemId,
            quantity:     it.cantidad,
            unit_price:   it.precio,
            item_status:  'pending',
            product_name: it.nombre,
            notes:        `[nombre]${it.nombre}`,
          };
        });

        const { error: errNuevos } = await db.from('order_items').insert(payload);
        if (errNuevos) {
          if (errNuevos.code === '42703') {
            const p2 = payload.map(({ product_name, ...rest }) => rest);
            await db.from('order_items').insert(p2);
          } else {
            console.warn('[MateusCore] Error insertando items nuevos:', errNuevos.message);
          }
        }
        aNuevos.forEach(it => {
          itemsParaAjusteInventario.push({ item: it, delta: 1 });
        });
      }

      // ── 4. Recalcular total ───────────────────────────────
      const nuevoTotal = itemsEditados
        .filter(i => !i.eliminado)
        .reduce((acc, i) => acc + (i.precio * i.cantidad), 0);

      // ── 5. Actualizar orden ───────────────────────────────
      const { error: errUpdate } = await db
        .from('orders')
        .update({
          total_amount: nuevoTotal,
          notes:        notaFinal || ordenActual.notes,
          updated_at:   new Date().toISOString(),
        })
        .eq('id', orderId);

      if (errUpdate) {
        console.warn('[MateusCore] Error actualizando orden:', errUpdate.message);
      }

      // ── 6. Ajustar inventario (recetas + porciones) ───────
      for (const { item, delta } of itemsParaAjusteInventario) {
        // Ajustar insumos del recetario
        await ajustarInventarioPorItems(
          [{ menu_item_id: item.menuItemId, quantity: item.cantidad, notes: `[nombre]${item.nombre}`, nombre: item.nombre }],
          delta
        );
        // Ajustar porciones del menú
        if (item.menuItemId) {
          await _ajustarPorcionesItem(item.menuItemId, item.cantidad, delta, db);
        }
      }

      return { ok: true, nuevoTotal };

    } catch (err) {
      console.error('[MateusCore] guardarEdicionAdmin error:', err);
      return { ok: false, error: err.message };
    }
  }

  // Valida si hay porciones disponibles para un item
  async function _validarStockItem(item, db) {
    if (!item.menuItemId) return true; // sin ID conocido, se permite

    const { data: plato } = await db
      .from('menu_items')
      .select('portions_today, is_active')
      .eq('id', item.menuItemId)
      .maybeSingle();

    if (!plato) return true; // no encontrado, no bloquear
    if (!plato.is_active) return false;
    if (plato.portions_today !== null && plato.portions_today !== undefined) {
      return plato.portions_today >= (item.cantidad || 1);
    }
    return true; // sin control de porciones
  }

  // Ajusta portions_today y is_active de un menu_item
  async function _ajustarPorcionesItem(menuItemId, cantidad, delta, db) {
    try {
      const { data: plato } = await db
        .from('menu_items')
        .select('portions_today, is_active')
        .eq('id', menuItemId)
        .maybeSingle();

      if (!plato || plato.portions_today === null || plato.portions_today === undefined) return;

      const nuevas = Math.max(0, plato.portions_today - cantidad * delta);
      const payload = { portions_today: nuevas };
      if (nuevas === 0) payload.is_active = false;
      if (delta < 0 && nuevas > 0) payload.is_active = true; // devolución → reactivar

      await db.from('menu_items').update(payload).eq('id', menuItemId);
    } catch (err) {
      console.warn('[MateusCore] _ajustarPorcionesItem error:', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────
  // OBJ-2 · REALTIME CENTRALIZADO
  // ──────────────────────────────────────────────────────────
  // Crea un canal único con suscripciones a:
  //   - orders (INSERT, UPDATE, DELETE)
  //   - order_items (INSERT, UPDATE, DELETE)
  //   - menu_items (UPDATE)
  //   - inventory_supplies (UPDATE)
  //
  // Llama a los callbacks registrados según el evento.
  // ──────────────────────────────────────────────────────────
  const _callbacks = {
    onOrderChange:     [],
    onMenuItemChange:  [],
    onInventoryChange: [],
  };

  let _channel = null;
  let _channelKey = null;

  function suscribirRealtime(restaurantId) {
    const db = _getDB();
    if (!db || !restaurantId) return;

    const key = `mateus-core-rt-${restaurantId}`;
    if (_channelKey === key && _channel) return; // ya suscrito al mismo restaurante

    if (_channel) db.removeChannel(_channel);

    _channel = db
      .channel(key)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, p => _dispatch('onOrderChange', { tipo: 'insert', payload: p }))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, p => _dispatch('onOrderChange', { tipo: 'update', payload: p }))
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'orders',
      }, p => _dispatch('onOrderChange', { tipo: 'delete', payload: p }))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_items',
      }, p => _dispatch('onOrderChange', { tipo: 'item_insert', payload: p }))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'order_items',
      }, p => _dispatch('onOrderChange', { tipo: 'item_update', payload: p }))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'menu_items',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, p => _dispatch('onMenuItemChange', { payload: p }))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inventory_supplies',
      }, p => _dispatch('onInventoryChange', { payload: p }))
      .subscribe(status => {
        console.info('[MateusCore] Realtime estado:', status);
      });

    _channelKey = key;
  }

  function on(evento, fn) {
    if (_callbacks[evento]) _callbacks[evento].push(fn);
  }

  function off(evento, fn) {
    if (_callbacks[evento]) {
      _callbacks[evento] = _callbacks[evento].filter(f => f !== fn);
    }
  }

  function _dispatch(evento, data) {
    (_callbacks[evento] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.warn('[MateusCore] callback error:', e); }
    });
  }

  function desuscribir() {
    const db = _getDB();
    if (db && _channel) {
      db.removeChannel(_channel);
      _channel = null;
      _channelKey = null;
    }
  }

  // ──────────────────────────────────────────────────────────
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────
  return {
    // OBJ-1
    descontarPorcionesOrden,
    ajustarInventarioPorItems,
    // OBJ-2
    suscribirRealtime,
    on,
    off,
    desuscribir,
    // OBJ-4
    guardarEdicionAdmin,
    // Helpers
    fmt: _fmt,
    toast: _toast,
  };

})();

// Exponer globalmente
window.MateusCore = MateusCore;