/**
 * @file cronMiddleware.js
 * @description Protege endpoints acionados por tarefas agendadas (CRON).
 * Exige o cabeçalho `X-Cron-Secret` igual a CRON_SECRET. Em produção o
 * segredo é obrigatório; em desenvolvimento/testes, sem CRON_SECRET, libera.
 */

const crypto = require('crypto');
const { isProduction } = require('../config/seguranca');

function cronMiddleware(req, res, next) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    if (!isProduction()) return next();
    return res.status(403).json({ status: 'error', message: 'Tarefa agendada não configurada.' });
  }
  const enviado = Buffer.from(String(req.headers['x-cron-secret'] || ''));
  const esperado = Buffer.from(segredo);
  if (enviado.length !== esperado.length || !crypto.timingSafeEqual(enviado, esperado)) {
    return res.status(403).json({ status: 'error', message: 'Acesso negado.' });
  }
  return next();
}

module.exports = cronMiddleware;
