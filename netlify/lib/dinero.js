// La API trabaja en centavos (enteros) para evitar errores de redondeo;
// la base de datos guarda pesos con 2 decimales (NUMERIC).

// "30.00" (de la base de datos) -> 3000
export function pesosACentavos(valor) {
  return Math.round(Number(valor) * 100);
}

// 3000 -> "30.00" (para guardar en la base de datos)
export function centavosAPesos(centavos) {
  return (centavos / 100).toFixed(2);
}

export function esCentavosValido(valor, maximo = 10_000_000) {
  return Number.isInteger(valor) && valor >= 0 && valor <= maximo;
}
