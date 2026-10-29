// Consultas de ventas compartidas por varias funciones.
import { getSql } from './db.js';
import { HttpError } from './http.js';
import { pesosACentavos } from './dinero.js';

export function parsearFolio(valor) {
  const folio = Number(valor);
  if (!Number.isInteger(folio) || folio <= 0) throw new HttpError(400, 'Folio inválido');
  return folio;
}

// Venta completa con su detalle, o 404 si no existe.
export async function obtenerVenta(folio) {
  const sql = getSql();
  const [ventas, lineas] = await Promise.all([
    sql`
      SELECT v.folio, v.total, v.metodo_pago, v.monto_recibido, v.cambio, v.estado,
             v.motivo_cancelacion,
             to_char(v.creada_en AT TIME ZONE cfg.tz, 'DD/MM/YYYY HH24:MI') AS fecha_hora,
             to_char(v.cancelada_en AT TIME ZONE cfg.tz, 'DD/MM/YYYY HH24:MI') AS cancelada_fecha_hora
      FROM ventas v,
           (SELECT COALESCE(
              (SELECT valor FROM configuracion WHERE clave = 'zona_horaria'),
              'America/Mexico_City') AS tz) cfg
      WHERE v.folio = ${folio}`,
    sql`
      SELECT producto_id, nombre_producto, precio_unitario, cantidad, subtotal, nota
      FROM venta_detalle
      WHERE folio = ${folio}
      ORDER BY id`,
  ]);

  const v = ventas[0];
  if (!v) throw new HttpError(404, `No existe la venta #${folio}`);

  return {
    folio: v.folio,
    fecha_hora: v.fecha_hora,
    total_centavos: pesosACentavos(v.total),
    metodo_pago: v.metodo_pago,
    monto_recibido_centavos: v.monto_recibido === null ? null : pesosACentavos(v.monto_recibido),
    cambio_centavos: v.cambio === null ? null : pesosACentavos(v.cambio),
    estado: v.estado,
    cancelada_fecha_hora: v.cancelada_fecha_hora,
    motivo_cancelacion: v.motivo_cancelacion,
    lineas: lineas.map((l) => ({
      producto_id: l.producto_id,
      nombre: l.nombre_producto,
      precio_unitario_centavos: pesosACentavos(l.precio_unitario),
      cantidad: l.cantidad,
      subtotal_centavos: pesosACentavos(l.subtotal),
      nota: l.nota,
    })),
  };
}
