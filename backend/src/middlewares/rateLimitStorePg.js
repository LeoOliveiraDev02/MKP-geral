/**
 * @file rateLimitStorePg.js
 * @description Contador do express-rate-limit guardado no PostgreSQL.
 *
 * Por que: na Vercel cada instância da função tem a própria memória. Com o
 * MemoryStore, quem tenta senhas em sequência cai em instâncias diferentes e
 * o limite por IP quase não vale. Aqui o contador fica na tabela "LimiteTaxa",
 * compartilhada por todas as instâncias.
 *
 * - A chave (IP) é gravada como hash SHA-256: o banco não guarda IPs (LGPD).
 * - Uma única instrução atômica (INSERT ... ON CONFLICT) conta e reinicia a
 *   janela, sem condição de corrida entre instâncias.
 * - Se o banco falhar ou a tabela ainda não existir (antes do `npm run db:init`),
 *   cai para a memória da instância: o limite fica mais fraco, mas a API não para.
 * - Linhas vencidas são apagadas aos poucos (1% das chamadas).
 */

const crypto = require('crypto');
const { MemoryStore } = require('express-rate-limit');
const { sql } = require('drizzle-orm');
const { getDb } = require('../db');
const { runAsSystem } = require('../db/context');
const logger = require('../utils/logger');

class PgRateLimitStore {
  /** @param {{prefixo: string}} opcoes prefixo separa os limitadores (auth, escrita...) */
  constructor({ prefixo }) {
    this.prefixo = prefixo;
    this.localKeys = false;
    this.memoria = new MemoryStore();
    this.avisou = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memoria.init(options);
  }

  chave(key) {
    return `${this.prefixo}:${crypto.createHash('sha256').update(String(key)).digest('hex')}`;
  }

  falhou(erro) {
    if (!this.avisou) {
      this.avisou = true;
      logger.warn('Limite de requisições usando memória local (banco indisponível ou tabela LimiteTaxa ausente: rode npm run db:init)', {
        limitador: this.prefixo,
        erro: String(erro && erro.message).slice(0, 200),
      });
    }
  }

  async executar(consulta) {
    const resultado = await runAsSystem(() => getDb().execute(consulta));
    return resultado.rows || resultado;
  }

  async increment(key) {
    try {
      const rows = await this.executar(sql`
        INSERT INTO "LimiteTaxa" (chave, hits, reinicia_em)
        VALUES (${this.chave(key)}, 1, now() + (${this.windowMs}::int * interval '1 millisecond'))
        ON CONFLICT (chave) DO UPDATE SET
          hits = CASE WHEN "LimiteTaxa".reinicia_em <= now() THEN 1 ELSE "LimiteTaxa".hits + 1 END,
          reinicia_em = CASE WHEN "LimiteTaxa".reinicia_em <= now() THEN EXCLUDED.reinicia_em ELSE "LimiteTaxa".reinicia_em END
        RETURNING hits, reinicia_em
      `);
      if (Math.random() < 0.01) {
        this.executar(sql`DELETE FROM "LimiteTaxa" WHERE reinicia_em < now() - interval '1 hour'`).catch(() => {});
      }
      return { totalHits: Number(rows[0].hits), resetTime: new Date(rows[0].reinicia_em) };
    } catch (erro) {
      this.falhou(erro);
      return this.memoria.increment(key);
    }
  }

  async decrement(key) {
    try {
      await this.executar(sql`UPDATE "LimiteTaxa" SET hits = greatest(hits - 1, 0) WHERE chave = ${this.chave(key)}`);
    } catch (erro) {
      this.falhou(erro);
      await this.memoria.decrement(key);
    }
  }

  async resetKey(key) {
    try {
      await this.executar(sql`DELETE FROM "LimiteTaxa" WHERE chave = ${this.chave(key)}`);
    } catch (erro) {
      this.falhou(erro);
      await this.memoria.resetKey(key);
    }
  }
}

module.exports = PgRateLimitStore;
