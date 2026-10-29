import { neon } from '@neondatabase/serverless';

let sql = null;

// Conexión a Neon. DATABASE_URL solo existe en el servidor (variables de entorno
// de Netlify); el navegador nunca la ve.
export function getSql() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Falta la variable de entorno DATABASE_URL');
    sql = neon(url);
  }
  return sql;
}
