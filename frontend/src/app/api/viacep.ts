/**
 * @file viacep.ts
 * @description Consulta de endereço por CEP na API pública do ViaCEP (https://viacep.com.br).
 * Não passa pelo client.ts: é um serviço externo, sem envelope nem token.
 */

export type EnderecoCep = {
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type ViaCepResponse = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

/** Retorna o endereço do CEP (8 dígitos) ou `null` se o CEP não existir. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) throw new Error('Falha ao consultar o CEP.');

  const data = (await res.json()) as ViaCepResponse;
  if (data.erro) return null;

  return {
    rua: data.logradouro ?? '',
    bairro: data.bairro ?? '',
    cidade: data.localidade ?? '',
    uf: data.uf ?? '',
  };
}
