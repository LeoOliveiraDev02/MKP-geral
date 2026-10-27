/**
 * @file seguranca-utils.test.js
 * @description TOTP (RFC 6238), cifra do segredo MFA, redação de logs e
 * checagem de ambiente de produção.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../../src/utils/totp');
const { sanitizar } = require('../../src/utils/logger');
const seguranca = require('../../src/config/seguranca');

describe('TOTP', () => {
  it('bate com o vetor de teste da RFC 6238 (SHA1, T=59s)', () => {
    // Segredo ASCII "12345678901234567890" em base32
    const segredo = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(totp.codigoNoPasso(segredo, Math.floor(59 / 30)), '287082');
  });

  it('aceita ±1 passo e recusa códigos malformados', () => {
    const segredo = totp.gerarSegredo();
    const agora = Date.now();
    const passo = totp.passoAtual(agora);
    assert.equal(totp.verificarCodigo(segredo, totp.codigoNoPasso(segredo, passo - 1), agora), passo - 1);
    assert.equal(totp.verificarCodigo(segredo, totp.codigoNoPasso(segredo, passo + 3), agora), null);
    assert.equal(totp.verificarCodigo(segredo, 'abc', agora), null);
  });

  it('cifra o segredo com AES-GCM (adulteração é detectada)', () => {
    const pacote = totp.cifrar('SEGREDO');
    assert.notEqual(pacote, 'SEGREDO');
    assert.equal(totp.decifrar(pacote), 'SEGREDO');
    const [iv, tag, dados] = pacote.split('.');
    const adulterado = [iv, tag, Buffer.from('xxxxxxx').toString('base64')].join('.');
    assert.throws(() => totp.decifrar(adulterado));
    assert.ok(dados);
  });
});

describe('Logs sem dados sensíveis', () => {
  it('remove senha/token/código e mascara e-mail e telefone', () => {
    const limpo = sanitizar({
      email: 'maria.souza@gmail.com',
      senha: 'Forte@123',
      token: 'eyJ...',
      codigo: '123456',
      telefone: '35999998888',
      url: '/api/x?email=maria@gmail.com&page=2',
      userId: 7,
    });
    assert.equal(limpo.email, 'ma***@gmail.com');
    assert.equal(limpo.senha, '[REDACTED]');
    assert.equal(limpo.token, '[REDACTED]');
    assert.equal(limpo.codigo, '[REDACTED]');
    assert.equal(limpo.telefone, '*******8888');
    assert.equal(limpo.url, '/api/x?email=[REDACTED]&page=2');
    assert.equal(limpo.userId, 7);
  });
});

describe('Configuração de produção', () => {
  function comAmbiente(env, fn) {
    const antes = { ...process.env };
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      for (const k of Object.keys(env)) {
        if (antes[k] === undefined) delete process.env[k];
        else process.env[k] = antes[k];
      }
    }
  }

  it('recusa subir com JWT_SECRET fraco, sem CORS ou com pagamento simulado', () => {
    comAmbiente({ NODE_ENV: 'production', JWT_SECRET: 'curto', CORS_ORIGINS: '', MFA_ENCRYPTION_KEY: '', PAGAMENTO_SIMULADO: 'on' }, () => {
      assert.throws(() => seguranca.validarAmbiente(), /JWT_SECRET[\s\S]*CORS_ORIGINS[\s\S]*MFA_ENCRYPTION_KEY[\s\S]*PAGAMENTO_SIMULADO/);
    });
  });

  it('aceita configuração completa e desliga pagamento simulado', () => {
    comAmbiente({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(48),
      CORS_ORIGINS: 'https://agromundo.com.br',
      MFA_ENCRYPTION_KEY: 'k'.repeat(40),
      PASSWORD_PEPPER: 'p'.repeat(40),
      PAGAMENTO_SIMULADO: 'off',
    }, () => {
      assert.doesNotThrow(() => seguranca.validarAmbiente());
      assert.equal(seguranca.pagamentoSimulado(), false);
    });
  });
});
