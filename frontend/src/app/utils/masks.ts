/**
 * @file masks.ts
 * @description Máscaras de digitação para campos de formulário.
 * Recebem o texto bruto do input e devolvem o valor já formatado.
 */

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** 00000-000 */
export function maskCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** (11) 9999-9999 (fixo) ou (11) 99999-9999 (celular) */
export function maskTelefone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
