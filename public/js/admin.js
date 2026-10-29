// Administración: productos y precios, WhatsApp de cocina, nombre del negocio y PIN.
import { api } from './api.js';
import { centavosATexto, confirmar, esc, mostrarError, textoACentavos, toast } from './ui.js';
import { enlaceWhatsApp } from './whatsapp.js';

const MENSAJE_PRUEBA = 'Mensaje de prueba desde el punto de venta ✅';

let productos = [];
let config = {};
let avisos = { alCambiarProductos() {}, alCambiarConfig() {}, alCerrarSesion() {} };

const $ = (id) => document.getElementById(id);

export function initAdmin(callbacks) {
  avisos = callbacks;
  const cont = $('admin-contenido');
  cont.addEventListener('click', alTocar);
  cont.addEventListener('submit', alEnviar);
  // Resalta "Guardar" cuando un producto tiene cambios sin guardar.
  const marcar = (e) => {
    e.target.closest('form[data-form="producto"]')?.querySelector('[type="submit"]').classList.add('btn-primario');
  };
  cont.addEventListener('input', marcar);
  cont.addEventListener('change', marcar);
}

export async function mostrarAdmin() {
  const cont = $('admin-contenido');
  cont.innerHTML = '<div class="mensaje-vacio">Cargando…</div>';
  try {
    [productos, config] = await Promise.all([api('/productos?todos=1'), api('/config')]);
    render();
  } catch (err) {
    mostrarError(err);
    cont.innerHTML = `
      <div class="mensaje-vacio">
        No se pudo cargar la administración.<br>
        <button type="button" class="btn btn-primario" data-accion="recargar">Reintentar</button>
      </div>`;
  }
}

function render() {
  $('admin-contenido').innerHTML = `
    <section class="admin-seccion">
      <div class="admin-encabezado">
        <h2>Productos y precios</h2>
        <button type="button" class="btn btn-primario" data-accion="nuevo">+ Agregar producto</button>
      </div>
      <p class="ayuda">Apaga "Activo" para ocultar un producto de la pantalla de venta.
        "Orden" es la posición del botón (el número más chico va primero).</p>
      <div id="admin-productos">${productos.map(formProducto).join('')}</div>
    </section>

    <section class="admin-seccion">
      <h2>WhatsApp de cocina</h2>
      <p class="ayuda">Número que recibe los pedidos. Escribe 10 dígitos (se agrega el 52 de México)
        o el número completo con lada de país.</p>
      <form class="fila-campos" data-form="whatsapp">
        <div>
          <label for="cfg-whatsapp">Número</label>
          <input id="cfg-whatsapp" class="campo" name="numero" type="tel" inputmode="numeric"
                 autocomplete="off" value="${esc(config.whatsapp_cocina)}">
        </div>
        <button type="submit" class="btn btn-primario">Guardar</button>
        <a class="btn btn-whatsapp" id="cfg-probar" target="_blank" rel="noopener"
           href="${esc(enlaceWhatsApp(MENSAJE_PRUEBA))}">Probar</a>
      </form>
    </section>

    <section class="admin-seccion">
      <h2>Nombre del negocio</h2>
      <form class="fila-campos" data-form="negocio">
        <div>
          <label for="cfg-negocio">Aparece arriba en la pantalla</label>
          <input id="cfg-negocio" class="campo" name="nombre" maxlength="40" autocomplete="off"
                 value="${esc(config.nombre_negocio)}">
        </div>
        <button type="submit" class="btn btn-primario">Guardar</button>
      </form>
    </section>

    <section class="admin-seccion">
      <h2>Cambiar PIN</h2>
      <form class="fila-campos" data-form="pin">
        <div>
          <label for="pin-actual">PIN actual</label>
          <input id="pin-actual" class="campo" name="actual" type="password" inputmode="numeric"
                 pattern="[0-9]*" maxlength="4" autocomplete="off">
        </div>
        <div>
          <label for="pin-nuevo">PIN nuevo</label>
          <input id="pin-nuevo" class="campo" name="nuevo" type="password" inputmode="numeric"
                 pattern="[0-9]*" maxlength="4" autocomplete="off">
        </div>
        <div>
          <label for="pin-repetido">Repite el PIN nuevo</label>
          <input id="pin-repetido" class="campo" name="repetido" type="password" inputmode="numeric"
                 pattern="[0-9]*" maxlength="4" autocomplete="off">
        </div>
        <button type="submit" class="btn btn-primario">Cambiar PIN</button>
      </form>
    </section>

    <section class="admin-seccion">
      <h2>Sesión</h2>
      <p class="ayuda">Cierra la sesión en este iPad. Para volver a entrar se pedirá el PIN.</p>
      <button type="button" class="btn btn-borde-peligro" data-accion="salir">Cerrar sesión</button>
    </section>`;
}

