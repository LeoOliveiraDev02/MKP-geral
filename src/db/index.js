/**
 * @file index.js (src/db)
 * @description Conexão Drizzle ORM (node-postgres) + inicialização do banco.
 *
 * - Duas credenciais:
 *   `DATABASE_URL`       → role da API (sem superuser/BYPASSRLS): sujeito ao RLS.
 *   `DATABASE_ADMIN_URL` → dono das tabelas: cria banco/role, DDL, policies e seed
 *                          no boot (`initializeDatabase`). Nunca atende requisições.
 * - Toda conexão retirada do pool recebe o contexto RLS atual (`app.user_id`,
 *   `app.system`) — ver `src/db/context.js`.
 * - Transações via `await db.transaction(async (tx) => ...)`.
 */

const fs = require('fs');
const path = require('path');
const { Pool, Client, escapeIdentifier, escapeLiteral } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { count } = require('drizzle-orm');
const schema = require('./schema');
const { currentContext, runAsSystem } = require('./context');

/** Aplica o contexto RLS da cadeia assíncrona atual na conexão. */
async function applyContext(client) {
  const { userId, system } = currentContext();
  await client.query(
    "SELECT set_config('app.user_id', $1, false), set_config('app.system', $2, false)",
    [userId, system ? 'on' : '']
  );
}

/**
 * Pool que reaplica o contexto RLS a cada checkout. As GUCs são de sessão e
 * sobrescritas em todo checkout, então nada vaza entre requisições.
 */
class RlsPool extends Pool {
  async connect(...args) {
    // Forma com callback é usada internamente pelo pg-pool
    if (args.length) return super.connect(...args);
    const client = await super.connect();
    try {
      await applyContext(client);
    } catch (err) {
      client.release(err);
      throw err;
    }
    return client;
  }

  async query(...args) {
    const client = await this.connect();
    try {
      return await client.query(...args);
    } finally {
      client.release();
    }
  }
}

let pool = null;
let db = null;

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');
  return url;
}

function getDb() {
  if (db) return db;
  pool = new RlsPool({ connectionString: databaseUrl() });
  db = drizzle(pool, { schema });
  return db;
}

/** Garante role da API (sem BYPASSRLS) e o banco, usando a conexão admin. */
async function ensureRoleAndDatabase(adminUrl) {
  const app = new URL(databaseUrl());
  const roleName = decodeURIComponent(app.username);
  const rolePass = decodeURIComponent(app.password);
  const dbName = decodeURIComponent(new URL(adminUrl).pathname.slice(1));

  const maintenance = new URL(adminUrl);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    // Serializa boots concorrentes (ex: testes em paralelo): ALTER ROLE simultâneo
    // falha com "tuple concurrently updated". Liberado ao fechar a conexão.
    await client.query("SELECT pg_advisory_lock(hashtext('agrostand:init'))");
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [roleName]);
    const verb = role.rowCount ? 'ALTER' : 'CREATE';
    await client.query(
      `${verb} ROLE ${escapeIdentifier(roleName)} LOGIN PASSWORD ${escapeLiteral(rolePass)}
       NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    );

    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rowCount) {
      await client.query(`CREATE DATABASE ${escapeIdentifier(dbName)} ENCODING 'UTF8'`);
    }
  } finally {
    await client.end();
  }
  return roleName;
}

/**
 * Cria banco/role/tabelas/policies se não existirem e popula categorias padrão.
 * Idempotente — seguro rodar em todo boot (preserva dados existentes).
 */
async function initializeDatabase() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (adminUrl) {
    const roleName = await ensureRoleAndDatabase(adminUrl);
    const role = escapeIdentifier(roleName);

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
      await admin.query(`
        GRANT USAGE ON SCHEMA public, app TO ${role};
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${role};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role};
        REVOKE INSERT, UPDATE, DELETE ON "Categoria" FROM ${role};
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
      `);

      const { rows } = await admin.query('SELECT count(*)::int AS total FROM "Categoria"');
      if (rows[0].total === 0) {
        await admin.query(`
          INSERT INTO "Categoria" (nome, descricao) VALUES
            ('Frutas', 'Frutas frescas colhidas diretamente do produtor'),
            ('Legumes', 'Legumes e hortaliças frescas e variadas'),
            ('Verduras', 'Folhas verdes e ervas frescas'),
            ('Grãos', 'Grãos, cereais, feijão, arroz e sementes'),
            ('Outros', 'Outros produtos agrícolas e derivados artesanais')
        `);
      }
    } finally {
      await admin.end();
    }
  }

  // Valida a conexão da API (falha cedo se credenciais/permissões estiverem erradas)
  await runAsSystem(() => getDb().select({ value: count() }).from(schema.categorias));

  console.log('Database initialized successfully (Drizzle/PostgreSQL + RLS).');
}

async function closeDatabase() {
  if (pool) {
    const p = pool;
    pool = null;
    db = null;
    try {
      await p.end();
    } catch {
      // ignora erro de fechamento duplo
    }
  }
}

/** Violação de UNIQUE (23505), opcionalmente de uma constraint específica. */
function isUniqueViolation(error, constraint) {
  const pgError = error && (error.code ? error : error.cause);
  if (!pgError || pgError.code !== '23505') return false;
  return !constraint || pgError.constraint === constraint;
}

module.exports = {
  getDb,
  initializeDatabase,
  closeDatabase,
  isUniqueViolation,
};
