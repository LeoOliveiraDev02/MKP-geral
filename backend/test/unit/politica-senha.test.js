/**
 * @file politica-senha.test.js
 * @description Regras de senha nova e formatos de hash (pepper, legado).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { ehComum, contemDadosPessoais } = require('../../src/utils/politicaSenha');

describe('politicaSenha', () => {
  it('reconhece senhas óbvias, inclusive com leetspeak', () => {
    for (const s of ['Senha@123', 'P@ssw0rd!', 'Admin@2024', 'Brasil#2026', 'Qwerty@123', 'Ab@12345678', 'Aaaa@1111']) {
      assert.equal(ehComum(s), true, s);
    }
    for (const s of ['Forte@123', 'Cavalo#Bateria9', 'minha frase longa 42!']) {
      assert.equal(ehComum(s), false, s);
    }
  });

  it('recusa nome ou parte do e-mail na senha (sem acento e sem caixa)', () => {
    assert.equal(contemDadosPessoais('Joao.silva#9', { email: 'joao.silva@x.com' }), true);
    assert.equal(contemDadosPessoais('#Conceição99', { nome: 'Conceicao' }), true);
    assert.equal(contemDadosPessoais('Forte@123', { email: 'ana@x.com', nome: 'Ana' }), false);
  });
});

describe('senha.js (pepper e migração)', () => {
  function comPepper(valor, fn) {
    const antes = process.env.PASSWORD_PEPPER;
    if (valor === undefined) delete process.env.PASSWORD_PEPPER;
    else process.env.PASSWORD_PEPPER = valor;
    try {
      return fn();
    } finally {
      if (antes === undefined) delete process.env.PASSWORD_PEPPER;
      else process.env.PASSWORD_PEPPER = antes;
    }
  }

  const { hashSenha, verificarSenha, precisaRehash } = require('../../src/utils/senha');

  it('hash com pepper só confere com o mesmo pepper', async () => {
    const hash = await comPepper('p'.repeat(40), () => hashSenha('Forte@123'));
    assert.match(hash, /^\$agp1\$/);
    comPepper('p'.repeat(40), () => assert.equal(verificarSenha('Forte@123', hash), true));
    comPepper('q'.repeat(40), () => assert.equal(verificarSenha('Forte@123', hash), false));
    comPepper(undefined, () => assert.equal(verificarSenha('Forte@123', hash), false));
  });

  it('aceita hash bcrypt antigo e pede migração', () => {
    const antigo = bcrypt.hashSync('Forte@123', 4);
    assert.equal(verificarSenha('Forte@123', antigo), true);
    assert.equal(verificarSenha('Errada@123', antigo), false);
    assert.equal(precisaRehash(antigo), true);
  });

  it('sem pepper usa $agh1$ e migra quando o pepper é configurado', async () => {
    const hash = await comPepper(undefined, () => hashSenha('Forte@123'));
    assert.match(hash, /^\$agh1\$/);
    comPepper(undefined, () => assert.equal(precisaRehash(hash), false));
    comPepper('p'.repeat(40), () => {
      assert.equal(verificarSenha('Forte@123', hash), true);
      assert.equal(precisaRehash(hash), true);
    });
  });
});
