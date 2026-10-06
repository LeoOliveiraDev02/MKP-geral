/**
 * @file TokenRevogadoDAO.js (Drizzle)
 * @description Denylist de JWTs (UC13 logout). Guarda o hash do token até a
 * expiração original; purge amortizado nas escritas.
 */

const { eq, lt } = require('drizzle-orm');
const { getDb } = require('../db');
const { tokensRevogados } = require('../db/schema');

class TokenRevogadoDAO {
  static async existePorHash(tokenHash, client) {
    const database = client || getDb();
    const [row] = await database
      .select({ id: tokensRevogados.id })
      .from(tokensRevogados)
      .where(eq(tokensRevogados.tokenHash, tokenHash))
      .limit(1);
    return !!row;
  }

  static async adicionar({ tokenHash, expiraEm }, client) {
    const database = client || getDb();
    await database
      .insert(tokensRevogados)
      .values({ tokenHash, expiraEm })
      .onConflictDoNothing({ target: tokensRevogados.tokenHash });
    // Amortizado: limpa expirados a cada revogação (sem write por request)
    await database
      .delete(tokensRevogados)
      .where(lt(tokensRevogados.expiraEm, new Date().toISOString()));
    return true;
  }
}

module.exports = TokenRevogadoDAO;
