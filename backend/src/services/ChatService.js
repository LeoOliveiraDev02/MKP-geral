/**
 * @file ChatService.js
 * @description Chat interno comprador ↔ produtor. Uma conversa por par
 * (comprador, produtor, anúncio). O front consulta novas mensagens por
 * polling (`depoisDe` = último id recebido). RLS: só os dois participantes.
 */

const { eq, and, or, desc, asc, gt, ne, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getDb } = require('../db');
const { conversas, mensagens, usuarios, anuncios, imagens } = require('../db/schema');
const AnuncioDAO = require('../dao/AnuncioDAO');
const NotificacaoService = require('./NotificacaoService');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const comprador = alias(usuarios, 'comprador');
const vendedor = alias(usuarios, 'vendedor');

function lerTexto(texto) {
  const t = String(texto || '').trim();
  if (!t) throw new BadRequestError('Escreva a mensagem.');
  if (t.length > 2000) throw new BadRequestError('A mensagem pode ter até 2000 caracteres.');
  return t;
}

const AGORA = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`;

class ChatService {
  /** Abre (ou reaproveita) a conversa sobre um anúncio e envia a 1ª mensagem. */
  static async iniciar({ usuarioId, anuncioId, texto }) {
    const conteudo = lerTexto(texto);
    const ad = await AnuncioDAO.findById(anuncioId);
    if (!ad) throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    if (ad.anunciante_id === usuarioId) throw new BadRequestError('Você não pode iniciar uma conversa com você mesmo.');

    const db = getDb();
    let [conversa] = await db
      .select()
      .from(conversas)
      .where(and(eq(conversas.compradorId, usuarioId), eq(conversas.vendedorId, ad.anunciante_id), eq(conversas.anuncioId, ad.id)))
      .limit(1);
    if (!conversa) {
      [conversa] = await db
        .insert(conversas)
        .values({ compradorId: usuarioId, vendedorId: ad.anunciante_id, anuncioId: ad.id })
        .returning();
    }
    await ChatService.enviar({ usuarioId, conversaId: conversa.id, texto: conteudo });
    return { conversa_id: conversa.id };
  }

  static async carregar(conversaId, usuarioId) {
    const [conversa] = await getDb().select().from(conversas).where(eq(conversas.id, Number(conversaId))).limit(1);
    // RLS já esconde conversas alheias: inexistente e alheia viram 404
    if (!conversa) throw new NotFoundError('Conversa não encontrada.');
    if (conversa.compradorId !== usuarioId && conversa.vendedorId !== usuarioId) {
      throw new ForbiddenError('Você não participa desta conversa.');
    }
    return conversa;
  }

  static async enviar({ usuarioId, conversaId, texto }) {
    const conteudo = lerTexto(texto);
    const conversa = await ChatService.carregar(conversaId, usuarioId);
    const db = getDb();
    const [msg] = await db
      .insert(mensagens)
      .values({ conversaId: conversa.id, autorId: usuarioId, texto: conteudo })
      .returning();
    await db.update(conversas).set({ dataAtualizacao: AGORA }).where(eq(conversas.id, conversa.id));

    const destinatario = conversa.compradorId === usuarioId ? conversa.vendedorId : conversa.compradorId;
    NotificacaoService.notificar(destinatario, {
      tipo: 'MENSAGEM',
      titulo: 'Nova mensagem',
      mensagem: conteudo.slice(0, 140),
      link: `/mensagens/${conversa.id}`,
    });
    return { mensagem: { id: msg.id, autor_id: msg.autorId, texto: msg.texto, data: msg.data, lida: msg.lida } };
  }

  /** Mensagens da conversa (todas ou só as novas) e marca as recebidas como lidas. */
  static async mensagens({ usuarioId, conversaId, depoisDe }) {
    const conversa = await ChatService.carregar(conversaId, usuarioId);
    const db = getDb();
    const conds = [eq(mensagens.conversaId, conversa.id)];
    if (depoisDe) conds.push(gt(mensagens.id, Number(depoisDe)));
    const lista = await db
      .select({ id: mensagens.id, autor_id: mensagens.autorId, texto: mensagens.texto, data: mensagens.data, lida: mensagens.lida })
      .from(mensagens)
      .where(and(...conds))
      .orderBy(asc(mensagens.id))
      .limit(500);
    await db
      .update(mensagens)
      .set({ lida: true })
      .where(and(eq(mensagens.conversaId, conversa.id), ne(mensagens.autorId, usuarioId), eq(mensagens.lida, false)));
    return { mensagens: lista };
  }

  /** Conversas do usuário (como comprador ou produtor), mais recentes primeiro. */
  static async listar({ usuarioId }) {
    const rows = await getDb()
      .select({
        id: conversas.id,
        comprador_id: conversas.compradorId,
        vendedor_id: conversas.vendedorId,
        anuncio_id: conversas.anuncioId,
        anuncio_nome: anuncios.nome,
        anuncio_imagem: imagens.url,
        data_atualizacao: conversas.dataAtualizacao,
        comprador_nome: sql`${comprador.nome} || ' ' || ${comprador.sobrenome}`,
        vendedor_nome: sql`${vendedor.nome} || ' ' || ${vendedor.sobrenome}`,
        ultima_mensagem: sql`(SELECT m.texto FROM "Mensagem" m WHERE m.conversa_id = ${conversas.id} ORDER BY m.id DESC LIMIT 1)`,
        nao_lidas: sql`(SELECT count(*) FROM "Mensagem" m WHERE m.conversa_id = ${conversas.id} AND m.autor_id <> ${usuarioId} AND NOT m.lida)`.mapWith(Number),
      })
      .from(conversas)
      .innerJoin(comprador, eq(comprador.id, conversas.compradorId))
      .innerJoin(vendedor, eq(vendedor.id, conversas.vendedorId))
      .leftJoin(anuncios, eq(anuncios.id, conversas.anuncioId))
      .leftJoin(imagens, and(eq(imagens.anuncioId, conversas.anuncioId), eq(imagens.tipo, 'PRINCIPAL')))
      .where(or(eq(conversas.compradorId, usuarioId), eq(conversas.vendedorId, usuarioId)))
      .orderBy(desc(conversas.dataAtualizacao), desc(conversas.id));
    return {
      conversas: rows.map((r) => ({
        ...r,
        papel: r.comprador_id === usuarioId ? 'COMPRADOR' : 'VENDEDOR',
        outra_parte: r.comprador_id === usuarioId ? r.vendedor_nome : r.comprador_nome,
      })),
    };
  }

  /** Total de mensagens não lidas (badge do cabeçalho). */
  static async naoLidas({ usuarioId }) {
    const [{ total }] = await getDb()
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(mensagens)
      .innerJoin(conversas, eq(conversas.id, mensagens.conversaId))
      .where(and(ne(mensagens.autorId, usuarioId), eq(mensagens.lida, false)));
    return { nao_lidas: total };
  }
}


module.exports = ChatService;
