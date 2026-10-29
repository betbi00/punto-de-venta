// Cobro: efectivo (con teclado y cambio) o transferencia; luego confirmación y aviso a cocina.
import { api } from './api.js';
import { abrirModal, dinero, mostrarError } from './ui.js';
import { botonWhatsApp, mensajePedido } from './whatsapp.js';

const BILLETES = [50, 100, 200, 500];
const MAX_PESOS = 999999;

export function abrirCobro({ lineas, totalCentavos, alRegistrar, alProductoNoDisponible }) {
  let metodo = 'efectivo';
  let recibido = null; // centavos, o null si no se ha capturado
  let enviando = false;

  const { el, cerrar } = abrirModal(`
    <div class="cobro">
      <div class="cobro-izq">
        <div class="cobro-total"><span>Total a cobrar</span><strong>${dinero(totalCentavos)}</strong></div>
        <div class="segmento">
          <button type="button" class="activo" data-metodo="efectivo">💵 Efectivo</button>
          <button type="button" data-metodo="transferencia">📱 Transferencia</button>
        </div>
        <div data-solo="efectivo">
          <div class="cobro-caja">
            <div class="rotulo">Paga con</div>
            <div class="valor" data-ref="recibido"></div>
          </div>
          <div class="cobro-caja cobro-cambio" data-ref="caja-cambio">
            <div class="rotulo" data-ref="rotulo-cambio">Cambio</div>
            <div class="valor" data-ref="cambio"></div>
          </div>
        </div>
        <div data-solo="transferencia" class="cobro-transfer" hidden>
          Revisa que ya llegó la transferencia de <strong>${dinero(totalCentavos)}</strong>
          antes de confirmar la venta.
        </div>
      </div>
      <div class="cobro-der" data-solo="efectivo">
        <div class="billetes">
          <button type="button" class="btn" data-billete="exacto">Exacto</button>
          ${BILLETES.map((b) => `<button type="button" class="btn" data-billete="${b}">$${b}</button>`).join('')}
        </div>
        <div class="teclado-cobro">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-tecla="${n}">${n}</button>`).join('')}
          <button type="button" data-tecla="00">00</button>
          <button type="button" data-tecla="0">0</button>
          <button type="button" data-tecla="borrar" aria-label="Borrar">⌫</button>
        </div>
      </div>
    </div>
    <div class="modal-botones">
      <button type="button" class="btn btn-grande" data-accion="cancelar">Cancelar</button>
      <button type="button" class="btn btn-exito btn-grande" data-accion="confirmar">Confirmar venta</button>
    </div>`, { clase: 'modal-cobro' });

  const ref = (nombre) => el.querySelector(`[data-ref="${nombre}"]`);
  const botonConfirmar = el.querySelector('[data-accion="confirmar"]');

  function teclear(tecla) {
    // El teclado captura pesos enteros
    let pesos = recibido === null ? 0 : Math.floor(recibido / 100);
    if (tecla === 'borrar') pesos = Math.floor(pesos / 10);
    else pesos = Number(`${pesos}${tecla}`);
    if (pesos > MAX_PESOS) return;
    recibido = pesos > 0 ? pesos * 100 : null;
    actualizar();
  }

  function actualizar() {
    el.querySelectorAll('[data-solo]').forEach((n) => { n.hidden = n.dataset.solo !== metodo; });
    el.querySelector('.cobro').classList.toggle('una-columna', metodo !== 'efectivo');
    el.querySelectorAll('[data-metodo]').forEach((b) => b.classList.toggle('activo', b.dataset.metodo === metodo));

    let valido = true;
    if (metodo === 'efectivo') {
      const caja = ref('caja-cambio');
      ref('recibido').textContent = recibido === null ? '$0' : dinero(recibido);
      caja.classList.remove('ok', 'falta');
      if (recibido === null) {
        ref('rotulo-cambio').textContent = 'Cambio';
        ref('cambio').textContent = '—';
        valido = false;
      } else if (recibido >= totalCentavos) {
        caja.classList.add('ok');
        ref('rotulo-cambio').textContent = 'Cambio';
        ref('cambio').textContent = dinero(recibido - totalCentavos);
      } else {
        caja.classList.add('falta');
        ref('rotulo-cambio').textContent = 'Faltan';
        ref('cambio').textContent = dinero(totalCentavos - recibido);
        valido = false;
      }
    }
    botonConfirmar.disabled = !valido || enviando;
    botonConfirmar.textContent = enviando ? 'Guardando…' : 'Confirmar venta';
  }

  async function confirmarVenta() {
    if (enviando) return;
    enviando = true;
    actualizar();
    try {
      const venta = await api('/ventas', {
        method: 'POST',
        body: {
          items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, nota: l.nota || null })),
          metodo_pago: metodo,
          monto_recibido_centavos: metodo === 'efectivo' ? recibido : null,
        },
      });
      cerrar();
      alRegistrar(venta);
      mostrarConfirmacion(venta);
    } catch (err) {
      enviando = false;
      actualizar();
      mostrarError(err);
      if (err.status === 409) {
        cerrar();
        alProductoNoDisponible();
      }
    }
  }

  el.addEventListener('click', (e) => {
    const opcion = e.target.closest('[data-metodo]');
    if (opcion) {
      metodo = opcion.dataset.metodo;
      actualizar();
      return;
    }
    const tecla = e.target.closest('[data-tecla]');
    if (tecla) {
      teclear(tecla.dataset.tecla);
      return;
    }
    const billete = e.target.closest('[data-billete]');
    if (billete) {
      recibido = billete.dataset.billete === 'exacto' ? totalCentavos : Number(billete.dataset.billete) * 100;
      actualizar();
      return;
    }
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cancelar' && !enviando) cerrar();
    if (accion === 'confirmar') confirmarVenta();
  });

  actualizar();
}

export function mostrarConfirmacion(venta) {
  const efectivo = venta.metodo_pago === 'efectivo';
  const { el, cerrar } = abrirModal(`
    <div class="confirmacion">
      <div class="confirmacion-check">✓</div>
      <h2 class="modal-titulo">Venta registrada</h2>
      <div class="confirmacion-folio">Pedido #${venta.folio}</div>
      <div>Total ${dinero(venta.total_centavos)} · ${efectivo ? 'Efectivo' : 'Transferencia'}</div>
      ${efectivo ? `
        <div class="cambio-grande">
          <span>Cambio</span>
          <strong>${dinero(venta.cambio_centavos)}</strong>
        </div>
        <div>Pagó con ${dinero(venta.monto_recibido_centavos)}</div>` : ''}
      <div class="modal-botones">
        ${botonWhatsApp(mensajePedido(venta), 'Avisar a cocina')}
        <button type="button" class="btn btn-primario" data-accion="nueva">Nueva venta</button>
      </div>
    </div>`);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="nueva"]')) cerrar();
  });
}
