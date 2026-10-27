/**
 * Mantém viva uma tarefa que roda depois da resposta (ex: envio de e-mail).
 * Na Vercel a função congela assim que responde; `waitUntil` segura a
 * instância até a promise terminar. Fora da Vercel não faz nada a mais.
 */
function emSegundoPlano(promise) {
  try {
    require('@vercel/functions').waitUntil(promise);
  } catch {
    // fora da Vercel (dev, testes): a promise segue normalmente
  }
  return promise;
}

module.exports = { emSegundoPlano };
