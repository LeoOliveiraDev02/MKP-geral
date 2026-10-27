/**
 * @file testar-backup.js
 * @description "Backup que nunca foi restaurado não é backup." Restaura o
 * backup mais recente (ou o arquivo passado como argumento) num banco
 * TEMPORÁRIO, confere tabelas, contagens, policies de RLS e compara com o
 * banco de origem; no fim apaga o banco temporário.
 *
 * Uso: npm run db:backup:test [-- caminho/do/arquivo.dump(.enc)]
 * Rode ao menos uma vez por mês (e sempre depois de mudar o processo de backup).
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Client, escapeIdentifier } = require('pg');

const TABELAS = ['Usuario', 'Endereco', 'Anuncio', 'Pedido', 'ItemPedido', 'Mensagem', 'Cotacao'];

function ultimoBackup() {
  const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
  const arquivos = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^agrostand-.*\.dump(\.enc)?$/.test(f)).sort()
    : [];
  if (!arquivos.length) throw new Error(`Nenhum backup em ${dir}. Rode "npm run db:backup" antes.`);
  return path.join(dir, arquivos[arquivos.length - 1]);
}

function decifrar(arquivo) {
  const chave = process.env.BACKUP_ENCRYPTION_KEY;
  if (!chave) throw new Error('Backup cifrado: defina BACKUP_ENCRYPTION_KEY.');
  const bruto = fs.readFileSync(arquivo);
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(chave).digest(), bruto.subarray(0, 12));
  decipher.setAuthTag(bruto.subarray(12, 28));
  const saida = path.join(os.tmpdir(), `agrostand-restore-${process.pid}.dump`);
  fs.writeFileSync(saida, Buffer.concat([decipher.update(bruto.subarray(28)), decipher.final()]));
  return saida;
}

function urlCom(base, banco) {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

async function contar(url) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const out = {};
    for (const t of TABELAS) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${escapeIdentifier(t)}`);
      out[t] = rows[0].n;
    }
    const { rows } = await c.query("SELECT count(*)::int AS n FROM pg_policies WHERE policyname LIKE 'rls_%'");
    out.policies_rls = rows[0].n;
    return out;
  } finally {
    await c.end();
  }
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('Defina DATABASE_ADMIN_URL no .env.');

  const arquivo = process.argv[2] ? path.resolve(process.argv[2]) : ultimoBackup();
  const dump = arquivo.endsWith('.enc') ? decifrar(arquivo) : arquivo;
  const temp = `agrostand_restore_test_${Date.now()}`;
  console.log(`Testando restauração de ${path.basename(arquivo)} em ${temp}...`);

  const admin = new Client({ connectionString: urlCom(adminUrl, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${escapeIdentifier(temp)}`);
  try {
    const u = new URL(urlCom(adminUrl, temp));
    const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
    u.password = '';
    const r = spawnSync('pg_restore', ['--no-owner', '--exit-on-error', `--dbname=${u.toString()}`, dump], {
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (r.error) throw new Error(`pg_restore não encontrado no PATH: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`pg_restore terminou com código ${r.status}.`);

    const restaurado = await contar(urlCom(adminUrl, temp));
    const origem = await contar(adminUrl).catch(() => null);
    console.table(Object.keys(restaurado).map((k) => ({ item: k, backup: restaurado[k], producao_agora: origem ? origem[k] : '-' })));

    if (!restaurado.Usuario) throw new Error('Backup restaurado sem nenhum usuário — verifique o processo de backup.');
    if (!restaurado.policies_rls) throw new Error('Backup restaurado sem as policies de RLS.');
    console.log('OK: backup restaurado e íntegro. (Diferenças para a produção = dados criados depois do backup.)');
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(temp)} WITH (FORCE)`);
    await admin.end();
    if (dump !== arquivo) fs.rmSync(dump, { force: true });
  }
}

main().catch((err) => {
  console.error(`Teste de backup FALHOU: ${err.message}`);
  process.exit(1);
});
