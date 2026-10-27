/**
 * @file validadores.js
 * @description Centralizador de funções de validação de dados de entrada do Agrostand.
 * Este arquivo reúne utilitários para validar formatos de strings importantes fornecidos
 * pelos usuários, como senhas fortes, endereços de e-mail e números de telefone.
 * 
 * Papel no fluxo de negócios:
 * - A validação de entrada é a primeira linha de defesa contra dados maliciosos, inconsistentes ou corrompidos.
 * - Ela impede que e-mails inválidos sejam cadastrados (o que quebraria o serviço de recuperação de senha),
 *   garante que o telefone do vendedor do WhatsApp possa ser formatado corretamente para links wa.me,
 *   e assegura que as senhas cadastradas tenham a complexidade mínima exigida para proteger as contas
 *   dos usuários contra ataques de força bruta.
 */

/**
 * Valida a força de uma senha de acordo com o Requisito do Sistema RS07.
 * Critérios obrigatórios:
 * - Pelo menos 8 caracteres.
 * - Pelo menos uma letra maiúscula.
 * - Pelo menos uma letra minúscula.
 * - Pelo menos um dígito numérico.
 * - Pelo menos um caractere especial (símbolo).
 * 
 * @param {string} password - Senha digitada pelo usuário no cadastro/alteração.
 * @returns {boolean} True se a senha atende a todos os critérios de segurança, caso contrário False.
 */
function validatePassword(password) {
  // Se a senha for nula, indefinida ou tiver comprimento inferior a 8, rejeita de imediato
  if (!password || password.length < 8) return false;
  
  // Utiliza expressões regulares (RegEx) para verificar a presença dos padrões obrigatórios:
  const hasUppercase = /[A-Z]/.test(password);     // Contém pelo menos uma letra maiúscula
  const hasLowercase = /[a-z]/.test(password);     // Contém pelo menos uma letra minúscula
  const hasDigit = /[0-9]/.test(password);         // Contém pelo menos um número (0-9)
  
  // Qualquer caractere que NÃO seja uma letra do alfabeto ou número é considerado especial.
  // O circunflexo '^' dentro de colchetes indica negação: tudo que não for A-Z, a-z ou 0-9.
  const hasSpecial = /[^A-Za-z0-9]/.test(password); 

  // A senha só será válida se passar em todos os cinco testes cumulativos
  return hasUppercase && hasLowercase && hasDigit && hasSpecial;
}

/**
 * Valida o formato de um endereço de e-mail.
 * 
 * @param {string} email - Endereço de e-mail enviado na requisição.
 * @returns {boolean} True se o formato do e-mail for válido, caso contrário False.
 */
function validateEmail(email) {
  if (!email) return false;
  
  // Expressão regular baseada na especificação simplificada do padrão RFC 5322.
  // Verifica se existe uma parte de usuário, o caractere '@', um domínio e uma extensão de domínio válida (ex: .com, .com.br).
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Valida o formato do telefone fornecido pelo usuário.
 * 
 * @param {string} phone - Telefone enviado no cadastro (geralmente formatado ou não).
 * @returns {boolean} True se o número de telefone contiver entre 10 e 15 dígitos numéricos limpos.
 */
function validatePhone(phone) {
  if (!phone) return false;
  
  // Limpa a string do telefone removendo tudo que não for número.
  // O modificador '\D' busca caracteres não-numéricos, e o flag 'g' garante a substituição global (todos).
  const digits = phone.replace(/\D/g, '');
  
  // Verifica se o comprimento está dentro dos limites aceitos no Brasil e internacionalmente.
  // 10 dígitos: (DDD de 2 dígitos) + 8 dígitos (fixo)
  // 11 dígitos: (DDD de 2 dígitos) + 9 dígitos (celular brasileiro)
  // 10 a 15 dígitos cobre números de telefone internacionais com códigos de país diversos.
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Valida CPF pelos dígitos verificadores (não consulta a Receita).
 * @param {string} cpf - com ou sem máscara
 */
function validateCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * Valida CNPJ pelos dígitos verificadores.
 * @param {string} cnpj - com ou sem máscara
 */
function validateCnpj(cnpj) {
  const d = String(cnpj || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (len) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/**
 * Formato do número do CAR (Cadastro Ambiental Rural): UF-IBGE(7)-32 hex,
 * ex.: MG-3152501-0F8E1C2B4A5D6E7F8091A2B3C4D5E6F7. Só confere o formato.
 */
function validateCar(car) {
  return /^[A-Z]{2}-\d{7}-[0-9A-F]{32}$/i.test(String(car || '').replace(/\./g, '').trim());
}

/** Link de vídeo aceito no perfil do produtor (YouTube ou Vimeo, https). */
function validateVideoUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  validatePassword,
  validateEmail,
  validatePhone,
  validateCpf,
  validateCnpj,
  validateCar,
  validateVideoUrl,
};
