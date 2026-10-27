/**
 * @file optionalAuthMiddleware.js
 * @description Autenticação opcional para rotas públicas que se beneficiam de
 * saber quem é o visitante (ex: registrar a visualização de um anúncio).
 * Com Bearer válido, segue como o usuário (req.user + contexto RLS); sem token
 * ou com token inválido/revogado, segue anônimo — nunca responde 401.
 */

const { lerToken, verificarSessao } = require('../utils/sessao');
const UsuarioDAO = require('../dao/UsuarioDAO');
const TokenRevogadoDAO = require('../dao/TokenRevogadoDAO');
const { hashToken } = require('../utils/tokens');
const { runAsUser, runAsSystem } = require('../db/context');
const SessaoService = require('../services/SessaoService');

async function optionalAuthMiddleware(req, res, next) {
  // Sem token, ou cookie sem CSRF válido em escrita: segue anônimo.
  const { token, csrfOk } = lerToken(req);
  if (!token || !csrfOk) return next();

  try {
    const decoded = verificarSessao(token);
    const revogado = await runAsSystem(() => TokenRevogadoDAO.existePorHash(hashToken(token)));
    if (revogado || !(await SessaoService.validar(decoded))) return next();
    const user = await runAsUser(decoded.id, () => UsuarioDAO.findById(decoded.id));
    if (!user) return next();
    req.user = user;
    req.auth = decoded;
    return runAsUser(user.id, next);
  } catch {
    return next();
  }
}

module.exports = optionalAuthMiddleware;
