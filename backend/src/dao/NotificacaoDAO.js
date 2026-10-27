/**
 * @file NotificacaoDAO.js (Drizzle)
 * @description Notificações do sininho. Inserção só em contexto de sistema
 * (o evento é de outro usuário); leitura e marcação pelo próprio dono (RLS).
 */

const { eq, and, desc, count } = require('drizzle-orm');
const { getDb } = require('../db');
const { notificacoes } = require('../db/schema');

function toLegacy(row) {
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    tipo: row.tipo,
    titulo: row.titulo,
    mensagem: row.mensagem,
    link: row.link,
    lida: row.lida,
    data: row.data,
  };
}

class NotificacaoDAO {
  static async create({ usuarioId, tipo, titulo, mensagem, link }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(notificacoes)
      .values({ usuarioId, tipo, titulo, mensagem: mensagem ?? null, link: link ?? null })
      .returning({ id: notificacoes.id });
    return row.id;
  }

  static async listByUsuario(usuarioId, limit = 30, client) {
    const database = client || getDb();
    const rows = await database
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.usuarioId, usuarioId))
      .orderBy(desc(notificacoes.id))
      .limit(limit);
    return rows.map(toLegacy);
  }

  static async countNaoLidas(usuarioId, client) {
    const database = client || getDb();
    const [{ value }] = await database
      .select({ value: count() })
      .from(notificacoes)
      .where(and(eq(notificacoes.usuarioId, usuarioId), eq(notificacoes.lida, false)));
    return value;
  }

  static async marcarLida(id, usuarioId, client) {
    const database = client || getDb();
    const rows = await database
      .update(notificacoes)
      .set({ lida: true })
      .where(and(eq(notificacoes.id, Number(id)), eq(notificacoes.usuarioId, usuarioId)))
      .returning({ id: notificacoes.id });
    return rows.length > 0;
  }

  static async marcarTodasLidas(usuarioId, client) {
    const database = client || getDb();
    await database
      .update(notificacoes)
      .set({ lida: true })
      .where(and(eq(notificacoes.usuarioId, usuarioId), eq(notificacoes.lida, false)));
  }
}

module.exports = NotificacaoDAO;
