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
 *
 * Venda: `preco_efetivo` é o preço promocional quando a oferta está vigente
 * (`promocao_ate` em 'YYYY-MM-DD', inclusive, ou sem data de fim).
 */

const { eq, and, or, ilike, desc, asc, sql, count, lt, gte, lte, inArray, ne, isNotNull } = require('drizzle-orm');
const { getDb } = require('../db');
const {
  anuncios, usuarios, categorias, enderecos, imagens, precosAtacado, certificacoes,
} = require('../db/schema');

const HOJE = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD')`;

/** Oferta vigente: preço promocional definido e dentro da validade. */
const EM_OFERTA = sql`(${anuncios.precoPromocional} IS NOT NULL
  AND (${anuncios.promocaoAte} IS NULL OR ${anuncios.promocaoAte} >= ${HOJE}))`;

const PRECO_EFETIVO = sql`CASE WHEN ${EM_OFERTA} THEN ${anuncios.precoPromocional} ELSE ${anuncios.preco} END`;

/** Distância em km (haversine) até (lat, lng). */
function distanciaKm(lat, lng) {
  return sql`6371 * 2 * asin(sqrt(
    power(sin(radians(${enderecos.latitude} - ${lat}) / 2), 2)
    + cos(radians(${lat})) * cos(radians(${enderecos.latitude}))
    * power(sin(radians(${enderecos.longitude} - ${lng}) / 2), 2)))`;
}

// Nota média e total de avaliações do anúncio (subconsultas correlacionadas).
const NOTA_MEDIA = sql`(SELECT round(avg(v.nota)::numeric, 1)::float FROM "Avaliacao" v WHERE v.anuncio_id = ${anuncios.id})`;
const TOTAL_AVALIACOES = sql`(SELECT count(*)::int FROM "Avaliacao" v WHERE v.anuncio_id = ${anuncios.id})`;
const VENDEDOR_VERIFICADO = sql`app.usuario_verificado(${anuncios.anuncianteId})`;

function toImagemLegada(row) {
  return {
    id: row.id,
    url: row.url,
    tipo: row.tipo,
    ordem: row.ordem,
  };
}

/** Campos de venda comuns a lista e detalhe. */
const CAMPOS_VENDA = {
  unidade: anuncios.unidade,
  estoque: anuncios.estoque,
  peso_kg: anuncios.pesoKg,
  preco_promocional: anuncios.precoPromocional,
  promocao_ate: anuncios.promocaoAte,
  em_oferta: sql`${EM_OFERTA}`.mapWith(Boolean),
  preco_efetivo: sql`${PRECO_EFETIVO}`.mapWith(Number),
  permite_entrega: anuncios.permiteEntrega,
  permite_retirada: anuncios.permiteRetirada,
  nota_media: sql`${NOTA_MEDIA}`,
  total_avaliacoes: sql`${TOTAL_AVALIACOES}`.mapWith(Number),
  vendedor_verificado: sql`${VENDEDOR_VERIFICADO}`.mapWith(Boolean),
};

const ORDENACOES = {
  recentes: () => [desc(anuncios.dataPublicacao), desc(anuncios.id)],
  menor_preco: () => [asc(PRECO_EFETIVO), desc(anuncios.id)],
  maior_preco: () => [desc(PRECO_EFETIVO), desc(anuncios.id)],
  mais_avaliados: () => [sql`${NOTA_MEDIA} DESC NULLS LAST`, desc(anuncios.id)],
};

class AnuncioDAO {
  static async create(
    {
      anuncianteId, categoriaId, enderecoId, nome, descricao, preco,
      unidade, estoque, pesoKg, precoPromocional, promocaoAte, permiteEntrega, permiteRetirada,
    },
    client
  ) {
    const database = client || getDb();
    const [row] = await database
      .insert(anuncios)
      .values({
        anuncianteId, categoriaId, enderecoId, nome, descricao, preco,
        unidade: unidade || 'un',
        estoque: estoque ?? null,
        pesoKg: pesoKg ?? null,
        precoPromocional: precoPromocional ?? null,
        promocaoAte: promocaoAte ?? null,
        permiteEntrega: permiteEntrega ?? true,
        permiteRetirada: permiteRetirada ?? true,
      })
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
        vendedor_foto: usuarios.fotoUrl,
        vendedor_desde: usuarios.dataCadastro,
        categoria_nome: categorias.nome,
        rua: enderecos.rua,
        numero: enderecos.numero,
        bairro: enderecos.bairro,
        cep: enderecos.cep,
        cidade: enderecos.cidade,
        uf: enderecos.uf,
        zona: enderecos.zona,
        latitude: enderecos.latitude,
        longitude: enderecos.longitude,
        ...CAMPOS_VENDA,
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

    const atacado = await database
      .select({ quantidade_minima: precosAtacado.quantidadeMinima, preco: precosAtacado.preco })
      .from(precosAtacado)
      .where(eq(precosAtacado.anuncioId, numericId))
      .orderBy(asc(precosAtacado.quantidadeMinima));

    const certs = await database
      .select({ tipo: certificacoes.tipo, numero: certificacoes.numero })
      .from(certificacoes)
      .where(eq(certificacoes.anuncioId, numericId));

    return { ...ad, imagens: imageRows.map(toImagemLegada), atacado, certificacoes: certs };
  }

