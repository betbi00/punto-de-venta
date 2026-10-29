// POST /api/login  { pin: "1234" }  ->  { token }
import { manejar, json, leerJson, HttpError, metodoNoPermitido } from '../lib/http.js';
import {
  crearSesion,
  pinEsCorrecto,
  revisarBloqueo,
  registrarFallo,
  limpiarIntentos,
  MINUTOS_BLOQUEO,
} from '../lib/auth.js';

export default manejar(async (req, context) => {
  if (req.method !== 'POST') throw metodoNoPermitido();

  const { pin } = await leerJson(req);
  const ip = context.ip || 'desconocida';

  await revisarBloqueo(ip);

  if (!(await pinEsCorrecto(pin))) {
    const restantes = await registrarFallo(ip);
    throw new HttpError(
      401,
      restantes > 0
        ? `PIN incorrecto. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'}.`
        : `PIN incorrecto. Bloqueado ${MINUTOS_BLOQUEO} minutos.`,
    );
  }

  await limpiarIntentos(ip);
  return json({ token: await crearSesion() });
});

export const config = { path: '/api/login' };
