/**
 * @file FreteService.js
 * @description Estimativa de frete do ambiente de teste (não consulta
 * transportadora). Considera a distância "administrativa" entre o endereço do
 * produtor e o destino (mesma cidade / mesmo estado / outro estado) e o peso.
 *
 * - Peso por item: `peso_kg` do anúncio × quantidade (1 kg quando não informado).
 * - Frete grátis quando o subtotal do vendedor passa de FRETE_GRATIS_ACIMA.
 * - Retirada no local é sempre gratuita.
 */

const FRETE_GRATIS_ACIMA = 500;

const TABELA = {
  MESMA_CIDADE: { base: 8, porKg: 0.5, prazo: [1, 2] },
  MESMO_ESTADO: { base: 18, porKg: 1.2, prazo: [2, 4] },
  OUTRO_ESTADO: { base: 35, porKg: 2.5, prazo: [5, 9] },
};

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function faixa(origem, destino) {
  if (normalizar(origem.uf) !== normalizar(destino.uf)) return 'OUTRO_ESTADO';
  if (normalizar(origem.cidade) !== normalizar(destino.cidade)) return 'MESMO_ESTADO';
  return 'MESMA_CIDADE';
}

class FreteService {
  /**
   * @param {{cidade: string, uf: string}} origem - endereço do produtor
   * @param {{cidade: string, uf: string}} destino - endereço do comprador
   * @param {number} pesoKg - peso total do pedido
   * @param {number} subtotal - valor dos produtos do vendedor
   * @returns {{valor: number, prazo_min: number, prazo_max: number, faixa: string, gratis: boolean}}
   */
  static calcular(origem, destino, pesoKg, subtotal) {
    const chave = faixa(origem, destino);
    const regra = TABELA[chave];
    const gratis = subtotal >= FRETE_GRATIS_ACIMA;
    const valor = gratis ? 0 : Math.round((regra.base + regra.porKg * Math.max(pesoKg, 1)) * 100) / 100;
    return { valor, prazo_min: regra.prazo[0], prazo_max: regra.prazo[1], faixa: chave, gratis };
  }

  /** Peso de uma linha do carrinho (1 kg por unidade quando o anúncio não informa). */
  static pesoDaLinha(anuncio, quantidade) {
    return (anuncio.peso_kg || 1) * quantidade;
  }
}

FreteService.FRETE_GRATIS_ACIMA = FRETE_GRATIS_ACIMA;

module.exports = FreteService;
