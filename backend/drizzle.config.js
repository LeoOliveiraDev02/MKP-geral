/**
 * Drizzle Kit — geração de migrations versionadas a partir de `src/db/schema.js`.
 * Uso:
 *   npm run db:generate  → gera SQL em ./drizzle
 *   npm run db:studio    → abre o Drizzle Studio
 *
 * O boot (`initializeDatabase`) já aplica `src/db/schema.sql` (DDL + RLS);
 * `db:push` não conhece as policies RLS — prefira o boot.
 * Migrations antigas do SQLite ficam em ./drizzle-sqlite-legado (histórico).
 */
require('dotenv').config({ quiet: true });

module.exports = {
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL,
  },
};
