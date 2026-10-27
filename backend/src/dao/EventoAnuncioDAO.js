/**
 * @file EventoAnuncioDAO.js (Drizzle)
 * @description Visualizações e cliques no WhatsApp por anúncio. Alimenta as
 * estatísticas do painel do vendedor e as recomendações "quem viu também viu".
 */

const { eq, and, desc, sql, ne, inArray } = require('drizzle-orm');
const { getDb } = require('../db');
const { eventosAnuncio, anuncios } = require('../db/schema');

class EventoAnuncioDAO {
  static async create({ anuncioId, tipo, usuarioId, sessao }, client) {
    const database = client || getDb();
    await database.insert(eventosAnuncio).values({
      anuncioId: Number(anuncioId),
      tipo,
      usuarioId: usuarioId ?? null,
      sessao: sessao ?? null,
    });
  }

  /**
   * Totais por anúncio do vendedor: visualizações e cliques (geral e nos
   * últimos `dias`). RLS: só o dono do anúncio enxerga os eventos.
   */
  static async statsByAnunciante(anuncianteId, dias = 30, client) {
    const database = client || getDb();
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const rows = await database
      .select({
        anuncio_id: anuncios.id,
        nome: anuncios.nome,
        status: anuncios.status,
        visualizacoes: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'VISUALIZACAO')`.mapWith(Number),
        cliques_whatsapp: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'CLIQUE_WHATSAPP')`.mapWith(Number),
        visualizacoes_periodo: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'VISUALIZACAO' AND ${eventosAnuncio.data} >= ${desde})`.mapWith(Number),
        cliques_periodo: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'CLIQUE_WHATSAPP' AND ${eventosAnuncio.data} >= ${desde})`.mapWith(Number),
      })
      .from(anuncios)
      .leftJoin(eventosAnuncio, eq(eventosAnuncio.anuncioId, anuncios.id))
      .where(and(eq(anuncios.anuncianteId, anuncianteId), ne(anuncios.status, 'REMOVIDO')))
      .groupBy(anuncios.id, anuncios.nome, anuncios.status)
      .orderBy(desc(sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'VISUALIZACAO')`));
    return rows;
  }

  /** Série diária de visualizações/cliques do vendedor (gráfico do painel). */
  static async seriePorDia(anuncianteId, dias = 30, client) {
    const database = client || getDb();
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    return database
      .select({
        dia: sql`substr(${eventosAnuncio.data}, 1, 10)`,
        visualizacoes: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'VISUALIZACAO')`.mapWith(Number),
        cliques_whatsapp: sql`count(*) FILTER (WHERE ${eventosAnuncio.tipo} = 'CLIQUE_WHATSAPP')`.mapWith(Number),
      })
      .from(eventosAnuncio)
      .innerJoin(anuncios, eq(eventosAnuncio.anuncioId, anuncios.id))
      .where(and(eq(anuncios.anuncianteId, anuncianteId), sql`${eventosAnuncio.data} >= ${desde}`))
      .groupBy(sql`substr(${eventosAnuncio.data}, 1, 10)`)
      .orderBy(sql`substr(${eventosAnuncio.data}, 1, 10)`);
  }

  /**
   * "Quem viu também viu": anúncios vistos pelas mesmas sessões que viram
   * `anuncioId`, do mais frequente ao menos. Deve rodar como sistema.
   */
  static async coVisualizados(anuncioId, limit = 8, client) {
    const database = client || getDb();
    const sessoes = database
      .selectDistinct({ sessao: eventosAnuncio.sessao })
      .from(eventosAnuncio)
      .where(and(
        eq(eventosAnuncio.anuncioId, Number(anuncioId)),
        eq(eventosAnuncio.tipo, 'VISUALIZACAO'),
        sql`${eventosAnuncio.sessao} IS NOT NULL`
      ));
    const rows = await database
      .select({
        anuncio_id: eventosAnuncio.anuncioId,
        vezes: sql`count(DISTINCT ${eventosAnuncio.sessao})`.mapWith(Number),
      })
      .from(eventosAnuncio)
      .innerJoin(anuncios, eq(anuncios.id, eventosAnuncio.anuncioId))
      .where(and(
        inArray(eventosAnuncio.sessao, sessoes),
        ne(eventosAnuncio.anuncioId, Number(anuncioId)),
        eq(eventosAnuncio.tipo, 'VISUALIZACAO'),
        eq(anuncios.status, 'ATIVO')
      ))
      .groupBy(eventosAnuncio.anuncioId)
      .orderBy(desc(sql`count(DISTINCT ${eventosAnuncio.sessao})`))
      .limit(limit);
    return rows;
  }
}

module.exports = EventoAnuncioDAO;
