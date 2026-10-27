/**
 * @file ReputacaoController.js
 * @description Thin adapter HTTP para avaliações, perguntas, página pública do
 * produtor e verificação (selo).
 */

const AvaliacaoService = require('../services/AvaliacaoService');
const PerguntaService = require('../services/PerguntaService');
const ProdutorService = require('../services/ProdutorService');
const VerificacaoService = require('../services/VerificacaoService');

/** Encapsula o try/catch + envelope padrão de sucesso. */
function acao(fn, status = 200) {
  return async (req, res, next) => {
    try {
      const { message, data } = (await fn(req)) || {};
      return res.status(status).json({ status: 'success', ...(message ? { message } : {}), ...(data !== undefined ? { data } : {}) });
    } catch (error) {
      next(error);
    }
  };
}

const ReputacaoController = {
  // ─── Avaliações ───
  listarAvaliacoes: acao(async (req) => ({
    data: await AvaliacaoService.listar({ anuncioId: req.query.anuncioId, vendedorId: req.query.vendedorId }),
  })),

  avaliar: acao(async (req) => ({
    message: 'Obrigado pela avaliação!',
    data: await AvaliacaoService.criar({
      autorId: req.user.id,
      pedidoId: req.body.pedidoId,
      anuncioId: req.body.anuncioId,
      nota: req.body.nota,
      comentario: req.body.comentario,
      fotos: (req.files && req.files.fotos) || [],
      httpReq: req,
    }),
  }), 201),

  responderAvaliacao: acao(async (req) => {
    await AvaliacaoService.responder({ vendedorId: req.user.id, id: req.params.id, resposta: req.body.resposta });
    return { message: 'Resposta publicada.' };
  }),

  // ─── Perguntas ───
  listarPerguntas: acao(async (req) => ({ data: await PerguntaService.listar({ anuncioId: req.query.anuncioId }) })),

  perguntar: acao(async (req) => ({
    message: 'Pergunta enviada ao produtor.',
    data: await PerguntaService.perguntar({ autorId: req.user.id, anuncioId: req.body.anuncioId, texto: req.body.texto }),
  }), 201),

  responderPergunta: acao(async (req) => {
    await PerguntaService.responder({ vendedorId: req.user.id, id: req.params.id, resposta: req.body.resposta });
    return { message: 'Resposta publicada.' };
  }),

  excluirPergunta: acao(async (req) => {
    await PerguntaService.excluir({ autorId: req.user.id, id: req.params.id });
    return { message: 'Pergunta excluída.' };
  }),

  // ─── Produtor ───
  perfilProdutor: acao(async (req) => ({ data: await ProdutorService.perfil({ id: req.params.id }) })),

  atualizarPerfilPublico: acao(async (req) => ({
    message: 'Perfil público atualizado.',
    data: await ProdutorService.atualizarPerfilPublico({ usuarioId: req.user.id, bio: req.body.bio, videoUrl: req.body.videoUrl }),
  })),

  atualizarFoto: acao(async (req) => ({
    message: 'Foto atualizada.',
    data: await ProdutorService.atualizarFoto({ usuarioId: req.user.id, arquivo: req.file, httpReq: req }),
  })),

  meuPerfilPublico: acao(async (req) => ({ data: await ProdutorService.meuPerfilPublico(req.user.id) })),

  // ─── Verificação ───
  minhaVerificacao: acao(async (req) => ({ data: await VerificacaoService.minha({ usuarioId: req.user.id }) })),

  solicitarVerificacao: acao(async (req) => ({
    message: 'Documentos enviados para análise.',
    data: await VerificacaoService.solicitar({
      usuarioId: req.user.id,
      tipoDocumento: req.body.tipoDocumento,
      documento: req.body.documento,
      car: req.body.car,
    }),
  }), 201),
};

module.exports = ReputacaoController;
module.exports.acao = acao;
