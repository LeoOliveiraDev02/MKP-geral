/**
 * @file api/index.js
 * @description Entrada da API como função serverless na Vercel.
 * Faz o mesmo que src/server.js, sem `listen`: valida o ambiente, conecta ao
 * PostgreSQL uma vez por instância (cold start) e entrega as requisições ao Express.
 * O DDL/RLS do banco é aplicado fora daqui (npm run db:init), por isso a
 * Vercel não recebe DATABASE_ADMIN_URL.
 */

require('../src/config/seguranca').validarAmbiente();

const app = require('../src/app');
const { initializeDatabase } = require('../src/db');

let pronto = null;

module.exports = async (req, res) => {
  if (!pronto) {
    pronto = initializeDatabase().catch((erro) => {
      pronto = null; // tenta de novo na próxima requisição
      throw erro;
    });
  }
  try {
    await pronto;
  } catch (erro) {
    console.error('Falha ao conectar ao banco', erro);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'error', message: 'Serviço indisponível. Tente novamente.' }));
  }
  return app(req, res);
};
