/**
 * @file EnderecoDAO.js (Drizzle)
 * @description DAO de endereços: persistência da tabela `Endereco` via Drizzle ORM.
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 * Retornos preservam o legado snake_case (`cliente_id`, ...).
 * Métodos assíncronos — aceitam `tx` opcional para transações.
 */

const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { enderecos } = require('../db/schema');

function toLegacy(row) {
  if (!row) return row;
  return {
    id: row.id,
    cliente_id: row.clienteId,
    rua: row.rua,
    numero: row.numero,
    bairro: row.bairro,
    cep: row.cep,
    cidade: row.cidade,
    uf: row.uf,
    zona: row.zona,
  };
}

class EnderecoDAO {
  static async create({ clienteId, rua, numero, bairro, cep, cidade, uf, zona }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(enderecos)
      .values({
        clienteId,
        rua,
        numero,
        bairro,
        cep: cep ?? null,
        cidade,
        uf,
        zona: zona.toUpperCase(),
      })
      .returning({ id: enderecos.id });
    return row.id;
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(enderecos).where(eq(enderecos.id, id))
      .limit(1);
    return row ? toLegacy(row) : row;
  }

  static async findByClienteId(clienteId, client) {
    const database = client || getDb();
    const rows = await database
      .select()
      .from(enderecos)
      .where(eq(enderecos.clienteId, clienteId));
    return rows.map(toLegacy);
  }

  static async update(id, { rua, numero, bairro, cep, cidade, uf, zona }, client) {
    const database = client || getDb();
    await database
      .update(enderecos)
      .set({ rua, numero, bairro, cep: cep ?? null, cidade, uf, zona: zona.toUpperCase() })
      .where(eq(enderecos.id, id));
    return true;
  }

  static async delete(id, client) {
    const database = client || getDb();
    await database.delete(enderecos).where(eq(enderecos.id, id));
    return true;
  }
}

module.exports = EnderecoDAO;
