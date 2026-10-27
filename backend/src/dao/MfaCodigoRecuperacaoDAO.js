/**
 * @file MfaCodigoRecuperacaoDAO.js (Drizzle)
 * @description Códigos de recuperação do MFA (tabela interna, RLS só-sistema).
 * Só o hash é gravado; cada código vale uma vez.
 */

const { eq, and, isNull } = require('drizzle-orm');
const { getDb } = require('../db');
const { mfaCodigosRecuperacao } = require('../db/schema');

const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

class MfaCodigoRecuperacaoDAO {
  /** Substitui todos os códigos do usuário pelos novos hashes. */
  static async substituir(usuarioId, hashes, client) {
    const database = client || getDb();
    await database.transaction(async (tx) => {
      await tx.delete(mfaCodigosRecuperacao).where(eq(mfaCodigosRecuperacao.usuarioId, usuarioId));
      if (hashes.length) {
        await tx.insert(mfaCodigosRecuperacao).values(hashes.map((codigoHash) => ({ usuarioId, codigoHash })));
      }
    });
  }

  /** Marca como usado de forma atômica; true só se o código existia e estava livre. */
  static async consumir(usuarioId, codigoHash, client) {
    const database = client || getDb();
    const rows = await database
      .update(mfaCodigosRecuperacao)
      .set({ usadoEm: agora() })
      .where(
        and(
          eq(mfaCodigosRecuperacao.usuarioId, usuarioId),
          eq(mfaCodigosRecuperacao.codigoHash, codigoHash),
          isNull(mfaCodigosRecuperacao.usadoEm)
        )
      )
      .returning({ id: mfaCodigosRecuperacao.id });
    return rows.length > 0;
  }

  static async contarDisponiveis(usuarioId, client) {
    const database = client || getDb();
    const rows = await database
      .select({ id: mfaCodigosRecuperacao.id })
      .from(mfaCodigosRecuperacao)
      .where(and(eq(mfaCodigosRecuperacao.usuarioId, usuarioId), isNull(mfaCodigosRecuperacao.usadoEm)));
    return rows.length;
  }

  static async apagar(usuarioId, client) {
    const database = client || getDb();
    await database.delete(mfaCodigosRecuperacao).where(eq(mfaCodigosRecuperacao.usuarioId, usuarioId));
  }
}

module.exports = MfaCodigoRecuperacaoDAO;
