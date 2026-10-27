/**
 * @file sessao.js
 * @description Emissão e leitura da sessão (JWT).
 *
 * Dois transportes para o mesmo token:
 * - Web: cookie HttpOnly + Secure + SameSite (`agrostand_session`). Para
 *   requisições que alteram dados exige o cabeçalho `X-CSRF-Token` igual ao
 *   cookie `agrostand_csrf` (double submit) — um site de terceiros não
 *   consegue ler esse cookie para forjar o cabeçalho.
 * - App nativo (Capacitor) e integrações: `Authorization: Bearer <jwt>`
 *   (não sofre CSRF, pois o navegador não anexa o cabeçalho sozinho).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  jwtSecret,
  nomeCookieSessao,
  COOKIE_CSRF,
  opcoesCookieSessao,
  opcoesCookieCsrf,
  cookieBase,
} = require('../config/seguranca');

const DURACAO_SESSAO_MS = 24 * 60 * 60 * 1000;

// Algoritmo, emissor e público fixos: um token assinado com outro algoritmo
// (ex.: `none`, RS256 com a chave como segredo) ou emitido para outro fim é recusado.
const JWT_OPCOES = { algorithm: 'HS256', issuer: 'agrostand', audience: 'agrostand-api' };
const JWT_VERIFICACAO = { algorithms: ['HS256'], issuer: 'agrostand', audience: 'agrostand-api' };
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Assina o JWT de sessão. `mfa: true` marca sessões que passaram pelo
 * segundo fator (exigido nas rotas de administração).
 */
function assinarSessao({ id, email, mfa = false, jti = crypto.randomUUID() }) {
  return jwt.sign(
    // jti = id da linha em "Sessao" (o logout revoga só a sessão usada).
    { id, email, jti, ...(mfa ? { mfa: true } : {}) },
    jwtSecret(),
    { ...JWT_OPCOES, expiresIn: '24h' }
  );
}

/** Token curto que só serve para concluir o login com o código do autenticador. */
function assinarDesafioMfa(id) {
  return jwt.sign({ id, purpose: 'mfa', jti: crypto.randomUUID() }, jwtSecret(), { ...JWT_OPCOES, expiresIn: '5m' });
}

/** Verifica um JWT de sessão; tokens de propósito especial (desafio MFA) não valem como sessão. */
function verificarSessao(token) {
  const decoded = jwt.verify(token, jwtSecret(), JWT_VERIFICACAO);
  if (decoded.purpose) throw new Error('Token não é de sessão.');
  return decoded;
}

function verificarDesafioMfa(token) {
  const decoded = jwt.verify(token, jwtSecret(), JWT_VERIFICACAO);
  if (decoded.purpose !== 'mfa') throw new Error('Token não é de desafio MFA.');
  return decoded;
}

/**
 * Grava os cookies de sessão (HttpOnly) e CSRF na resposta.
 * @returns {string} o token CSRF (também devolvido no corpo do login, para o
 * front em outro subdomínio, que não consegue ler o cookie da API)
 */
function definirCookies(res, token) {
  const csrf = crypto.randomBytes(32).toString('hex');
  res.cookie(nomeCookieSessao(), token, opcoesCookieSessao(DURACAO_SESSAO_MS));
  res.cookie(COOKIE_CSRF, csrf, opcoesCookieCsrf(DURACAO_SESSAO_MS));
  return csrf;
}

function limparCookies(res) {
  res.clearCookie(nomeCookieSessao(), { ...cookieBase(), httpOnly: true });
  res.clearCookie(COOKIE_CSRF, cookieBase());
}

function iguaisEmTempoConstante(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Extrai o token da requisição.
 * @returns {{token: string|null, origem: 'bearer'|'cookie'|null, csrfOk: boolean}}
 */
function lerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return { token: authHeader.slice(7).trim(), origem: 'bearer', csrfOk: true };
  }
  const token = req.cookies && req.cookies[nomeCookieSessao()];
  if (!token) return { token: null, origem: null, csrfOk: true };

  if (METODOS_SEGUROS.has(req.method)) return { token, origem: 'cookie', csrfOk: true };
  const cookieCsrf = req.cookies[COOKIE_CSRF];
  const headerCsrf = req.headers['x-csrf-token'];
  const csrfOk = !!cookieCsrf && !!headerCsrf && iguaisEmTempoConstante(cookieCsrf, headerCsrf);
  return { token, origem: 'cookie', csrfOk };
}

module.exports = {
  DURACAO_SESSAO_MS,
  assinarSessao,
  assinarDesafioMfa,
  verificarSessao,
  verificarDesafioMfa,
  definirCookies,
  limparCookies,
  lerToken,
};
