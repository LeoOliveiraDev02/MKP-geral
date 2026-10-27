/**
 * Aplica schema, policies RLS, role da API e categorias no banco apontado por
 * DATABASE_URL / DATABASE_ADMIN_URL (ex: o Postgres da Vercel). Idempotente.
 * Uso: npm run db:init (com as variáveis no ambiente ou no .env)
 */
require('dotenv').config({ quiet: true });
const { initializeDatabase, closeDatabase } = require('../src/db');

initializeDatabase()
  .then(() => closeDatabase())
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
