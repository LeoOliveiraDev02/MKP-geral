/**
 * @file hardening.test.js
 * @description Camada de segurança: cabeçalhos/CSP, CORS restrito, sessão em
 * cookie HttpOnly + CSRF, validação por schema (mass assignment), IDOR em
 * pedidos/cotações/chat, webhook de pagamento assinado, MFA do admin, upload
 * com magic bytes, exportação LGPD, CRON protegido e rate limit.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'chefe@test.com';
process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_teste_123';
process.env.CORS_ORIGINS = 'https://agromundo.test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, api, pngFile, snapshotUploads, cleanUploads } = require('../helpers');

const SENHA = 'Forte@123';

async function registrar(base, email, telefone) {
  const { body } = await api(base, 'POST', '/api/auth/register', {
    body: { nome: 'Pessoa', sobrenome: 'Teste', email, telefone, senha: SENHA, rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA' },
  });
  return body.data.token;
}

async function publicar(base, token, nome) {
  const cat = (await api(base, 'GET', '/api/categories')).body.data.categorias[0].id;
  const end = (await api(base, 'GET', '/api/addresses', { token })).body.data.enderecos[0].id;
  const fd = new FormData();
  for (const [k, v] of Object.entries({ nome, descricao: 'x', preco: '20', categoriaId: String(cat), enderecoId: String(end) })) fd.append(k, v);
  fd.append('imagemPrincipal', pngFile(), 'p.png');
  const res = await fetch(base + '/api/ads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  assert.equal(res.status, 201);
  return (await res.json()).data.anuncio;
}

/** Cookies do Set-Cookie → { nome: { valor, atributos } } */
function lerCookies(res) {
  const out = {};
  for (const linha of res.headers.getSetCookie()) {
    const [par, ...attrs] = linha.split(';').map((p) => p.trim());
    const [nome, ...resto] = par.split('=');
    out[nome] = { valor: resto.join('='), attrs: attrs.map((a) => a.toLowerCase()) };
  }
  return out;
}

function webhook(base, evento, { t, assinaturaManual } = {}) {
  const PagamentoService = require('../../src/services/PagamentoService');
  const corpo = JSON.stringify(evento);
  return fetch(base + '/api/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': assinaturaManual || PagamentoService.assinar(corpo, t),
    },
    body: corpo,
  });
}

