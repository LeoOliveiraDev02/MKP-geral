/**
 * @file pos-venda.test.js
 * @description Reputação e pós-venda: avaliações com foto (só após entrega),
 * perguntas e respostas, página pública do produtor com reputação,
 * verificação aprovada por administrador, chat interno, reclamação com
 * mediação, cotação de atacado que vira pedido, cestas por assinatura e a
 * página de compartilhamento com prévia.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'admin-pv@test.com';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, api, pngFile, snapshotUploads, cleanUploads } = require('../helpers');

const SENHA = 'Forte@123';

async function registrar(base, email, telefone) {
  const { body } = await api(base, 'POST', '/api/auth/register', {
    body: { nome: email.split('@')[0], sobrenome: 'Silva', email, telefone, senha: SENHA, rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA' },
  });
  return body.data.token;
}

async function multipart(base, method, url, token, campos, arquivos = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, String(v));
  for (const [campo, n] of Object.entries(arquivos)) for (let i = 0; i < n; i++) fd.append(campo, pngFile(), `f${i}.png`);
  const res = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: res.status, body: await res.json() };
}

async function comprarEReceber(base, comprador, vendedor, anuncio) {
  const { body } = await api(base, 'POST', '/api/orders/checkout', {
    token: comprador,
    body: { itens: [{ anuncioId: anuncio.id, quantidade: 1 }], entregas: { [anuncio.anunciante_id]: 'RETIRADA' }, formaPagamento: 'PIX' },
  });
  const id = body.data.pedidos[0].id;
  for (const [token, status] of [[comprador, 'PAGO'], [vendedor, 'EM_PREPARACAO'], [vendedor, 'PRONTO_RETIRADA'], [comprador, 'ENTREGUE']]) {
    const r = await api(base, 'PATCH', `/api/orders/${id}/status`, { token, body: { status } });
    assert.equal(r.status, 200, `${status}: ${JSON.stringify(r.body)}`);
  }
  return id;
}

describe('Reputação, comunicação e comércio', async () => {
  let base;
  let close;
  let produtor;
  let cliente;
  let outro;
  let admin;
  let anuncio;
  let produtorId;
  let pedidoEntregue;
  let uploadsAntes;

  before(async () => {
    ({ base, close } = await startServer('pos-venda'));
    uploadsAntes = snapshotUploads();
    produtor = await registrar(base, 'produtor-pv@test.com', '35911110001');
    cliente = await registrar(base, 'cliente-pv@test.com', '35911110002');
    outro = await registrar(base, 'outro-pv@test.com', '35911110003');
    admin = await registrar(base, 'admin-pv@test.com', '35911110004');
    const cat = (await api(base, 'GET', '/api/categories')).body.data.categorias[0].id;
    const end = (await api(base, 'GET', '/api/addresses', { token: produtor })).body.data.enderecos[0].id;
    anuncio = (await multipart(base, 'POST', '/api/ads', produtor, {
      nome: 'Queijo', descricao: 'Curado', preco: '45', categoriaId: cat, enderecoId: end, unidade: 'kg', estoque: '100',
    }, { imagemPrincipal: 1 })).body.data.anuncio;
    produtorId = anuncio.anunciante_id;
    pedidoEntregue = await comprarEReceber(base, cliente, produtor, anuncio);
  });

  after(async () => {
    cleanUploads(uploadsAntes);
    await close();
  });

  describe('Avaliações', () => {
    it('só quem recebeu avalia, uma vez, com até 3 fotos', async () => {
      const semCompra = await multipart(base, 'POST', '/api/reviews', outro, { pedidoId: pedidoEntregue, anuncioId: anuncio.id, nota: 5 });
      assert.equal(semCompra.status, 403);
      const notaInvalida = await multipart(base, 'POST', '/api/reviews', cliente, { pedidoId: pedidoEntregue, anuncioId: anuncio.id, nota: 7 });
      assert.equal(notaInvalida.status, 400);

      const ok = await multipart(base, 'POST', '/api/reviews', cliente, {
        pedidoId: pedidoEntregue, anuncioId: anuncio.id, nota: 4, comentario: 'Muito bom, chegou certinho',
      }, { fotos: 2 });
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      const repetida = await multipart(base, 'POST', '/api/reviews', cliente, { pedidoId: pedidoEntregue, anuncioId: anuncio.id, nota: 5 });
      assert.equal(repetida.status, 400);

      const { body } = await api(base, 'GET', `/api/reviews?anuncioId=${anuncio.id}`);
      assert.equal(body.data.resumo.media, 4);
      assert.equal(body.data.avaliacoes[0].fotos.length, 2);
      assert.equal(body.data.avaliacoes[0].autor_nome, 'cliente-pv');

      const det = await api(base, 'GET', `/api/ads/${anuncio.id}`);
      assert.equal(det.body.data.anuncio.nota_media, 4);
      assert.equal(det.body.data.anuncio.total_avaliacoes, 1);
    });

    it('o produtor responde uma vez', async () => {
      const id = (await api(base, 'GET', `/api/reviews?anuncioId=${anuncio.id}`)).body.data.avaliacoes[0].id;
      assert.equal((await api(base, 'POST', `/api/reviews/${id}/reply`, { token: cliente, body: { resposta: 'oi' } })).status, 403);
      assert.equal((await api(base, 'POST', `/api/reviews/${id}/reply`, { token: produtor, body: { resposta: 'Obrigado!' } })).status, 200);
      assert.equal((await api(base, 'POST', `/api/reviews/${id}/reply`, { token: produtor, body: { resposta: 'De novo' } })).status, 400);
    });
  });

  describe('Perguntas', () => {
    it('pergunta pública, resposta do produtor e notificação', async () => {
      const proprio = await api(base, 'POST', '/api/questions', { token: produtor, body: { anuncioId: anuncio.id, texto: 'Teste' } });
      assert.equal(proprio.status, 400);
      const p = await api(base, 'POST', '/api/questions', { token: outro, body: { anuncioId: anuncio.id, texto: 'É curado há quantos dias?' } });
      assert.equal(p.status, 201);
      const naoDono = await api(base, 'POST', `/api/questions/${p.body.data.id}/answer`, { token: cliente, body: { resposta: 'Sei lá' } });
      assert.equal(naoDono.status, 403);
      await api(base, 'POST', `/api/questions/${p.body.data.id}/answer`, { token: produtor, body: { resposta: 'Trinta dias.' } });
      const lista = await api(base, 'GET', `/api/questions?anuncioId=${anuncio.id}`);
      assert.equal(lista.body.data.perguntas[0].resposta, 'Trinta dias.');
      const n = await api(base, 'GET', '/api/notifications', { token: outro });
      assert.ok(n.body.data.notificacoes.some((x) => x.tipo === 'PERGUNTA_RESPONDIDA'));
    });
  });

  describe('Produtor: perfil público, reputação e verificação', () => {
    it('edita apresentação e vídeo (só YouTube/Vimeo)', async () => {
      const ruim = await api(base, 'PUT', '/api/users/profile/public', { token: produtor, body: { videoUrl: 'http://site.com/v' } });
      assert.equal(ruim.status, 400);
      const ok = await api(base, 'PUT', '/api/users/profile/public', {
        token: produtor, body: { bio: 'Queijaria familiar desde 1990.', videoUrl: 'https://www.youtube.com/watch?v=abc' },
      });
      assert.equal(ok.status, 200);
      const foto = await multipart(base, 'POST', '/api/users/profile/photo', produtor, {}, { foto: 1 });
      assert.equal(foto.status, 200);
      assert.match(foto.body.data.perfil.foto_url, /\/uploads\//);
    });

    it('mostra reputação calculada das vendas e avaliações', async () => {
      const { status, body } = await api(base, 'GET', `/api/producers/${produtorId}`);
      assert.equal(status, 200);
      assert.equal(body.data.produtor.bio, 'Queijaria familiar desde 1990.');
      assert.equal(body.data.produtor.verificado, false);
      assert.equal(body.data.reputacao.vendas_concluidas, 1);
      assert.equal(body.data.reputacao.nivel, 4);
      assert.equal((await api(base, 'GET', '/api/producers/999999')).status, 404);
    });

    it('verificação: CPF validado, aprovação só pelo admin, selo público', async () => {
      const cpfRuim = await api(base, 'POST', '/api/verification', { token: produtor, body: { tipoDocumento: 'CPF', documento: '123.456.789-00' } });
      assert.equal(cpfRuim.status, 400);
      const ok = await api(base, 'POST', '/api/verification', { token: produtor, body: { tipoDocumento: 'CPF', documento: '529.982.247-25' } });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.data.verificacao.documento, '***.982.***-25');
      const repetida = await api(base, 'POST', '/api/verification', { token: produtor, body: { tipoDocumento: 'CPF', documento: '529.982.247-25' } });
      assert.equal(repetida.status, 400);

      assert.equal((await api(base, 'GET', '/api/admin/verifications', { token: produtor })).status, 403);
      const fila = await api(base, 'GET', '/api/admin/verifications', { token: admin });
      const pendente = fila.body.data.verificacoes[0];
      assert.equal(pendente.documento, '52998224725');
      // no banco o documento fica cifrado
      const { getDb } = require('../../src/db');
      const { verificacoes } = require('../../src/db/schema');
      const brutos = await require('../helpers').asSystem(() => getDb().select().from(verificacoes));
      assert.ok(brutos.every((v) => v.documento.startsWith('enc1:') && !v.documento.includes('52998224725')));
      const decisao = await api(base, 'POST', `/api/admin/verifications/${pendente.id}/decision`, { token: admin, body: { status: 'APROVADA' } });
      assert.equal(decisao.status, 200);

      assert.equal((await api(base, 'GET', `/api/producers/${produtorId}`)).body.data.produtor.verificado, true);
      assert.equal((await api(base, 'GET', `/api/ads/${anuncio.id}`)).body.data.anuncio.vendedor.verificado, true);
      const perfil = await api(base, 'GET', '/api/users/profile', { token: admin });
      assert.equal(perfil.body.data.usuario.is_admin, true);
    });
  });

  describe('Chat interno', () => {
    it('conversa só entre as duas partes, com contagem de não lidas', async () => {
      const ini = await api(base, 'POST', '/api/chats', { token: cliente, body: { anuncioId: anuncio.id, texto: 'Olá, tem queijo meia cura?' } });
      assert.equal(ini.status, 201);
      const conversaId = ini.body.data.conversa_id;
      const mesma = await api(base, 'POST', '/api/chats', { token: cliente, body: { anuncioId: anuncio.id, texto: 'Oi de novo' } });
      assert.equal(mesma.body.data.conversa_id, conversaId);

      assert.equal((await api(base, 'GET', '/api/chats/unread', { token: produtor })).body.data.nao_lidas, 2);
      const msgs = await api(base, 'GET', `/api/chats/${conversaId}/messages`, { token: produtor });
      assert.equal(msgs.body.data.mensagens.length, 2);
      assert.equal((await api(base, 'GET', '/api/chats/unread', { token: produtor })).body.data.nao_lidas, 0);

      const resp = await api(base, 'POST', `/api/chats/${conversaId}/messages`, { token: produtor, body: { texto: 'Tenho sim!' } });
      const novas = await api(base, 'GET', `/api/chats/${conversaId}/messages?depoisDe=${resp.body.data.mensagem.id - 1}`, { token: cliente });
      assert.deepEqual(novas.body.data.mensagens.map((m) => m.texto), ['Tenho sim!']);

      const intruso = await api(base, 'GET', `/api/chats/${conversaId}/messages`, { token: outro });
      assert.equal(intruso.status, 404);
      const lista = await api(base, 'GET', '/api/chats', { token: produtor });
      assert.equal(lista.body.data.conversas[0].outra_parte, 'cliente-pv Silva');
    });
  });

  describe('Reclamação e mediação', () => {
    let reclamacaoId;
    it('o comprador abre; o produtor responde; a mediação decide', async () => {
      const r = await api(base, 'POST', '/api/claims', {
        token: cliente,
        body: { pedidoId: pedidoEntregue, motivo: 'QUALIDADE', descricao: 'O queijo veio com mofo por fora.', pedidoDevolucao: true },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      reclamacaoId = r.body.data.reclamacao.id;
      const dup = await api(base, 'POST', '/api/claims', { token: cliente, body: { pedidoId: pedidoEntregue, motivo: 'OUTRO', descricao: 'Outra reclamação aqui.' } });
      assert.equal(dup.status, 400);
      assert.equal((await api(base, 'GET', `/api/claims/${reclamacaoId}`, { token: outro })).status, 403);

      const cedo = await api(base, 'POST', `/api/claims/${reclamacaoId}/mediation`, { token: cliente });
      assert.equal(cedo.status, 400);
      await api(base, 'POST', `/api/claims/${reclamacaoId}/reply`, { token: produtor, body: { resposta: 'Mofo branco é normal na casca.' } });
      const med = await api(base, 'POST', `/api/claims/${reclamacaoId}/mediation`, { token: cliente });
      assert.equal(med.body.data.reclamacao.status, 'EM_MEDIACAO');

      const fila = await api(base, 'GET', '/api/admin/claims', { token: admin });
      assert.deepEqual(fila.body.data.reclamacoes.map((x) => x.id), [reclamacaoId]);
      const decisao = await api(base, 'POST', `/api/admin/claims/${reclamacaoId}/decision`, {
        token: admin, body: { favorecido: 'COMPRADOR', decisao: 'Fotos mostram mofo fora do padrão.' },
      });
      assert.equal(decisao.body.data.reclamacao.status, 'RESOLVIDA_COMPRADOR');

      const pedido = await api(base, 'GET', `/api/orders/${pedidoEntregue}`, { token: cliente });
      assert.ok(pedido.body.data.pedido.historico.some((h) => h.status === 'REEMBOLSO'));
      const rep = await api(base, 'GET', `/api/producers/${produtorId}`);
      assert.equal(rep.body.data.reputacao.reclamacoes_resolvidas_contra, 1);
    });
  });

  describe('Cotação de atacado', () => {
    it('pedido → proposta → aceite vira pedido com o preço combinado', async () => {
      const c = await api(base, 'POST', '/api/quotes', { token: outro, body: { anuncioId: anuncio.id, quantidade: 20, mensagem: 'Restaurante' } });
      assert.equal(c.status, 201);
      const id = c.body.data.id;
      assert.equal((await api(base, 'POST', `/api/quotes/${id}/accept`, { token: outro, body: { tipoEntrega: 'RETIRADA', formaPagamento: 'PIX' } })).status, 400);
      const recebidas = await api(base, 'GET', '/api/quotes/received', { token: produtor });
      assert.equal(recebidas.body.data.cotacoes[0].cliente_nome, 'outro-pv Silva');
      await api(base, 'POST', `/api/quotes/${id}/reply`, { token: produtor, body: { precoUnitario: 38, prazoEntrega: '3 dias' } });
      const aceite = await api(base, 'POST', `/api/quotes/${id}/accept`, { token: outro, body: { tipoEntrega: 'RETIRADA', formaPagamento: 'PIX' } });
      assert.equal(aceite.status, 200, JSON.stringify(aceite.body));
      const pedido = await api(base, 'GET', `/api/orders/${aceite.body.data.pedido_id}`, { token: outro });
      assert.equal(pedido.body.data.pedido.total, 760);
      assert.equal(pedido.body.data.pedido.origem, 'COTACAO');
    });
  });

  describe('Cestas por assinatura', () => {
    it('produtor cria, cliente assina e o produtor gera o pedido da entrega', async () => {
      const cesta = await multipart(base, 'POST', '/api/baskets', produtor, {
        nome: 'Cesta da semana', descricao: 'Verduras e legumes da estação', itens: 'Alface, couve, cenoura', preco: 60, frequencia: 'SEMANAL',
      }, { imagem: 1 });
      assert.equal(cesta.status, 201, JSON.stringify(cesta.body));
      const cestaId = cesta.body.data.cesta.id;
      assert.equal((await api(base, 'GET', '/api/baskets')).body.data.cestas.length, 1);

      const propria = await api(base, 'POST', `/api/baskets/${cestaId}/subscribe`, { token: produtor, body: { tipoEntrega: 'RETIRADA' } });
      assert.equal(propria.status, 400);
      const end = (await api(base, 'GET', '/api/addresses', { token: cliente })).body.data.enderecos[0].id;
      const ass = await api(base, 'POST', `/api/baskets/${cestaId}/subscribe`, { token: cliente, body: { tipoEntrega: 'ENTREGA', enderecoId: end } });
      assert.equal(ass.status, 201);
      assert.equal((await api(base, 'POST', `/api/baskets/${cestaId}/subscribe`, { token: cliente, body: { tipoEntrega: 'RETIRADA' } })).status, 400);

      const assinantes = await api(base, 'GET', `/api/baskets/${cestaId}/subscribers`, { token: produtor });
      assert.equal(assinantes.body.data.assinantes[0].cidade, 'Pouso Alegre');
      assert.equal((await api(base, 'GET', `/api/baskets/${cestaId}/subscribers`, { token: outro })).status, 403);

      const antes = assinantes.body.data.assinantes[0].proxima_entrega;
      const entrega = await api(base, 'POST', `/api/subscriptions/${ass.body.data.id}/delivery`, { token: produtor });
      assert.equal(entrega.status, 201, JSON.stringify(entrega.body));
      const minhas = await api(base, 'GET', '/api/subscriptions', { token: cliente });
      assert.ok(minhas.body.data.assinaturas[0].proxima_entrega > antes);
      const pedido = await api(base, 'GET', `/api/orders/${entrega.body.data.pedido_id}`, { token: cliente });
      assert.equal(pedido.body.data.pedido.total, 60);

      await api(base, 'PATCH', `/api/subscriptions/${ass.body.data.id}`, { token: cliente, body: { status: 'PAUSADA' } });
      const pausada = await api(base, 'POST', `/api/subscriptions/${ass.body.data.id}/delivery`, { token: produtor });
      assert.equal(pausada.status, 400);
    });
  });

  describe('Compartilhamento', () => {
    it('gera prévia Open Graph com nome, preço e foto do anúncio', async () => {
      const res = await fetch(`${base}/share/produto/${anuncio.id}`);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.match(html, /og:title" content="Queijo — R\$\s?45,00 \/ kg"/);
      assert.match(html, /og:image" content="http/);
      const inexistente = await fetch(`${base}/share/produto/99999`, { redirect: 'manual' });
      assert.equal(inexistente.status, 302);
    });
  });
});
