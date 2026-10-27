/**
 * @file CotacaoService.js
 * @description Cotação de atacado (B2B): restaurantes e mercados pedem preço
 * para uma quantidade grande; o produtor propõe preço unitário e prazo; o
 * comprador aceita e a cotação vira um pedido normal (origem COTACAO).
 */

const { eq, desc, sql } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getDb } = require('../db');
const { cotacoes, anuncios, usuarios } = require('../db/schema');
const { runAsSystem } = require('../db/context');
const AnuncioDAO = require('../dao/AnuncioDAO');
const EnderecoDAO = require('../dao/EnderecoDAO');
const PedidoService = require('./PedidoService');
const FreteService = require('./FreteService');
const NotificacaoService = require('./NotificacaoService');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const cliente = alias(usuarios, 'cliente');
const vendedor = alias(usuarios, 'vendedor');
const AGORA = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`;

const CAMPOS = {
  id: cotacoes.id,
  anuncio_id: cotacoes.anuncioId,
  anuncio_nome: anuncios.nome,
  anuncio_unidade: anuncios.unidade,
  anuncio_preco: anuncios.preco,
  cliente_id: cotacoes.clienteId,
  vendedor_id: cotacoes.vendedorId,
  cliente_nome: sql`${cliente.nome} || ' ' || ${cliente.sobrenome}`,
  vendedor_nome: sql`${vendedor.nome} || ' ' || ${vendedor.sobrenome}`,
  quantidade: cotacoes.quantidade,
  mensagem: cotacoes.mensagem,
  status: cotacoes.status,
  preco_unitario: cotacoes.precoUnitario,
  prazo_entrega: cotacoes.prazoEntrega,
  resposta: cotacoes.resposta,
  pedido_id: cotacoes.pedidoId,
  data_criacao: cotacoes.dataCriacao,
  data_resposta: cotacoes.dataResposta,
};

function consulta(db) {
  return db
    .select(CAMPOS)
    .from(cotacoes)
    .innerJoin(anuncios, eq(anuncios.id, cotacoes.anuncioId))
    .innerJoin(cliente, eq(cliente.id, cotacoes.clienteId))
    .innerJoin(vendedor, eq(vendedor.id, cotacoes.vendedorId));
}

class CotacaoService {
  static async solicitar({ clienteId, anuncioId, quantidade, mensagem }) {
    const qtd = Number(quantidade);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100000) throw new BadRequestError('Informe a quantidade desejada.');
    const ad = await AnuncioDAO.findById(anuncioId);
    if (!ad) throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    if (ad.anunciante_id === clienteId) throw new BadRequestError('Você não pode cotar o seu próprio anúncio.');
    const [{ id }] = await getDb()
      .insert(cotacoes)
      .values({
        anuncioId: ad.id,
        clienteId,
        vendedorId: ad.anunciante_id,
        quantidade: qtd,
        mensagem: mensagem ? String(mensagem).trim().slice(0, 1000) : null,
      })
      .returning({ id: cotacoes.id });
    NotificacaoService.notificar(ad.anunciante_id, {
      tipo: 'COTACAO',
      titulo: `Pedido de cotação: ${qtd} ${ad.unidade} de ${ad.nome}`,
      mensagem: mensagem ? String(mensagem).slice(0, 140) : 'Um comprador quer comprar em quantidade.',
      link: '/vender/cotacoes',
    });
    return { id };
  }

  static async listar({ usuarioId, papel }) {
    const where = papel === 'VENDEDOR' ? eq(cotacoes.vendedorId, usuarioId) : eq(cotacoes.clienteId, usuarioId);
    return { cotacoes: await consulta(getDb()).where(where).orderBy(desc(cotacoes.id)) };
  }

  static async carregar(id) {
    const [c] = await runAsSystem(() => consulta(getDb()).where(eq(cotacoes.id, Number(id))).limit(1));
    if (!c) throw new NotFoundError('Cotação não encontrada.');
    return c;
  }

  static async atualizar(id, campos) {
    await runAsSystem(() => getDb().update(cotacoes).set(campos).where(eq(cotacoes.id, Number(id))));
  }

  /** Produtor propõe preço/prazo (ou recusa com `recusar`). */
  static async responder({ vendedorId, id, precoUnitario, prazoEntrega, resposta, recusar }) {
    const c = await CotacaoService.carregar(id);
    if (c.vendedor_id !== vendedorId) throw new ForbiddenError('Só o produtor pode responder esta cotação.');
    if (c.status !== 'PENDENTE' && c.status !== 'RESPONDIDA') throw new BadRequestError('Esta cotação não pode mais ser respondida.');
    const texto = resposta ? String(resposta).trim().slice(0, 1000) : null;
    if (recusar) {
      await CotacaoService.atualizar(id, { status: 'RECUSADA', resposta: texto, dataResposta: AGORA });
    } else {
      const preco = Number(precoUnitario);
      if (!Number.isFinite(preco) || preco <= 0) throw new BadRequestError('Informe o preço unitário proposto.');
      await CotacaoService.atualizar(id, {
        status: 'RESPONDIDA',
        precoUnitario: Math.round(preco * 100) / 100,
        prazoEntrega: prazoEntrega ? String(prazoEntrega).trim().slice(0, 100) : null,
        resposta: texto,
        dataResposta: AGORA,
      });
    }
    NotificacaoService.notificar(c.cliente_id, {
      tipo: 'COTACAO',
      titulo: recusar ? `Cotação de ${c.anuncio_nome} recusada` : `Proposta recebida para ${c.anuncio_nome}`,
      mensagem: recusar ? texto : `R$ ${Number(precoUnitario).toFixed(2).replace('.', ',')} por ${c.anuncio_unidade}.`,
      link: '/cotacoes',
    });
    return { cotacao: await CotacaoService.carregar(id) };
  }

  /** Comprador aceita a proposta: vira pedido (estoque baixado, frete estimado). */
  static async aceitar({ clienteId, id, tipoEntrega, enderecoId, formaPagamento }) {
    const c = await CotacaoService.carregar(id);
    if (c.cliente_id !== clienteId) throw new ForbiddenError('Só quem pediu a cotação pode aceitá-la.');
    if (c.status !== 'RESPONDIDA') throw new BadRequestError('Esta cotação não tem uma proposta para aceitar.');
    if (!['PIX', 'CARTAO', 'BOLETO'].includes(formaPagamento)) throw new BadRequestError('Escolha a forma de pagamento.');
    if (tipoEntrega !== 'ENTREGA' && tipoEntrega !== 'RETIRADA') throw new BadRequestError('Escolha entrega ou retirada.');

    const ad = await AnuncioDAO.findById(c.anuncio_id);
    if (!ad) throw new BadRequestError('O anúncio desta cotação não está mais disponível.');
    if (tipoEntrega === 'ENTREGA' && !ad.permite_entrega) throw new BadRequestError('Este produtor não faz entrega deste produto.');
    if (tipoEntrega === 'RETIRADA' && !ad.permite_retirada) throw new BadRequestError('Este produto não pode ser retirado no local.');

    let endereco = null;
    let frete = 0;
    if (tipoEntrega === 'ENTREGA') {
      endereco = await runAsSystem(() => EnderecoDAO.findById(Number(enderecoId)));
      if (!endereco || endereco.cliente_id !== clienteId) throw new BadRequestError('Endereço de entrega inválido.');
      frete = FreteService.calcular(
        { cidade: ad.cidade, uf: ad.uf },
        { cidade: endereco.cidade, uf: endereco.uf },
        FreteService.pesoDaLinha(ad, c.quantidade),
        c.preco_unitario * c.quantidade
      ).valor;
    }
    const principal = (ad.imagens || []).find((i) => i.tipo === 'PRINCIPAL');

    const pedidoId = await runAsSystem(() =>
      getDb().transaction(async (tx) => {
        const novo = await PedidoService.gravarPedido(tx, {
          compradorId: clienteId,
          vendedorId: c.vendedor_id,
          tipoEntrega,
          formaPagamento,
          endereco,
          frete,
          origem: 'COTACAO',
          observacao: `Cotação #${c.id}${c.prazo_entrega ? ` — prazo combinado: ${c.prazo_entrega}` : ''}`,
          itens: [{
            anuncio_id: ad.id,
            nome: ad.nome,
            unidade: ad.unidade,
            preco_unitario: c.preco_unitario,
            quantidade: c.quantidade,
            imagem_url: principal ? principal.url : null,
          }],
        });
        await tx.update(cotacoes).set({ status: 'ACEITA', pedidoId: novo }).where(eq(cotacoes.id, c.id));
        return novo;
      })
    );
    NotificacaoService.notificar(c.vendedor_id, {
      tipo: 'PEDIDO_NOVO',
      titulo: `Cotação #${c.id} aceita — pedido #${pedidoId}`,
      mensagem: `${c.quantidade} ${c.anuncio_unidade} de ${c.anuncio_nome}.`,
      link: `/vender/pedidos/${pedidoId}`,
    });
    logger.audit('Cotação aceita', { userId: clienteId, cotacaoId: c.id, pedidoId });
    return { pedido_id: pedidoId };
  }

  static async cancelar({ clienteId, id }) {
    const c = await CotacaoService.carregar(id);
    if (c.cliente_id !== clienteId) throw new ForbiddenError('Só quem pediu a cotação pode cancelá-la.');
    if (c.status !== 'PENDENTE' && c.status !== 'RESPONDIDA') throw new BadRequestError('Esta cotação já foi finalizada.');
    await CotacaoService.atualizar(id, { status: 'CANCELADA' });
  }
}


module.exports = CotacaoService;
