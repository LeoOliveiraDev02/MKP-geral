/**
 * @file optionalAuthMiddleware.js
 * @description Autenticação opcional para rotas públicas que se beneficiam de
 * saber quem é o visitante (ex: registrar a visualização de um anúncio).
 * Com Bearer válido, segue como o usuário (req.user + contexto RLS); sem token
 * ou com token inválido/revogado, segue anônimo — nunca responde 401.
 */

const { lerToken, verificarSessao } = require('../utils/sessao');
const { runAsUser } = require('../db/context');
const SessaoService = require('../services/SessaoService');

async function optionalAuthMiddleware(req, res, next) {
  // Sem token, ou cookie sem CSRF válido em escrita: segue anônimo.
  const { token, csrfOk } = lerToken(req);
  if (!token || !csrfOk) return next();

  try {
    const decoded = verificarSessao(token);
    const { user } = await SessaoService.autenticar({ decoded, token });
    if (!user) return next();
    req.user = user;
    req.auth = decoded;
    return runAsUser(user.id, next);
  } catch {
    return next();
  }
}

module.exports = optionalAuthMiddleware;
