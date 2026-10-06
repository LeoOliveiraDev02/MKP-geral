/**
 * @file CategoriaDAO.js (Drizzle)
 * @description DAO de categorias: persistência da tabela `Categoria` via Drizzle ORM.
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { categorias } = require('../db/schema');

class CategoriaDAO {
  static async findAll(client) {
    const database = client || getDb();
    return database.select().from(categorias).orderBy(categorias.nome);
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(categorias).where(eq(categorias.id, id)).limit(1);
    return row;
  }
}

module.exports = CategoriaDAO;
