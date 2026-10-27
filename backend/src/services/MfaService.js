/**
 * @file MfaService.js
 * @description Verificação em duas etapas (TOTP). Opcional para qualquer
 * usuário e obrigatória para administradores (adminMiddleware).
 *
 * Fluxo:
 * 1. `iniciar` gera um segredo (ainda inativo) e devolve a URI otpauth;
 * 2. `ativar` confere o 1º código do app autenticador, liga o MFA e devolve
 *    10 códigos de recuperação (mostrados uma única vez; no banco só o hash);
 * 3. no login, contas com MFA ativo recebem um desafio (`mfaToken`, 5 min)
 *    em vez da sessão; `concluirLogin` troca desafio + código (do app ou de
 *    recuperação) pela sessão.
 *
 * Tabelas internas (RLS só-sistema): todo acesso roda em `runAsSystem`.
 */

const crypto = require('crypto');
const { runAsSystem } = require('../db/context');
const UsuarioDAO = require('../dao/UsuarioDAO');
const MfaUsuarioDAO = require('../dao/MfaUsuarioDAO');
const MfaCodigoRecuperacaoDAO = require('../dao/MfaCodigoRecuperacaoDAO');
const SessaoService = require('./SessaoService');
const NotificacaoService = require('./NotificacaoService');
const totp = require('../utils/totp');
const { verificarDesafioMfa } = require('../utils/sessao');
const { jwtSecret } = require('../config/seguranca');
const logger = require('../utils/logger');
const { BadRequestError, UnauthorizedError } = require('../errors/AppError');

const QTD_CODIGOS = 10;
// Sem caracteres ambíguos (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const registro = (usuarioId) => MfaUsuarioDAO.findByUsuarioId(usuarioId);

