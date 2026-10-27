/**
 * @file errorMiddleware.js
 * @description @ControllerAdvice da aplicação: traduz erros de negócio
 * (`AppError` com `expose`, lançados pelos Services) para o envelope legado
 * `{status:'error', message}` com o HTTP code correspondente. Erros
 * inesperados seguem como 500 no formato detalhado.
 */

// Importa a instância personalizada de logger (usando winston ou similar) para persistir e exibir logs formatados de erro.
const logger = require('../utils/logger');

/**
 * Função de middleware para interceptar e formatar respostas de erro enviadas ao cliente.
 * 
 * @param {Error|Object} err - O objeto de erro lançado ou passado via next(err).
 * @param {Object} req - Objeto de requisição do Express.
 * @param {Object} res - Objeto de resposta do Express.
 * @param {Function} next - Função callback do Express (obrigatório na assinatura, mesmo se não invocado).
 */
function errorMiddleware(err, req, res, next) {
  // Erros do Multer (arquivo grande demais, campo inesperado...) são do cliente.
  if (err && err.name === 'MulterError') {
    const mensagens = {
      LIMIT_FILE_SIZE: 'A imagem excede o tamanho limite de 10 MB.',
      LIMIT_FILE_COUNT: 'Arquivos demais no envio.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado ou arquivos demais.',
    };
    return res.status(400).json({ status: 'error', message: mensagens[err.code] || 'Upload inválido.' });
  }

  // Erro de negócio esperado (Service): envelope legado, sem stack, log como WARN.
  if (err && err.expose && err.status && err.status < 500) {
    logger.warn(`Business error ${err.status} during ${req.method} ${req.originalUrl}`, {
      status: err.status,
      message: err.message,
      ip: req.ip,
      userId: req.user ? req.user.id : null
    });
    return res.status(err.status).json({
      status: 'error',
      message: err.message || 'Erro na requisição.'
    });
  }

  // Define o status HTTP padrão como 500 (Erro Interno do Servidor) caso nenhum status específico tenha sido fornecido.
  const status = err.status || 500;
  
  // Em produção, erros internos (5xx) nunca expõem a mensagem original
  // (pode conter SQL, caminhos de arquivo, nomes de tabela...).
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Ocorreu um erro interno no servidor.'
    : err.message || 'Ocorreu um erro interno no servidor.';

  // Registra o erro utilizando o logger estruturado.
  // Grava informações contextuais essenciais, como método HTTP, URL acessada, endereço de IP e ID do usuário autenticado.
  logger.error(`Error during request to ${req.method} ${req.originalUrl}`, err, {
    requestId: req.id,
    status,
    ip: req.ip,
    userId: req.user ? req.user.id : null
  });

  // Retorna a resposta HTTP formatada em JSON com detalhes estruturados do erro.
  res.status(status).json({
    status: 'error',
    statusCode: status,
    message: message,
    // Id para o suporte achar o erro nos logs sem expor detalhes ao usuário.
    requestId: req.id,
    // Em ambiente de desenvolvimento, inclui o stack trace completo (pilha de chamadas) para facilitar o debug.
    // Em produção, o stack trace é omitido (retorna undefined) por questões de segurança e privacidade do código.
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

// Exporta o middleware de erro para ser registrado no arquivo principal da aplicação (geralmente app.js ou server.js) como o último middleware.
module.exports = errorMiddleware;

