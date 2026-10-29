// Mensajes para la cocina por WhatsApp (enlace wa.me).
// Formato: "Pedido #12: 2 chalupas, 1 pambazo (chorizo con papa), 1 ponche"
import { esc } from './ui.js';

let numeroCocina = '';

export function setNumeroCocina(numero) {
  numeroCocina = String(numero || '').replace(/\D/g, '');
}

export function hayNumeroCocina() {
  return numeroCocina.length > 0;
}

// Plural sencillo: "pambazo" -> "pambazos", "café" -> "cafés".
// Nombres que ya terminan en "s" o de varias palabras se dejan igual.
export function pluralizar(nombre, cantidad) {
  if (cantidad === 1 || /s$/i.test(nombre) || /\s/.test(nombre.trim())) return nombre;
  return `${nombre}s`;
}

function describirLineas(lineas) {
  return lineas
    .map((l) => {
      const nombre = pluralizar(l.nombre.toLocaleLowerCase('es-MX'), l.cantidad);
      return `${l.cantidad} ${nombre}${l.nota ? ` (${l.nota})` : ''}`;
    })
    .join(', ');
}

export function mensajePedido(venta) {
  return `Pedido #${venta.folio}: ${describirLineas(venta.lineas)}`;
}

export function mensajeCancelacion(venta) {
  return `CANCELADO Pedido #${venta.folio}: ${describirLineas(venta.lineas)}`;
}

export function enlaceWhatsApp(texto) {
  return `https://wa.me/${numeroCocina}?text=${encodeURIComponent(texto)}`;
}

// Botón (enlace) que abre WhatsApp con el mensaje ya escrito.
export function botonWhatsApp(texto, etiqueta) {
  if (!hayNumeroCocina()) {
    return '<button type="button" class="btn" disabled>Falta el WhatsApp de cocina (Admin)</button>';
  }
  return `<a class="btn btn-whatsapp" href="${esc(enlaceWhatsApp(texto))}" target="_blank" rel="noopener" data-whatsapp>${esc(etiqueta)}</a>`;
}

// Después de tocarlo, indica que ya se abrió (se puede volver a tocar para reenviar).
document.addEventListener('click', (e) => {
  const enlace = e.target.closest('a[data-whatsapp]');
  if (enlace) {
    setTimeout(() => { enlace.textContent = '✓ WhatsApp abierto · tocar para reenviar'; }, 300);
  }
});
