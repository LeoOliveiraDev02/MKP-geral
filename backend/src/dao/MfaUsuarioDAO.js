/**
 * @file MfaUsuarioDAO.js (Drizzle)
 * @description DAO da verificação em duas etapas (tabela interna `MfaUsuario`,
 * RLS só-sistema). Guarda o segredo TOTP já cifrado — a cifra é do service.
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { mfaUsuarios } = require('../db/schema');

function toLegacy(row) {
  if (!row) return null;
  return {
    usuario_id: row.usuarioId,
    segredo_cifrado: row.segredoCifrado,
    ativo: row.ativo,
    ultimo_passo: row.ultimoPasso,
    criado_em: row.criadoEm,
  };
}

class MfaUsuarioDAO {
  static async findByUsuarioId(usuarioId, client) {
    const database = client || getDb();
    const [row] = await database.select().from(mfaUsuarios).where(eq(mfaUsuarios.usuarioId, usuarioId)).limit(1);
    return toLegacy(row);
  }

  /** Cria ou substitui o segredo pendente (ainda inativo). */
  static async salvarPendente({ usuarioId, segredoCifrado }, client) {
    const database = client || getDb();
    await database
      .insert(mfaUsuarios)
      .values({ usuarioId, segredoCifrado, ativo: false, ultimoPasso: 0 })
      .onConflictDoUpdate({ target: mfaUsuarios.usuarioId, set: { segredoCifrado, ativo: false, ultimoPasso: 0 } });
  }

  static async ativar(usuarioId, client) {
    const database = client || getDb();
    await database.update(mfaUsuarios).set({ ativo: true }).where(eq(mfaUsuarios.usuarioId, usuarioId));
  }

  /** Registra o passo TOTP usado (o mesmo código não vale duas vezes). */
  static async registrarPasso(usuarioId, passo, client) {
    const database = client || getDb();
    await database.update(mfaUsuarios).set({ ultimoPasso: passo }).where(eq(mfaUsuarios.usuarioId, usuarioId));
  }

  static async delete(usuarioId, client) {
    const database = client || getDb();
    await database.delete(mfaUsuarios).where(eq(mfaUsuarios.usuarioId, usuarioId));
  }
}

module.exports = MfaUsuarioDAO;
