/**
 * @file ComunicacaoController.js
 * @description Thin adapter HTTP para chat, reclamações/mediação e as telas de
 * administração (verificações e mediações).
 */

const ChatService = require('../services/ChatService');
const ReclamacaoService = require('../services/ReclamacaoService');
const VerificacaoService = require('../services/VerificacaoService');
const { acao } = require('./ReputacaoController');

const ComunicacaoController = {
  // ─── Chat ───
  conversas: acao(async (req) => ({ data: await ChatService.listar({ usuarioId: req.user.id }) })),
  naoLidas: acao(async (req) => ({ data: await ChatService.naoLidas({ usuarioId: req.user.id }) })),
  iniciar: acao(async (req) => ({
    data: await ChatService.iniciar({ usuarioId: req.user.id, anuncioId: req.body.anuncioId, texto: req.body.texto }),
  }), 201),
  mensagens: acao(async (req) => ({
    data: await ChatService.mensagens({ usuarioId: req.user.id, conversaId: req.params.id, depoisDe: req.query.depoisDe }),
  })),
  enviar: acao(async (req) => ({
    data: await ChatService.enviar({ usuarioId: req.user.id, conversaId: req.params.id, texto: req.body.texto }),
  }), 201),

  // ─── Reclamações ───
  reclamacoes: acao(async (req) => ({ data: await ReclamacaoService.listar({ usuarioId: req.user.id }) })),
  reclamacao: acao(async (req) => ({ data: await ReclamacaoService.detalhe({ id: req.params.id, usuarioId: req.user.id }) })),
  abrir: acao(async (req) => ({
    message: 'Reclamação aberta. O produtor foi avisado.',
    data: await ReclamacaoService.abrir({
      compradorId: req.user.id,
      pedidoId: req.body.pedidoId,
      motivo: req.body.motivo,
      descricao: req.body.descricao,
      pedidoDevolucao: req.body.pedidoDevolucao,
    }),
  }), 201),
  responder: acao(async (req) => ({
    data: await ReclamacaoService.responder({
      vendedorId: req.user.id, id: req.params.id, resposta: req.body.resposta, aceitar: !!req.body.aceitar,
    }),
  })),
  encerrar: acao(async (req) => ({ data: await ReclamacaoService.encerrar({ compradorId: req.user.id, id: req.params.id }) })),
  mediacao: acao(async (req) => ({ data: await ReclamacaoService.pedirMediacao({ usuarioId: req.user.id, id: req.params.id }) })),

  // ─── Administração ───
  adminVerificacoes: acao(async (req) => ({ data: await VerificacaoService.listarParaAdmin({ status: req.query.status }) })),
  adminDecidirVerificacao: acao(async (req) => {
    await VerificacaoService.decidir({ adminId: req.user.id, id: req.params.id, status: req.body.status, observacao: req.body.observacao });
    return { message: 'Decisão registrada.' };
  }),
  adminReclamacoes: acao(async (req) => ({ data: await ReclamacaoService.listarParaAdmin({ status: req.query.status }) })),
  adminReclamacao: acao(async (req) => ({ data: await ReclamacaoService.detalhe({ id: req.params.id, usuarioId: req.user.id, admin: true }) })),
  adminDecidirReclamacao: acao(async (req) => ({
    message: 'Mediação concluída.',
    data: await ReclamacaoService.decidir({ adminId: req.user.id, id: req.params.id, favorecido: req.body.favorecido, decisao: req.body.decisao }),
  })),
};

module.exports = ComunicacaoController;
