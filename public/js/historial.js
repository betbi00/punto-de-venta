// Historial: ventas del día, detalle y cancelación.
import { api } from './api.js';
import { abrirModal, dinero, esc, mostrarError, toast } from './ui.js';
import { botonWhatsApp, mensajePedido, mensajeCancelacion } from './whatsapp.js';

const MOTIVOS = ['Error al capturar', 'El cliente ya no lo quiso', 'Se acabó el producto'];
const NOMBRE_METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia' };

const $ = (id) => document.getElementById(id);

let fecha = hoy();
let peticionActual = 0;

function dosDigitos(n) {
  return String(n).padStart(2, '0');
}

function fechaATexto(d) {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

function hoy() {
  return fechaATexto(new Date());
}

function moverDias(texto, dias) {
  const [a, m, d] = texto.split('-').map(Number);
  return fechaATexto(new Date(a, m - 1, d + dias));
}

function cambiarFecha(nueva) {
  fecha = nueva;
  $('historial-fecha').value = fecha;
  cargarHistorial();
}

export function initHistorial() {
  $('historial-fecha').addEventListener('change', (e) => {
    if (e.target.value) cambiarFecha(e.target.value);
  });
  document.querySelectorAll('#pantalla-historial [data-dias]').forEach((boton) => {
    boton.addEventListener('click', () => cambiarFecha(moverDias(fecha, Number(boton.dataset.dias))));
  });
  $('historial-hoy').addEventListener('click', () => cambiarFecha(hoy()));
  $('historial-recargar').addEventListener('click', cargarHistorial);
  $('historial-lista').addEventListener('click', (e) => {
    const fila = e.target.closest('[data-folio]');
    if (fila) abrirDetalle(Number(fila.dataset.folio));
  });
}

// Al entrar a la pestaña siempre se muestra el día de hoy.
export function mostrarHistorial() {
  cambiarFecha(hoy());
}

async function cargarHistorial() {
  const miPeticion = ++peticionActual;
  const lista = $('historial-lista');
  lista.innerHTML = '<li class="mensaje-vacio">Cargando…</li>';
  try {
    const datos = await api(`/ventas?fecha=${fecha}`);
    if (miPeticion !== peticionActual) return; // ya se pidió otro día
    renderResumen(datos.resumen);
    renderLista(datos.ventas);
  } catch (err) {
    if (miPeticion !== peticionActual) return;
    mostrarError(err);
    $('historial-resumen').innerHTML = '';
    lista.innerHTML = '<li class="mensaje-vacio">No se pudo cargar el historial.</li>';
  }
}

function renderResumen(r) {
  $('historial-resumen').innerHTML = `
    <div class="tarjeta destacada"><div class="rotulo">Total vendido</div><div class="valor">${dinero(r.total_centavos)}</div></div>
    <div class="tarjeta"><div class="rotulo">Efectivo</div><div class="valor">${dinero(r.efectivo_centavos)}</div></div>
    <div class="tarjeta"><div class="rotulo">Transferencia</div><div class="valor">${dinero(r.transferencia_centavos)}</div></div>
    <div class="tarjeta"><div class="rotulo">Ventas</div><div class="valor">${r.num_ventas}</div></div>
    <div class="tarjeta"><div class="rotulo">Canceladas</div><div class="valor">${r.num_canceladas}</div></div>`;
}

function etiqueta(venta) {
  return venta.estado === 'cancelada'
    ? '<span class="etiqueta cancelada">Cancelada</span>'
    : `<span class="etiqueta ${venta.metodo_pago}">${NOMBRE_METODO[venta.metodo_pago]}</span>`;
}

function renderLista(ventas) {
  const lista = $('historial-lista');
  if (!ventas.length) {
    lista.innerHTML = '<li class="mensaje-vacio">No hay ventas este día.</li>';
    return;
  }
  lista.innerHTML = ventas.map((v) => `
    <li>
      <button type="button" class="venta-fila ${v.estado}" data-folio="${v.folio}">
        <span class="folio">#${v.folio}</span>
        <span class="hora">${esc(v.hora)}</span>
        <span class="resumen-texto">${esc(v.resumen)}</span>
        <span class="monto"><span class="cifra">${dinero(v.total_centavos)}</span><br>${etiqueta(v)}</span>
      </button>
    </li>`).join('');
}

async function abrirDetalle(folio) {
  let venta;
  try {
    venta = await api(`/ventas/${folio}`);
  } catch (err) {
    mostrarError(err);
    return;
  }

  const { el, cerrar } = abrirModal('', { clase: 'modal-detalle' });
  const pintar = () => { el.innerHTML = htmlDetalle(venta); };
  pintar();

  el.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cerrar') cerrar();
    if (accion === 'cancelar') {
      const actualizada = await pedirCancelacion(venta);
      if (actualizada) {
        venta = actualizada;
        pintar();
        cargarHistorial();
      }
    }
  });
}

