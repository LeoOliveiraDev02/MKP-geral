/**
 * @file admin-email.test.js
 * @description Escalada de privilégio pelo e-mail do administrador.
 *
 * O admin é reconhecido pelo e-mail (ADMIN_EMAILS) e o cadastro não confirma
 * o e-mail. Estes testes garantem que ninguém vira admin:
 * - cadastrando o mesmo e-mail com outras maiúsculas/minúsculas;
 * - cadastrando um e-mail de ADMIN_EMAILS que ainda não tem conta;
 * - trocando o próprio e-mail no perfil para um e-mail de admin.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'chefe@test.com, Reserva@Test.com';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, api } = require('../helpers');

const SENHA = 'Forte@123';
const corpo = (email, telefone) => ({
  nome: 'Pessoa', sobrenome: 'Teste', email, telefone, senha: SENHA,
  rua: 'Rua', numero: '1', bairro: 'Centro', cidade: 'Pouso Alegre', uf: 'MG', zona: 'URBANA',
});

describe('Admin não pode ser assumido pelo e-mail', () => {
  let ctx;
  before(async () => {
    ctx = await startServer('adminemail');
    // A conta legítima do admin já existe (criada pelo sistema, não pelo cadastro público).
    const { hashSenha } = require('../../src/utils/senha');
    const UsuarioDAO = require('../../src/dao/UsuarioDAO');
    const { runAsSystem } = require('../../src/db/context');
    const senhaHash = await hashSenha(SENHA);
    await runAsSystem(() => UsuarioDAO.create({ nome: 'Chefe', sobrenome: 'Adm', email: 'chefe@test.com', telefone: '35999990000', senhaHash }));
  });
  after(async () => ctx && ctx.close());

  it('cadastro com o e-mail do admin em outra caixa é recusado', async () => {
    const r = await api(ctx.base, 'POST', '/api/auth/register', { body: corpo('CHEFE@test.com', '35999990001') });
    assert.equal(r.status, 400);
  });

  it('login aceita o e-mail em qualquer caixa (mesma conta)', async () => {
    const r = await api(ctx.base, 'POST', '/api/auth/login', { body: { email: ' Chefe@Test.com ', senha: SENHA } });
    assert.equal(r.status, 200);
  });

  it('cadastro público com e-mail de ADMIN_EMAILS (sem conta) é recusado', async () => {
    const r = await api(ctx.base, 'POST', '/api/auth/register', { body: corpo('reserva@test.com', '35999990002') });
    assert.equal(r.status, 400);
  });

  it('trocar o próprio e-mail para um de admin é recusado', async () => {
    const reg = await api(ctx.base, 'POST', '/api/auth/register', { body: corpo('comum@test.com', '35999990003') });
    assert.equal(reg.status, 201);
    const token = reg.body.data.token;
    const r = await api(ctx.base, 'PUT', '/api/users/profile', {
      token,
      body: { nome: 'Pessoa', sobrenome: 'Teste', email: 'RESERVA@test.com', telefone: '35999990003', senhaAtual: SENHA },
    });
    assert.equal(r.status, 400);
    const perfil = await api(ctx.base, 'GET', '/api/users/profile', { token });
    assert.equal(perfil.body.data.usuario.is_admin, false);
  });

  it('conta antiga gravada com maiúsculas não herda o admin', async () => {
    const { hashSenha } = require('../../src/utils/senha');
    const { getDb } = require('../../src/db');
    const { usuarios } = require('../../src/db/schema');
    const { runAsSystem } = require('../../src/db/context');
    const senhaHash = await hashSenha(SENHA);
    // Simula um registro feito antes da correção (insert cru, sem normalizar).
    await runAsSystem(() => getDb().insert(usuarios).values({ nome: 'X', sobrenome: 'Y', email: 'RESERVA@TEST.COM', telefone: '35999990006', senhaHash }));
    const login = await api(ctx.base, 'POST', '/api/auth/login', { body: { email: 'reserva@test.com', senha: SENHA } });
    assert.equal(login.status, 200);
    const token = login.body.data.token;
    const perfil = await api(ctx.base, 'GET', '/api/users/profile', { token });
    assert.equal(perfil.body.data.usuario.is_admin, false);
    const admin = await api(ctx.base, 'GET', '/api/admin/claims', { token });
    assert.equal(admin.status, 403);
    // E não consegue "consertar" a caixa pelo perfil para virar admin.
    const r = await api(ctx.base, 'PUT', '/api/users/profile', {
      token, body: { nome: 'X', sobrenome: 'Y', email: 'reserva@test.com', telefone: '35999990006' },
    });
    assert.equal(r.status, 400);
  });

  it('variar maiúsculas não burla o bloqueio por tentativas', async () => {
    for (const e of ['Chefe@test.com', 'CHEFE@TEST.COM', 'chefe@Test.com']) {
      await api(ctx.base, 'POST', '/api/auth/login', { body: { email: e, senha: 'Errada@123' } });
    }
    const r = await api(ctx.base, 'POST', '/api/auth/login', { body: { email: 'chefe@test.com', senha: SENHA } });
    assert.equal(r.status, 429);
  });

  it('e-mail com maiúsculas é gravado em minúsculas', async () => {
    const reg = await api(ctx.base, 'POST', '/api/auth/register', { body: corpo('Maria.Silva@Test.com', '35999990004') });
    assert.equal(reg.status, 201);
    const perfil = await api(ctx.base, 'GET', '/api/users/profile', { token: reg.body.data.token });
    assert.equal(perfil.body.data.usuario.email, 'maria.silva@test.com');
    const dup = await api(ctx.base, 'POST', '/api/auth/register', { body: corpo('maria.silva@test.com', '35999990005') });
    assert.equal(dup.status, 400);
  });
});
