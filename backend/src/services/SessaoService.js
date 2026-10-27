/**
 * @file SessaoService.js
 * @description Sessões no servidor. Todo JWT de sessão tem uma linha em
 * `Sessao` (id = jti); o authMiddleware só aceita o token se a linha existir,
 * não estiver revogada e não estiver ociosa além do limite.
 *
 * - Timeout absoluto: 24 h (expiração do JWT).
 * - Timeout por inatividade: SESSION_IDLE_MINUTES (padrão 8 h).
 * - "Sair de todos os dispositivos", encerrar uma sessão específica e
 *   revogação automática após troca/redefinição de senha.
 * - Alerta por e-mail quando a conta entra de um navegador/aparelho novo.
 *
 * Tabela interna (RLS só-sistema): todo acesso roda em `runAsSystem`.
 */

const crypto = require('crypto');
const SessaoDAO = require('../dao/SessaoDAO');
const NotificacaoService = require('./NotificacaoService');
const { runAsSystem } = require('../db/context');
const { assinarSessao, DURACAO_SESSAO_MS } = require('../utils/sessao');
const logger = require('../utils/logger');
const { NotFoundError } = require('../errors/AppError');

const TOQUE_MIN_MS = 60 * 1000;

const paraTexto = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const deTexto = (texto) => Date.parse(`${String(texto).replace(' ', 'T')}Z`);

function ociosidadeMs() {
  const min = parseInt(process.env.SESSION_IDLE_MINUTES || '', 10);
  return (Number.isFinite(min) && min > 0 ? min : 8 * 60) * 60 * 1000;
}

/** Descrição curta do aparelho a partir do User-Agent (para a lista de sessões). */
function descreverDispositivo(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Dispositivo desconhecido';
  const so = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Outro sistema';
  const nav = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'App/Navegador';
  return `${nav} no ${so}`;
}

class SessaoService {
  /**
   * Cria a sessão no servidor e devolve o JWT correspondente.
   * @param {{usuario: {id: number, email: string}, mfa?: boolean, ip?: string, userAgent?: string}} p
   */
  static async criar({ usuario, mfa = false, ip, userAgent }) {
    const id = crypto.randomUUID();
    const ua = String(userAgent || '').slice(0, 300);
    const conhecido = await SessaoDAO.existeComUserAgent(usuario.id, ua);
    const primeiraSessao = !conhecido && (await SessaoDAO.listarAtivas(usuario.id)).length === 0;

    await SessaoDAO.criar({
      id,
      usuarioId: usuario.id,
      expiraEm: paraTexto(Date.now() + DURACAO_SESSAO_MS),
      ip: ip ? String(ip).slice(0, 64) : null,
      userAgent: ua,
      mfa,
    });

    // Aparelho novo numa conta que já tinha sessões: avisa o titular.
    if (!conhecido && !primeiraSessao) {
      logger.audit('Login de dispositivo novo', { userId: usuario.id, ip });
      NotificacaoService.alertaSeguranca(usuario.id, {
        titulo: 'Novo acesso à sua conta',
        mensagem: `Detectamos um login de um dispositivo novo (${descreverDispositivo(ua)}) em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Se não foi você, troque sua senha e encerre as outras sessões em Meu Perfil → Segurança.`,
        link: '/perfil',
      });
    }

    return assinarSessao({ id: usuario.id, email: usuario.email, mfa, jti: id });
  }

  /**
   * Confere se a sessão do token continua válida (existe, não revogada, não
   * ociosa) e registra o uso. Tokens sem `jti` registrado são recusados.
   * @returns {Promise<boolean>}
   */
  static async validar(decoded) {
    if (!decoded || !decoded.jti) return false;
    const sessao = await SessaoDAO.findById(decoded.jti);
    if (!sessao || sessao.revogada_em || sessao.usuario_id !== decoded.id) return false;
    const agora = Date.now();
    const ultimoUso = deTexto(sessao.ultimo_uso);
    if (agora - ultimoUso > ociosidadeMs()) {
      await SessaoDAO.revogar(sessao.id, sessao.usuario_id);
      return false;
    }
    if (agora - ultimoUso > TOQUE_MIN_MS) await SessaoDAO.tocar(sessao.id);
    return true;
  }

  static async listar({ usuarioId, sessaoAtual }) {
    const sessoes = await SessaoDAO.listarAtivas(usuarioId);
    return sessoes.map((s) => ({
      id: s.id,
      dispositivo: descreverDispositivo(s.user_agent),
      ip: s.ip,
      criadaEm: s.criada_em,
      ultimoUso: s.ultimo_uso,
      atual: s.id === sessaoAtual,
    }));
  }

  static async revogar({ usuarioId, id, ip }) {
    const ok = await SessaoDAO.revogar(id, usuarioId);
    if (!ok) throw new NotFoundError('Sessão não encontrada.');
    logger.audit('Sessão encerrada pelo usuário', { userId: usuarioId, ip });
  }

  /** Encerra todas as sessões do usuário (menos `exceto`, se informada). */
  static async revogarTodas({ usuarioId, exceto = null, ip, motivo = 'pedido do usuário' }) {
    const total = await SessaoDAO.revogarTodas(usuarioId, exceto);
    logger.audit('Sessões encerradas', { userId: usuarioId, total, motivo, ip });
    return total;
  }
}

for (const metodo of ['criar', 'validar', 'listar', 'revogar', 'revogarTodas']) {
  const original = SessaoService[metodo];
  SessaoService[metodo] = (...args) => runAsSystem(() => original.apply(SessaoService, args));
}

SessaoService.descreverDispositivo = descreverDispositivo;

module.exports = SessaoService;
