/**
 * @file pedido.test.js
 * @description Máquina de estados do Pedido, frete estimado e preço por
 * quantidade (oferta x atacado).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Pedido = require('../../src/domain/Pedido');
const FreteService = require('../../src/services/FreteService');
const { precoUnitario } = require('../../src/services/PedidoService');

function pedido(status, tipoEntrega = 'ENTREGA') {
  return new Pedido({ id: 1, compradorId: 10, vendedorId: 20, status, tipoEntrega });
}

describe('Pedido — máquina de estados', () => {
  it('identifica o papel de cada participante', () => {
    const p = pedido('PAGO');
    assert.equal(p.papelDe(10), 'COMPRADOR');
    assert.equal(p.papelDe(20), 'VENDEDOR');
    assert.equal(p.papelDe(99), null);
  });

  it('só o comprador paga e só o vendedor prepara', () => {
    assert.throws(() => pedido('AGUARDANDO_PAGAMENTO').transicionar('PAGO', 'VENDEDOR'));
    const p = pedido('AGUARDANDO_PAGAMENTO');
    p.transicionar('PAGO', 'COMPRADOR');
    assert.equal(p.status, 'PAGO');
    assert.throws(() => p.transicionar('EM_PREPARACAO', 'COMPRADOR'));
  });

  it('entrega vai para ENVIADO e retirada para PRONTO_RETIRADA', () => {
    assert.deepEqual(pedido('EM_PREPARACAO', 'ENTREGA').proximosStatus('VENDEDOR'), ['ENVIADO', 'CANCELADO']);
    assert.deepEqual(pedido('EM_PREPARACAO', 'RETIRADA').proximosStatus('VENDEDOR'), ['PRONTO_RETIRADA', 'CANCELADO']);
    assert.throws(() => pedido('EM_PREPARACAO', 'RETIRADA').transicionar('ENVIADO', 'VENDEDOR'), /retirada/);
  });

  it('não volta de estados finais nem pula etapas', () => {
    assert.throws(() => pedido('ENTREGUE').transicionar('CANCELADO', 'VENDEDOR'));
    assert.throws(() => pedido('PAGO').transicionar('ENTREGUE', 'VENDEDOR'));
    assert.deepEqual(pedido('CANCELADO').proximosStatus('COMPRADOR'), []);
  });

  it('cancelamento sinaliza devolução de estoque', () => {
    const p = pedido('PAGO');
    p.transicionar('CANCELADO', 'COMPRADOR');
    assert.equal(p.devolveEstoque, true);
  });
});

describe('FreteService', () => {
  it('classifica a distância e soma peso', () => {
    const origem = { cidade: 'Pouso Alegre', uf: 'MG' };
    assert.equal(FreteService.calcular(origem, { cidade: 'pouso alegre', uf: 'mg' }, 2, 50).faixa, 'MESMA_CIDADE');
    assert.equal(FreteService.calcular(origem, { cidade: 'Varginha', uf: 'MG' }, 2, 50).faixa, 'MESMO_ESTADO');
    const outro = FreteService.calcular(origem, { cidade: 'Campinas', uf: 'SP' }, 4, 50);
    assert.equal(outro.faixa, 'OUTRO_ESTADO');
    assert.equal(outro.valor, 45);
  });

  it('frete grátis acima do limite', () => {
    const r = FreteService.calcular({ cidade: 'A', uf: 'MG' }, { cidade: 'B', uf: 'SP' }, 10, 600);
    assert.equal(r.gratis, true);
    assert.equal(r.valor, 0);
  });
});

describe('Preço por quantidade', () => {
  const anuncio = { preco_efetivo: 45, atacado: [{ quantidade_minima: 5, preco: 40 }, { quantidade_minima: 10, preco: 36 }] };
  it('usa a melhor faixa alcançada', () => {
    assert.equal(precoUnitario(anuncio, 1), 45);
    assert.equal(precoUnitario(anuncio, 5), 40);
    assert.equal(precoUnitario(anuncio, 12), 36);
  });
  it('oferta menor que o atacado prevalece', () => {
    assert.equal(precoUnitario({ ...anuncio, preco_efetivo: 35 }, 12), 35);
  });
});
