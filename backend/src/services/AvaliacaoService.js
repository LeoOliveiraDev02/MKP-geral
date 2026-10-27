/**
 * @file AvaliacaoService.js
 * @description Avaliação de produto por quem comprou: só após o pedido
 * ENTREGUE, uma vez por item do pedido, com até 3 fotos. O vendedor pode
 * responder publicamente uma vez.
 */

const AvaliacaoDAO = require('../dao/AvaliacaoDAO');
const PedidoDAO = require('../dao/PedidoDAO');
const ArmazenamentoService = require('./armazenamentoService');
const NotificacaoService = require('./NotificacaoService');
const { getDb, isUniqueViolation } = require('../db');
const { runAsSystem } = require('../db/context');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const MAX_FOTOS = 3;

class AvaliacaoService {
  static async criar({ autorId, pedidoId, anuncioId, nota, comentario, fotos = [], httpReq }) {
    const notaNum = Number(nota);
    if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
      throw new BadRequestError('A nota deve ser um número inteiro de 1 a 5.');
    }
    const texto = comentario ? String(comentario).trim() : '';
    if (texto.length > 1000) throw new BadRequestError('O comentário pode ter até 1000 caracteres.');
    if (fotos.length > MAX_FOTOS) throw new BadRequestError(`Envie no máximo ${MAX_FOTOS} fotos.`);

    const pedido = await runAsSystem(() => PedidoDAO.findById(pedidoId));
    if (!pedido) throw new NotFoundError('Pedido não encontrado.');
    if (pedido.comprador_id !== autorId) throw new ForbiddenError('Só quem comprou pode avaliar este produto.');
    if (pedido.status !== 'ENTREGUE') throw new BadRequestError('Você poderá avaliar quando o pedido for entregue.');
    const item = pedido.itens.find((i) => i.anuncio_id === Number(anuncioId));
    if (!item) throw new BadRequestError('Este produto não faz parte do pedido.');
    if (await AvaliacaoDAO.jaAvaliou(pedido.id, item.anuncio_id)) {
      throw new BadRequestError('Você já avaliou este produto neste pedido.');
    }

    const urls = [];
    for (const foto of fotos) {
      try {
        urls.push(await ArmazenamentoService.uploadImage(foto, httpReq));
      } catch (err) {
        throw new BadRequestError(err.message);
      }
    }

    let id;
    try {
      id = await getDb().transaction(async (tx) => {
        const novoId = await AvaliacaoDAO.create({
          pedidoId: pedido.id,
          anuncioId: item.anuncio_id,
          autorId,
          vendedorId: pedido.vendedor_id,
          nota: notaNum,
          comentario: texto,
        }, tx);
        for (const url of urls) await AvaliacaoDAO.addFoto(novoId, url, tx);
        return novoId;
      });
    } catch (err) {
      for (const url of urls) await ArmazenamentoService.deleteImage(url);
      if (isUniqueViolation(err)) throw new BadRequestError('Você já avaliou este produto neste pedido.');
      throw err;
    }

    NotificacaoService.notificar(pedido.vendedor_id, {
      tipo: 'AVALIACAO_NOVA',
      titulo: `Nova avaliação: ${notaNum} de 5`,
      mensagem: `${item.nome} recebeu uma avaliação${texto ? `: "${texto.slice(0, 120)}"` : '.'}`,
      link: `/produto/${item.anuncio_id}#avaliacoes`,
    });
    logger.audit('Produto avaliado', { userId: autorId, pedidoId: pedido.id, anuncioId: item.anuncio_id, nota: notaNum });
    return { id };
  }

  static async listar({ anuncioId, vendedorId }) {
    if (!anuncioId && !vendedorId) throw new BadRequestError('Informe anuncioId ou vendedorId.');
    const [avaliacoes, resumo] = await Promise.all([
      AvaliacaoDAO.list({ anuncioId, vendedorId }),
      AvaliacaoDAO.resumo({ anuncioId, vendedorId }),
    ]);
    return { avaliacoes, resumo };
  }

  static async responder({ vendedorId, id, resposta }) {
    const texto = String(resposta || '').trim();
    if (!texto) throw new BadRequestError('Escreva a resposta.');
    if (texto.length > 1000) throw new BadRequestError('A resposta pode ter até 1000 caracteres.');
    const avaliacao = await AvaliacaoDAO.findById(id);
    if (!avaliacao) throw new NotFoundError('Avaliação não encontrada.');
    if (avaliacao.vendedorId !== vendedorId) throw new ForbiddenError('Só o vendedor pode responder esta avaliação.');
    if (avaliacao.respostaVendedor) throw new BadRequestError('Esta avaliação já foi respondida.');
    await AvaliacaoDAO.responder(id, texto);
    NotificacaoService.notificar(avaliacao.autorId, {
      tipo: 'AVALIACAO_RESPONDIDA',
      titulo: 'O produtor respondeu sua avaliação',
      mensagem: texto.slice(0, 160),
      link: `/produto/${avaliacao.anuncioId}#avaliacoes`,
    });
  }
}

module.exports = AvaliacaoService;
