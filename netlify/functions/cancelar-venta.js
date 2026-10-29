// POST /api/ventas/:folio/cancelar  { motivo }  -> venta actualizada
// La venta no se borra: queda marcada como cancelada, con fecha y motivo.
import { manejar, json, leerJson, HttpError, metodoNoPermitido } from '../lib/http.js';
import { requerirSesion } from '../lib/auth.js';
import { getSql } from '../lib/db.js';
import { obtenerVenta, parsearFolio } from '../lib/ventas.js';

export default manejar(async (req, context) => {
  await requerirSesion(req);
  if (req.method !== 'POST') throw metodoNoPermitido();

  const folio = parsearFolio(context.params?.folio);
  const body = await leerJson(req);
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 200) : '';

  const sql = getSql();
  const filas = await sql`
    UPDATE ventas
    SET estado = 'cancelada', cancelada_en = now(), motivo_cancelacion = ${motivo || null}
    WHERE folio = ${folio} AND estado = 'pagada'
    RETURNING folio`;

  if (!filas.length) {
    await obtenerVenta(folio); // lanza 404 si no existe
    throw new HttpError(409, `La venta #${folio} ya estaba cancelada`);
  }

  return json(await obtenerVenta(folio));
});

export const config = { path: '/api/ventas/:folio/cancelar' };