/** Código de recuperação no formato XXXXX-XXXXX (~49 bits de entropia). */
function gerarCodigoRecuperacao() {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

function normalizarRecuperacao(codigo) {
  return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecuperacao(usuarioId, codigo) {
  return crypto
    .createHmac('sha256', process.env.MFA_ENCRYPTION_KEY || jwtSecret())
    .update(`mfa-recuperacao:${usuarioId}:${normalizarRecuperacao(codigo)}`)
    .digest('hex');
}

const pareceRecuperacao = (codigo) => normalizarRecuperacao(codigo).length === 10;

/** Confere o código TOTP e grava o passo usado (o mesmo código não vale duas vezes). */
async function conferirCodigo(row, codigo) {
  const passo = totp.verificarCodigo(totp.decifrar(row.segredo_cifrado), codigo);
  if (passo === null || passo <= row.ultimo_passo) return false;
  await MfaUsuarioDAO.registrarPasso(row.usuario_id, passo);
  return true;
}

/** Aceita o código do app ou um código de recuperação (consumido). */
async function conferirCodigoOuRecuperacao(row, codigo) {
  if (pareceRecuperacao(codigo)) {
    const ok = await MfaCodigoRecuperacaoDAO.consumir(row.usuario_id, hashRecuperacao(row.usuario_id, codigo));
    if (ok) {
      logger.audit('Código de recuperação do MFA usado', { userId: row.usuario_id });
      NotificacaoService.alertaSeguranca(row.usuario_id, {
        titulo: 'Código de recuperação usado',
        mensagem: 'Um dos seus códigos de recuperação da verificação em duas etapas foi usado para entrar. Se não foi você, troque sua senha agora.',
        link: '/perfil',
      });
    }
    return ok;
  }
  return conferirCodigo(row, codigo);
}

async function novosCodigos(usuarioId) {
  const codigos = Array.from({ length: QTD_CODIGOS }, gerarCodigoRecuperacao);
  await MfaCodigoRecuperacaoDAO.substituir(usuarioId, codigos.map((c) => hashRecuperacao(usuarioId, c)));
  return codigos;
}

class MfaService {
  static async ativo(usuarioId) {
    const row = await registro(usuarioId);
    return !!(row && row.ativo);
  }

  static async status({ usuarioId }) {
    const ativo = await MfaService.ativo(usuarioId);
    return {
      ativo,
      codigosRecuperacaoRestantes: ativo ? await MfaCodigoRecuperacaoDAO.contarDisponiveis(usuarioId) : 0,
    };
  }

  static async iniciar({ usuarioId, email }) {
    const atual = await registro(usuarioId);
    if (atual && atual.ativo) throw new BadRequestError('A verificação em duas etapas já está ativa.');
    const segredo = totp.gerarSegredo();
    await MfaUsuarioDAO.salvarPendente({ usuarioId, segredoCifrado: totp.cifrar(segredo) });
    return { segredo, otpauth: totp.uriOtpauth({ segredo, conta: email }) };
  }

  /** Liga o MFA e devolve uma sessão nova já marcada como `mfa` + códigos de recuperação. */
  static async ativar({ usuarioId, email, codigo, ip, userAgent }) {
    const row = await registro(usuarioId);
    if (!row) throw new BadRequestError('Inicie a configuração da verificação em duas etapas primeiro.');
    if (row.ativo) throw new BadRequestError('A verificação em duas etapas já está ativa.');
    if (!(await conferirCodigo(row, codigo))) throw new BadRequestError('Código inválido. Confira o horário do celular e tente de novo.');
    await MfaUsuarioDAO.ativar(usuarioId);
    const codigosRecuperacao = await novosCodigos(usuarioId);
    logger.audit('MFA ativado', { userId: usuarioId, ip });
    NotificacaoService.alertaSeguranca(usuarioId, {
      titulo: 'Verificação em duas etapas ativada',
      mensagem: 'A verificação em duas etapas foi ativada na sua conta. Guarde seus códigos de recuperação em local seguro.',
      link: '/perfil',
    });
    const token = await SessaoService.criar({ usuario: { id: usuarioId, email }, mfa: true, ip, userAgent });
    return { token, codigosRecuperacao };
  }

  static async desativar({ usuarioId, codigo, ip }) {
    const row = await registro(usuarioId);
    if (!row || !row.ativo) throw new BadRequestError('A verificação em duas etapas não está ativa.');
    if (!(await conferirCodigoOuRecuperacao(row, codigo))) throw new BadRequestError('Código inválido.');
    await MfaUsuarioDAO.delete(usuarioId);
    await MfaCodigoRecuperacaoDAO.apagar(usuarioId);
    logger.audit('MFA desativado', { userId: usuarioId, ip });
    NotificacaoService.alertaSeguranca(usuarioId, {
      titulo: 'Verificação em duas etapas desativada',
      mensagem: 'A verificação em duas etapas foi desativada na sua conta. Se não foi você, troque sua senha e reative-a.',
      link: '/perfil',
    });
  }

  /** Gera um novo conjunto de códigos de recuperação (os antigos deixam de valer). */
  static async regenerarCodigos({ usuarioId, codigo, ip }) {
    const row = await registro(usuarioId);
    if (!row || !row.ativo) throw new BadRequestError('A verificação em duas etapas não está ativa.');
    if (!(await conferirCodigo(row, codigo))) throw new BadRequestError('Código inválido.');
    const codigosRecuperacao = await novosCodigos(usuarioId);
    logger.audit('Códigos de recuperação do MFA regenerados', { userId: usuarioId, ip });
    return { codigosRecuperacao };
  }

  /** Troca o desafio do login (mfaToken) + código do autenticador (ou de recuperação) pela sessão. */
  static async concluirLogin({ mfaToken, codigo, ip, userAgent }) {
    let desafio;
    try {
      desafio = verificarDesafioMfa(mfaToken);
    } catch {
      throw new UnauthorizedError('A etapa de verificação expirou. Faça login novamente.');
    }
    const row = await registro(desafio.id);
    if (!row || !row.ativo) throw new UnauthorizedError('A etapa de verificação expirou. Faça login novamente.');
    if (!(await conferirCodigoOuRecuperacao(row, codigo))) {
      logger.warn('Código MFA incorreto no login', { userId: desafio.id, ip });
      throw new UnauthorizedError('Código de verificação incorreto.');
    }
    const user = await UsuarioDAO.findById(desafio.id);
    if (!user) throw new UnauthorizedError('A etapa de verificação expirou. Faça login novamente.');
    logger.info('Login concluído com MFA', { userId: user.id, ip });
    return {
      token: await SessaoService.criar({ usuario: user, mfa: true, ip, userAgent }),
      usuario: { id: user.id, nome: user.nome, sobrenome: user.sobrenome, email: user.email, telefone: user.telefone },
    };
  }
}

for (const metodo of ['ativo', 'status', 'iniciar', 'ativar', 'desativar', 'regenerarCodigos', 'concluirLogin']) {
  const original = MfaService[metodo];
  MfaService[metodo] = (...args) => runAsSystem(() => original.apply(MfaService, args));
}

module.exports = MfaService;