describe('Hardening de segurança', async () => {
  let base;
  let close;
  let uploadsAntes;
  let vendedor;
  let comprador;
  let intruso;
  let anuncio;
  let pedido;

  before(async () => {
    ({ base, close } = await startServer('hardening'));
    uploadsAntes = snapshotUploads();
    vendedor = await registrar(base, 'vend@test.com', '35911110001');
    comprador = await registrar(base, 'comp@test.com', '35911110002');
    intruso = await registrar(base, 'intr@test.com', '35911110003');
    anuncio = await publicar(base, vendedor, 'Queijo');
    const { body } = await api(base, 'POST', '/api/orders/checkout', {
      token: comprador,
      body: { itens: [{ anuncioId: anuncio.id, quantidade: 2 }], entregas: { [anuncio.anunciante_id]: 'RETIRADA' }, formaPagamento: 'PIX' },
    });
    pedido = body.data.pedidos[0];
  });

  after(async () => {
    cleanUploads(uploadsAntes);
    await close();
  });

  describe('cabeçalhos e CORS', () => {
    it('envia CSP, nosniff e anti-iframe; esconde X-Powered-By', async () => {
      const res = await fetch(base + '/health');
      assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-powered-by'), null);
    });

    it('CORS só para origens permitidas', async () => {
      const ok = await fetch(base + '/api/categories', { headers: { Origin: 'https://agromundo.test' } });
      assert.equal(ok.headers.get('access-control-allow-origin'), 'https://agromundo.test');
      const ruim = await fetch(base + '/api/categories', { headers: { Origin: 'https://site-malicioso.com' } });
      assert.equal(ruim.headers.get('access-control-allow-origin'), null);
    });

    it('rota inexistente responde JSON 404 sem página do Express', async () => {
      const { status, body } = await api(base, 'GET', '/api/nao-existe');
      assert.equal(status, 404);
      assert.equal(body.status, 'error');
    });
  });

  describe('sessão em cookie HttpOnly + CSRF', () => {
    it('login grava cookie HttpOnly/SameSite; escrita exige X-CSRF-Token', async () => {
      const login = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'comp@test.com', senha: SENHA }),
      });
      assert.equal(login.status, 200);
      const c = lerCookies(login);
      assert.ok(c.agrostand_session.attrs.includes('httponly'));
      assert.ok(c.agrostand_session.attrs.some((a) => a.startsWith('samesite=strict')));
      assert.ok(!c.agrostand_csrf.attrs.includes('httponly'));
      const cookie = `agrostand_session=${c.agrostand_session.valor}; agrostand_csrf=${c.agrostand_csrf.valor}`;

      const leitura = await fetch(base + '/api/users/profile', { headers: { Cookie: cookie } });
      assert.equal(leitura.status, 200);

      const perfil = { nome: 'Novo', sobrenome: 'Nome', email: 'comp@test.com', telefone: '35911110002' };
      const semCsrf = await fetch(base + '/api/users/profile', {
        method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(perfil),
      });
      assert.equal(semCsrf.status, 403);

      const comCsrf = await fetch(base + '/api/users/profile', {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': c.agrostand_csrf.valor },
        body: JSON.stringify(perfil),
      });
      assert.equal(comCsrf.status, 200);
    });
  });

  describe('validação de entrada', () => {
    it('rejeita tipos inesperados (ex: objeto no lugar do e-mail)', async () => {
      const { status, body } = await api(base, 'POST', '/api/auth/login', { body: { email: { $ne: null }, senha: 'x' } });
      assert.equal(status, 400);
      assert.match(body.message, /Dados inválidos \(email\)/);
    });

    it('rejeita id de rota não numérico e textos gigantes', async () => {
      assert.equal((await api(base, 'GET', '/api/orders/abc', { token: comprador })).status, 400);
      const { status } = await api(base, 'POST', '/api/chats', { token: comprador, body: { anuncioId: anuncio.id, texto: 'a'.repeat(5000) } });
      assert.equal(status, 400);
    });

    it('mass assignment: userId no corpo não troca o dono do endereço', async () => {
      const outro = (await api(base, 'GET', '/api/users/profile', { token: intruso })).body.data.usuario.id;
      const { status, body } = await api(base, 'POST', '/api/addresses', {
        token: comprador,
        body: { userId: outro, rua: 'R', numero: '2', bairro: 'B', cidade: 'C', uf: 'MG', zona: 'URBANA' },
      });
      assert.equal(status, 201);
      const doIntruso = (await api(base, 'GET', '/api/addresses', { token: intruso })).body.data.enderecos;
      assert.ok(!doIntruso.some((e) => e.id === body.data.endereco.id));
    });
  });

  describe('autorização por recurso (IDOR)', () => {
    it('terceiro não vê nem altera pedido alheio', async () => {
      assert.equal((await api(base, 'GET', `/api/orders/${pedido.id}`, { token: intruso })).status, 403);
      assert.equal((await api(base, 'PATCH', `/api/orders/${pedido.id}/status`, { token: intruso, body: { status: 'CANCELADO' } })).status, 403);
    });

    it('terceiro não responde, aceita nem cancela cotação alheia', async () => {
      const { body } = await api(base, 'POST', '/api/quotes', { token: comprador, body: { anuncioId: anuncio.id, quantidade: 50 } });
      const id = body.data.id;
      assert.equal((await api(base, 'POST', `/api/quotes/${id}/reply`, { token: intruso, body: { precoUnitario: 1 } })).status, 403);
      assert.equal((await api(base, 'POST', `/api/quotes/${id}/accept`, { token: intruso, body: { tipoEntrega: 'RETIRADA', formaPagamento: 'PIX' } })).status, 403);
      assert.equal((await api(base, 'POST', `/api/quotes/${id}/cancel`, { token: intruso })).status, 403);
    });

    it('terceiro não lê nem escreve em conversa alheia', async () => {
      const { body } = await api(base, 'POST', '/api/chats', { token: comprador, body: { anuncioId: anuncio.id, texto: 'Oi' } });
      const id = body.data.conversa_id;
      assert.equal((await api(base, 'GET', `/api/chats/${id}/messages`, { token: intruso })).status, 404);
      assert.equal((await api(base, 'POST', `/api/chats/${id}/messages`, { token: intruso, body: { texto: 'invadi' } })).status, 404);
    });
  });

  describe('pagamento', () => {
    it('sem modo simulado, o comprador não marca o próprio pedido como pago', async () => {
      process.env.PAGAMENTO_SIMULADO = 'off';
      try {
        const { status } = await api(base, 'PATCH', `/api/orders/${pedido.id}/status`, { token: comprador, body: { status: 'PAGO' } });
        assert.equal(status, 403);
        const det = (await api(base, 'GET', `/api/orders/${pedido.id}`, { token: comprador })).body.data.pedido;
        assert.ok(!det.acoes.includes('PAGO'));
      } finally {
        delete process.env.PAGAMENTO_SIMULADO;
      }
    });

    it('webhook: assinatura inválida, expirada ou valor divergente não confirmam', async () => {
      const evento = { id: 'evt_1', type: 'payment.approved', data: { pedidoId: pedido.id, valor: pedido.total } };
      assert.equal((await webhook(base, evento, { assinaturaManual: `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` })).status, 401);
      assert.equal((await webhook(base, evento, { t: Math.floor(Date.now() / 1000) - 3600 })).status, 401);

      const divergente = await webhook(base, { ...evento, id: 'evt_2', data: { pedidoId: pedido.id, valor: 0.01 } });
      assert.equal((await divergente.json()).data.resultado, 'VALOR_DIVERGENTE');
      const det = (await api(base, 'GET', `/api/orders/${pedido.id}`, { token: comprador })).body.data.pedido;
      assert.equal(det.status, 'AGUARDANDO_PAGAMENTO');
    });

    it('webhook válido confirma o pedido uma única vez (idempotente)', async () => {
      const evento = { id: 'evt_ok', type: 'payment.approved', data: { pedidoId: pedido.id, valor: pedido.total } };
      const r1 = await webhook(base, evento);
      assert.equal((await r1.json()).data.resultado, 'CONFIRMADO');
      const r2 = await webhook(base, evento);
      assert.equal((await r2.json()).data.resultado, 'DUPLICADO');
      const det = (await api(base, 'GET', `/api/orders/${pedido.id}`, { token: comprador })).body.data.pedido;
      assert.equal(det.status, 'PAGO');
    });
  });

  describe('MFA do administrador', () => {
    it('admin sem MFA é barrado; com TOTP ativo entra; login passa a pedir o código', async () => {
      const totp = require('../../src/utils/totp');
      process.env.ADMIN_MFA = 'on';
      try {
        let admin = await registrar(base, 'chefe@test.com', '35911110009');
        const barrado = await api(base, 'GET', '/api/admin/verifications', { token: admin });
        assert.equal(barrado.status, 403);
        assert.equal(barrado.body.code, 'MFA_REQUIRED');

        const { segredo } = (await api(base, 'POST', '/api/auth/mfa/setup', { token: admin })).body.data;
        assert.equal((await api(base, 'POST', '/api/auth/mfa/enable', { token: admin, body: { codigo: '000000' } })).status, 400);
        const passo = totp.passoAtual();
        const ativado = await api(base, 'POST', '/api/auth/mfa/enable', {
          token: admin, body: { codigo: totp.codigoNoPasso(segredo, passo) },
        });
        assert.equal(ativado.status, 200);
        // sessão antiga (sem 2º fator) foi revogada
        assert.equal((await api(base, 'GET', '/api/users/profile', { token: admin })).status, 401);
        admin = ativado.body.data.token;
        assert.equal((await api(base, 'GET', '/api/admin/verifications', { token: admin })).status, 200);

        const login = await api(base, 'POST', '/api/auth/login', { body: { email: 'chefe@test.com', senha: SENHA } });
        assert.equal(login.body.data.mfaRequired, true);
        assert.equal(login.body.data.token, undefined);
        const { mfaToken } = login.body.data;
        // o desafio não vale como sessão
        assert.equal((await api(base, 'GET', '/api/users/profile', { token: mfaToken })).status, 401);
        // código já usado não vale de novo (anti-replay)
        const repetido = await api(base, 'POST', '/api/auth/mfa/verify', {
          body: { mfaToken, codigo: totp.codigoNoPasso(segredo, passo) },
        });
        assert.equal(repetido.status, 401);
        const ok = await api(base, 'POST', '/api/auth/mfa/verify', {
          body: { mfaToken, codigo: totp.codigoNoPasso(segredo, passo + 1) },
        });
        assert.equal(ok.status, 200);
        assert.equal((await api(base, 'GET', '/api/admin/verifications', { token: ok.body.data.token })).status, 200);
      } finally {
        delete process.env.ADMIN_MFA;
      }
    });
  });

  describe('upload, LGPD e CRON', () => {
    it('recusa arquivo que diz ser PNG mas não é imagem (magic bytes)', async () => {
      const cat = (await api(base, 'GET', '/api/categories')).body.data.categorias[0].id;
      const end = (await api(base, 'GET', '/api/addresses', { token: vendedor })).body.data.enderecos[0].id;
      const fd = new FormData();
      for (const [k, v] of Object.entries({ nome: 'Falso', descricao: 'x', preco: '1', categoriaId: String(cat), enderecoId: String(end) })) fd.append(k, v);
      fd.append('imagemPrincipal', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
      const res = await fetch(base + '/api/ads', { method: 'POST', headers: { Authorization: `Bearer ${vendedor}` }, body: fd });
      assert.equal(res.status, 400);
      assert.match((await res.json()).message, /não é uma imagem válida/);
    });

    it('exporta os dados do titular sem hash de senha', async () => {
      const { status, body } = await api(base, 'GET', '/api/users/data-export', { token: comprador });
      assert.equal(status, 200);
      assert.equal(body.data.titular.email, 'comp@test.com');
      assert.ok(body.data.pedidos.length >= 1);
      assert.ok(!JSON.stringify(body.data).includes('senha'));
    });

    it('limpeza agendada exige X-Cron-Secret quando configurado', async () => {
      process.env.CRON_SECRET = 'cron-123';
      try {
        assert.equal((await api(base, 'POST', '/api/ads/cleanup')).status, 403);
        const ok = await fetch(base + '/api/ads/cleanup', { method: 'POST', headers: { 'X-Cron-Secret': 'cron-123' } });
        assert.equal(ok.status, 200);
      } finally {
        delete process.env.CRON_SECRET;
      }
    });
  });

  describe('rate limit', () => {
    it('login acima do limite por IP recebe 429', async () => {
      process.env.RATE_LIMIT_TESTS = 'on';
      process.env.RATE_LIMIT_AUTH = '2';
      try {
        const tentar = () => api(base, 'POST', '/api/auth/login', { body: { email: 'ninguem@test.com', senha: 'Errada@1' } });
        assert.equal((await tentar()).status, 401);
        assert.equal((await tentar()).status, 401);
        const bloqueado = await tentar();
        assert.equal(bloqueado.status, 429);
        assert.match(bloqueado.body.message, /Muitas tentativas/);
      } finally {
        delete process.env.RATE_LIMIT_TESTS;
        delete process.env.RATE_LIMIT_AUTH;
      }
    });
  });
});
