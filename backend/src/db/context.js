/**
 * @file context.js (src/db)
 * @description Contexto de segurança do banco para Row-Level Security (RLS).
 *
 * Cada conexão retirada do pool recebe (via `set_config`) as GUCs lidas pelas
 * policies do PostgreSQL:
 * - `app.user_id` → id do usuário autenticado da requisição ('' = anônimo)
 * - `app.system`  → 'on' para fluxos confiáveis do servidor (login, cadastro,
 *   recuperação de senha, denylist de JWT, purga CRON), que precisam ler/gravar
 *   linhas de outros usuários ou tabelas internas.
 *
 * O contexto viaja pela cadeia assíncrona com AsyncLocalStorage, então DAOs e
 * services não precisam recebê-lo por parâmetro.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Roda `fn` no contexto. Query builders do Drizzle são "thenables" lazy: só
 * executam no `await` — resolvê-los aqui garante que isso ocorra DENTRO do contexto.
 */
function run(ctx, fn) {
  return storage.run(ctx, () => {
    const result = fn();
    return result && typeof result.then === 'function' ? Promise.resolve(result) : result;
  });
}

/** Executa `fn` como o usuário `userId` (policies de dono se aplicam). */
function runAsUser(userId, fn) {
  return run({ userId: String(userId), system: false }, fn);
}

/** Executa `fn` com privilégio de sistema (policies liberam o acesso). */
function runAsSystem(fn) {
  const atual = storage.getStore();
  return run({ userId: atual ? atual.userId : '', system: true }, fn);
}

/** Contexto atual; fora de qualquer `run*` a consulta é anônima. */
function currentContext() {
  return storage.getStore() || { userId: '', system: false };
}

module.exports = { runAsUser, runAsSystem, currentContext };
