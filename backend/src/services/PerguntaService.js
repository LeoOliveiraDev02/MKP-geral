/**
 * @file PerguntaService.js
 * @description Perguntas e respostas públicas no anúncio. O vendedor é
 * notificado da pergunta; o autor, da resposta.
 */

const PerguntaDAO = require('../dao/PerguntaDAO');
const AnuncioDAO = require('../dao/AnuncioDAO');
const NotificacaoService = require('./NotificacaoService');
const { runAsSystem } = require('../db/context');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

function lerTexto(texto, campo) {
  const t = String(texto || '').trim();
  if (t.length < 3) throw new BadRequestError(`Escreva a ${campo} com pelo menos 3 caracteres.`);
  if (t.length > 500) throw new BadRequestError(`A ${campo} pode ter até 500 caracteres.`);
  return t;
}

class PerguntaService {
  static async listar({ anuncioId }) {
    if (!anuncioId) throw new BadRequestError('Informe o anuncioId.');
    return { perguntas: await PerguntaDAO.listByAnuncio(anuncioId) };
  }

  static async perguntar({ autorId, anuncioId, texto }) {
    const conteudo = lerTexto(texto, 'pergunta');
    const ad = await AnuncioDAO.findById(anuncioId);
    if (!ad) throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    if (ad.anunciante_id === autorId) throw new BadRequestError('Você não pode perguntar no seu próprio anúncio.');
    const id = await PerguntaDAO.create({ anuncioId: ad.id, autorId, texto: conteudo });
    NotificacaoService.notificar(ad.anunciante_id, {
      tipo: 'PERGUNTA_NOVA',
      titulo: `Nova pergunta em ${ad.nome}`,
      mensagem: conteudo.slice(0, 160),
      link: `/produto/${ad.id}#perguntas`,
    });
    return { id };
  }

  static async responder({ vendedorId, id, resposta }) {
    const conteudo = lerTexto(resposta, 'resposta');
    const pergunta = await PerguntaDAO.findById(id);
    if (!pergunta) throw new NotFoundError('Pergunta não encontrada.');
    const ad = await runAsSystem(() => AnuncioDAO.findById(pergunta.anuncioId, true));
    if (!ad || ad.anunciante_id !== vendedorId) throw new ForbiddenError('Só o vendedor pode responder esta pergunta.');
    if (pergunta.resposta) throw new BadRequestError('Esta pergunta já foi respondida.');
    await PerguntaDAO.responder(id, conteudo);
    NotificacaoService.notificar(pergunta.autorId, {
      tipo: 'PERGUNTA_RESPONDIDA',
      titulo: `Sua pergunta sobre ${ad.nome} foi respondida`,
      mensagem: conteudo.slice(0, 160),
      link: `/produto/${ad.id}#perguntas`,
    });
  }

  static async excluir({ autorId, id }) {
    const pergunta = await PerguntaDAO.findById(id);
    if (!pergunta) throw new NotFoundError('Pergunta não encontrada.');
    if (pergunta.autorId !== autorId) throw new ForbiddenError('Você só pode excluir suas próprias perguntas.');
    await PerguntaDAO.delete(id);
  }
}

module.exports = PerguntaService;
