/**
 * @file totp.js
 * @description TOTP (RFC 6238) compatível com Google Authenticator, Authy,
 * Microsoft Authenticator etc. — HMAC-SHA1, 6 dígitos, passo de 30 s — e
 * cifra AES-256-GCM do segredo guardado no banco.
 */

const crypto = require('crypto');
const { jwtSecret } = require('../config/seguranca');

const PASSO_S = 30;
const DIGITOS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

function base32Decode(texto) {
  const limpo = String(texto).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of limpo) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) throw new Error('Segredo base32 inválido.');
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function gerarSegredo() {
  return base32Encode(crypto.randomBytes(20));
}

function codigoNoPasso(segredo, passo) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = crypto.createHmac('sha1', base32Decode(segredo)).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binario = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITOS;
  return String(binario).padStart(DIGITOS, '0');
}

function passoAtual(agoraMs = Date.now()) {
  return Math.floor(agoraMs / 1000 / PASSO_S);
}

/**
 * Confere o código aceitando ±1 passo (relógio do celular adiantado/atrasado).
 * @returns {number|null} o passo que casou (para bloquear reuso) ou null
 */
function verificarCodigo(segredo, codigo, agoraMs = Date.now()) {
  const limpo = String(codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpo)) return null;
  const atual = passoAtual(agoraMs);
  for (const delta of [0, -1, 1]) {
    const esperado = codigoNoPasso(segredo, atual + delta);
    if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(limpo))) return atual + delta;
  }
  return null;
}

/** URI para o app autenticador (pode virar QR code no front). */
function uriOtpauth({ segredo, conta, emissor = 'AgroMundo' }) {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_S}`;
}

// ─── Cifra do segredo em repouso ───
function chave() {
  return crypto.createHash('sha256').update(process.env.MFA_ENCRYPTION_KEY || jwtSecret()).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

function decifrar(pacote) {
  const [iv, tag, dados] = String(pacote).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8');
}

module.exports = {
  gerarSegredo,
  verificarCodigo,
  codigoNoPasso,
  passoAtual,
  uriOtpauth,
  cifrar,
  decifrar,
};
