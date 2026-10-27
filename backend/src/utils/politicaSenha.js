/**
 * @file politicaSenha.js
 * @description Regras para senhas NOVAS (cadastro, troca e redefinição),
 * além do formato básico de `validatePassword` (RS07):
 * - até 128 caracteres (qualquer caractere Unicode; o hash usa HMAC antes do
 *   bcrypt, então nada é truncado);
 * - recusa senhas óbvias (palavra comum + números/símbolos, ex.: Senha@123);
 * - recusa senhas que contêm o e-mail ou o nome da pessoa;
 * - recusa senhas que já apareceram em vazamentos (Have I Been Pwned, modelo
 *   k-anonymity: só os 5 primeiros caracteres do SHA-1 saem do servidor).
 *
 * A consulta ao HIBP é "fail-open": se o serviço não responder em 3 s, a
 * senha segue (o cadastro não depende de terceiros). Desligue com
 * PASSWORD_BREACH_CHECK=off. Nos testes automatizados fica desligada.
 */

const crypto = require('crypto');
const logger = require('./logger');
const { isTest } = require('../config/seguranca');
const { BadRequestError } = require('../errors/AppError');

const TAMANHO_MAXIMO = 128;

// Palavras-base das senhas mais usadas no Brasil e no mundo. A senha é
// reduzida às letras (sem números/símbolos e com leetspeak desfeito) e
// comparada com esta lista.
const PALAVRAS_COMUNS = new Set([
  'senha', 'password', 'passw', 'pass', 'admin', 'administrador', 'root', 'user', 'usuario', 'teste', 'test',
  'mudar', 'mudarsenha', 'trocar', 'acesso', 'entrar', 'login', 'qwerty', 'qwertyuiop', 'asdf', 'asdfgh', 'zxcvbn',
  'abc', 'abcd', 'abcde', 'abcdef', 'abc', 'aaa', 'aaaa', 'iloveyou', 'loveyou', 'teamo', 'amor', 'welcome',
  'bemvindo', 'brasil', 'brazil', 'flamengo', 'corinthians', 'palmeiras', 'saopaulo', 'vasco', 'gremio',
  'cruzeiro', 'santos', 'botafogo', 'fluminense', 'internacional', 'atletico', 'jesus', 'deus', 'familia',
  'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football', 'futebol', 'shadow', 'superman', 'batman',
  'agromundo', 'agrostand', 'agro', 'fazenda', 'produtor', 'cliente', 'mercado', 'marketplace', 'empresa',
  'gabriel', 'lucas', 'pedro', 'maria', 'ana', 'joao', 'jose', 'mateus', 'rafael', 'daniel', 'bruno',
  'secret', 'segredo', 'default', 'padrao', 'changeme', 'letmein', 'trustno', 'hello', 'ola', 'oi',
]);

function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Desfaz substituições comuns (P@ssw0rd → password) e remove o que não é letra. */
function nucleoDeLetras(senha) {
  return normalizar(senha)
    .replace(/^[^a-z]+|[^a-z]+$/g, '') // números/símbolos nas pontas não contam (Senha@123 → senha)
    .replace(/@/g, 'a').replace(/4/g, 'a').replace(/3/g, 'e').replace(/1/g, 'i').replace(/!/g, 'i')
    .replace(/0/g, 'o').replace(/\$/g, 's').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

function ehComum(senha) {
  const nucleo = nucleoDeLetras(senha);
  const soLetras = normalizar(senha).replace(/[^a-z]/g, '');
  if (!soLetras || soLetras.length < 3) return true; // ex.: Ab@12345678
  if (/^(.)\1+$/.test(soLetras)) return true; // aaaa, zzzz
  return PALAVRAS_COMUNS.has(nucleo) || PALAVRAS_COMUNS.has(soLetras);
}

function contemDadosPessoais(senha, { email, nome, sobrenome } = {}) {
  const alvo = normalizar(senha);
  const partes = [
    email ? normalizar(String(email).split('@')[0]) : '',
    nome ? normalizar(nome) : '',
    sobrenome ? normalizar(sobrenome) : '',
  ].filter((p) => p.length >= 4);
  return partes.some((p) => alvo.includes(p));
}

/** Quantas vezes a senha aparece em vazamentos (0 = nunca; null = não foi possível consultar). */
async function vezesVazada(senha) {
  const sha1 = crypto.createHash('sha1').update(String(senha), 'utf8').digest('hex').toUpperCase();
  const prefixo = sha1.slice(0, 5);
  const sufixo = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'AgroMundo-PasswordCheck' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const corpo = await res.text();
    for (const linha of corpo.split('\n')) {
      const [suf, qtd] = linha.trim().split(':');
      if (suf === sufixo) return parseInt(qtd, 10) || 0;
    }
    return 0;
  } catch (err) {
    logger.warn('Consulta de senha vazada indisponível (seguindo sem ela)', { erro: err.message });
    return null;
  }
}

function checagemVazamentoAtiva() {
  // Testes não dependem de rede (o .env de dev pode estar com a checagem ligada).
  if (isTest()) return process.env.PASSWORD_BREACH_CHECK_TESTS === 'on';
  return (process.env.PASSWORD_BREACH_CHECK || 'on').toLowerCase() !== 'off';
}

/**
 * Valida uma senha nova além do formato básico.
 * @throws {BadRequestError}
 */
async function verificarSenhaNova(senha, dadosPessoais = {}) {
  if (typeof senha !== 'string') throw new BadRequestError('Senha inválida.');
  if (senha.length > TAMANHO_MAXIMO) {
    throw new BadRequestError(`A senha pode ter no máximo ${TAMANHO_MAXIMO} caracteres.`);
  }
  if (ehComum(senha)) {
    throw new BadRequestError('Essa senha é muito comum e fácil de adivinhar. Escolha outra (dica: use uma frase).');
  }
  if (contemDadosPessoais(senha, dadosPessoais)) {
    throw new BadRequestError('A senha não pode conter seu nome ou seu e-mail.');
  }
  if (checagemVazamentoAtiva()) {
    const vezes = await vezesVazada(senha);
    if (vezes && vezes > 0) {
      throw new BadRequestError('Essa senha já apareceu em vazamentos de dados na internet. Escolha outra.');
    }
  }
}

module.exports = { verificarSenhaNova, ehComum, contemDadosPessoais, vezesVazada, TAMANHO_MAXIMO };
