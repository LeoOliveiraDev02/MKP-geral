/**
 * @file RecuperacaoSenhaDAO.js (Drizzle)
 * @description DAO da tabela `RecuperacaoSenha` via Drizzle ORM.
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 * Retornos em snake_case legado.
 */

const { eq, and, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { recuperacaoSenhas } = require('../db/schema');

function toLegacy(row) {
  if (!row) return row;
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    codigo: row.codigo,
    expira_em: row.expiraEm,
    usado: row.usado,
  };
}

class RecuperacaoSenhaDAO {
  static async invalidateActiveByUsuarioId(usuarioId, client) {
    const database = client || getDb();
    await database
      .update(recuperacaoSenhas)
      .set({ usado: 1 })
      .where(and(eq(recuperacaoSenhas.usuarioId, usuarioId), eq(recuperacaoSenhas.usado, 0)));
    return true;
  }

  static async create({ usuarioId, codigo, expiraEm }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(recuperacaoSenhas)
      .values({ usuarioId, codigo, expiraEm, usado: 0 })
      .returning({ id: recuperacaoSenhas.id });
    return row.id;
  }

  static async findActiveByUsuarioAndCodigo(usuarioId, codigo, client) {
    const database = client || getDb();
    const [row] = await database
      .select()
      .from(recuperacaoSenhas)
      .where(
        and(
          eq(recuperacaoSenhas.usuarioId, usuarioId),
          eq(recuperacaoSenhas.codigo, codigo),
          eq(recuperacaoSenhas.usado, 0)
        )
      )
      .orderBy(desc(recuperacaoSenhas.id))
      .limit(1);
    return row ? toLegacy(row) : row;
  }

  static async markAsUsed(id, client) {
    const database = client || getDb();
    await database.update(recuperacaoSenhas).set({ usado: 1 }).where(eq(recuperacaoSenhas.id, id));
    return true;
  }
}

module.exports = RecuperacaoSenhaDAO;
