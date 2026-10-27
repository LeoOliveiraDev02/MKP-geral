/**
 * @file sessoes.test.js
 * @description Segunda rodada de hardening: sessões no servidor (lista,
 * encerrar, sair de todos, inatividade, troca/redefinição de senha), JWT com
 * algoritmo/emissor fixos, códigos de recuperação do MFA, política de senha,
 * cabeçalhos (no-store, X-Request-Id, Permissions-Policy, Clear-Site-Data),
 * Content-Type, prototype pollution, security.txt e reprocessamento de imagens.
 */
process.env.JWT_SECRET = 'test-secret';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { startServer, api, asSystem, stubEmail, snapshotUploads, cleanUploads } = require('../helpers');

const SENHA = 'Forte@123';

async function registrar(base, email, telefone) {
  const res = await api(base, 'POST', '/api/auth/register', {
    body: { nome: 'Pessoa', sobrenome: 'Teste', email, telefone, senha: SENHA, rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.token;
}

const login = async (base, email, senha = SENHA) =>
  (await api(base, 'POST', '/api/auth/login', { body: { email, senha } })).body.data.token;

const perfil = async (base, token) => (await api(base, 'GET', '/api/users/profile', { token })).status;

describe('Hardening — sessões, MFA e política de senha', () => {
  let server;
  let base;

  before(async () => {
    server = await startServer('sessoes');
    base = server.base;
  });

  after(async () => {
    await server.close();
  });

  describe('sessões no servidor', () => {
    it('lista as sessões, marca a atual e encerra outra pelo id', async () => {
      const email = 'sess1@test.com';
      const t1 = await registrar(base, email, '35911112001');
      const t2 = await login(base, email);

      const lista = await api(base, 'GET', '/api/auth/sessions', { token: t1 });
      assert.equal(lista.status, 200);
      assert.equal(lista.body.data.sessoes.length, 2);
      assert.equal(lista.body.data.sessoes.filter((s) => s.atual).length, 1);

      const outra = lista.body.data.sessoes.find((s) => !s.atual);
      assert.equal((await api(base, 'DELETE', `/api/auth/sessions/${outra.id}`, { token: t1 })).status, 200);
      assert.equal(await perfil(base, t2), 401);
      assert.equal(await perfil(base, t1), 200);

      // id de outra conta / inexistente
      const inexistente = await api(base, 'DELETE', '/api/auth/sessions/00000000-0000-4000-8000-000000000000', { token: t1 });
      assert.equal(inexistente.status, 404);
    });

    it('"sair de todos os dispositivos" derruba todas, inclusive a atual', async () => {
      const email = 'sess2@test.com';
      const t1 = await registrar(base, email, '35911112002');
      const t2 = await login(base, email);
      const res = await api(base, 'POST', '/api/auth/logout-all', { token: t1 });
      assert.equal(res.status, 200);
      assert.equal(await perfil(base, t1), 401);
      assert.equal(await perfil(base, t2), 401);
    });

    it('troca de senha mantém esta sessão e derruba as outras', async () => {
      const email = 'sess3@test.com';
      const t1 = await registrar(base, email, '35911112003');
      const t2 = await login(base, email);
      const res = await api(base, 'PUT', '/api/users/password', {
        token: t1,
        body: { senhaAtual: SENHA, novaSenha: 'Nova#Chave42', confirmarNovaSenha: 'Nova#Chave42' },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(await perfil(base, t1), 200);
      assert.equal(await perfil(base, t2), 401);
    });

    it('redefinição de senha derruba todas as sessões', async () => {
      const email = 'sess4@test.com';
      const t1 = await registrar(base, email, '35911112004');
      const mail = stubEmail();
      try {
        await api(base, 'POST', '/api/auth/forgot-password', { body: { email } });
        const codigo = mail.sent.at(-1).code;
        // o banco guarda só o hash do código
        const RecuperacaoSenhaDAO = require('../../src/dao/RecuperacaoSenhaDAO');
        const UsuarioDAO = require('../../src/dao/UsuarioDAO');
        const user = await asSystem(() => UsuarioDAO.findByEmail(email));
        assert.equal(await asSystem(() => RecuperacaoSenhaDAO.findActiveByUsuarioAndCodigo(user.id, codigo)), undefined);

        const res = await api(base, 'POST', '/api/auth/reset-password', { body: { email, codigo, novaSenha: 'Outra#Chave42' } });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(await perfil(base, t1), 401);
      } finally {
        mail.restore();
      }
    });

    it('sessão ociosa além do limite expira', async () => {
      const t = await registrar(base, 'sess5@test.com', '35911112005');
      const { getDb } = require('../../src/db');
      const { sessoes } = require('../../src/db/schema');
      const { eq } = require('drizzle-orm');
      const { jti } = jwt.decode(t);
      await asSystem(() => getDb().update(sessoes).set({ ultimoUso: '2000-01-01 00:00:00' }).where(eq(sessoes.id, jti)));
      assert.equal(await perfil(base, t), 401);
    });

    it('recusa JWT com alg "none", sem emissor/público ou sem sessão registrada', async () => {
      const t = await registrar(base, 'sess6@test.com', '35911112006');
      const { id, email } = jwt.decode(t);
      const none = jwt.sign({ id, email }, null, { algorithm: 'none' });
      assert.equal(await perfil(base, none), 401);
      const semIss = jwt.sign({ id, email, jti: jwt.decode(t).jti }, 'test-secret');
      assert.equal(await perfil(base, semIss), 401);
      const forjado = jwt.sign({ id, email, jti: 'nao-existe' }, 'test-secret', { issuer: 'agrostand', audience: 'agrostand-api' });
      assert.equal(await perfil(base, forjado), 401);
    });

    it('logout pede ao navegador para limpar cookies e cache', async () => {
      const t = await registrar(base, 'sess7@test.com', '35911112007');
      const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('clear-site-data'), /cookies/);
    });
  });

  describe('códigos de recuperação do MFA', () => {
    it('ativar devolve 10 códigos; cada um vale uma vez no login', async () => {
      const totp = require('../../src/utils/totp');
      const email = 'mfa1@test.com';
      const t = await registrar(base, email, '35911112010');
      const { segredo } = (await api(base, 'POST', '/api/auth/mfa/setup', { token: t })).body.data;
      const ativado = await api(base, 'POST', '/api/auth/mfa/enable', {
        token: t, body: { codigo: totp.codigoNoPasso(segredo, totp.passoAtual()) },
      });
      assert.equal(ativado.status, 200);
      const codigos = ativado.body.data.codigosRecuperacao;
      assert.equal(codigos.length, 10);
      assert.match(codigos[0], /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

      const desafio = async () =>
        (await api(base, 'POST', '/api/auth/login', { body: { email, senha: SENHA } })).body.data.mfaToken;

      const ok = await api(base, 'POST', '/api/auth/mfa/verify', { body: { mfaToken: await desafio(), codigo: codigos[0].toLowerCase() } });
      assert.equal(ok.status, 200);
      const repetido = await api(base, 'POST', '/api/auth/mfa/verify', { body: { mfaToken: await desafio(), codigo: codigos[0] } });
      assert.equal(repetido.status, 401);

      const status = await api(base, 'GET', '/api/auth/mfa', { token: ok.body.data.token });
      assert.equal(status.body.data.codigosRecuperacaoRestantes, 9);

      // banco só guarda hash
      const { getDb } = require('../../src/db');
      const { mfaCodigosRecuperacao } = require('../../src/db/schema');
      const rows = await asSystem(() => getDb().select().from(mfaCodigosRecuperacao));
      assert.ok(rows.every((r) => !codigos.includes(r.codigoHash) && r.codigoHash.length === 64));
    });
  });

  describe('política de senha', () => {
    it('recusa senha comum, com dados pessoais ou longa demais', async () => {
      const corpo = { nome: 'Joaquim', sobrenome: 'Teste', telefone: '35911112020', rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA' };
      const comum = await api(base, 'POST', '/api/auth/register', { body: { ...corpo, email: 'pol1@test.com', senha: 'Senha@123' } });
      assert.equal(comum.status, 400);
      assert.match(comum.body.message, /comum/);
      const pessoal = await api(base, 'POST', '/api/auth/register', { body: { ...corpo, email: 'pol2@test.com', senha: 'Joaquim#2024' } });
      assert.equal(pessoal.status, 400);
      assert.match(pessoal.body.message, /nome ou seu e-mail/);
      const longa = await api(base, 'POST', '/api/auth/register', { body: { ...corpo, email: 'pol3@test.com', senha: `Aa1!${'x'.repeat(130)}` } });
      assert.equal(longa.status, 400);
    });

    it('senha longa (> 72 bytes) vale por inteiro e hash antigo migra no login', async () => {
      const email = 'pol4@test.com';
      const longa = `Uma frase bem longa e única! 9 ${'ção'.repeat(20)}`;
      const corpo = { nome: 'Pessoa', sobrenome: 'Teste', email, telefone: '35911112021', senha: longa, rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA' };
      assert.equal((await api(base, 'POST', '/api/auth/register', { body: corpo })).status, 201);
      // mesma senha com o final trocado (bcrypt puro truncaria em 72 bytes e aceitaria)
      const quase = longa.slice(0, -1) + 'x';
      assert.equal((await api(base, 'POST', '/api/auth/login', { body: { email, senha: quase } })).status, 401);
      assert.ok(await login(base, email, longa));

      // conta antiga (bcrypt puro) entra e o hash é migrado
      const bcrypt = require('bcryptjs');
      const UsuarioDAO = require('../../src/dao/UsuarioDAO');
      const user = await asSystem(() => UsuarioDAO.findByEmail(email));
      await asSystem(() => UsuarioDAO.updatePassword(user.id, bcrypt.hashSync(SENHA, 10)));
      assert.ok(await login(base, email, SENHA));
      const migrado = await asSystem(() => UsuarioDAO.findByEmail(email));
      assert.match(migrado.senha_hash, /^\$ag[hp]1\$/);
    });

    it('trocar o e-mail exige a senha atual', async () => {
      const t = await registrar(base, 'pol5@test.com', '35911112022');
      const dados = { nome: 'Pessoa', sobrenome: 'Teste', email: 'pol5-novo@test.com', telefone: '35911112022' };
      assert.equal((await api(base, 'PUT', '/api/users/profile', { token: t, body: dados })).status, 400);
      assert.equal((await api(base, 'PUT', '/api/users/profile', { token: t, body: { ...dados, senhaAtual: 'Errada#1' } })).status, 400);
      assert.equal((await api(base, 'PUT', '/api/users/profile', { token: t, body: { ...dados, senhaAtual: SENHA } })).status, 200);
      // sem trocar e-mail, não pede senha
      assert.equal((await api(base, 'PUT', '/api/users/profile', { token: t, body: { ...dados, nome: 'Outro' } })).status, 200);
    });
  });

  describe('cabeçalhos e entrada', () => {
    it('API responde no-store, X-Request-Id e Permissions-Policy', async () => {
      const res = await fetch(base + '/api/categories');
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
      assert.match(res.headers.get('permissions-policy'), /camera=\(\)/);
      assert.equal(res.headers.get('x-xss-protection'), '0');
    });

    it('escrita com Content-Type inesperado recebe 415', async () => {
      const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'email=a' });
      assert.equal(res.status, 415);
    });

    it('descarta __proto__ do JSON (prototype pollution)', async () => {
      const res = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email":"x@test.com","senha":"Errada@1","__proto__":{"poluido":true}}',
      });
      assert.equal(res.status, 401);
      assert.equal({}.poluido, undefined);
    });

    it('publica /.well-known/security.txt', async () => {
      const res = await fetch(base + '/.well-known/security.txt');
      assert.equal(res.status, 200);
      const corpo = await res.text();
      assert.match(corpo, /^Contact: /m);
      assert.match(corpo, /^Expires: /m);
    });

    it('imagem enviada é reprocessada sem EXIF', async () => {
      const sharp = require('sharp');
      const antes = snapshotUploads();
      try {
        const t = await registrar(base, 'img1@test.com', '35911112030');
        const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a7' } })
          .jpeg()
          .withMetadata({ exif: { IFD0: { Copyright: 'segredo-gps', Artist: 'fulano' } } })
          .toBuffer();
        assert.ok((await sharp(jpeg).metadata()).exif, 'o arquivo de teste tem EXIF');
        const fd = new FormData();
        fd.append('foto', new Blob([jpeg], { type: 'image/jpeg' }), 'f.jpg');
        const res = await fetch(base + '/api/users/profile/photo', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd });
        assert.equal(res.status, 200, await res.clone().text());
        const fs = require('fs');
        const path = require('path');
        const novo = fs.readdirSync(server.uploadDir).find((f) => !antes.has(f) && f.endsWith('.jpg'));
        const meta = await sharp(fs.readFileSync(path.join(server.uploadDir, novo))).metadata();
        assert.equal(meta.exif, undefined);
      } finally {
        cleanUploads(antes);
      }
    });
  });
});
