-- =============================================================================
-- Punto de venta: tablas y datos iniciales
-- Ejecútalo UNA sola vez en el "SQL Editor" de Neon.
-- ANTES de ejecutarlo, cambia el PIN '0000' (casi al final) por el tuyo.
-- =============================================================================

-- Necesaria para guardar el PIN cifrado (bcrypt) y generar claves aleatorias
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PRODUCTOS -------------------------------------------------------------------
CREATE TABLE productos (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,                 -- "Chalupas"
  descripcion     TEXT,                          -- "Orden de 3 piezas" (texto chico en el botón)
  precio          NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  activo          BOOLEAN NOT NULL DEFAULT TRUE, -- ocultar sin borrar
  orden           INTEGER NOT NULL DEFAULT 0,    -- posición del botón
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VENTAS ----------------------------------------------------------------------
CREATE TABLE ventas (
  folio              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creada_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  total              NUMERIC(10,2) NOT NULL CHECK (total > 0),
  metodo_pago        TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia')),
  monto_recibido     NUMERIC(10,2),
  cambio             NUMERIC(10,2),
  estado             TEXT NOT NULL DEFAULT 'pagada' CHECK (estado IN ('pagada', 'cancelada')),
  cancelada_en       TIMESTAMPTZ,
  motivo_cancelacion TEXT,
  -- Efectivo: recibido >= total y cambio correcto. Transferencia: sin esos campos.
  CONSTRAINT pago_coherente CHECK (
    (metodo_pago = 'efectivo'
       AND monto_recibido >= total
       AND cambio = monto_recibido - total)
    OR
    (metodo_pago = 'transferencia'
       AND monto_recibido IS NULL
       AND cambio IS NULL)
  ),
  CONSTRAINT cancelacion_coherente CHECK ((estado = 'cancelada') = (cancelada_en IS NOT NULL))
);
CREATE INDEX ventas_creada_en_idx ON ventas (creada_en);

-- DETALLE DE VENTA ------------------------------------------------------------
-- Guarda nombre y precio "congelados": si mañana cambias un precio,
-- las ventas pasadas no se alteran.
CREATE TABLE venta_detalle (
  id               SERIAL PRIMARY KEY,
  folio            INTEGER NOT NULL REFERENCES ventas(folio),
  producto_id      INTEGER REFERENCES productos(id),
  nombre_producto  TEXT NOT NULL,
  precio_unitario  NUMERIC(10,2) NOT NULL,
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  subtotal         NUMERIC(10,2) NOT NULL,
  nota             TEXT
);
CREATE INDEX venta_detalle_folio_idx ON venta_detalle (folio);

-- CONFIGURACIÓN (clave / valor) -----------------------------------------------
CREATE TABLE configuracion (
  clave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INTENTOS DE PIN (protección contra adivinar el PIN) -------------------------
CREATE TABLE intentos_acceso (
  ip               TEXT PRIMARY KEY,
  fallidos         INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta  TIMESTAMPTZ
);

-- DATOS INICIALES -------------------------------------------------------------
INSERT INTO productos (nombre, descripcion, precio, orden) VALUES
  ('Chalupas', 'Orden de 3 piezas', 10, 1),
  ('Pambazo',  NULL,                30, 2),
  ('Ponche',   NULL,                20, 3),
  ('Café',     NULL,                15, 4),
  ('Maruchan', NULL,                30, 5),
  ('Coca',     NULL,                25, 6);

INSERT INTO configuracion (clave, valor) VALUES
  ('whatsapp_cocina', '527713291713'),
  ('nombre_negocio',  'Mi negocio'),
  ('zona_horaria',    'America/Mexico_City'),
  -- Clave secreta para firmar las sesiones (se genera sola, no la toques)
  ('session_secret',  encode(gen_random_bytes(32), 'hex')),
  -- ⚠️ Cambia 0000 por tu PIN de 4 dígitos. Se guarda cifrado, nunca en texto.
  ('pin_hash',        crypt('0000', gen_salt('bf')));
