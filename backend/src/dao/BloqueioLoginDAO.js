/**
 * @file BloqueioLoginDAO.js (Drizzle)
 * @description DAO do contador de falhas de login (RN19). Chave natural: e-mail.
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { tentativasLogin } = require('../db/schema');

function toLegacy(row) {
  if (!row) return row;
  return {
    email: row.email,
    tentativas: row.tentativas,
    bloqueado_ate: row.bloqueadoAte,
    atualizado_em: row.atualizadoEm,
  };
}

class BloqueioLoginDAO {
  static async findByEmail(email, client) {
    const database = client || getDb();
    const [row] = await database.select().from(tentativasLogin).where(eq(tentativasLogin.email, email))
      .limit(1);
    return row ? toLegacy(row) : row;
  }

  static async salvar({ email, tentativas, bloqueadoAte }, client) {
    const database = client || getDb();
    await database
      .insert(tentativasLogin)
      .values({ email, tentativas, bloqueadoAte: bloqueadoAte ?? null })
      .onConflictDoUpdate({
        target: tentativasLogin.email,
        set: {
          tentativas,
          bloqueadoAte: bloqueadoAte ?? null,
          atualizadoEm: new Date().toISOString(),
        },
      });
    return true;
  }

  static async deleteByEmail(email, client) {
    const database = client || getDb();
    await database.delete(tentativasLogin).where(eq(tentativasLogin.email, email));
    return true;
  }
}

module.exports = BloqueioLoginDAO;
