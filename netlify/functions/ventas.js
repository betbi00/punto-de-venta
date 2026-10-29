// GET  /api/ventas?fecha=AAAA-MM-DD  -> ventas de ese día (por defecto, hoy) y resumen
// GET  /api/ventas/:folio            -> detalle de una venta
// POST /api/ventas                   -> registrar venta
//   { items: [{ producto_id, cantidad, nota }], metodo_pago, monto_recibido_centavos }
import { manejar, json, leerJson, HttpError, metodoNoPermitido } from '../lib/http.js';
import { requerirSesion } from '../lib/auth.js';
import { getSql } from '../lib/db.js';
import { pesosACentavos, centavosAPesos, esCentavosValido } from '../lib/dinero.js';
import { obtenerVenta, parsearFolio } from '../lib/ventas.js';

const METODOS = ['efectivo', 'transferencia'];

async function listarVentas(fecha) {
  if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new HttpError(400, 'Fecha inválida');
  }
  const sql = getSql();
  // El "día" se calcula con la hora de México, no con la del servidor (UTC).
  const [fila] = await sql`
    WITH cfg AS (
      SELECT COALESCE(
        (SELECT valor FROM configuracion WHERE clave = 'zona_horaria'),
        'America/Mexico_City') AS tz
    ),
    dia AS (
      SELECT COALESCE(${fecha}::date, (now() AT TIME ZONE cfg.tz)::date) AS d, cfg.tz FROM cfg
    )
    SELECT
      to_char(dia.d, 'YYYY-MM-DD') AS fecha,
      COALESCE((
        SELECT json_agg(json_build_object(
          'folio', v.folio,
          'hora', to_char(v.creada_en AT TIME ZONE dia.tz, 'HH24:MI'),
          'total', v.total,
          'metodo_pago', v.metodo_pago,
          'estado', v.estado,
          'resumen', (
            SELECT string_agg(d.cantidad || ' ' || d.nombre_producto, ', ' ORDER BY d.id)
            FROM venta_detalle d WHERE d.folio = v.folio
          )
        ) ORDER BY v.folio DESC)
        FROM ventas v
        WHERE v.creada_en >= dia.d::timestamp AT TIME ZONE dia.tz
          AND v.creada_en < (dia.d + 1)::timestamp AT TIME ZONE dia.tz
      ), '[]'::json) AS ventas
    FROM dia`;

  const ventas = fila.ventas.map((v) => ({
    folio: v.folio,
    hora: v.hora,
    total_centavos: pesosACentavos(v.total),
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    resumen: v.resumen || '',
  }));

  const pagadas = ventas.filter((v) => v.estado === 'pagada');
  const sumar = (lista) => lista.reduce((s, v) => s + v.total_centavos, 0);

  return {
    fecha: fila.fecha,
    ventas,
    resumen: {
      num_ventas: pagadas.length,
      num_canceladas: ventas.length - pagadas.length,
      total_centavos: sumar(pagadas),
      efectivo_centavos: sumar(pagadas.filter((v) => v.metodo_pago === 'efectivo')),
      transferencia_centavos: sumar(pagadas.filter((v) => v.metodo_pago === 'transferencia')),
    },
  };
}

async function crearVenta(body) {
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'El pedido está vacío');
  if (items.length > 50) throw new HttpError(400, 'El pedido tiene demasiados renglones');

  const pedido = items.map((it) => {
    const productoId = Number(it?.producto_id);
    const cantidad = Number(it?.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) throw new HttpError(400, 'Producto inválido');
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) {
      throw new HttpError(400, 'Cantidad inválida');
    }
    const nota = typeof it.nota === 'string' ? it.nota.trim().slice(0, 100) : '';
    return { productoId, cantidad, nota: nota || null };
  });

  const metodo = body.metodo_pago;
  if (!METODOS.includes(metodo)) throw new HttpError(400, 'Método de pago inválido');

  const sql = getSql();

  // Los precios se toman de la base de datos, nunca del navegador.
  const ids = [...new Set(pedido.map((l) => l.productoId))];
  const productos = await sql`
    SELECT id, nombre, precio FROM productos WHERE id = ANY(${ids}::int[]) AND activo`;
  const porId = new Map(productos.map((p) => [p.id, p]));

  let totalCentavos = 0;
  const lineas = pedido.map((l, i) => {
    const p = porId.get(l.productoId);
    if (!p) throw new HttpError(409, 'Un producto ya no está disponible. Recarga la pantalla.');
    const precio = pesosACentavos(p.precio);
    const subtotal = precio * l.cantidad;
    totalCentavos += subtotal;
    return {
      pos: i,
      producto_id: p.id,
      nombre: p.nombre,
      precio: centavosAPesos(precio),
      cantidad: l.cantidad,
      subtotal: centavosAPesos(subtotal),
      nota: l.nota,
    };
  });

  if (totalCentavos <= 0) throw new HttpError(400, 'El total debe ser mayor a cero');

  let recibido = null;
  let cambio = null;
  if (metodo === 'efectivo') {
    const centavos = body.monto_recibido_centavos;
    if (!esCentavosValido(centavos)) throw new HttpError(400, 'Monto recibido inválido');
    if (centavos < totalCentavos) throw new HttpError(400, 'El monto recibido no alcanza');
    recibido = centavosAPesos(centavos);
    cambio = centavosAPesos(centavos - totalCentavos);
  }

  // Venta y detalle se guardan en una sola instrucción: o se guarda todo o nada.
  const [nueva] = await sql`
    WITH nueva AS (
      INSERT INTO ventas (total, metodo_pago, monto_recibido, cambio)
      VALUES (${centavosAPesos(totalCentavos)}, ${metodo}, ${recibido}, ${cambio})
      RETURNING folio
    ),
    detalle AS (
      INSERT INTO venta_detalle
        (folio, producto_id, nombre_producto, precio_unitario, cantidad, subtotal, nota)
      SELECT nueva.folio, l.producto_id, l.nombre, l.precio, l.cantidad, l.subtotal, l.nota
      FROM nueva,
           jsonb_to_recordset(${JSON.stringify(lineas)}::jsonb) AS l(
             pos int, producto_id int, nombre text, precio numeric,
             cantidad int, subtotal numeric, nota text)
      ORDER BY l.pos
    )
    SELECT folio FROM nueva`;

  return obtenerVenta(nueva.folio);
}

export default manejar(async (req, context) => {
  await requerirSesion(req);
  const folio = context.params?.folio;

  if (req.method === 'GET' && folio) return json(await obtenerVenta(parsearFolio(folio)));
  if (req.method === 'GET') return json(await listarVentas(new URL(req.url).searchParams.get('fecha')));
  if (req.method === 'POST' && !folio) return json(await crearVenta(await leerJson(req)), 201);

  throw metodoNoPermitido();
});

export const config = { path: ['/api/ventas', '/api/ventas/:folio'] };
