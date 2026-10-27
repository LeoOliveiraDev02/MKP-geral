/**
 * @file urlBase.js
 * @description Endereço público da API (protocolo + host) a partir da
 * requisição HTTP. Usado pelos controllers para que os services recebam só
 * uma string, sem depender do objeto `req` do Express (camada HTTP).
 */

function urlBaseDaRequisicao(req) {
  const port = process.env.PORT || 3000;
  // Identifica se a requisição é segura (HTTPS), inclusive atrás de proxy
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  // Obtém o host atual (ex: localhost:3000 ou api.agrostand.com)
  const host = req.headers.host || `localhost:${port}`;
  return `${protocol}://${host}`;
}

module.exports = { urlBaseDaRequisicao };
