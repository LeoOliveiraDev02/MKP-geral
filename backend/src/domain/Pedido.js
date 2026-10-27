/**
 * @file Pedido.js
 * @description Entidade Pedido: ciclo de vida da compra de um comprador com
 * UM vendedor (o carrinho é dividido por vendedor no checkout).
 *
 * Máquina de estados (quem pode disparar cada transição):
 *   AGUARDANDO_PAGAMENTO → PAGO (gateway via webhook; comprador só no modo simulado) | CANCELADO (ambos)
 *   PAGO                 → EM_PREPARACAO (vendedor) | CANCELADO (ambos)
 *   EM_PREPARACAO        → ENVIADO (vendedor, só entrega) | PRONTO_RETIRADA (vendedor, só retirada)
 *                          | CANCELADO (vendedor)
 *   ENVIADO              → ENTREGUE (ambos)
 *   PRONTO_RETIRADA      → ENTREGUE (ambos)
 *   ENTREGUE, CANCELADO  → (finais)
 */

const STATUS = [
  'AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'ENVIADO', 'PRONTO_RETIRADA', 'ENTREGUE', 'CANCELADO',
];

const TRANSICOES = {
  AGUARDANDO_PAGAMENTO: { PAGO: ['COMPRADOR', 'GATEWAY'], CANCELADO: ['COMPRADOR', 'VENDEDOR'] },
  PAGO: { EM_PREPARACAO: ['VENDEDOR'], CANCELADO: ['COMPRADOR', 'VENDEDOR'] },
  EM_PREPARACAO: { ENVIADO: ['VENDEDOR'], PRONTO_RETIRADA: ['VENDEDOR'], CANCELADO: ['VENDEDOR'] },
  ENVIADO: { ENTREGUE: ['COMPRADOR', 'VENDEDOR'] },
  PRONTO_RETIRADA: { ENTREGUE: ['COMPRADOR', 'VENDEDOR'] },
  ENTREGUE: {},
  CANCELADO: {},
};

class Pedido {
  #id;
  #compradorId;
  #vendedorId;
  #status;
  #tipoEntrega;

  constructor({ id, compradorId, vendedorId, status, tipoEntrega }) {
    this.#id = id;
    this.#compradorId = compradorId;
    this.#vendedorId = vendedorId;
    this.#status = status;
    this.#tipoEntrega = tipoEntrega;
  }

  get id() { return this.#id; }
  get compradorId() { return this.#compradorId; }
  get vendedorId() { return this.#vendedorId; }
  get status() { return this.#status; }
  get tipoEntrega() { return this.#tipoEntrega; }

  /** Papel do usuário no pedido: 'COMPRADOR', 'VENDEDOR' ou null. */
  papelDe(usuarioId) {
    if (usuarioId === this.#compradorId) return 'COMPRADOR';
    if (usuarioId === this.#vendedorId) return 'VENDEDOR';
    return null;
  }

  /** Status para os quais `papel` pode levar o pedido agora. */
  proximosStatus(papel) {
    const opcoes = TRANSICOES[this.#status] || {};
    return Object.entries(opcoes)
      .filter(([destino, papeis]) => papeis.includes(papel) && this.#compativelComEntrega(destino))
      .map(([destino]) => destino);
  }

  /**
   * Aplica a transição ou lança Error com a explicação.
   * @param {string} destino
   * @param {'COMPRADOR'|'VENDEDOR'} papel
   */
  transicionar(destino, papel) {
    if (!STATUS.includes(destino)) throw new Error('Status de pedido inválido.');
    const papeis = (TRANSICOES[this.#status] || {})[destino];
    if (!papeis) {
      throw new Error(`Não é possível mudar um pedido de ${this.#status} para ${destino}.`);
    }
    if (!papeis.includes(papel)) {
      throw new Error('Você não pode fazer essa alteração neste pedido.');
    }
    if (!this.#compativelComEntrega(destino)) {
      throw new Error(destino === 'ENVIADO'
        ? 'Pedidos para retirada não são enviados: use "pronto para retirada".'
        : 'Pedidos com entrega não ficam prontos para retirada: use "enviado".');
    }
    this.#status = destino;
  }

  #compativelComEntrega(destino) {
    if (destino === 'ENVIADO') return this.#tipoEntrega === 'ENTREGA';
    if (destino === 'PRONTO_RETIRADA') return this.#tipoEntrega === 'RETIRADA';
    return true;
  }

  /** Estoque volta quando o pedido é cancelado. */
  get devolveEstoque() {
    return this.#status === 'CANCELADO';
  }

  /** Pedido entregue habilita avaliação e reclamação. */
  get entregue() {
    return this.#status === 'ENTREGUE';
  }
}

Pedido.STATUS = STATUS;

module.exports = Pedido;
