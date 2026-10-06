/**
 * @file login-google.test.js
 * @description Login social com Google (POST /api/auth/google). A validação do
 * ID token no Google é stubada — o teste cobre o fluxo do nosso lado:
 * criação no primeiro acesso, vínculo por e-mail e rejeições.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, api } = require('../helpers');

// Tokens "falsos" -> payloads que o Google devolveria
const PAYLOADS = {
  'token-novo': { email: 'Nova.Google@test.com', email_verified: true, given_name: 'Nova', family_name: 'Google' },
  'token-existente': { email: 'existente@test.com', email_verified: true, given_name: 'Outro', family_name: 'Nome' },
  'token-nao-verificado': { email: 'naoverificado@test.com', email_verified: false },
};

describe('Login com Google', async () => {
  let base;
  let close;
  let restaurar;

  before(async () => {
    ({ base, close } = await startServer('google'));
    const AutenticacaoService = require('../../src/services/AutenticacaoService');
    const original = AutenticacaoService.verificarTokenGoogle;
    AutenticacaoService.verificarTokenGoogle = async (credential) => {
      if (!PAYLOADS[credential]) throw new Error('invalid token');
      return PAYLOADS[credential];
    };
    restaurar = () => { AutenticacaoService.verificarTokenGoogle = original; };
  });

  after(async () => {
    restaurar();
    await close();
  });

  it('cria a conta no primeiro acesso (201) e loga no segundo (200)', async () => {
    const primeiro = await api(base, 'POST', '/api/auth/google', { body: { credential: 'token-novo' } });
    assert.equal(primeiro.status, 201);
    assert.equal(primeiro.body.data.novoUsuario, true);
    assert.equal(primeiro.body.data.usuario.email, 'nova.google@test.com');
    assert.equal(primeiro.body.data.usuario.nome, 'Nova');
    assert.equal(primeiro.body.data.usuario.telefone, '');

    const perfil = await api(base, 'GET', '/api/users/profile', { token: primeiro.body.data.token });
    assert.equal(perfil.status, 200);

    const segundo = await api(base, 'POST', '/api/auth/google', { body: { credential: 'token-novo' } });
    assert.equal(segundo.status, 200);
    assert.equal(segundo.body.data.novoUsuario, false);
    assert.equal(segundo.body.data.usuario.id, primeiro.body.data.usuario.id);
  });

  it('vincula à conta já cadastrada com o mesmo e-mail', async () => {
    const cadastro = await api(base, 'POST', '/api/auth/register', {
      body: {
        nome: 'Existente', sobrenome: 'Silva', email: 'existente@test.com', telefone: '11999998888',
        senha: 'Forte@123', rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', zona: 'URBANA',
      },
    });
    assert.equal(cadastro.status, 201);

    const { status, body } = await api(base, 'POST', '/api/auth/google', { body: { credential: 'token-existente' } });
    assert.equal(status, 200);
    assert.equal(body.data.novoUsuario, false);
    assert.equal(body.data.usuario.id, cadastro.body.data.usuario.id);
    assert.equal(body.data.usuario.nome, 'Existente');
  });

  it('rejeita e-mail não verificado e token inválido (401)', async () => {
    const naoVerificado = await api(base, 'POST', '/api/auth/google', { body: { credential: 'token-nao-verificado' } });
    assert.equal(naoVerificado.status, 401);

    const invalido = await api(base, 'POST', '/api/auth/google', { body: { credential: 'lixo' } });
    assert.equal(invalido.status, 401);
  });

  it('exige credential (400)', async () => {
    const { status } = await api(base, 'POST', '/api/auth/google', { body: {} });
    assert.equal(status, 400);
  });
});
