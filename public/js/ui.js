// Utilidades de interfaz: dinero, escape de HTML, ventanas modales y avisos.

// 3050 -> "$30.50" ; 3000 -> "$30"
export function dinero(centavos) {
  const pesos = (centavos || 0) / 100;
  const decimales = centavos % 100 === 0 ? 0 : 2;
  return `$${pesos.toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`;
}

// "12.5" o "12,50" -> 1250 ; texto inválido -> null
export function textoACentavos(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.').replace(/[$\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
}

// 1250 -> "12.50" ; 1200 -> "12"
export function centavosATexto(centavos) {
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2);
}

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Abre una ventana modal. Devuelve { el, cerrar }.
export function abrirModal(html, { clase = '' } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${clase}" role="dialog" aria-modal="true">${html}</div>`;
  document.getElementById('modal-raiz').appendChild(fondo);

  const cerrar = () => fondo.remove();
  return { el: fondo.firstElementChild, cerrar };
}

// Pregunta de sí/no con botones grandes. Devuelve una promesa con true/false.
export function confirmar(mensaje, { si = 'Sí', no = 'No', peligro = false } = {}) {
  return new Promise((resolver) => {
    const { el, cerrar } = abrirModal(`
      <p class="modal-texto">${esc(mensaje)}</p>
      <div class="modal-botones">
        <button type="button" class="btn" data-r="no">${esc(no)}</button>
        <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-r="si">${esc(si)}</button>
      </div>`);
    el.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-r]');
      if (!boton) return;
      cerrar();
      resolver(boton.dataset.r === 'si');
    });
  });
}

let temporizadorToast = null;

export function toast(mensaje, tipo = 'info') {
  const el = document.getElementById('toast');
  el.textContent = mensaje;
  el.className = `toast ${tipo}`;
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.hidden = true; }, tipo === 'error' ? 4500 : 2500);
}

export function mostrarError(err) {
  toast(err?.message || 'Ocurrió un error', 'error');
}
