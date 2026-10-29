// PIN y sesiones.
// - El PIN se guarda cifrado (bcrypt) en la tabla configuracion y se compara en la base de datos.
// - Al acertar el PIN se entrega un token firmado (HMAC) que dura DURACION_SESION_MS.
// - Tras MAX_INTENTOS fallidos desde una misma IP, se bloquea MINUTOS_BLOQUEO minutos.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from './db.js';
import { HttpError } from './http.js';

const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // 12 horas
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

let secretoCache = null;

async function obtenerSecreto() {
  if (!secretoCache) {
    const sql = getSql();
    const filas = await sql`SELECT valor FROM configuracion WHERE clave = 'session_secret'`;
    if (!filas.length) throw new Error('Falta session_secret en la tabla configuracion');
    secretoCache = filas[0].valor;
  }
  return secretoCache;
}

function firmar(payload, secreto) {
  return createHmac('sha256', secreto).update(payload).digest('base64url');
}

export async function crearSesion() {
  const datos = { exp: Date.now() + DURACION_SESION_MS };
  const payload = Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${payload}.${firmar(payload, await obtenerSecreto())}`;
}

// Lanza 401 si la petición no trae una sesión válida y vigente.
export async function requerirSesion(req) {
  const encabezado = req.headers.get('authorization') || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
  const [payload, firma] = token.split('.');
  if (!payload || !firma) throw new HttpError(401, 'Ingresa tu PIN');

  const esperada = Buffer.from(firmar(payload, await obtenerSecreto()));
  const recibida = Buffer.from(firma);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    throw new HttpError(401, 'Sesión no válida, ingresa tu PIN');
  }

  let datos = null;
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    datos = null;
  }
  if (!datos || typeof datos.exp !== 'number' || datos.exp < Date.now()) {
    throw new HttpError(401, 'Tu sesión expiró, ingresa tu PIN');
  }
}

export function esPinValido(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export async function pinEsCorrecto(pin) {
  if (!esPinValido(pin)) return false;
  const sql = getSql();
  const filas = await sql`
    SELECT valor = crypt(${pin}, valor) AS ok
    FROM configuracion WHERE clave = 'pin_hash'`;
  return Boolean(filas[0]?.ok);
}

export async function cambiarPin(pinNuevo) {
  const sql = getSql();
  await sql`
    UPDATE configuracion
    SET valor = crypt(${pinNuevo}, gen_salt('bf')), actualizado_en = now()
    WHERE clave = 'pin_hash'`;
}

// Lanza 429 si la IP está bloqueada por demasiados intentos fallidos.
export async function revisarBloqueo(ip) {
  const sql = getSql();
  const filas = await sql`
    SELECT CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - now())) / 60)::int AS minutos
    FROM intentos_acceso
    WHERE ip = ${ip} AND bloqueado_hasta > now()`;
  if (filas.length) {
    throw new HttpError(429, `Demasiados intentos. Espera ${filas[0].minutos} min.`);
  }
}

// Suma un intento fallido. Devuelve cuántos intentos quedan (0 = quedó bloqueado).
export async function registrarFallo(ip) {
  const sql = getSql();
  const [fila] = await sql`
    INSERT INTO intentos_acceso (ip, fallidos) VALUES (${ip}, 1)
    ON CONFLICT (ip) DO UPDATE SET
      fallidos = CASE
        WHEN intentos_acceso.fallidos + 1 >= ${MAX_INTENTOS}::int THEN 0
        ELSE intentos_acceso.fallidos + 1
      END,
      bloqueado_hasta = CASE
        WHEN intentos_acceso.fallidos + 1 >= ${MAX_INTENTOS}::int
          THEN now() + make_interval(mins => ${MINUTOS_BLOQUEO}::int)
        ELSE NULL
      END
    RETURNING fallidos, bloqueado_hasta`;
  return fila.bloqueado_hasta ? 0 : MAX_INTENTOS - fila.fallidos;
}

export async function limpiarIntentos(ip) {
  const sql = getSql();
  await sql`DELETE FROM intentos_acceso WHERE ip = ${ip}`;
}
