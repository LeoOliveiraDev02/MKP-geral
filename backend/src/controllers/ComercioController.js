/**
 * @file ComercioController.js
 * @description Thin adapter HTTP para cotações de atacado e cestas por assinatura.
 */

const CotacaoService = require('../services/CotacaoService');
const CestaService = require('../services/CestaService');
const { acao } = require('./ReputacaoController');

const ComercioController = {
  // ─── Cotações ───
  solicitarCotacao: acao(async (req) => ({
    message: 'Pedido de cotação enviado ao produtor.',
    data: await CotacaoService.solicitar({
      clienteId: req.user.id, anuncioId: req.body.anuncioId, quantidade: req.body.quantidade, mensagem: req.body.mensagem,
    }),
  }), 201),
  minhasCotacoes: acao(async (req) => ({ data: await CotacaoService.listar({ usuarioId: req.user.id, papel: 'CLIENTE' }) })),
  cotacoesRecebidas: acao(async (req) => ({ data: await CotacaoService.listar({ usuarioId: req.user.id, papel: 'VENDEDOR' }) })),
  responderCotacao: acao(async (req) => ({
    message: req.body.recusar ? 'Cotação recusada.' : 'Proposta enviada.',
    data: await CotacaoService.responder({
      vendedorId: req.user.id, id: req.params.id, precoUnitario: req.body.precoUnitario,
      prazoEntrega: req.body.prazoEntrega, resposta: req.body.resposta, recusar: !!req.body.recusar,
    }),
  })),
  aceitarCotacao: acao(async (req) => ({
    message: 'Proposta aceita. Seu pedido foi criado.',
    data: await CotacaoService.aceitar({
      clienteId: req.user.id, id: req.params.id, tipoEntrega: req.body.tipoEntrega,
      enderecoId: req.body.enderecoId, formaPagamento: req.body.formaPagamento,
    }),
  })),
  cancelarCotacao: acao(async (req) => {
    await CotacaoService.cancelar({ clienteId: req.user.id, id: req.params.id });
    return { message: 'Cotação cancelada.' };
  }),

  // ─── Cestas ───
  cestasPublicas: acao(async () => ({ data: await CestaService.listarPublicas() })),
  cesta: acao(async (req) => ({ data: await CestaService.detalhe({ id: req.params.id }) })),
  minhasCestas: acao(async (req) => ({ data: await CestaService.minhasCestas({ vendedorId: req.user.id }) })),
  criarCesta: acao(async (req) => ({
    message: 'Cesta publicada.',
    data: await CestaService.criar({ vendedorId: req.user.id, body: req.body, arquivo: req.file, httpReq: req }),
  }), 201),
  editarCesta: acao(async (req) => ({
    message: 'Cesta atualizada.',
    data: await CestaService.editar({ vendedorId: req.user.id, id: req.params.id, body: req.body, arquivo: req.file, httpReq: req }),
  })),
  assinantes: acao(async (req) => ({ data: await CestaService.assinantes({ vendedorId: req.user.id, id: req.params.id }) })),
  gerarPedidoDaEntrega: acao(async (req) => ({
    message: 'Pedido da entrega criado.',
    data: await CestaService.gerarPedidoDaEntrega({ vendedorId: req.user.id, assinaturaId: req.params.id }),
  }), 201),
  assinar: acao(async (req) => ({
    message: 'Assinatura confirmada!',
    data: await CestaService.assinar({
      clienteId: req.user.id, cestaId: req.params.id, tipoEntrega: req.body.tipoEntrega, enderecoId: req.body.enderecoId,
    }),
  }), 201),
  minhasAssinaturas: acao(async (req) => ({ data: await CestaService.minhasAssinaturas({ clienteId: req.user.id }) })),
  alterarAssinatura: acao(async (req) => {
    await CestaService.alterarAssinatura({ clienteId: req.user.id, id: req.params.id, status: req.body.status });
    return { message: 'Assinatura atualizada.' };
  }),
};

module.exports = ComercioController;
