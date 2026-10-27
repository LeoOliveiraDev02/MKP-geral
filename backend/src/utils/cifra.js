/**
 * @file cifra.js
 * @description Cifra de campos sensíveis guardados no banco (ex.: CPF/CNPJ da
 * verificação de produtor) com AES-256-GCM e IV aleatório por valor.
 *
 * Chave: DATA_ENCRYPTION_KEY (ou, na falta dela, MFA_ENCRYPTION_KEY/JWT_SECRET),
 * derivada com SHA-256 e um rótulo próprio — a mesma senha-mestra nunca é
 * usada direto para duas finalidades.
 *
 * Valores cifrados começam com `enc1:`; valores antigos em texto puro são
 * devolvidos como estão (migração gradual, sem quebrar dados existentes).
 */

const crypto = require('crypto');
const { jwtSecret } = require('../config/seguranca');

const PREFIXO = 'enc1:';

function chave() {
  const mestra = process.env.DATA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY || jwtSecret();
  return crypto.createHash('sha256').update(`agrostand:campos:${mestra}`).digest();
}

function cifrarCampo(texto) {
  if (texto === null || texto === undefined) return texto;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return PREFIXO + [iv, cipher.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

function decifrarCampo(valor) {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIXO)) return valor;
  const [iv, tag, dados] = valor.slice(PREFIXO.length).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8');
}

module.exports = { cifrarCampo, decifrarCampo };
