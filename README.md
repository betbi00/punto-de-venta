# punto-de-venta

Punto de venta web para un negocio de comida (chalupas, pambazos, ponche, café…),
pensado para usarse en un iPad desde Safari, agregado a la pantalla de inicio.

- **Frontend:** HTML, CSS y JavaScript sin framework (carpeta `public/`).
- **API:** Netlify Functions (carpeta `netlify/functions/`).
- **Base de datos:** Neon (PostgreSQL) con `@neondatabase/serverless`.
- **Acceso:** PIN de 4 dígitos validado en el servidor (5 intentos fallidos = 15 min de bloqueo).

## Estructura

```
db/schema.sql               Tablas y datos iniciales (se ejecuta una vez en Neon)
netlify.toml                Configuración de Netlify
package.json                Dependencia: @neondatabase/serverless
netlify/lib/                Código compartido de la API (conexión, PIN/sesión, dinero, ventas)
netlify/functions/          Endpoints: login, productos, ventas, cancelar-venta, config
public/                     La app que abre el iPad (index.html, css, js, íconos, manifest)
```

## Publicarlo (primera vez)

### 1. Crear la base de datos en Neon

1. Entra a <https://neon.tech> y crea una cuenta (puedes usar tu cuenta de GitHub o Google).
2. Crea un proyecto:
   - **Project name:** `punto-de-venta`.
   - **Region:** *AWS US East 2 (Ohio)*. Es donde corren las funciones de Netlify, así responde más rápido.
   - Lo demás déjalo como viene.
3. En el menú de la izquierda abre **SQL Editor**.
4. Abre el archivo `db/schema.sql` de este proyecto, copia **todo** su contenido y pégalo en el editor.
5. **Antes de ejecutar**, busca casi al final la línea con `crypt('0000', ...)` y cambia `0000` por
   el PIN que quieras (4 dígitos). Cámbialo solo en el editor de Neon, **no** en el archivo,
   para que tu PIN no quede guardado en GitHub.
6. Presiona **Run**. Debe terminar sin errores.
7. Para comprobarlo, borra el editor, escribe `SELECT * FROM productos;` y presiona **Run**.
   Deben aparecer los 6 productos.
8. Copia la cadena de conexión: en el panel del proyecto (**Dashboard**) presiona el botón
   **Connect** y copia el texto que empieza con `postgresql://...`. Guárdalo un momento:
   es la "llave" de tu base de datos, no la compartas con nadie.

### 2. Publicar la app en Netlify

1. El código debe estar en la rama `main` de tu repositorio de GitHub (`betbi00/punto-de-venta`).
2. Entra a <https://app.netlify.com> y crea una cuenta con **GitHub**.
3. Presiona **Add new project** → **Import an existing project** → **GitHub**.
   Autoriza a Netlify y elige el repositorio `punto-de-venta`.
4. En la configuración que aparece:
   - **Branch to deploy:** `main`.
   - **Build command:** déjalo vacío.
   - **Publish directory:** `public` (ya viene de `netlify.toml`).
   - **Functions directory:** `netlify/functions` (también viene de `netlify.toml`).
5. En esa misma pantalla, presiona **Add environment variables** (o "New variable"):
   - **Key:** `DATABASE_URL`
   - **Value:** la cadena `postgresql://...` que copiaste de Neon.
   - Si te lo ofrece, marca **Contains secret values**.
6. Presiona **Deploy**. En uno o dos minutos te dará una dirección como
   `https://nombre-raro-123.netlify.app`.
7. Si agregaste la variable **después** del primer deploy: ve a **Deploys** →
   **Trigger deploy** → **Deploy project** para que la tome.
8. Opcional: cambia el nombre de la dirección en **Project configuration** →
   **Change project name** (por ejemplo `chalupas-dona-mary` → `https://chalupas-dona-mary.netlify.app`).

### 3. Instalarla en el iPad

1. Abre la dirección de Netlify en **Safari** (tiene que ser Safari).
2. Ingresa tu PIN.
3. Toca el botón **Compartir** (el cuadro con la flecha hacia arriba) → **Agregar a pantalla de inicio**
   → **Agregar**.
4. Abre la app desde el ícono nuevo: se ve a pantalla completa, sin la barra de Safari.
   Puede que te pida el PIN otra vez: es normal, para el iPad es otra "ventana".

### 4. Prueba rápida

1. Haz una venta de prueba y cóbrala.
2. Toca **Avisar a cocina** y revisa que WhatsApp se abra con el mensaje escrito.
3. Ve a **Historial**, abre la venta y cancélala (queda marcada como cancelada, no se borra).
4. En **Admin** revisa el número de WhatsApp de la cocinera y el nombre del negocio.

## Uso diario

- **Venta:** toca un producto para agregar 1. Usa − / + para cambiar cantidades, **Nota** para
  indicaciones (si hay 2 o más, puedes aplicar la nota solo a uno) y **Cobrar**.
- **Cobro en efectivo:** usa los billetes rápidos o el teclado; el cambio aparece en verde.
  "Confirmar venta" no se activa si el dinero no alcanza.
- **Historial:** ventas del día con totales en efectivo y transferencia; puedes ver otros días
  con las flechas.
- **Admin:** precios, productos nuevos, ocultar productos (no se borran), número de cocina,
  nombre del negocio y cambio de PIN.
- La sesión dura 12 horas; después pide el PIN de nuevo.

## Actualizar la app

Cada vez que se sube un cambio a la rama `main` en GitHub, Netlify lo publica solo en uno o dos minutos.

## Si algo falla

- **"Error interno del servidor":** en Netlify abre **Logs** → **Functions** y revisa el error.
  Lo más común es que `DATABASE_URL` falte o esté mal copiada; corrígela y vuelve a desplegar
  (**Deploys** → **Trigger deploy**).
- **Olvidé el PIN:** en el SQL Editor de Neon ejecuta (cambiando `1234` por el PIN nuevo):

  ```sql
  UPDATE configuracion SET valor = crypt('1234', gen_salt('bf')) WHERE clave = 'pin_hash';
  ```

- **Se bloqueó por intentos fallidos:** espera 15 minutos, o en Neon ejecuta
  `DELETE FROM intentos_acceso;`
