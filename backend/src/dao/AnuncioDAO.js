/**
 * @file AnuncioDAO.js (Drizzle)
 * @description DAO de anúncios: persistência da tabela `Anuncio` via Drizzle ORM
 * (joins + paginação + soft delete).
 * (Camada DAO — as regras de negócio vivem nas entidades de `src/domain`.)
 * Retornos preservam o formato legado (snake_case + `imagens` / `imagem_principal`).
 * Métodos assíncronos com `tx` opcional.
 *
 * Correção em relação ao SQL cru original: a contagem paginada com `search`
 * agora faz JOIN com Categoria (o SQL antigo referenciava `c.nome` no COUNT sem JOIN).
 */

const { eq, and, or, ilike, desc, asc, sql, count, lt, inArray } = require('drizzle-orm');
const { getDb } = require('../db');
const { anuncios, usuarios, categorias, enderecos, imagens } = require('../db/schema');

function toImagemLegada(row) {
  return {
    id: row.id,
    url: row.url,
    tipo: row.tipo,
    ordem: row.ordem,
  };
}

class AnuncioDAO {
  static async create({ anuncianteId, categoriaId, enderecoId, nome, descricao, preco }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(anuncios)
      .values({ anuncianteId, categoriaId, enderecoId, nome, descricao, preco })
      .returning({ id: anuncios.id });
    return row.id;
  }

  static async findById(id, includeInactive = false, client) {
    const database = client || getDb();
    const numericId = Number(id);

    const conditions = [eq(anuncios.id, numericId)];
    if (!includeInactive) conditions.push(eq(anuncios.status, 'ATIVO'));

    const [ad] = await database
      .select({
        id: anuncios.id,
        nome: anuncios.nome,
        descricao: anuncios.descricao,
        preco: anuncios.preco,
        data_publicacao: anuncios.dataPublicacao,
        status: anuncios.status,
        data_remocao: anuncios.dataRemocao,
        anunciante_id: anuncios.anuncianteId,
        categoria_id: anuncios.categoriaId,
        endereco_id: anuncios.enderecoId,
        vendedor_nome: usuarios.nome,
        vendedor_sobrenome: usuarios.sobrenome,
        vendedor_telefone: usuarios.telefone,
        categoria_nome: categorias.nome,
        rua: enderecos.rua,
        numero: enderecos.numero,
        bairro: enderecos.bairro,
        cep: enderecos.cep,
        cidade: enderecos.cidade,
        uf: enderecos.uf,
        zona: enderecos.zona,
      })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .where(and(...conditions))
      .limit(1);

    if (!ad) return null;

    const imageRows = await database
      .select()
      .from(imagens)
      .where(eq(imagens.anuncioId, numericId))
      // PRINCIPAL primeiro (corrige o `ORDER BY tipo DESC` legado, que na prática
      // retornava SECUNDARIA antes por ordem alfabética). Depois, ordem ascendente.
      .orderBy(sql`CASE WHEN ${imagens.tipo} = 'PRINCIPAL' THEN 0 ELSE 1 END`, asc(imagens.ordem));

    return { ...ad, imagens: imageRows.map(toImagemLegada) };
  }

  static async findAll(
    { page = 1, limit = 10, categoryId, search, anuncianteId, status = 'ATIVO' } = {},
    client
  ) {
    const database = client || getDb();
    const offset = (page - 1) * limit;

    const conditions = [eq(anuncios.status, status)];
    if (categoryId) conditions.push(eq(anuncios.categoriaId, Number(categoryId)));
    if (anuncianteId) conditions.push(eq(anuncios.anuncianteId, Number(anuncianteId)));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(anuncios.nome, pattern),
          ilike(anuncios.descricao, pattern),
          ilike(categorias.nome, pattern)
        )
      );
    }
    const whereClause = and(...conditions);

    const [{ value: total }] = await database
      .select({ value: count() })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .where(whereClause);

    const ads = await database
      .select({
        id: anuncios.id,
        nome: anuncios.nome,
        descricao: anuncios.descricao,
        preco: anuncios.preco,
        data_publicacao: anuncios.dataPublicacao,
        status: anuncios.status,
        anunciante_id: anuncios.anuncianteId,
        categoria_id: anuncios.categoriaId,
        endereco_id: anuncios.enderecoId,
        vendedor_nome: usuarios.nome,
        vendedor_sobrenome: usuarios.sobrenome,
        categoria_nome: categorias.nome,
        cidade: enderecos.cidade,
        uf: enderecos.uf,
        zona: enderecos.zona,
      })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .where(whereClause)
      // id como desempate do timestamp de 1s (ordem estável na paginação)
      .orderBy(desc(anuncios.dataPublicacao), desc(anuncios.id))
      .limit(limit)
      .offset(offset);

    const adIds = ads.map((a) => a.id);
    let principalByAd = new Map();
    if (adIds.length > 0) {
      const rows = await database
        .select()
        .from(imagens)
        .where(and(inArray(imagens.anuncioId, adIds), eq(imagens.tipo, 'PRINCIPAL')));
      principalByAd = new Map(rows.map((r) => [r.anuncioId, r.url]));
    }

    return {
      data: ads.map((ad) => ({
        ...ad,
        imagem_principal: principalByAd.get(ad.id) ?? null,
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async update(id, { categoriaId, enderecoId, nome, descricao, preco }, client) {
    const database = client || getDb();
    await database
      .update(anuncios)
      .set({ categoriaId, enderecoId, nome, descricao, preco })
      .where(eq(anuncios.id, Number(id)));
    return true;
  }

  /** RS09: soft delete → lixeira. */
  static async moveToLixeira(id, client) {
    const database = client || getDb();
    await database
      .update(anuncios)
      .set({ status: 'EM_LIXEIRA', dataRemocao: new Date().toISOString() })
      .where(eq(anuncios.id, Number(id)));
    return true;
  }

  static async restoreFromLixeira(id, client) {
    const database = client || getDb();
    await database
      .update(anuncios)
      .set({ status: 'ATIVO', dataRemocao: null })
      .where(eq(anuncios.id, Number(id)));
    return true;
  }

  /** RS09: hard delete de EM_LIXEIRA há +30 dias (CASCADE limpa imagens). */
  static async cleanupLixeira(client) {
    const database = client || getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const expired = await database
      .select({ id: anuncios.id })
      .from(anuncios)
      .where(and(eq(anuncios.status, 'EM_LIXEIRA'), lt(anuncios.dataRemocao, cutoff.toISOString())));

    if (expired.length === 0) return 0;

    const ids = expired.map((a) => a.id);
    await database.delete(anuncios).where(inArray(anuncios.id, ids));
    return ids.length;
  }
}

module.exports = AnuncioDAO;
