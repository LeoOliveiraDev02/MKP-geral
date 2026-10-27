/**
 * @file AutenticacaoController.js
 * @description Thin adapter HTTP: extrai entrada, delega ao AutenticacaoService
 * e monta o envelope de resposta. Erros de negócio (AppError) vão ao
 * errorMiddleware via next() — sem try/catch de regra aqui.
 *
 * Sessão: além do `token` no corpo (app nativo), grava o cookie HttpOnly de
 * sessão + cookie CSRF (navegador). Login de conta com MFA devolve só o
 * desafio (`mfaRequired` + `mfaToken`), sem sessão.
 */

const AutenticacaoService = require('../services/AutenticacaoService');
const MfaService = require('../services/MfaService');
const SessaoService = require('../services/SessaoService');
const { definirCookies, limparCookies } = require('../utils/sessao');
const adminMiddleware = require('../middlewares/adminMiddleware');

/** IP e navegador da requisição (registrados na sessão do servidor). */
const contexto = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') || '' });

/** Logout: além de apagar os cookies, pede ao navegador que limpe cache e cookies do site. */
function encerrarNoNavegador(res) {
  limparCookies(res);
  res.setHeader('Clear-Site-Data', '"cache", "cookies"');
}

/** Responde a sessão criada (cookies + envelope) ou o desafio MFA. */
function responderSessao(res, status, message, resultado) {
  if (resultado.mfaRequired) {
    return res.status(200).json({
      status: 'success',
      message: 'Informe o código do seu aplicativo autenticador.',
      data: { mfaRequired: true, mfaToken: resultado.mfaToken },
    });
  }
  const csrfToken = definirCookies(res, resultado.token);
  const { mfaToken, mfaRequired, ...data } = resultado;
  return res.status(status).json({ status: 'success', message, data: { ...data, csrfToken } });
}

class AutenticacaoController {
  static async register(req, res, next) {
    try {
      const { token, usuario } = await AutenticacaoService.register({ ...req.body, ...contexto(req) });
      return responderSessao(res, 201, 'Cadastro realizado com sucesso.', { token, usuario });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const resultado = await AutenticacaoService.login({ ...req.body, ...contexto(req) });
      return responderSessao(res, 200, 'Autenticação bem-sucedida.', resultado);
    } catch (error) {
      next(error);
    }
  }

  static async loginWithGoogle(req, res, next) {
    try {
      const resultado = await AutenticacaoService.loginWithGoogle({
        credential: req.body.credential,
        ...contexto(req),
      });
      const { novoUsuario } = resultado;
      return responderSessao(
        res,
        novoUsuario ? 201 : 200,
        novoUsuario ? 'Cadastro realizado com sucesso via Google.' : 'Autenticação bem-sucedida.',
        resultado
      );
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      await AutenticacaoService.forgotPassword(req.body);
      return res.status(200).json({
        status: 'success',
        message: 'Se o e-mail informado estiver cadastrado, um código de verificação será enviado.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      await AutenticacaoService.resetPassword({ ...req.body, ip: req.ip });
      return res.status(200).json({
        status: 'success',
        message: 'Senha redefinida com sucesso. Você já pode fazer login com a sua nova senha.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      await AutenticacaoService.logout({ token: req.token, userId: req.user.id, ip: req.ip });
      encerrarNoNavegador(res);
      return res.status(200).json({
        status: 'success',
        message: 'Sessão encerrada com sucesso.',
      });
    } catch (error) {
      next(error);
    }
  }

  // ─── Sessões ativas (dispositivos) ───

  /** GET /auth/sessions — sessões ativas da conta (a atual vem marcada). */
  static async listarSessoes(req, res, next) {
    try {
      const sessoes = await SessaoService.listar({ usuarioId: req.user.id, sessaoAtual: req.auth.jti });
      return res.status(200).json({ status: 'success', data: { sessoes } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /auth/sessions/:sessaoId — encerra uma sessão (outro aparelho). */
  static async encerrarSessao(req, res, next) {
    try {
      await SessaoService.revogar({ usuarioId: req.user.id, id: req.params.sessaoId, ip: req.ip });
      if (req.params.sessaoId === req.auth.jti) encerrarNoNavegador(res);
      return res.status(200).json({ status: 'success', message: 'Sessão encerrada.' });
    } catch (error) {
      next(error);
    }
  }

  /** POST /auth/logout-all — sai de todos os dispositivos (inclusive este). */
  static async logoutAll(req, res, next) {
    try {
      const total = await AutenticacaoService.logoutAll({ token: req.token, userId: req.user.id, ip: req.ip });
      encerrarNoNavegador(res);
      return res.status(200).json({
        status: 'success',
        message: 'Você saiu de todos os dispositivos.',
        data: { sessoesEncerradas: total },
      });
    } catch (error) {
      next(error);
    }
  }

  // ─── Verificação em duas etapas (TOTP) ───

  /** POST /auth/mfa/verify — conclui o login com o código do autenticador. */
  static async mfaVerify(req, res, next) {
    try {
      const resultado = await MfaService.concluirLogin({ ...req.body, ...contexto(req) });
      return responderSessao(res, 200, 'Autenticação bem-sucedida.', resultado);
    } catch (error) {
      next(error);
    }
  }

  /** GET /auth/mfa — MFA ativo? e a sessão atual passou pelo 2º fator? */
  static async mfaStatus(req, res, next) {
    try {
      const { ativo, codigosRecuperacaoRestantes } = await MfaService.status({ usuarioId: req.user.id });
      return res.status(200).json({
        status: 'success',
        data: {
          ativo,
          codigosRecuperacaoRestantes,
          sessaoVerificada: !!(req.auth && req.auth.mfa),
          // Admin sem 2º fator na sessão é barrado nas rotas /admin (front mostra a configuração).
          adminExigeMfa: adminMiddleware.isAdmin(req.user) && adminMiddleware.mfaObrigatorio(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /auth/mfa/setup — gera o segredo e a URI otpauth (ainda inativo). */
  static async mfaSetup(req, res, next) {
    try {
      const data = await MfaService.iniciar({ usuarioId: req.user.id, email: req.user.email });
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  /** POST /auth/mfa/enable — confirma o 1º código e troca a sessão por uma verificada. */
  static async mfaEnable(req, res, next) {
    try {
      const { token, codigosRecuperacao } = await MfaService.ativar({
        usuarioId: req.user.id,
        email: req.user.email,
        codigo: req.body.codigo,
        ...contexto(req),
      });
      // A sessão antiga (sem 2º fator) deixa de valer.
      await AutenticacaoService.logout({ token: req.token, userId: req.user.id, ip: req.ip });
      const csrfToken = definirCookies(res, token);
      return res.status(200).json({
        status: 'success',
        message: 'Verificação em duas etapas ativada.',
        data: { token, csrfToken, codigosRecuperacao },
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /auth/mfa/recovery-codes — novo conjunto de códigos (exige código do app). */
  static async mfaRegenerarCodigos(req, res, next) {
    try {
      const data = await MfaService.regenerarCodigos({ usuarioId: req.user.id, codigo: req.body.codigo, ip: req.ip });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ status: 'success', message: 'Novos códigos de recuperação gerados.', data });
    } catch (error) {
      next(error);
    }
  }

  /** POST /auth/mfa/disable — exige um código válido (do app ou de recuperação). */
  static async mfaDisable(req, res, next) {
    try {
      await MfaService.desativar({ usuarioId: req.user.id, codigo: req.body.codigo, ip: req.ip });
      return res.status(200).json({ status: 'success', message: 'Verificação em duas etapas desativada.' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AutenticacaoController;
