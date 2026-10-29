// Pantalla de venta: botones de productos y pedido actual.
import { abrirModal, confirmar, dinero, esc } from './ui.js';
import { abrirCobro } from './cobro.js';

const CLAVE_PEDIDO = 'pv_pedido';
const COLORES = ['#c2410c', '#15803d', '#b45309', '#0e7490', '#be123c', '#6d28d9', '#1d4ed8', '#4d7c0f'];
const NOTAS_RAPIDAS = ['sin cebolla', 'salsa verde', 'salsa roja', 'sin crema', 'sin queso', 'para llevar'];

let productos = null;   // null mientras carga
let errorCarga = false;
let lineas = cargarPedido(); // [{ id, producto_id, nombre, precio_centavos, cantidad, nota }]
let siguienteId = lineas.reduce((max, l) => Math.max(max, l.id), 0) + 1;
let recargarProductos = () => {};

const $ = (id) => document.getElementById(id);

export function initVenta({ reintentar }) {
  recargarProductos = reintentar;

  $('productos').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-producto]');
    if (boton) agregarProducto(Number(boton.dataset.producto));
    if (e.target.closest('[data-accion="reintentar"]')) recargarProductos();
  });

  $('pedido-lineas').addEventListener('click', alTocarLinea);

  $('btn-vaciar').addEventListener('click', async () => {
    if (!lineas.length) return;
    if (await confirmar('¿Vaciar el pedido actual?', { si: 'Vaciar', no: 'No', peligro: true })) {
      lineas = [];
      cambio();
    }
  });

  $('btn-cobrar').addEventListener('click', () => {
    if (!lineas.length) return;
    abrirCobro({
      lineas,
      totalCentavos: totalPedido(),
      alRegistrar: () => {
        lineas = [];
        cambio();
      },
      alProductoNoDisponible: recargarProductos,
    });
  });

  renderProductos();
  renderPedido();
}

// lista = arreglo de productos activos, o null si no se pudieron cargar
export function setProductos(lista) {
  errorCarga = !lista;
  productos = lista;
  if (lista) {
    // Actualiza precio/nombre de lo que ya está en el pedido y quita lo que ya no se vende.
    const porId = new Map(lista.map((p) => [p.id, p]));
    lineas = lineas.filter((l) => porId.has(l.producto_id));
    for (const l of lineas) {
      const p = porId.get(l.producto_id);
      l.nombre = p.nombre;
      l.precio_centavos = p.precio_centavos;
    }
  }
  renderProductos();
  cambio();
}

function totalPedido() {
  return lineas.reduce((suma, l) => suma + l.precio_centavos * l.cantidad, 0);
}

