/* Traslada un pedido abierto a otra mesa sin cambiar sus productos ni pagos. */
(function () {
  'use strict';

  const EXCLUDED = new Set(['cancelled', 'canceled', 'paid', 'void', 'deleted']);
  const todayKey = date => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);

  function getClient() {
    if (window.MateusOffline?.createClient) return window.MateusOffline.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  }

  async function getTables(client) {
    let lastError = null;
    for (const name of ['tables', 'restaurant_tables']) {
      const result = await client.from(name).select('*');
      if (!result.error && (result.data || []).length) return result.data;
      if (result.error) lastError = result.error;
    }
    if (lastError) throw lastError;
    throw new Error('No se encontraron mesas configuradas.');
  }

  function tableName(table) {
    return String(table.label || table.name || table.number || table.numero || `Mesa ${table.id}`);
  }

  function isUnpaidOpen(order) {
    return order.table_id != null
      && !order.payment_method
      && !EXCLUDED.has(String(order.status || '').toLowerCase());
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function mount() {
    if (document.getElementById('mateus-change-table-button') || !document.body) return;
    const button = document.createElement('button');
    button.id = 'mateus-change-table-button';
    button.type = 'button';
    button.textContent = 'Cambiar mesa';
    Object.assign(button.style, {
      display: 'none', position: 'fixed', right: '28px', bottom: '22px', zIndex: '85000',
      border: '1px solid #301e12', borderRadius: '999px', padding: '12px 20px',
      background: '#301e12', color: '#fffdf9', boxShadow: '0 8px 28px #301e1240',
      font: '600 13px DM Sans, sans-serif', cursor: 'pointer',
    });
    button.addEventListener('click', openDialog);
    document.body.appendChild(button);

    const dialog = document.createElement('div');
    dialog.id = 'mateus-change-table-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    Object.assign(dialog.style, {
      display: 'none', position: 'fixed', inset: '0', zIndex: '85001', alignItems: 'center',
      justifyContent: 'center', padding: '16px', background: '#1a120dcc', fontFamily: 'DM Sans, sans-serif',
    });
    dialog.innerHTML = `
      <section style="width:min(520px,100%);max-height:90vh;overflow:auto;padding:24px;border-radius:20px;background:#fffdf9;color:#241608;box-shadow:0 24px 80px #0005">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div><p style="margin:0;color:#93816a;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Tomar pedido / mesas</p>
          <h2 style="margin:5px 0;font:700 24px Georgia,serif">Cambiar pedido de mesa</h2>
          <p style="margin:0 0 18px;color:#6c5a47;font-size:13px">El pedido y sus productos se conservan. Solo cambia su mesa.</p></div>
          <button type="button" data-close aria-label="Cerrar" style="border:1px solid #d3c4a8;border-radius:999px;background:white;padding:8px 12px;cursor:pointer">Cerrar</button>
        </div>
        <label for="mateus-transfer-order" style="display:block;margin:10px 0 6px;font-size:12px;font-weight:700">PEDIDO ABIERTO</label>
        <select id="mateus-transfer-order" style="width:100%;padding:12px;border:1px solid #d3c4a8;border-radius:12px;background:white;color:#241608;font:14px DM Sans,sans-serif"></select>
        <label for="mateus-transfer-destination" style="display:block;margin:16px 0 6px;font-size:12px;font-weight:700">MOVER A MESA LIBRE</label>
        <select id="mateus-transfer-destination" style="width:100%;padding:12px;border:1px solid #d3c4a8;border-radius:12px;background:white;color:#241608;font:14px DM Sans,sans-serif"></select>
        <p id="mateus-transfer-message" role="status" style="min-height:18px;margin:12px 0 0;color:#80531b;font-size:12px"></p>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button type="button" data-close style="border:1px solid #d3c4a8;border-radius:999px;background:white;padding:11px 16px;cursor:pointer">Cancelar</button>
          <button type="button" id="mateus-transfer-confirm" style="border:1px solid #301e12;border-radius:999px;background:#301e12;color:white;padding:11px 18px;font-weight:700;cursor:pointer">Confirmar cambio</button>
        </div>
      </section>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.style.display = 'none';
    });
    dialog.querySelector('#mateus-transfer-confirm').addEventListener('click', transfer);

    const updateVisibility = () => {
      const admin = sessionStorage.getItem('user_role') === 'admin';
      const mesasHeading = [...document.querySelectorAll('h1,h2,h3,h4')].find(el =>
        el.textContent.trim().toLocaleLowerCase('es').includes('tomar pedido') && el.getClientRects().length,
      );
      button.style.display = admin && mesasHeading ? 'block' : 'none';
      if (!admin) dialog.style.display = 'none';
    };
    new MutationObserver(updateVisibility).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    updateVisibility();
  }

  async function openDialog() {
    const dialog = document.getElementById('mateus-change-table-modal');
    const orderSelect = dialog.querySelector('#mateus-transfer-order');
    const destinationSelect = dialog.querySelector('#mateus-transfer-destination');
    const message = dialog.querySelector('#mateus-transfer-message');
    message.textContent = 'Cargando pedidos y mesas…';
    dialog.style.display = 'flex';
    orderSelect.innerHTML = '';
    destinationSelect.innerHTML = '';

    try {
      const client = getClient();
      const [ordersResult, tables] = await Promise.all([
        client.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
        getTables(client),
      ]);
      if (ordersResult.error) throw ordersResult.error;
      const today = todayKey(new Date());
      const todayOrders = (ordersResult.data || []).filter(order => {
        if (!isUnpaidOpen(order) || !order.created_at) return false;
        return todayKey(new Date(order.created_at)) === today;
      });
      tables.sort((a, b) => tableName(a).localeCompare(tableName(b), 'es', { numeric: true }));
      const byId = new Map(tables.map(table => [String(table.id), table]));

      todayOrders.forEach(order => {
        const option = document.createElement('option');
        option.value = String(order.id);
        const mesa = byId.get(String(order.table_id));
        const numero = order.order_number ? ` · Pedido #${order.order_number}` : '';
        const cliente = order.customer_name ? ` · ${order.customer_name}` : '';
        option.textContent = `${mesa ? tableName(mesa) : `Mesa ${order.table_id}`}${numero}${cliente}`;
        orderSelect.appendChild(option);
      });

      const occupied = new Set(todayOrders.map(order => String(order.table_id)));
      tables.filter(table => !occupied.has(String(table.id))).forEach(table => {
        const option = document.createElement('option');
        option.value = String(table.id);
        option.textContent = tableName(table);
        destinationSelect.appendChild(option);
      });

      const ready = todayOrders.length && destinationSelect.options.length;
      orderSelect.disabled = !todayOrders.length;
      destinationSelect.disabled = !destinationSelect.options.length;
      dialog.querySelector('#mateus-transfer-confirm').disabled = !ready;
      if (!todayOrders.length) message.textContent = 'No hay pedidos abiertos de hoy para cambiar de mesa.';
      else if (!destinationSelect.options.length) message.textContent = 'No hay mesas libres disponibles.';
      else message.textContent = 'Solo se muestran pedidos sin pago registrados en el día de hoy.';
    } catch (error) {
      message.textContent = `No se pudieron cargar los pedidos: ${error.message || error}`;
      dialog.querySelector('#mateus-transfer-confirm').disabled = true;
    }
  }

  async function transfer() {
    const dialog = document.getElementById('mateus-change-table-modal');
    const orderId = dialog.querySelector('#mateus-transfer-order').value;
    const destinationId = dialog.querySelector('#mateus-transfer-destination').value;
    const confirm = dialog.querySelector('#mateus-transfer-confirm');
    const message = dialog.querySelector('#mateus-transfer-message');
    if (!orderId || !destinationId) { message.textContent = 'Selecciona un pedido y una mesa libre.'; return; }

    confirm.disabled = true;
    confirm.textContent = 'Guardando…';
    message.textContent = 'Actualizando el pedido…';
    try {
      const client = getClient();
      const [orderResult, tables] = await Promise.all([
        client.from('orders').select('*').eq('id', orderId).single(),
        getTables(client),
      ]);
      if (orderResult.error) throw orderResult.error;
      const order = orderResult.data;
      const destination = tables.find(table => String(table.id) === String(destinationId));
      if (!destination) throw new Error('La mesa seleccionada ya no existe. Actualiza la lista.');
      if (!isUnpaidOpen(order)) throw new Error('El pedido ya no está abierto o ya tiene un pago registrado. Actualiza la lista.');
      if (!order.created_at || todayKey(new Date(order.created_at)) !== todayKey(new Date())) {
        throw new Error('El pedido ya no corresponde al servicio de hoy. Actualiza la lista.');
      }

      const occupyingResult = await client.from('orders').select('*').eq('table_id', destination.id).limit(1000);
      if (occupyingResult.error) throw occupyingResult.error;
      const today = todayKey(new Date());
      const isOccupied = (occupyingResult.data || []).some(other =>
        String(other.id) !== String(order.id)
        && isUnpaidOpen(other)
        && other.created_at
        && todayKey(new Date(other.created_at)) === today,
      );
      if (isOccupied) throw new Error('Esa mesa acaba de ocuparse. Actualiza la lista y elige otra.');

      const label = tableName(destination);
      const oldNotes = String(order.notes || '');
      const marker = `[MESA] Mesa: ${label}`;
      const notes = /\[MESA\]\s*Mesa:\s*[^|]*/i.test(oldNotes)
        ? oldNotes.replace(/\[MESA\]\s*Mesa:\s*[^|]*/i, marker)
        : `${marker}${oldNotes ? ` | ${oldNotes}` : ''}`;
      const { error } = await client.from('orders')
        .update({ table_id: destination.id, notes })
        .eq('id', order.id);
      if (error) throw error;

      message.textContent = `Pedido trasladado a ${label}.`;
      try { if (typeof Toast !== 'undefined') Toast.ok(`Pedido trasladado a ${label}.`); } catch (_) {}
      setTimeout(() => { dialog.style.display = 'none'; }, 900);
    } catch (error) {
      message.textContent = `No se cambió la mesa: ${error.message || error}`;
    } finally {
      confirm.disabled = false;
      confirm.textContent = 'Confirmar cambio';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
