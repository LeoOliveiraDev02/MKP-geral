/**
 * @file backup.js
 * @description Backup do PostgreSQL com pg_dump (formato custom, comprimido).
 *
 * Uso: npm run db:backup
 * - Lê DATABASE_ADMIN_URL do .env (dono das tabelas: o dump inclui RLS/policies).
 * - Grava em BACKUP_DIR (padrão ./backups — fora do Git) como agrostand-AAAAMMDD-HHMMSS.dump.
 * - Com BACKUP_ENCRYPTION_KEY definido, cifra o arquivo (AES-256-GCM → .dump.enc);
 *   guarde a chave FORA do servidor do banco (cofre de senhas/secret manager).
 * - Mantém só os BACKUP_RETENTION (padrão 14) mais recentes.
 *
 * Agende diariamente (cron/Render Cron Job/Agendador do Windows) e copie os
 * arquivos para outro provedor (S3, Backblaze, Google Drive) — backup que
 * fica só na mesma máquina do banco não sobrevive a perda da máquina.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const destino = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const retencao = parseInt(process.env.BACKUP_RETENTION || '14', 10);
const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

function carimbo() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

/** AES-256-GCM: [iv 12 bytes][tag 16 bytes][dados]. Chave derivada por SHA-256. */
function cifrarArquivo(origem, chave) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(chave).digest(), iv);
  const dados = Buffer.concat([cipher.update(fs.readFileSync(origem)), cipher.final()]);
  const saida = `${origem}.enc`;
  fs.writeFileSync(saida, Buffer.concat([iv, cipher.getAuthTag(), dados]));
  fs.unlinkSync(origem);
  return saida;
}

function main() {
  if (!url) throw new Error('Defina DATABASE_ADMIN_URL (ou DATABASE_URL) no .env.');
  fs.mkdirSync(destino, { recursive: true });

  const arquivo = path.join(destino, `agrostand-${carimbo()}.dump`);
  // Senha via variável de ambiente do processo filho (não aparece na lista de processos).
  const u = new URL(url);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
  u.password = '';

  const r = spawnSync('pg_dump', ['--format=custom', '--compress=9', '--no-owner', `--file=${arquivo}`, u.toString()], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.error) throw new Error(`pg_dump não encontrado no PATH: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`pg_dump terminou com código ${r.status}.`);

  let final = arquivo;
  if (process.env.BACKUP_ENCRYPTION_KEY) final = cifrarArquivo(arquivo, process.env.BACKUP_ENCRYPTION_KEY);

  const antigos = fs
    .readdirSync(destino)
    .filter((f) => /^agrostand-.*\.dump(\.enc)?$/.test(f))
    .sort()
    .reverse()
    .slice(retencao);
  for (const f of antigos) fs.unlinkSync(path.join(destino, f));

  const tamanhoKb = Math.round(fs.statSync(final).size / 1024);
  console.log(`Backup criado: ${final} (${tamanhoKb} KB). Mantidos os ${retencao} mais recentes.`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Falha no backup: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { cifrarArquivo };
