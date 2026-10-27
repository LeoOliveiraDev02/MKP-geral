/**
 * @file AvaliacaoDAO.js (Drizzle)
 * @description Avaliações de produtos (nota 1–5, comentário, fotos e resposta
 * do vendedor). Leitura pública; escrita pelo autor (RLS).
 */

const { eq, and, desc, inArray, sql } = require('drizzle-orm');
const { getDb } = require('../db');
const { avaliacoes, avaliacaoFotos, usuarios, anuncios } = require('../db/schema');

class AvaliacaoDAO {
  static async create({ pedidoId, anuncioId, autorId, vendedorId, nota, comentario }, client) {
    const database = client || getDb();
    const [row] = await database
      .insert(avaliacoes)
      .values({ pedidoId, anuncioId, autorId, vendedorId, nota, comentario: comentario || null })
      .returning({ id: avaliacoes.id });
    return row.id;
  }

  static async addFoto(avaliacaoId, url, client) {
    const database = client || getDb();
    await database.insert(avaliacaoFotos).values({ avaliacaoId, url });
  }

  static async findById(id, client) {
    const database = client || getDb();
    const [row] = await database.select().from(avaliacoes).where(eq(avaliacoes.id, Number(id))).limit(1);
    return row || null;
  }

  static async responder(id, resposta, client) {
    const database = client || getDb();
    await database.update(avaliacoes).set({ respostaVendedor: resposta }).where(eq(avaliacoes.id, Number(id)));
  }

  static async jaAvaliou(pedidoId, anuncioId, client) {
    const database = client || getDb();
    const [row] = await database
      .select({ id: avaliacoes.id })
      .from(avaliacoes)
      .where(and(eq(avaliacoes.pedidoId, Number(pedidoId)), eq(avaliacoes.anuncioId, Number(anuncioId))))
      .limit(1);
    return !!row;
  }

  /** Lista com nome do autor (só o primeiro nome) e fotos. */
  static async list({ anuncioId, vendedorId, limit = 50 }, client) {
    const database = client || getDb();
    const where = anuncioId ? eq(avaliacoes.anuncioId, Number(anuncioId)) : eq(avaliacoes.vendedorId, Number(vendedorId));
    const rows = await database
      .select({
        id: avaliacoes.id,
        anuncio_id: avaliacoes.anuncioId,
        anuncio_nome: anuncios.nome,
        nota: avaliacoes.nota,
        comentario: avaliacoes.comentario,
        resposta_vendedor: avaliacoes.respostaVendedor,
        data: avaliacoes.data,
        autor_nome: usuarios.nome,
      })
      .from(avaliacoes)
      .innerJoin(usuarios, eq(usuarios.id, avaliacoes.autorId))
      .innerJoin(anuncios, eq(anuncios.id, avaliacoes.anuncioId))
      .where(where)
      .orderBy(desc(avaliacoes.id))
      .limit(limit);
    const ids = rows.map((r) => r.id);
    const fotos = ids.length
      ? await database.select().from(avaliacaoFotos).where(inArray(avaliacaoFotos.avaliacaoId, ids))
      : [];
    const porAvaliacao = new Map();
    for (const f of fotos) {
      if (!porAvaliacao.has(f.avaliacaoId)) porAvaliacao.set(f.avaliacaoId, []);
      porAvaliacao.get(f.avaliacaoId).push(f.url);
    }
    return rows.map((r) => ({ ...r, fotos: porAvaliacao.get(r.id) || [] }));
  }

  /** Média, total e distribuição das notas (1..5). */
  static async resumo({ anuncioId, vendedorId }, client) {
    const database = client || getDb();
    const where = anuncioId ? eq(avaliacoes.anuncioId, Number(anuncioId)) : eq(avaliacoes.vendedorId, Number(vendedorId));
    const rows = await database
      .select({ nota: avaliacoes.nota, total: sql`count(*)`.mapWith(Number) })
      .from(avaliacoes)
      .where(where)
      .groupBy(avaliacoes.nota);
    const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let soma = 0;
    let total = 0;
    for (const r of rows) {
      distribuicao[r.nota] = r.total;
      soma += r.nota * r.total;
      total += r.total;
    }
    return { media: total ? Math.round((soma / total) * 10) / 10 : null, total, distribuicao };
  }
}

module.exports = AvaliacaoDAO;
