/**
 * @file SessaoDAO.js (Drizzle)
 * @description Sessões no servidor (tabela interna `Sessao`, RLS só-sistema).
 * O id é o `jti` do JWT; o token em si nunca é gravado.
 */

const { eq, and, ne, isNull, lt, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { sessoes } = require('../db/schema');

function toLegacy(row) {
  if (!row) return null;
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    criada_em: row.criadaEm,
    ultimo_uso: row.ultimoUso,
    expira_em: row.expiraEm,
    ip: row.ip,
    user_agent: row.userAgent,
    mfa: row.mfa,
    revogada_em: row.revogadaEm,
  };
}

const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

class SessaoDAO {
  static async criar({ id, usuarioId, expiraEm, ip, userAgent, mfa }, client) {
    const database = client || getDb();
    await database.insert(sessoes).values({ id, usuarioId, expiraEm, ip, userAgent, mfa: !!mfa });
    // Purga amortizada: sessões vencidas há mais de 30 dias (o histórico
    // recente serve para reconhecer dispositivos já usados).
    const limite = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await database.delete(sessoes).where(lt(sessoes.expiraEm, limite));
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(sessoes).where(eq(sessoes.id, id)).limit(1);
    return toLegacy(row);
  }

  static async tocar(id, client) {
    const database = client || getDb();
    await database.update(sessoes).set({ ultimoUso: agora() }).where(eq(sessoes.id, id));
  }

  /** Sessões ainda válidas do usuário (mais recentes primeiro). */
  static async listarAtivas(usuarioId, client) {
    const database = client || getDb();
    const rows = await database
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.revogadaEm)))
      .orderBy(desc(sessoes.ultimoUso));
    const now = agora();
    return rows.map(toLegacy).filter((s) => s.expira_em > now);
  }

  /** O usuário já entrou antes com este navegador/aparelho? */
  static async existeComUserAgent(usuarioId, userAgent, client) {
    const database = client || getDb();
    const [row] = await database
      .select({ id: sessoes.id })
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), eq(sessoes.userAgent, userAgent || '')))
      .limit(1);
    return !!row;
  }

  static async revogar(id, usuarioId, client) {
    const database = client || getDb();
    const rows = await database
      .update(sessoes)
      .set({ revogadaEm: agora() })
      .where(and(eq(sessoes.id, id), eq(sessoes.usuarioId, usuarioId), isNull(sessoes.revogadaEm)))
      .returning({ id: sessoes.id });
    return rows.length > 0;
  }

  /** Revoga todas as sessões do usuário, exceto `exceto` (a atual), se informada. */
  static async revogarTodas(usuarioId, exceto, client) {
    const database = client || getDb();
    const filtro = exceto
      ? and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.revogadaEm), ne(sessoes.id, exceto))
      : and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.revogadaEm));
    const rows = await database.update(sessoes).set({ revogadaEm: agora() }).where(filtro).returning({ id: sessoes.id });
    return rows.length;
  }
}

module.exports = SessaoDAO;
