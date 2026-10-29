// GET  /api/productos          -> productos activos (pantalla de venta)
// GET  /api/productos?todos=1  -> todos, incluso ocultos (administración)
// POST /api/productos          -> crear
// PUT  /api/productos/:id      -> editar
// No se borran: se ocultan con "activo = false" para no romper ventas pasadas.
import { manejar, json, leerJson, HttpError, metodoNoPermitido } from '../lib/http.js';
import { requerirSesion } from '../lib/auth.js';
import { getSql } from '../lib/db.js';
import { pesosACentavos, centavosAPesos, esCentavosValido } from '../lib/dinero.js';

function formatear(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    precio_centavos: pesosACentavos(fila.precio),
    activo: fila.activo,
    orden: fila.orden,
  };
}

function validar(body) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre || nombre.length > 40) {
    throw new HttpError(400, 'El nombre es obligatorio (máximo 40 letras)');
  }

  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : '';
  if (descripcion.length > 60) throw new HttpError(400, 'La descripción es muy larga (máximo 60)');

  if (!esCentavosValido(body.precio_centavos)) throw new HttpError(400, 'Precio inválido');

  const orden = body.orden === undefined || body.orden === null ? 0 : Number(body.orden);
  if (!Number.isInteger(orden) || Math.abs(orden) > 1000) throw new HttpError(400, 'Orden inválido');

  return {
    nombre,
    descripcion: descripcion || null,
    precio: centavosAPesos(body.precio_centavos),
    orden,
    activo: body.activo !== false,
  };
}

export default manejar(async (req, context) => {
  await requerirSesion(req);
  const sql = getSql();
  const id = context.params?.id;

  if (req.method === 'GET' && !id) {
    const todos = new URL(req.url).searchParams.get('todos') === '1';
    const filas = todos
      ? await sql`SELECT * FROM productos ORDER BY orden, id`
      : await sql`SELECT * FROM productos WHERE activo ORDER BY orden, id`;
    return json(filas.map(formatear));
  }

  if (req.method === 'POST' && !id) {
    const p = validar(await leerJson(req));
    const [fila] = await sql`
      INSERT INTO productos (nombre, descripcion, precio, orden, activo)
      VALUES (${p.nombre}, ${p.descripcion}, ${p.precio}, ${p.orden}, ${p.activo})
      RETURNING *`;
    return json(formatear(fila), 201);
  }

  if (req.method === 'PUT' && id) {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) throw new HttpError(400, 'Producto inválido');
    const p = validar(await leerJson(req));
    const [fila] = await sql`
      UPDATE productos SET
        nombre = ${p.nombre},
        descripcion = ${p.descripcion},
        precio = ${p.precio},
        orden = ${p.orden},
        activo = ${p.activo},
        actualizado_en = now()
      WHERE id = ${idNum}
      RETURNING *`;
    if (!fila) throw new HttpError(404, 'El producto no existe');
    return json(formatear(fila));
  }

  throw metodoNoPermitido();
});

export const config = { path: ['/api/productos', '/api/productos/:id'] };
