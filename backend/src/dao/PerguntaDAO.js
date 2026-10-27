/**
 * @file PerguntaDAO.js (Drizzle)
 * @description Perguntas públicas nos anúncios e respostas do vendedor.
 */

const { eq, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { perguntas, usuarios } = require('../db/schema');

class PerguntaDAO {
  static async create({ anuncioId, autorId, texto }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(perguntas)
      .values({ anuncioId: Number(anuncioId), autorId, texto })
      .returning({ id: perguntas.id });
    return row.id;
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(perguntas).where(eq(perguntas.id, Number(id))).limit(1);
    return row || null;
  }

  static async responder(id, resposta, client) {
    const database = client || getDb();
    await database
      .update(perguntas)
      .set({ resposta, dataResposta: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      .where(eq(perguntas.id, Number(id)));
  }

  static async delete(id, client) {
    const database = client || getDb();
    await database.delete(perguntas).where(eq(perguntas.id, Number(id)));
  }

  static async listByAnuncio(anuncioId, client) {
    const database = client || getDb();
    return database
      .select({
        id: perguntas.id,
        autor_id: perguntas.autorId,
        autor_nome: usuarios.nome,
        texto: perguntas.texto,
        resposta: perguntas.resposta,
        data_pergunta: perguntas.dataPergunta,
        data_resposta: perguntas.dataResposta,
      })
      .from(perguntas)
      .innerJoin(usuarios, eq(usuarios.id, perguntas.autorId))
      .where(eq(perguntas.anuncioId, Number(anuncioId)))
      .orderBy(desc(perguntas.id));
  }
}

module.exports = PerguntaDAO;
