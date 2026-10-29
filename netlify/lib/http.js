// Utilidades para responder JSON desde las Netlify Functions.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function leerJson(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
  return body;
}

// Envuelve un handler: convierte HttpError en respuesta y oculta errores internos.
export function manejar(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Error interno del servidor' }, 500);
    }
  };
}

export function metodoNoPermitido() {
  return new HttpError(405, 'Método no permitido');
}
