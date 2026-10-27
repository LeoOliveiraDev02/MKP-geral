/**
 * @file senha.js
 * @description Hash de senhas com bcrypt. Custo padrão 12 (OWASP: ≥ 10),
 * ajustável por BCRYPT_ROUNDS.
 *
 * Formato novo: a senha passa antes por HMAC-SHA256 (chave = PASSWORD_PEPPER,
 * guardada fora do banco) e o resultado em base64 vai para o bcrypt. Isso:
 * - elimina o limite de 72 bytes do bcrypt (senhas longas valem por inteiro);
 * - com pepper, um dump do banco sozinho não permite testar senhas offline.
 *
 * Prefixos gravados no hash:
 * - `$agp1$` → HMAC com PASSWORD_PEPPER
 * - `$agh1$` → HMAC sem pepper (PASSWORD_PEPPER não configurado)
 * - sem prefixo → bcrypt puro (contas antigas)
 * Hashes antigos continuam válidos e são migrados no próximo login.
 *
 * ⚠ Trocar ou apagar PASSWORD_PEPPER invalida todas as senhas `$agp1$`.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { isTest } = require('../config/seguranca');

const PREFIXO_PEPPER = '$agp1$';
const PREFIXO_SEM_PEPPER = '$agh1$';

function rounds() {
  const v = parseInt(process.env.BCRYPT_ROUNDS || '', 10);
  if (Number.isFinite(v) && v >= 4 && v <= 15) return v;
  return isTest() ? 8 : 12;
}

const pepper = () => process.env.PASSWORD_PEPPER || '';

function preHash(senha, comPepper) {
  return crypto
    .createHmac('sha256', comPepper ? pepper() : 'agrostand-sem-pepper')
    .update(String(senha).normalize('NFC'), 'utf8')
    .digest('base64');
}

async function hashSenha(senha) {
  const comPepper = !!pepper();
  const hash = await bcrypt.hash(preHash(senha, comPepper), rounds());
  return (comPepper ? PREFIXO_PEPPER : PREFIXO_SEM_PEPPER) + hash;
}

/** Compara em tempo constante (bcrypt) aceitando os três formatos. */
function verificarSenha(senha, hashGravado) {
  if (typeof senha !== 'string' || typeof hashGravado !== 'string') return false;
  if (hashGravado.startsWith(PREFIXO_PEPPER)) {
    if (!pepper()) return false;
    return bcrypt.compareSync(preHash(senha, true), hashGravado.slice(PREFIXO_PEPPER.length));
  }
  if (hashGravado.startsWith(PREFIXO_SEM_PEPPER)) {
    return bcrypt.compareSync(preHash(senha, false), hashGravado.slice(PREFIXO_SEM_PEPPER.length));
  }
  return bcrypt.compareSync(senha, hashGravado);
}

/** O hash deve ser refeito no login? (formato antigo, sem pepper disponível ou custo menor) */
function precisaRehash(hashGravado) {
  const h = String(hashGravado || '');
  const esperado = pepper() ? PREFIXO_PEPPER : PREFIXO_SEM_PEPPER;
  if (!h.startsWith(esperado)) return true;
  try {
    return bcrypt.getRounds(h.slice(esperado.length)) < rounds();
  } catch {
    return true;
  }
}

// Hash de uma senha qualquer, usado quando o e-mail não existe: o login leva
// o mesmo tempo com ou sem conta (evita descobrir e-mails cadastrados pelo tempo).
const HASH_FICTICIO = bcrypt.hashSync('senha-ficticia-anti-enumeracao', 10);

function compararFicticio(senha) {
  bcrypt.compareSync(String(senha), HASH_FICTICIO);
  return false;
}

module.exports = { hashSenha, verificarSenha, precisaRehash, compararFicticio };
