// Comunicación con la API (/api/*). Agrega la sesión a cada petición.

const CLAVE_TOKEN = 'pv_token';
let alExpirar = () => {};
let tokenEnMemoria = getToken();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(CLAVE_TOKEN, token);
  } catch {
    /* sin almacenamiento: la sesión dura mientras la página esté abierta */
  }
  tokenEnMemoria = token;
}

export function borrarToken() {
  try {
    localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* nada que borrar */
  }
  tokenEnMemoria = null;
}

// Se llama cuando el servidor dice que la sesión ya no es válida.
export function alExpirarSesion(fn) {
  alExpirar = fn;
}

export async function api(ruta, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (tokenEnMemoria) headers.authorization = `Bearer ${tokenEnMemoria}`;

  let res;
  try {
    res = await fetch(`/api${ruta}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Sin conexión a internet. Intenta de nuevo.', 0);
  }

  let datos = null;
  try {
    datos = await res.json();
  } catch {
    datos = null;
  }

  if (res.status === 401 && ruta !== '/login') {
    borrarToken();
    alExpirar(datos?.error);
  }
  if (!res.ok) throw new ApiError(datos?.error || `Error ${res.status}`, res.status);
  return datos;
}
