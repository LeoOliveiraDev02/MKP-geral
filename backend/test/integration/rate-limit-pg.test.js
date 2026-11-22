/**
 * @file rate-limit-pg.test.js
 * @description Contador do limite de requisições no PostgreSQL: duas
 * "instâncias" (dois stores) somam no mesmo contador, a janela reinicia, o IP
 * não é gravado em claro e, sem a tabela, o store cai para a memória.
 */
process.env.JWT_SECRET = 'test-secret';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, asSystem } = require('../helpers');

describe('Limite de requisições compartilhado no banco', () => {
  let ctx;
  let PgRateLimitStore;
  before(async () => {
    ctx = await startServer('ratelimitpg');
    PgRateLimitStore = require('../../src/middlewares/rateLimitStorePg');
  });
  after(async () => ctx && ctx.close());

  const novo = (prefixo, windowMs = 60000) => {
    const s = new PgRateLimitStore({ prefixo });
    s.init({ windowMs });
    return s;
  };

  it('duas instâncias somam no mesmo contador', async () => {
    const a = novo('t1');
    const b = novo('t1');
    assert.equal((await a.increment('203.0.113.7')).totalHits, 1);
    assert.equal((await b.increment('203.0.113.7')).totalHits, 2);
    assert.equal((await a.increment('203.0.113.7')).totalHits, 3);
    assert.equal((await b.increment('198.51.100.1')).totalHits, 1);
  });

  it('o IP não fica gravado em claro', async () => {
    const { getDb } = require('../../src/db');
    const { sql } = require('drizzle-orm');
    const r = await asSystem(() => getDb().execute(sql`SELECT chave FROM "LimiteTaxa"`));
    const chaves = (r.rows || r).map((x) => x.chave).join(' ');
    assert.ok(!chaves.includes('203.0.113.7'));
    assert.match(chaves, /t1:[0-9a-f]{64}/);
  });

  it('a janela reinicia depois de vencer', async () => {
    const s = novo('t2', 200);
    await s.increment('ip');
    assert.equal((await s.increment('ip')).totalHits, 2);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await s.increment('ip')).totalHits, 1);
  });

  it('decrement e resetKey', async () => {
    const s = novo('t3');
    await s.increment('ip');
    await s.increment('ip');
    await s.decrement('ip');
    assert.equal((await s.increment('ip')).totalHits, 2);
    await s.resetKey('ip');
    assert.equal((await s.increment('ip')).totalHits, 1);
  });

  it('sem a tabela, cai para a memória sem derrubar a requisição', async () => {
    const s = novo('t4');
    s.executar = async () => { throw new Error('relation "LimiteTaxa" does not exist'); };
    assert.equal((await s.increment('ip')).totalHits, 1);
    assert.equal((await s.increment('ip')).totalHits, 2);
  });
});