function agregarProducto(id) {
  const p = productos?.find((x) => x.id === id);
  if (!p) return;
  let linea = lineas.find((l) => l.producto_id === id && !l.nota);
  if (linea) {
    linea.cantidad += 1;
  } else {
    linea = { id: siguienteId++, producto_id: id, nombre: p.nombre, precio_centavos: p.precio_centavos, cantidad: 1, nota: '' };
    lineas.push(linea);
  }
  cambio();
  $('pedido-lineas').querySelector(`[data-id="${linea.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function alTocarLinea(e) {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const linea = lineas.find((l) => l.id === Number(boton.dataset.linea));
  if (!linea) return;

  switch (boton.dataset.accion) {
    case 'mas':
      linea.cantidad += 1;
      break;
    case 'menos':
      if (linea.cantidad > 1) linea.cantidad -= 1;
      else lineas = lineas.filter((l) => l !== linea);
      break;
    case 'quitar':
      lineas = lineas.filter((l) => l !== linea);
      break;
    case 'nota':
      abrirNota(linea);
      return;
    default:
      return;
  }
  cambio();
}

function abrirNota(linea) {
  let alcance = 'todos';
  const { el, cerrar } = abrirModal(`
    <h2 class="modal-titulo">Nota: ${esc(linea.nombre)}</h2>
    <input class="campo" id="nota-texto" type="text" maxlength="100" autocomplete="off"
           enterkeyhint="done" placeholder="Ej. sin cebolla" value="${esc(linea.nota)}">
    <div class="chips">
      ${NOTAS_RAPIDAS.map((n) => `<button type="button" class="chip" data-chip="${esc(n)}">${esc(n)}</button>`).join('')}
    </div>
    ${linea.cantidad > 1 ? `
      <span class="etiqueta-campo">¿A cuántos aplica la nota?</span>
      <div class="segmento">
        <button type="button" class="activo" data-alcance="todos">A los ${linea.cantidad}</button>
        <button type="button" data-alcance="uno">Solo a 1</button>
      </div>` : ''}
    <div class="modal-botones">
      <button type="button" class="btn" data-accion="cancelar">Cancelar</button>
      ${linea.nota ? '<button type="button" class="btn btn-borde-peligro" data-accion="borrar">Quitar nota</button>' : ''}
      <button type="button" class="btn btn-primario" data-accion="guardar">Guardar</button>
    </div>`);

  const input = el.querySelector('#nota-texto');

  const guardar = () => {
    const nota = input.value.trim().slice(0, 100);
    if (alcance === 'uno' && linea.cantidad > 1) {
      // Separa una pieza con su propia nota
      linea.cantidad -= 1;
      lineas.splice(lineas.indexOf(linea) + 1, 0, { ...linea, id: siguienteId++, cantidad: 1, nota });
    } else {
      linea.nota = nota;
    }
    cerrar();
    cambio();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') guardar();
  });

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const actual = input.value.trim();
      input.value = actual ? `${actual}, ${chip.dataset.chip}` : chip.dataset.chip;
      return;
    }
    const opcion = e.target.closest('[data-alcance]');
    if (opcion) {
      alcance = opcion.dataset.alcance;
      el.querySelectorAll('[data-alcance]').forEach((b) => b.classList.toggle('activo', b === opcion));
      return;
    }
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cancelar') cerrar();
    if (accion === 'borrar') {
      input.value = '';
      guardar();
    }
    if (accion === 'guardar') guardar();
  });
}

// Junta renglones del mismo producto con la misma nota.
function combinar() {
  const resultado = [];
  for (const l of lineas) {
    const igual = resultado.find((r) => r.producto_id === l.producto_id && r.nota === l.nota);
    if (igual) igual.cantidad += l.cantidad;
    else resultado.push(l);
  }
  lineas = resultado;
}

function cambio() {
  combinar();
  guardarPedido();
  renderPedido();
  actualizarCuentas();
}

// Guarda el pedido en el iPad para no perderlo si se recarga la página.
function guardarPedido() {
  try {
    localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(lineas));
  } catch {
    /* sin almacenamiento disponible */
  }
}

function cargarPedido() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_PEDIDO) || '[]');
    if (!Array.isArray(datos)) return [];
    return datos.filter((l) => Number.isInteger(l?.id) && Number.isInteger(l.producto_id) && l.cantidad > 0);
  } catch {
    return [];
  }
}

function renderProductos() {
  const cont = $('productos');
  if (errorCarga) {
    cont.innerHTML = `
      <div class="mensaje-vacio">
        No se pudieron cargar los productos.<br>
        <button type="button" class="btn btn-primario" data-accion="reintentar">Reintentar</button>
      </div>`;
    return;
  }
  if (!productos) {
    cont.innerHTML = '<div class="mensaje-vacio">Cargando productos…</div>';
    return;
  }
  if (!productos.length) {
    cont.innerHTML = '<div class="mensaje-vacio">No hay productos activos. Agrégalos en Admin.</div>';
    return;
  }
  cont.innerHTML = productos.map((p) => `
    <button type="button" class="producto" data-producto="${p.id}" style="--color:${COLORES[(p.id - 1) % COLORES.length]}">
      <span class="producto-cuenta" hidden></span>
      <span class="producto-texto">
        <span class="producto-nombre">${esc(p.nombre)}</span>
        ${p.descripcion ? `<span class="producto-desc">${esc(p.descripcion)}</span>` : ''}
      </span>
      <span class="producto-precio">${dinero(p.precio_centavos)}</span>
    </button>`).join('');
  actualizarCuentas();
}

// Burbuja con cuántos de cada producto lleva el pedido.
function actualizarCuentas() {
  const cuentas = new Map();
  for (const l of lineas) cuentas.set(l.producto_id, (cuentas.get(l.producto_id) || 0) + l.cantidad);
  document.querySelectorAll('#productos [data-producto]').forEach((boton) => {
    const n = cuentas.get(Number(boton.dataset.producto)) || 0;
    const burbuja = boton.querySelector('.producto-cuenta');
    burbuja.hidden = n === 0;
    burbuja.textContent = n;
  });
}

function renderPedido() {
  const lista = $('pedido-lineas');
  if (!lineas.length) {
    lista.innerHTML = '<li class="pedido-vacio">Toca un producto para agregarlo</li>';
  } else {
    lista.innerHTML = lineas.map((l) => `
      <li class="linea" data-id="${l.id}">
        <div>
          <div class="linea-nombre">${esc(l.nombre)}</div>
          ${l.nota ? `<div class="linea-nota">“${esc(l.nota)}”</div>` : ''}
          <div class="linea-precio">${dinero(l.precio_centavos)} c/u</div>
        </div>
        <div class="linea-subtotal">${dinero(l.precio_centavos * l.cantidad)}</div>
        <div class="linea-controles">
          <button type="button" class="btn-cant" data-accion="menos" data-linea="${l.id}" aria-label="Quitar uno">−</button>
          <span class="linea-cant">${l.cantidad}</span>
          <button type="button" class="btn-cant" data-accion="mas" data-linea="${l.id}" aria-label="Agregar uno">+</button>
          <span class="espacio"></span>
          <button type="button" class="btn btn-chico" data-accion="nota" data-linea="${l.id}">${l.nota ? 'Editar nota' : 'Nota'}</button>
          <button type="button" class="btn btn-chico btn-borde-peligro" data-accion="quitar" data-linea="${l.id}">Quitar</button>
        </div>
      </li>`).join('');
  }

  const total = totalPedido();
  $('pedido-total').textContent = dinero(total);
  $('btn-cobrar').disabled = !lineas.length || total <= 0;
  $('btn-vaciar').hidden = !lineas.length;
}
