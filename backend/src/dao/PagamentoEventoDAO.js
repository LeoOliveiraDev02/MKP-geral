/**
 * @file PagamentoEventoDAO.js (Drizzle)
 * @description DAO dos eventos recebidos do gateway de pagamento (tabela
 * interna `PagamentoEvento`, RLS só-sistema). A UNIQUE em `evento_id` garante
 * a idempotência do webhook.
 */

const { getDb } = require('../db');
const { pagamentoEventos } = require('../db/schema');

class PagamentoEventoDAO {
  /** @throws erro 23505 (PagamentoEvento_evento_id_unique) se o evento já foi registrado */
  static async create({ eventoId, tipo, pedidoId, valor, resultado }, client) {
    const database = client || getDb();
    await database.insert(pagamentoEventos).values({
      eventoId,
      tipo,
      pedidoId: pedidoId || null,
      valor: Number.isFinite(valor) ? valor : null,
      resultado,
    });
  }
}

module.exports = PagamentoEventoDAO;
