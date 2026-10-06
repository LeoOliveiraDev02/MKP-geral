/**
 * @file ImagemDAO.js (Drizzle)
 * @description DAO de imagens: persistência da tabela `Imagem` via Drizzle ORM.
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 * Retornos em snake_case legado (`anuncio_id`, ...). Métodos assíncronos com `tx` opcional.
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { imagens } = require('../db/schema');

function toLegacy(row) {
  if (!row) return row;
  return {
    id: row.id,
    anuncio_id: row.anuncioId,
    url: row.url,
    tipo: row.tipo,
    ordem: row.ordem,
  };
}

class ImagemDAO {
  static async create({ anuncioId, url, tipo, ordem }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(imagens)
      .values({ anuncioId: Number(anuncioId), url, tipo, ordem })
      .returning({ id: imagens.id });
    return row.id;
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(imagens).where(eq(imagens.id, id)).limit(1);
    return row ? toLegacy(row) : row;
  }

  static async delete(id, client) {
    const database = client || getDb();
    await database.delete(imagens).where(eq(imagens.id, id));
    return true;
  }
}

module.exports = ImagemDAO;
