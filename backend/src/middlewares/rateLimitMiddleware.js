/**
 * @file rateLimitMiddleware.js
 * @description Limites de requisições por IP (express-rate-limit), em camadas:
 * - `apiLimiter`: teto geral de /api (protege contra scraping e abuso);
 * - `authLimiter`: login, cadastro, Google, MFA e recuperação de senha
 *   (força bruta / credential stuffing). Soma-se ao bloqueio por e-mail (RN19);
 * - `escritaLimiter`: ações que geram conteúdo para outras pessoas (chat,
 *   cotações, perguntas, reclamações) — anti-spam.
 *
 * Os tetos vêm do .env (RATE_LIMIT_*). Nos testes automatizados ficam
 * desligados, exceto quando RATE_LIMIT_TESTS=on (teste do próprio limite).
 * Atrás de proxy/Cloudflare, configure TRUST_PROXY para o IP real valer.
 */

const { rateLimit } = require('express-rate-limit');
const { isTest } = require('../config/seguranca');

const MINUTO = 60 * 1000;

function numeroEnv(nome, padrao) {
  const v = parseInt(process.env[nome] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

function criar({ janelaMs, limiteEnv, limitePadrao, mensagem }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: () => numeroEnv(limiteEnv, limitePadrao),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => isTest() && process.env.RATE_LIMIT_TESTS !== 'on',
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({ status: 'error', message: mensagem });
    },
  });
}

const apiLimiter = criar({
  janelaMs: MINUTO,
  limiteEnv: 'RATE_LIMIT_API',
  limitePadrao: 300,
  mensagem: 'Muitas requisições. Aguarde um instante e tente novamente.',
});

const authLimiter = criar({
  janelaMs: 15 * MINUTO,
  limiteEnv: 'RATE_LIMIT_AUTH',
  limitePadrao: 20,
  mensagem: 'Muitas tentativas de acesso. Tente novamente em alguns minutos.',
});

const escritaLimiter = criar({
  janelaMs: MINUTO,
  limiteEnv: 'RATE_LIMIT_ESCRITA',
  limitePadrao: 30,
  mensagem: 'Você está enviando muito rápido. Aguarde um instante.',
});

module.exports = { apiLimiter, authLimiter, escritaLimiter };
