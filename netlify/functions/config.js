// GET /api/config  -> { whatsapp_cocina, nombre_negocio }
// PUT /api/config  -> { whatsapp_cocina?, nombre_negocio?, pin_actual?, pin_nuevo? }
// El PIN y la clave de sesión nunca se envían al navegador.
import { manejar, json, leerJson, HttpError, metodoNoPermitido } from '../lib/http.js';
import { requerirSesion, esPinValido, pinEsCorrecto, cambiarPin } from '../lib/auth.js';
import { getSql } from '../lib/db.js';

const CLAVES_PUBLICAS = ['whatsapp_cocina', 'nombre_negocio'];

async function leerConfig() {
  const sql = getSql();
  const filas = await sql`
    SELECT clave, valor FROM configuracion WHERE clave = ANY(${CLAVES_PUBLICAS}::text[])`;
  const config = Object.fromEntries(CLAVES_PUBLICAS.map((c) => [c, '']));
  for (const f of filas) config[f.clave] = f.valor;
  return config;
}

function normalizarWhatsApp(valor) {
  let numero = String(valor ?? '').replace(/\D/g, '');
  if (numero.length === 10) numero = `52${numero}`; // número de México sin lada de país
  if (!/^\d{11,15}$/.test(numero)) {
    throw new HttpError(400, 'Número de WhatsApp inválido. Usa 10 dígitos o incluye la lada del país.');
  }
  return numero;
}

export default manejar(async (req) => {
  await requerirSesion(req);

  if (req.method === 'GET') return json(await leerConfig());

  if (req.method === 'PUT') {
    const body = await leerJson(req);
    const cambios = [];

    if ('whatsapp_cocina' in body) {
      cambios.push(['whatsapp_cocina', normalizarWhatsApp(body.whatsapp_cocina)]);
    }

    if ('nombre_negocio' in body) {
      const nombre = typeof body.nombre_negocio === 'string' ? body.nombre_negocio.trim() : '';
      if (!nombre || nombre.length > 40) {
        throw new HttpError(400, 'El nombre del negocio es obligatorio (máximo 40 letras)');
      }
      cambios.push(['nombre_negocio', nombre]);
    }

    if ('pin_nuevo' in body) {
      if (!esPinValido(body.pin_nuevo)) throw new HttpError(400, 'El PIN nuevo debe tener 4 dígitos');
      if (!(await pinEsCorrecto(body.pin_actual))) throw new HttpError(400, 'El PIN actual es incorrecto');
      await cambiarPin(body.pin_nuevo);
    }

    const sql = getSql();
    for (const [clave, valor] of cambios) {
      await sql`
        INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`;
    }

    return json(await leerConfig());
  }

  throw metodoNoPermitido();
});

export const config = { path: '/api/config' };