function htmlDetalle(v) {
  const efectivo = v.metodo_pago === 'efectivo';
  const pagada = v.estado === 'pagada';
  return `
    <div class="admin-encabezado">
      <h2 class="modal-titulo" style="margin:0">Venta #${v.folio}</h2>
      ${etiqueta(v)}
    </div>
    <p style="margin:0 0 12px;color:var(--texto-suave)">${esc(v.fecha_hora)}</p>
    <table class="detalle-tabla">
      ${v.lineas.map((l) => `
        <tr>
          <td>${l.cantidad} × ${esc(l.nombre)}
            ${l.nota ? `<div class="nota">“${esc(l.nota)}”</div>` : ''}</td>
          <td>${dinero(l.subtotal_centavos)}</td>
        </tr>`).join('')}
    </table>
    <dl class="detalle-datos">
      <dt>Total</dt><dd class="grande">${dinero(v.total_centavos)}</dd>
      <dt>Pago</dt><dd>${NOMBRE_METODO[v.metodo_pago]}</dd>
      ${efectivo ? `
        <dt>Recibido</dt><dd>${dinero(v.monto_recibido_centavos)}</dd>
        <dt>Cambio</dt><dd>${dinero(v.cambio_centavos)}</dd>` : ''}
    </dl>
    ${pagada ? '' : `
      <div class="aviso-cancelada">
        Cancelada el ${esc(v.cancelada_fecha_hora)}
        ${v.motivo_cancelacion ? `<br>Motivo: ${esc(v.motivo_cancelacion)}` : ''}
      </div>`}
    <div class="modal-botones">
      ${pagada
        ? `${botonWhatsApp(mensajePedido(v), 'Reenviar a cocina')}
           <button type="button" class="btn btn-borde-peligro" data-accion="cancelar">Cancelar venta</button>`
        : botonWhatsApp(mensajeCancelacion(v), 'Avisar cancelación a cocina')}
      <button type="button" class="btn" data-accion="cerrar">Cerrar</button>
    </div>`;
}

// Pide confirmación y motivo. Devuelve la venta actualizada, o null si no se canceló.
function pedirCancelacion(venta) {
  return new Promise((resolver) => {
    const { el, cerrar } = abrirModal(`
      <h2 class="modal-titulo">¿Cancelar la venta #${venta.folio}?</h2>
      <p class="modal-texto">Quedará guardada como cancelada (no se borra) y ya no contará en el total del día.</p>
      <label class="etiqueta-campo" for="motivo-cancelacion">Motivo (opcional)</label>
      <input class="campo" id="motivo-cancelacion" type="text" maxlength="200" autocomplete="off"
             placeholder="Ej. error al capturar">
      <div class="chips">
        ${MOTIVOS.map((m) => `<button type="button" class="chip" data-chip="${esc(m)}">${esc(m)}</button>`).join('')}
      </div>
      <div class="modal-botones">
        <button type="button" class="btn" data-accion="no">No cancelar</button>
        <button type="button" class="btn btn-peligro" data-accion="si">Sí, cancelar venta</button>
      </div>`);

    const input = el.querySelector('#motivo-cancelacion');

    el.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) {
        input.value = chip.dataset.chip;
        return;
      }
      const boton = e.target.closest('[data-accion]');
      if (!boton) return;
      if (boton.dataset.accion === 'no') {
        cerrar();
        resolver(null);
        return;
      }
      boton.disabled = true;
      boton.textContent = 'Cancelando…';
      try {
        const actualizada = await api(`/ventas/${venta.folio}/cancelar`, {
          method: 'POST',
          body: { motivo: input.value },
        });
        cerrar();
        toast(`Venta #${venta.folio} cancelada`, 'exito');
        resolver(actualizada);
      } catch (err) {
        boton.disabled = false;
        boton.textContent = 'Sí, cancelar venta';
        mostrarError(err);
      }
    });
  });
}
