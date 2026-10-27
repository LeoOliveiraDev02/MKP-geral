/**
 * @file seguranca.js
 * @description Configuração central de segurança lida do ambiente (.env):
 * segredo do JWT, cookies de sessão, origens de CORS, proxy confiável e
 * checagem de variáveis obrigatórias em produção (o servidor nem sobe com
 * segredo fraco ou ausente).
 */

const isProduction = () => process.env.NODE_ENV === 'production';
const isTest = () => process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT;

const SEGREDO_DEV = 'dev-only-secret-nao-use-em-producao';

/** Segredo de assinatura dos JWT. Em produção, ausente = erro (sem fallback). */
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction()) throw new Error('JWT_SECRET não definido em produção.');
  return SEGREDO_DEV;
}

// ─── Cookies de sessão (web) ───
// O JWT viaja num cookie HttpOnly (inacessível a JavaScript → XSS não rouba a
// sessão). O cookie CSRF não é HttpOnly: o front lê e devolve no cabeçalho
// X-CSRF-Token (double submit) em requisições que alteram dados.
const COOKIE_SESSAO = 'agrostand_session';
const COOKIE_CSRF = 'agrostand_csrf';

/**
 * Em produção, sem COOKIE_DOMAIN, o cookie de sessão usa o prefixo `__Host-`:
 * o navegador só o aceita com Secure, Path=/ e sem Domain (um subdomínio
 * comprometido não consegue sobrescrevê-lo). O cookie CSRF mantém o nome,
 * pois o front o lê.
 */
function nomeCookieSessao() {
  return isProduction() && !process.env.COOKIE_DOMAIN ? `__Host-${COOKIE_SESSAO}` : COOKIE_SESSAO;
}

function cookieBase() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'strict').toLowerCase();
  return {
    secure: isProduction() || process.env.COOKIE_SECURE === 'on' || sameSite === 'none',
    sameSite,
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

function opcoesCookieSessao(maxAgeMs) {
  return { ...cookieBase(), httpOnly: true, maxAge: maxAgeMs };
}

function opcoesCookieCsrf(maxAgeMs) {
  return { ...cookieBase(), httpOnly: false, maxAge: maxAgeMs };
}

// ─── CORS ───
// Lista explícita (CORS_ORIGINS, separadas por vírgula). Em desenvolvimento,
// sem a variável, libera só o front local e o app Capacitor.
const ORIGENS_DEV = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

function origensPermitidas() {
  const lista = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (lista.length) return lista;
  if (isProduction()) return [];
  const front = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, '')] : [];
  return [...new Set([...front, ...ORIGENS_DEV])];
}

/**
 * Valor do `trust proxy` do Express. Atrás do Cloudflare/Render há 1+ proxies;
 * sem isso, req.ip seria o do proxy (rate limit inútil) e req.secure falso.
 */
function trustProxy() {
  const v = process.env.TRUST_PROXY;
  if (v === undefined || v === '') return isProduction() ? 1 : false;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}

/**
 * Falha cedo (no boot) quando a configuração de produção é insegura.
 * @throws {Error} lista de problemas encontrados
 */
function validarAmbiente() {
  if (!isProduction()) return;
  const problemas = [];
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32 || /your_jwt_secret|secret_key_default|test-secret/.test(secret)) {
    problemas.push('JWT_SECRET deve ter ao menos 32 caracteres aleatórios (gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))").');
  }
  if (!process.env.CORS_ORIGINS) problemas.push('CORS_ORIGINS precisa listar as origens do front (ex: https://agromundo.com.br).');
  if (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.length < 32) {
    problemas.push('MFA_ENCRYPTION_KEY precisa ter ao menos 32 caracteres (cifra os segredos TOTP do admin).');
  }
  if (!process.env.PASSWORD_PEPPER || process.env.PASSWORD_PEPPER.length < 32) {
    problemas.push('PASSWORD_PEPPER precisa ter ao menos 32 caracteres (segredo extra do hash de senha; NUNCA troque depois de definido).');
  }
  if (process.env.MFA_ENCRYPTION_KEY && process.env.MFA_ENCRYPTION_KEY === process.env.JWT_SECRET) {
    problemas.push('MFA_ENCRYPTION_KEY deve ser diferente de JWT_SECRET (chaves separadas por finalidade).');
  }
  if (process.env.PAGAMENTO_SIMULADO === 'on') {
    problemas.push('PAGAMENTO_SIMULADO=on não é permitido em produção (o comprador marcaria o próprio pedido como pago).');
  }
  if (problemas.length) {
    throw new Error(`Configuração insegura para produção:\n- ${problemas.join('\n- ')}`);
  }
}

/**
 * Pagamento simulado (comprador clica em "pagar"): ligado em dev/teste para
 * demonstração, sempre desligado em produção — lá só o webhook confirma.
 */
function pagamentoSimulado() {
  if (isProduction()) return false;
  return process.env.PAGAMENTO_SIMULADO !== 'off';
}

module.exports = {
  isProduction,
  isTest,
  jwtSecret,
  COOKIE_SESSAO,
  COOKIE_CSRF,
  nomeCookieSessao,
  opcoesCookieSessao,
  opcoesCookieCsrf,
  cookieBase,
  origensPermitidas,
  trustProxy,
  validarAmbiente,
  pagamentoSimulado,
};
