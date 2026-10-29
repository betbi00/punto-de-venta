// Arranque de la app: PIN, navegación entre pantallas y carga de datos.
import { api, alExpirarSesion, borrarToken, getToken, setToken } from './api.js';
import { mostrarError } from './ui.js';
import { setNumeroCocina } from './whatsapp.js';
import { initVenta, setProductos } from './venta.js';
import { initHistorial, mostrarHistorial } from './historial.js';
import { initAdmin, mostrarAdmin } from './admin.js';

const PANTALLAS = ['venta', 'historial', 'admin'];
const $ = (id) => document.getElementById(id);

let pantallaActual = 'venta';
let pin = '';
let enviandoPin = false;

// PIN ----------------------------------------------------------------------------

function pintarPuntos() {
  $('pin-puntos').querySelectorAll('span').forEach((punto, i) => {
    punto.classList.toggle('lleno', i < pin.length);
  });
}

function mostrarPin(mensaje = '') {
  $('modal-raiz').innerHTML = '';
  $('app').hidden = true;
  $('pantalla-pin').hidden = false;
  pin = '';
  pintarPuntos();
  $('pin-mensaje').textContent = mensaje;
}

function teclaPin(tecla) {
  if (enviandoPin) return;
  if (tecla === 'borrar') pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += tecla;
  $('pin-mensaje').textContent = '';
  pintarPuntos();
  if (pin.length === 4) enviarPin();
}

async function enviarPin() {
  enviandoPin = true;
  try {
    const { token } = await api('/login', { method: 'POST', body: { pin } });
    setToken(token);
    entrar();
  } catch (err) {
    $('pin-mensaje').textContent = err.message;
    const puntos = $('pin-puntos');
    puntos.classList.remove('sacudir');
    void puntos.offsetWidth; // reinicia la animación
    puntos.classList.add('sacudir');
  } finally {
    pin = '';
    pintarPuntos();
    enviandoPin = false;
  }
}

// La sesión guardada sigue vigente? (el servidor la valida de todos modos)
function sesionVigente() {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).exp > Date.now();
  } catch {
    return false;
  }
}

// App ----------------------------------------------------------------------------

function entrar() {
  $('pantalla-pin').hidden = true;
  $('app').hidden = false;
  irA('venta');
  cargarDatos();
}

async function cargarDatos() {
  try {
    const [productos, config] = await Promise.all([api('/productos'), api('/config')]);
    aplicarConfig(config);
    setProductos(productos);
  } catch (err) {
    if (err.status === 401) return; // ya se mostró la pantalla de PIN
    setProductos(null);
    mostrarError(err);
  }
}

async function recargarProductos() {
  try {
    setProductos(await api('/productos'));
  } catch (err) {
    if (err.status !== 401) mostrarError(err);
  }
}

function aplicarConfig(config) {
  setNumeroCocina(config.whatsapp_cocina);
  const nombre = config.nombre_negocio || 'Punto de venta';
  $('nombre-negocio').textContent = nombre;
  document.title = nombre;
}

function irA(nombre) {
  pantallaActual = nombre;
  for (const p of PANTALLAS) $(`pantalla-${p}`).hidden = p !== nombre;
  document.querySelectorAll('.pestana').forEach((b) => {
    b.classList.toggle('activa', b.dataset.pantalla === nombre);
  });
  if (nombre === 'historial') mostrarHistorial();
  if (nombre === 'admin') mostrarAdmin();
}

function iniciar() {
  $('pin-teclado').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-tecla]');
    if (boton) teclaPin(boton.dataset.tecla);
  });
  // También funciona con teclado físico
  document.addEventListener('keydown', (e) => {
    if ($('pantalla-pin').hidden) return;
    if (/^\d$/.test(e.key)) teclaPin(e.key);
    if (e.key === 'Backspace') teclaPin('borrar');
  });

  document.querySelectorAll('.pestana').forEach((boton) => {
    boton.addEventListener('click', () => irA(boton.dataset.pantalla));
  });

  initVenta({ reintentar: cargarDatos });
  initHistorial();
  initAdmin({
    alCambiarProductos: recargarProductos,
    alCambiarConfig: aplicarConfig,
    alCerrarSesion: () => {
      borrarToken();
      mostrarPin();
    },
  });

  alExpirarSesion((mensaje) => mostrarPin(mensaje || 'Ingresa tu PIN'));

  // Al volver a la app (por ejemplo, después de WhatsApp) se actualizan precios.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || $('app').hidden) return;
    if (!sesionVigente()) {
      borrarToken();
      mostrarPin('Tu sesión expiró. Ingresa tu PIN.');
    } else if (pantallaActual === 'venta') {
      recargarProductos();
    }
  });

  if (sesionVigente()) entrar();
  else {
    borrarToken();
    mostrarPin();
  }
}

iniciar();
