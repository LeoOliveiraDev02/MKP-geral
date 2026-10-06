/**
 * @file UsuarioDAO.js (Drizzle)
 * @description DAO de usuários: persistência da tabela `Usuario` via Drizzle ORM.
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 *
 * Compatibilidade:
 * - Assinaturas e formatos de retorno preservam o legado (snake_case:
 *   `senha_hash`, `data_cadastro`, ...).
 * - Métodos são assíncronos (node-postgres) e funcionam dentro de
 *   `await db.transaction(async (tx) => ...)`.
 * - Passe `tx` como último argumento para rodar dentro de uma transação:
 *   `UsuarioDAO.create(dados, tx)`.
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { usuarios } = require('../db/schema');

function toPublic(row) {
  if (!row) return row;
  return {
    id: row.id,
    nome: row.nome,
    sobrenome: row.sobrenome,
    email: row.email,
    telefone: row.telefone,
    data_cadastro: row.dataCadastro,
  };
}

function toFull(row) {
  if (!row) return row;
  return {
    ...toPublic(row),
    senha_hash: row.senhaHash,
  };
}

class UsuarioDAO {
  static async create({ nome, sobrenome, email, telefone, senhaHash }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(usuarios)
      .values({ nome, sobrenome, email, telefone, senhaHash })
      .returning({ id: usuarios.id });
    return row.id;
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        sobrenome: usuarios.sobrenome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        dataCadastro: usuarios.dataCadastro,
      })
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);
    return row ? toPublic(row) : row;
  }

  static async findByIdWithPassword(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(usuarios).where(eq(usuarios.id, id))
      .limit(1);
    return row ? toFull(row) : row;
  }

  static async findByEmail(email, client) {
    const database = client || getDb();
    const [row] = await database.select().from(usuarios).where(eq(usuarios.email, email))
      .limit(1);
    return row ? toFull(row) : row;
  }

  static async update(id, { nome, sobrenome, email, telefone }, client) {
    const database = client || getDb();
    await database
      .update(usuarios)
      .set({ nome, sobrenome, email, telefone })
      .where(eq(usuarios.id, id));
    return true;
  }

  static async updatePassword(id, senhaHash, client) {
    const database = client || getDb();
    await database.update(usuarios).set({ senhaHash }).where(eq(usuarios.id, id));
    return true;
  }

  /** RS03 LGPD: CASCADE remove endereços/anúncios/imagens/recuperações. */
  static async delete(id, client) {
    const database = client || getDb();
    await database.delete(usuarios).where(eq(usuarios.id, id));
    return true;
  }
}

module.exports = UsuarioDAO;