function formProducto(p) {
  const nuevo = !p.id;
  return `
    <form class="producto-form ${p.activo ? '' : 'inactivo'} ${nuevo ? 'nuevo' : ''}"
          data-form="producto" data-id="${p.id ?? ''}">
      <div>
        <label>Nombre</label>
        <input class="campo" name="nombre" maxlength="40" autocomplete="off" value="${esc(p.nombre)}">
      </div>
      <div>
        <label>Descripción (opcional)</label>
        <input class="campo" name="descripcion" maxlength="60" autocomplete="off" value="${esc(p.descripcion)}">
      </div>
      <div>
        <label>Precio $</label>
        <input class="campo" name="precio" inputmode="decimal" autocomplete="off"
               value="${nuevo ? '' : centavosATexto(p.precio_centavos)}">
      </div>
      <div>
        <label>Orden</label>
        <input class="campo" name="orden" inputmode="numeric" autocomplete="off" value="${p.orden}">
      </div>
      <label class="interruptor">Activo<input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}></label>
      <div class="guardar">
        <button type="submit" class="btn btn-ancho ${nuevo ? 'btn-primario' : ''}">${nuevo ? 'Crear' : 'Guardar'}</button>
      </div>
    </form>`;
}

async function alTocar(e) {
  const accion = e.target.closest('[data-accion]')?.dataset.accion;

  if (accion === 'recargar') mostrarAdmin();

  if (accion === 'nuevo') {
    const lista = $('admin-productos');
    if (lista.querySelector('.producto-form.nuevo')) return;
    const orden = productos.reduce((max, p) => Math.max(max, p.orden), 0) + 1;
    lista.insertAdjacentHTML('afterbegin', formProducto({ nombre: '', descripcion: '', orden, activo: true }));
    lista.querySelector('.producto-form.nuevo input[name="nombre"]').focus();
  }

  if (accion === 'salir') {
    if (await confirmar('¿Cerrar sesión en este iPad?', { si: 'Cerrar sesión', peligro: true })) {
      avisos.alCerrarSesion();
    }
  }
}

async function alEnviar(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    if (form.dataset.form === 'producto') await guardarProducto(form);
    if (form.dataset.form === 'whatsapp') await guardarWhatsApp(form);
    if (form.dataset.form === 'negocio') await guardarNegocio(form);
    if (form.dataset.form === 'pin') await guardarPin(form);
  } catch (err) {
    mostrarError(err);
  } finally {
    boton.disabled = false;
  }
}

async function guardarProducto(form) {
  const campos = form.elements;
  const precio = textoACentavos(campos.precio.value);
  if (precio === null) {
    toast('Escribe un precio válido, por ejemplo 25 o 12.50', 'error');
    return;
  }
  const orden = Number(campos.orden.value || 0);
  if (!Number.isInteger(orden)) {
    toast('El orden debe ser un número entero', 'error');
    return;
  }

  const body = {
    nombre: campos.nombre.value,
    descripcion: campos.descripcion.value,
    precio_centavos: precio,
    orden,
    activo: campos.activo.checked,
  };
  const id = form.dataset.id;
  const guardado = id
    ? await api(`/productos/${id}`, { method: 'PUT', body })
    : await api('/productos', { method: 'POST', body });

  const i = productos.findIndex((p) => p.id === guardado.id);
  if (i >= 0) productos[i] = guardado;
  else productos.push(guardado);

  form.outerHTML = formProducto(guardado);
  toast(`"${guardado.nombre}" guardado`, 'exito');
  avisos.alCambiarProductos();
}

async function guardarWhatsApp(form) {
  config = await api('/config', { method: 'PUT', body: { whatsapp_cocina: form.elements.numero.value } });
  avisos.alCambiarConfig(config);
  form.elements.numero.value = config.whatsapp_cocina;
  $('cfg-probar').href = enlaceWhatsApp(MENSAJE_PRUEBA);
  toast('Número de cocina guardado', 'exito');
}

async function guardarNegocio(form) {
  config = await api('/config', { method: 'PUT', body: { nombre_negocio: form.elements.nombre.value } });
  avisos.alCambiarConfig(config);
  toast('Nombre guardado', 'exito');
}

async function guardarPin(form) {
  const { actual, nuevo, repetido } = form.elements;
  if (!/^\d{4}$/.test(nuevo.value)) {
    toast('El PIN nuevo debe tener 4 dígitos', 'error');
    return;
  }
  if (nuevo.value !== repetido.value) {
    toast('Los PIN nuevos no coinciden', 'error');
    return;
  }
  await api('/config', { method: 'PUT', body: { pin_actual: actual.value, pin_nuevo: nuevo.value } });
  form.reset();
  toast('PIN cambiado', 'exito');
}
