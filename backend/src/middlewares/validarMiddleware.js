/**
 * @file validarMiddleware.js
 * @description Validação de entrada com schema (zod) antes do controller.
 *
 * Os schemas validam FORMA: tipos, tamanhos máximos, enums e ids numéricos.
 * Campos desconhecidos são descartados (proteção contra mass assignment).
 * A obrigatoriedade e as regras de negócio continuam nos services, com as
 * mensagens que o front já conhece.
 */

const { z } = require('zod');

function descreverErro(error) {
  const issue = error.issues[0];
  const campo = issue.path.join('.') || 'corpo';
  return `Dados inválidos (${campo}): ${issue.message}`;
}

/**
 * @param {{body?: z.ZodType, params?: z.ZodType, query?: z.ZodType}} schemas
 */
function validar(schemas) {
  return (req, res, next) => {
    for (const parte of ['params', 'query', 'body']) {
      const schema = schemas[parte];
      if (!schema) continue;
      const resultado = schema.safeParse(req[parte] ?? {});
      if (!resultado.success) {
        return res.status(400).json({ status: 'error', message: descreverErro(resultado.error) });
      }
      // Express 5: req.query é getter somente-leitura → sobrescreve a propriedade.
      if (parte === 'query') {
        Object.defineProperty(req, 'query', { value: resultado.data, writable: true, configurable: true });
      } else {
        req[parte] = resultado.data;
      }
    }
    return next();
  };
}

module.exports = validar;
