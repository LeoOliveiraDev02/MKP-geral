/**
 * @file vitrine-avancada.test.js
 * @description Campos de venda do anúncio (unidade, estoque, oferta, atacado,
 * certificações), pausar/reativar, filtros e ordenação da vitrine, busca por
 * distância, sugestões da busca, eventos (visitas/cliques), estatísticas do
 * vendedor e recomendações "quem viu também viu".
 */
process.env.JWT_SECRET = 'test-secret';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, asSystem, api, pngFile, snapshotUploads, cleanUploads } = require('../helpers');

const SENHA = 'Forte@123';

async function registrar(base, email, telefone) {
  const { body } = await api(base, 'POST', '/api/auth/register', {
    body: {
      nome: 'Produtor', sobrenome: 'Teste', email, telefone, senha: SENHA,
      rua: 'Estrada', numero: '1', bairro: 'Rural', cidade: 'Pouso Alegre', uf: 'MG', zona: 'RURAL',
    },
  });
  return body.data.token;
}

async function publicar(base, token, campos) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  fd.append('imagemPrincipal', pngFile(), 'principal.png');
  const res = await fetch(base + '/api/ads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: res.status, body: await res.json() };
}

describe('Vitrine avançada e campos de venda', async () => {
  let base;
  let close;
  let tokenA;
  let tokenB;
  let cat;
  let endA;
  let queijo;
  let ovos;
  let cafe;
  let uploadsAntes;

  before(async () => {
    ({ base, close } = await startServer('vitrine-avancada'));
    uploadsAntes = snapshotUploads();
    tokenA = await registrar(base, 'vendedor-va@test.com', '35999990001');
    tokenB = await registrar(base, 'comprador-va@test.com', '35999990002');
    cat = (await api(base, 'GET', '/api/categories')).body.data.categorias[0].id;
    endA = (await api(base, 'GET', '/api/addresses', { token: tokenA })).body.data.enderecos[0].id;

    const base1 = { descricao: 'Produto da fazenda', categoriaId: String(cat), enderecoId: String(endA) };
    queijo = (await publicar(base, tokenA, {
      ...base1, nome: 'Queijo minas', preco: '45', unidade: 'kg', estoque: '10', pesoKg: '1',
      precoPromocional: '39.9', atacado: [{ quantidadeMinima: 5, preco: 40 }],
      certificacoes: [{ tipo: 'SIM', numero: '123' }],
    })).body.data.anuncio;
    ovos = (await publicar(base, tokenA, { ...base1, nome: 'Ovos caipira', preco: '15', unidade: 'dz' })).body.data.anuncio;
    cafe = (await publicar(base, tokenA, { ...base1, nome: 'Café torrado', preco: '42', unidade: 'kg' })).body.data.anuncio;
  });

  after(async () => {
    cleanUploads(uploadsAntes);
    await close();
  });

  it('publica com unidade, estoque, oferta, atacado e certificação', async () => {
    const { status, body } = await api(base, 'GET', `/api/ads/${queijo.id}`);
    assert.equal(status, 200);
    const ad = body.data.anuncio;
    assert.equal(ad.unidade, 'kg');
    assert.equal(ad.estoque, 10);
    assert.equal(ad.em_oferta, true);
    assert.equal(ad.preco_efetivo, 39.9);
    assert.deepEqual(ad.atacado, [{ quantidade_minima: 5, preco: 40 }]);
    assert.deepEqual(ad.certificacoes, [{ tipo: 'SIM', numero: '123' }]);
    assert.match(ad.vendedor.link_whatsapp, /39\.90/);
  });

  it('recusa campos de venda inválidos', async () => {
    const comum = { nome: 'X', descricao: 'Y', preco: '10', categoriaId: String(cat), enderecoId: String(endA) };
    for (const extra of [
      { unidade: 'tonelada' },
      { estoque: '-1' },
      { precoPromocional: '12' },
      { atacado: [{ quantidadeMinima: 1, preco: 5 }] },
      { certificacoes: [{ tipo: 'ISO' }] },
      { permiteEntrega: 'false', permiteRetirada: 'false' },
    ]) {
      const { status } = await publicar(base, tokenA, { ...comum, ...extra });
      assert.equal(status, 400, JSON.stringify(extra));
    }
  });

  it('filtra por preço e ofertas e ordena pelo preço efetivo', async () => {
    const ate20 = (await api(base, 'GET', '/api/ads?precoMax=20')).body.data.data.map((a) => a.nome);
    assert.deepEqual(ate20, ['Ovos caipira']);

    const ofertas = (await api(base, 'GET', '/api/ads?ofertas=true')).body.data.data.map((a) => a.nome);
    assert.deepEqual(ofertas, ['Queijo minas']);

    const ordem = (await api(base, 'GET', '/api/ads?sort=menor_preco')).body.data.data.map((a) => a.nome);
    assert.deepEqual(ordem, ['Ovos caipira', 'Queijo minas', 'Café torrado']);

    const porCidade = (await api(base, 'GET', '/api/ads?uf=MG&cidade=pouso alegre&zona=RURAL')).body.data.pagination.total;
    assert.equal(porCidade, 3);
    assert.equal((await api(base, 'GET', '/api/ads?uf=SP')).body.data.pagination.total, 0);
  });

  it('busca por distância só considera endereços com coordenadas', async () => {
    await asSystem(async () => {
      const { getDb } = require('../../src/db');
      const { enderecos } = require('../../src/db/schema');
      const { eq } = require('drizzle-orm');
      await getDb().update(enderecos).set({ latitude: -22.2306, longitude: -45.9367 }).where(eq(enderecos.id, endA));
    });
    // Belo Horizonte fica a ~300 km de Pouso Alegre
    const perto = await api(base, 'GET', '/api/ads?lat=-22.25&lng=-45.95&raioKm=10&sort=proximos');
    assert.equal(perto.body.data.pagination.total, 3);
    assert.ok(perto.body.data.data[0].distancia_km < 10);
    const longe = await api(base, 'GET', '/api/ads?lat=-19.92&lng=-43.94&raioKm=50');
    assert.equal(longe.body.data.pagination.total, 0);
  });

  it('sugere nomes e categorias enquanto digita', async () => {
    const { body } = await api(base, 'GET', '/api/ads/suggest?q=qu');
    assert.deepEqual(body.data.produtos, ['Queijo minas']);
    const curto = await api(base, 'GET', '/api/ads/suggest?q=q');
    assert.deepEqual(curto.body.data.produtos, []);
  });

  it('pausa tira da vitrine e reativa devolve', async () => {
    const outro = await api(base, 'PATCH', `/api/ads/${ovos.id}/status`, { token: tokenB, body: { status: 'PAUSADO' } });
    assert.equal(outro.status, 403);

    const pausa = await api(base, 'PATCH', `/api/ads/${ovos.id}/status`, { token: tokenA, body: { status: 'PAUSADO' } });
    assert.equal(pausa.status, 200);
    assert.equal((await api(base, 'GET', `/api/ads/${ovos.id}`)).status, 404);
    const pausados = await api(base, 'GET', '/api/ads/me/products?status=PAUSADO', { token: tokenA });
    assert.deepEqual(pausados.body.data.data.map((a) => a.id), [ovos.id]);

    await api(base, 'PATCH', `/api/ads/${ovos.id}/status`, { token: tokenA, body: { status: 'ATIVO' } });
    assert.equal((await api(base, 'GET', `/api/ads/${ovos.id}`)).status, 200);
  });

  it('conta visitas e cliques (sem contar o próprio vendedor) e mostra no painel', async () => {
    await api(base, 'POST', `/api/ads/${queijo.id}/events`, { body: { tipo: 'VISUALIZACAO', sessao: 's1' } });
    await api(base, 'POST', `/api/ads/${queijo.id}/events`, { token: tokenB, body: { tipo: 'VISUALIZACAO', sessao: 's2' } });
    await api(base, 'POST', `/api/ads/${queijo.id}/events`, { token: tokenB, body: { tipo: 'CLIQUE_WHATSAPP', sessao: 's2' } });
    await api(base, 'POST', `/api/ads/${queijo.id}/events`, { token: tokenA, body: { tipo: 'VISUALIZACAO', sessao: 's3' } });
    const invalido = await api(base, 'POST', `/api/ads/${queijo.id}/events`, { body: { tipo: 'COMPRA' } });
    assert.equal(invalido.status, 400);

    const { body } = await api(base, 'GET', '/api/ads/me/stats', { token: tokenA });
    const linha = body.data.por_anuncio.find((r) => r.anuncio_id === queijo.id);
    assert.equal(linha.visualizacoes, 2);
    assert.equal(linha.cliques_whatsapp, 1);
    assert.equal(body.data.totais.visualizacoes, 2);

    // RLS: o comprador não enxerga eventos de anúncios alheios
    const doB = await api(base, 'GET', '/api/ads/me/stats', { token: tokenB });
    assert.equal(doB.body.data.totais.visualizacoes, 0);
  });

  it('recomenda o que as mesmas sessões viram', async () => {
    await api(base, 'POST', `/api/ads/${cafe.id}/events`, { body: { tipo: 'VISUALIZACAO', sessao: 's1' } });
    const { body } = await api(base, 'GET', `/api/ads/${queijo.id}/recommendations`);
    assert.equal(body.data.baseado_em_visitas, true);
    assert.equal(body.data.anuncios[0].id, cafe.id);
    assert.ok(!body.data.anuncios.some((a) => a.id === queijo.id));
  });
});
