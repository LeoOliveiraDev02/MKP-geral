/**
 * @file adminMiddleware.js
 * @description Restringe rotas ao administrador do marketplace. Usar depois
 * do authMiddleware. Administradores são os e-mails listados em ADMIN_EMAILS
 * (separados por vírgula) no .env.
 *
 * MFA: a sessão precisa ter passado pela verificação em duas etapas (claim
 * `mfa` do JWT). Sempre exigido em produção; fora dela pode ser desligado com
 * ADMIN_MFA=off (nos testes automatizados vem desligado, salvo ADMIN_MFA=on).
 */

const { isProduction, isTest } = require('../config/seguranca');

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdmin(user) {
  return !!user && adminEmails().includes(String(user.email).toLowerCase());
}

function mfaObrigatorio() {
  if (isProduction()) return true;
  if (process.env.ADMIN_MFA === 'off') return false;
  if (isTest()) return process.env.ADMIN_MFA === 'on';
  return true;
}

function adminMiddleware(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ status: 'error', message: 'Acesso restrito à administração.' });
  }
  if (mfaObrigatorio() && !(req.auth && req.auth.mfa)) {
    return res.status(403).json({
      status: 'error',
      code: 'MFA_REQUIRED',
      message: 'A administração exige verificação em duas etapas. Ative-a ou entre novamente com o código do autenticador.',
    });
  }
  return next();
}

adminMiddleware.isAdmin = isAdmin;
adminMiddleware.mfaObrigatorio = mfaObrigatorio;

module.exports = adminMiddleware;
