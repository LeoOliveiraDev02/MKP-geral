/**
 * @file pedidos.test.js
 * @description Carrinho → checkout (um pedido por produtor), frete estimado,
 * baixa e devolução de estoque, pagamento simulado, andamento com rastreio,
 * notificações e isolamento entre usuários (RLS).
 */
process.env.JWT_SECRET = 'test-secret';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, api, pngFile, snapshotUploads, cleanUploads } = require('../helpers');

const SENHA = 'Forte@123';

async function registrar(base, email, telefone, cidade = 'Pouso Alegre', uf = 'MG') {
  const { body } = await api(base, 'POST', '/api/auth/register', {
    body: { nome: 'Pessoa', sobrenome: email.split('@')[0], email, telefone, senha: SENHA, rua: 'Rua', numero: '1', bairro: 'Centro', cidade, uf, zona: 'URBANA' },
  });
  return body.data.token;
}

async function publicar(base, token, campos) {
  const cat = (await api(base, 'GET', '/api/categories')).body.data.categorias[0].id;
  const end = (await api(base, 'GET', '/api/addresses', { token })).body.data.enderecos[0].id;
  const fd = new FormData();
  const tudo = { descricao: 'Da roça', categoriaId: String(cat), enderecoId: String(end), ...campos };
  for (const [k, v] of Object.entries(tudo)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  fd.append('imagemPrincipal', pngFile(), 'p.png');
  const res = await fetch(base + '/api/ads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  assert.equal(res.status, 201);
  return (await res.json()).data.anuncio;
}

describe('Pedidos e checkout', async () => {
  let base;
  let close;
  let vendedor1;
  let vendedor2;
  let comprador;
  let intruso;
  let queijo;
  let ovos;
  let mel;
  let enderecoComprador;
  let uploadsAntes;
  let pedidoQueijo;
  let pedidoMel;

  before(async () => {
    ({ base, close } = await startServer('pedidos'));
    uploadsAntes = snapshotUploads();
    vendedor1 = await registrar(base, 'v1@test.com', '35900000001');
    vendedor2 = await registrar(base, 'v2@test.com', '35900000002', 'Campinas', 'SP');
    comprador = await registrar(base, 'c@test.com', '35900000003');
    intruso = await registrar(base, 'x@test.com', '35900000004');
    queijo = await publicar(base, vendedor1, {
      nome: 'Queijo', preco: '45', unidade: 'kg', estoque: '6', pesoKg: '1',
      atacado: [{ quantidadeMinima: 5, preco: 40 }],
    });
    ovos = await publicar(base, vendedor1, { nome: 'Ovos', preco: '15', unidade: 'dz', permiteEntrega: 'false' });
    mel = await publicar(base, vendedor2, { nome: 'Mel', preco: '30', pesoKg: '0.5', permiteRetirada: 'false' });
    enderecoComprador = (await api(base, 'GET', '/api/addresses', { token: comprador })).body.data.enderecos[0].id;
  });

  after(async () => {
    cleanUploads(uploadsAntes);
    await close();
  });

  it('cota frete por produtor e aplica atacado', async () => {
    const { status, body } = await api(base, 'POST', '/api/orders/quote', {
      body: { itens: [{ anuncioId: queijo.id, quantidade: 5 }, { anuncioId: mel.id, quantidade: 2 }], cidade: 'Pouso Alegre', uf: 'MG' },
    });
    assert.equal(status, 200);
    const [g1, g2] = body.data.grupos;
    assert.equal(g1.subtotal, 200); // 5 × R$ 40 (atacado)
    assert.equal(g1.opcoes.find((o) => o.tipo === 'ENTREGA').faixa, 'MESMA_CIDADE');
    assert.equal(g2.opcoes.find((o) => o.tipo === 'ENTREGA').faixa, 'OUTRO_ESTADO');
    assert.ok(!g2.opcoes.some((o) => o.tipo === 'RETIRADA'));
  });

  it('recusa estoque insuficiente e compra do próprio anúncio', async () => {
    const muito = await api(base, 'POST', '/api/orders/quote', { body: { itens: [{ anuncioId: queijo.id, quantidade: 7 }] } });
    assert.equal(muito.status, 400);
    const proprio = await api(base, 'POST', '/api/orders/checkout', {
      token: vendedor1,
      body: { itens: [{ anuncioId: queijo.id, quantidade: 1 }], entregas: {}, formaPagamento: 'PIX' },
    });
    assert.equal(proprio.status, 400);
  });

  it('exige modo de entrega aceito por todos os itens do produtor', async () => {
    const r = await api(base, 'POST', '/api/orders/checkout', {
      token: comprador,
      body: {
        itens: [{ anuncioId: queijo.id, quantidade: 1 }, { anuncioId: ovos.id, quantidade: 1 }],
        entregas: { [queijo.anunciante_id]: 'ENTREGA' },
        enderecoId: enderecoComprador,
        formaPagamento: 'PIX',
      },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /não faz entrega/);
  });

  it('fecha o carrinho em um pedido por produtor e baixa o estoque', async () => {
    const { status, body } = await api(base, 'POST', '/api/orders/checkout', {
      token: comprador,
      body: {
        itens: [{ anuncioId: queijo.id, quantidade: 5 }, { anuncioId: mel.id, quantidade: 1 }],
        entregas: { [queijo.anunciante_id]: 'RETIRADA', [mel.anunciante_id]: 'ENTREGA' },
        enderecoId: enderecoComprador,
        formaPagamento: 'PIX',
      },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data.pedidos.length, 2);
    [pedidoQueijo, pedidoMel] = body.data.pedidos.map((p) => p.id);
    assert.equal(body.data.pedidos[0].total, 200); // retirada sem frete

    const ad = await api(base, 'GET', `/api/ads/${queijo.id}`);
    assert.equal(ad.body.data.anuncio.estoque, 1);

    const notifs = await api(base, 'GET', '/api/notifications', { token: vendedor1 });
    assert.equal(notifs.body.data.nao_lidas, 1);
    assert.match(notifs.body.data.notificacoes[0].titulo, /Novo pedido/);
  });

  it('lista compras e vendas separadamente e esconde de terceiros', async () => {
    const compras = await api(base, 'GET', '/api/orders', { token: comprador });
    assert.equal(compras.body.data.pedidos.length, 2);
    const vendas = await api(base, 'GET', '/api/orders/sales', { token: vendedor1 });
    assert.deepEqual(vendas.body.data.pedidos.map((p) => p.id), [pedidoQueijo]);
    assert.equal(vendas.body.data.pedidos[0].comprador_nome, 'Pessoa c');

    const alheio = await api(base, 'GET', `/api/orders/${pedidoQueijo}`, { token: intruso });
    assert.equal(alheio.status, 403);
  });

  it('segue o fluxo pago → preparo → pronto para retirada → entregue', async () => {
    const naoPodePreparar = await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, {
      token: vendedor1, body: { status: 'EM_PREPARACAO' },
    });
    assert.equal(naoPodePreparar.status, 400);

    const pago = await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, { token: comprador, body: { status: 'PAGO' } });
    assert.equal(pago.status, 200);
    assert.deepEqual(pago.body.data.pedido.acoes, ['CANCELADO']);

    await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, { token: vendedor1, body: { status: 'EM_PREPARACAO' } });
    const enviado = await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, { token: vendedor1, body: { status: 'ENVIADO' } });
    assert.equal(enviado.status, 400);
    await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, { token: vendedor1, body: { status: 'PRONTO_RETIRADA' } });
    const entregue = await api(base, 'PATCH', `/api/orders/${pedidoQueijo}/status`, { token: comprador, body: { status: 'ENTREGUE' } });
    assert.equal(entregue.body.data.pedido.status, 'ENTREGUE');
    assert.deepEqual(
      entregue.body.data.pedido.historico.map((h) => h.status),
      ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'PRONTO_RETIRADA', 'ENTREGUE']
    );
  });

  it('envia com código de rastreio e notifica o comprador', async () => {
    await api(base, 'PATCH', `/api/orders/${pedidoMel}/status`, { token: comprador, body: { status: 'PAGO' } });
    await api(base, 'PATCH', `/api/orders/${pedidoMel}/status`, { token: vendedor2, body: { status: 'EM_PREPARACAO' } });
    const r = await api(base, 'PATCH', `/api/orders/${pedidoMel}/status`, {
      token: vendedor2, body: { status: 'ENVIADO', codigoRastreio: 'BR123456789BR' },
    });
    assert.equal(r.body.data.pedido.codigo_rastreio, 'BR123456789BR');
    const n = await api(base, 'GET', '/api/notifications', { token: comprador });
    assert.ok(n.body.data.notificacoes.some((x) => /BR123456789BR/.test(x.mensagem)));

    await api(base, 'POST', '/api/notifications/read-all', { token: comprador });
    assert.equal((await api(base, 'GET', '/api/notifications', { token: comprador })).body.data.nao_lidas, 0);
  });

  it('cancelar devolve o estoque', async () => {
    const { body } = await api(base, 'POST', '/api/orders/checkout', {
      token: comprador,
      body: { itens: [{ anuncioId: queijo.id, quantidade: 1 }], entregas: { [queijo.anunciante_id]: 'RETIRADA' }, formaPagamento: 'BOLETO' },
    });
    const id = body.data.pedidos[0].id;
    assert.equal((await api(base, 'GET', `/api/ads/${queijo.id}`)).body.data.anuncio.estoque, 0);
    const c = await api(base, 'PATCH', `/api/orders/${id}/status`, { token: comprador, body: { status: 'CANCELADO' } });
    assert.equal(c.status, 200);
    assert.equal((await api(base, 'GET', `/api/ads/${queijo.id}`)).body.data.anuncio.estoque, 1);
  });
});