  /**
   * Vitrine/painel paginados. Filtros opcionais: categoria, busca, anunciante,
   * faixa de preço (efetivo), UF, cidade, zona, só ofertas, raio em km a
   * partir de (lat, lng) e exclusão de ids. Ordenação por `sort`
   * (recentes | menor_preco | maior_preco | mais_avaliados | proximos).
   */
  static async findAll(
    {
      page = 1, limit = 10, categoryId, search, anuncianteId, status = 'ATIVO',
      precoMin, precoMax, uf, cidade, zona, ofertas, lat, lng, raioKm, sort, excluirIds,
    } = {},
    client
  ) {
    const database = client || getDb();
    const offset = (page - 1) * limit;
    const temPosicao = Number.isFinite(lat) && Number.isFinite(lng);
    const distancia = temPosicao ? distanciaKm(lat, lng) : null;

    const conditions = [eq(anuncios.status, status)];
    if (categoryId) conditions.push(eq(anuncios.categoriaId, Number(categoryId)));
    if (anuncianteId) conditions.push(eq(anuncios.anuncianteId, Number(anuncianteId)));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(anuncios.nome, pattern),
          ilike(anuncios.descricao, pattern),
          ilike(categorias.nome, pattern),
          ilike(sql`${usuarios.nome} || ' ' || ${usuarios.sobrenome}`, pattern)
        )
      );
    }
    if (Number.isFinite(precoMin)) conditions.push(gte(PRECO_EFETIVO, precoMin));
    if (Number.isFinite(precoMax)) conditions.push(lte(PRECO_EFETIVO, precoMax));
    if (uf) conditions.push(eq(enderecos.uf, uf.toUpperCase()));
    if (cidade) conditions.push(ilike(enderecos.cidade, cidade));
    if (zona) conditions.push(eq(enderecos.zona, zona.toUpperCase()));
    if (ofertas) conditions.push(EM_OFERTA);
    if (excluirIds && excluirIds.length) {
      for (const excluido of excluirIds) conditions.push(ne(anuncios.id, excluido));
    }
    if (temPosicao && Number.isFinite(raioKm)) {
      conditions.push(isNotNull(enderecos.latitude), lte(distancia, raioKm));
    }
    const whereClause = and(...conditions);

    const [{ value: total }] = await database
      .select({ value: count() })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .where(whereClause);

    let orderBy = (ORDENACOES[sort] || ORDENACOES.recentes)();
    if (sort === 'proximos' && temPosicao) {
      orderBy = [sql`${distancia} ASC NULLS LAST`, desc(anuncios.id)];
    }

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
        latitude: enderecos.latitude,
        longitude: enderecos.longitude,
        distancia_km: temPosicao ? sql`round(${distancia}::numeric, 1)::float` : sql`NULL::float`,
        ...CAMPOS_VENDA,
      })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .where(whereClause)
      // id como desempate do timestamp de 1s (ordem estável na paginação)
      .orderBy(...orderBy)
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

  /** Busca por ids (mantém a ordem pedida); usada por recomendações. */
  static async findManyByIds(ids, client) {
    if (!ids.length) return [];
    const database = client || getDb();
    const rows = await database
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
        latitude: enderecos.latitude,
        longitude: enderecos.longitude,
        ...CAMPOS_VENDA,
        imagem_principal: imagens.url,
      })
      .from(anuncios)
      .innerJoin(usuarios, eq(anuncios.anuncianteId, usuarios.id))
      .innerJoin(categorias, eq(anuncios.categoriaId, categorias.id))
      .innerJoin(enderecos, eq(anuncios.enderecoId, enderecos.id))
      .leftJoin(imagens, and(eq(imagens.anuncioId, anuncios.id), eq(imagens.tipo, 'PRINCIPAL')))
      .where(and(inArray(anuncios.id, ids), eq(anuncios.status, 'ATIVO')));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /** Sugestões da busca: nomes de anúncios e categorias que contêm o termo. */
  static async suggest(term, limit = 8, client) {
    const database = client || getDb();
    const pattern = `%${term}%`;
    const produtos = await database
      .selectDistinct({ nome: anuncios.nome })
      .from(anuncios)
      .where(and(eq(anuncios.status, 'ATIVO'), ilike(anuncios.nome, pattern)))
      .orderBy(asc(anuncios.nome))
      .limit(limit);
    const cats = await database
      .select({ id: categorias.id, nome: categorias.nome })
      .from(categorias)
      .where(ilike(categorias.nome, pattern))
      .limit(3);
    return { produtos: produtos.map((p) => p.nome), categorias: cats };
  }

  static async update(
    id,
    {
      categoriaId, enderecoId, nome, descricao, preco,
      unidade, estoque, pesoKg, precoPromocional, promocaoAte, permiteEntrega, permiteRetirada,
    },
    client
  ) {
    const database = client || getDb();
    const campos = { categoriaId, enderecoId, nome, descricao, preco };
    // Campos de venda só mudam quando enviados (edição antiga continua válida)
    if (unidade !== undefined) campos.unidade = unidade;
    if (estoque !== undefined) campos.estoque = estoque;
    if (pesoKg !== undefined) campos.pesoKg = pesoKg;
    if (precoPromocional !== undefined) campos.precoPromocional = precoPromocional;
    if (promocaoAte !== undefined) campos.promocaoAte = promocaoAte;
    if (permiteEntrega !== undefined) campos.permiteEntrega = permiteEntrega;
    if (permiteRetirada !== undefined) campos.permiteRetirada = permiteRetirada;
    await database.update(anuncios).set(campos).where(eq(anuncios.id, Number(id)));
    return true;
  }

  /** Substitui as faixas de atacado do anúncio. */
  static async replaceAtacado(anuncioId, faixas, client) {
    const database = client || getDb();
    await database.delete(precosAtacado).where(eq(precosAtacado.anuncioId, Number(anuncioId)));
    if (faixas.length) {
      await database.insert(precosAtacado).values(
        faixas.map((f) => ({ anuncioId: Number(anuncioId), quantidadeMinima: f.quantidadeMinima, preco: f.preco }))
      );
    }
  }

  /** Substitui as certificações declaradas do anúncio. */
  static async replaceCertificacoes(anuncioId, certs, client) {
    const database = client || getDb();
    await database.delete(certificacoes).where(eq(certificacoes.anuncioId, Number(anuncioId)));
    if (certs.length) {
      await database.insert(certificacoes).values(
        certs.map((c) => ({ anuncioId: Number(anuncioId), tipo: c.tipo, numero: c.numero || null }))
      );
    }
  }

  /** ATIVO ↔ PAUSADO (pausar some da vitrine sem ir para a lixeira). */
  static async setStatus(id, status, client) {
    const database = client || getDb();
    await database.update(anuncios).set({ status }).where(eq(anuncios.id, Number(id)));
    return true;
  }

  /**
   * Baixa de estoque atômica no checkout: só decrementa se houver saldo.
   * Anúncio sem controle de estoque (NULL) sempre aceita.
   * @returns {Promise<boolean>} false quando o saldo é insuficiente
   */
  static async baixarEstoque(id, quantidade, client) {
    const database = client || getDb();
    const rows = await database
      .update(anuncios)
      .set({ estoque: sql`CASE WHEN ${anuncios.estoque} IS NULL THEN NULL ELSE ${anuncios.estoque} - ${quantidade} END` })
      .where(and(
        eq(anuncios.id, Number(id)),
        or(sql`${anuncios.estoque} IS NULL`, gte(anuncios.estoque, quantidade))
      ))
      .returning({ id: anuncios.id });
    return rows.length > 0;
  }

  /** Devolve estoque (pedido cancelado). */
  static async devolverEstoque(id, quantidade, client) {
    const database = client || getDb();
    await database
      .update(anuncios)
      .set({ estoque: sql`${anuncios.estoque} + ${quantidade}` })
      .where(and(eq(anuncios.id, Number(id)), isNotNull(anuncios.estoque)));
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
