/**
 * @file helpers.js
 * @description Utilidades compartilhadas dos testes (node:test).
 *
 * Isolamento:
 * - Cada arquivo de teste roda em processo próprio e ganha um banco PostgreSQL
 *   temporário (`agrostand_test_<tag>_<pid>`), criado no boot e dropado no
 *   close. Credenciais vêm do `.env` (DATABASE_URL / DATABASE_ADMIN_URL).
 * - Requires de `src/` aqui são LAZY (dentro das funções): o singleton do
 *   Drizzle fixa a URL do banco no primeiro uso.
 * - DAOs chamados direto pelos testes passam pelo RLS: use `asSystem(fn)`.
 * - E-mail transacional é stubado em memória (sem Ethereal/rede).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function uploadsDir() {
  // Isolado por arquivo de teste (definido em startServer) — nunca o real.
  return process.env.UPLOAD_DIR || path.join(repoRoot(), 'public', 'uploads');
}

/** Aponta DATABASE_URL/DATABASE_ADMIN_URL para um banco exclusivo deste processo. */
function useTempDatabase(tag) {
  require('dotenv').config({ path: path.join(repoRoot(), '.env'), quiet: true });
  if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
    throw new Error('Testes exigem DATABASE_URL e DATABASE_ADMIN_URL no .env');
  }
  const dbName = `agrostand_test_${tag}_${process.pid}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const withDb = (url) => {
    const u = new URL(url);
    u.pathname = '/' + dbName;
    return u.toString();
  };
  process.env.DATABASE_URL = withDb(process.env.DATABASE_URL);
  process.env.DATABASE_ADMIN_URL = withDb(process.env.DATABASE_ADMIN_URL);
  return dbName;
}

async function dropDatabase(dbName) {
  const { Client, escapeIdentifier } = require('pg');
  const u = new URL(process.env.DATABASE_ADMIN_URL);
  u.pathname = '/postgres';
  const client = new Client({ connectionString: u.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

/** Executa `fn` com privilégio de sistema no RLS (inspeção direta via DAO). */
function asSystem(fn) {
  return require('../src/db/context').runAsSystem(fn);
}

/** Sobe o app com banco temporário e uploads isolados, em porta efêmera. */
async function startServer(tag) {
  const dbName = useTempDatabase(tag);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

  // Diretório de upload exclusivo deste arquivo (execução paralela segura)
  const uploadDir = path.join(os.tmpdir(), `agrostand-uploads-${tag}-${process.pid}`);
  process.env.UPLOAD_DIR = uploadDir;
  fs.mkdirSync(uploadDir, { recursive: true });

  const { initializeDatabase, closeDatabase } = require('../src/db');
  await initializeDatabase();
  const app = require('../src/app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${server.address().port}`;

  return {
    base,
    uploadDir,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await closeDatabase();
      await dropDatabase(dbName);
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      } catch {
        // ignora
      }
    },
  };
}

/** Chamada JSON com Bearer opcional. Retorna { status, body }. */
async function api(base, method, url, { body, token } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

/** PNG 1x1 para uploads multipart. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function pngFile() {
  return new Blob([PNG_1X1], { type: 'image/png' });
}

function snapshotUploads() {
  try {
    return new Set(fs.readdirSync(uploadsDir()));
  } catch {
    return new Set();
  }
}

/** Remove arquivos de upload criados durante o teste. */
function cleanUploads(before) {
  let after = [];
  try {
    after = fs.readdirSync(uploadsDir());
  } catch {
    return;
  }
  for (const file of after) {
    if (!before.has(file) && file !== '.gitkeep') {
      try {
        fs.unlinkSync(path.join(uploadsDir(), file));
      } catch {
        // ignora
      }
    }
  }
}

/** Substitui o envio real de e-mail por um espião em memória. */
function stubEmail() {
  const mod = require('../src/utils/email');
  const original = mod.sendRecoveryEmail;
  const sent = [];
  mod.sendRecoveryEmail = async (to, code) => {
    sent.push({ to, code });
    return true;
  };
  return {
    sent,
    restore() {
      mod.sendRecoveryEmail = original;
    },
  };
}

module.exports = {
  startServer,
  asSystem,
  api,
  PNG_1X1,
  pngFile,
  snapshotUploads,
  cleanUploads,
  stubEmail,
};
