# Segurança — AgroMundo / Agrostand

Guia do que está implementado no código, do que precisa ser configurado na
infraestrutura e da rotina de operação. Itens marcados com **[infra]** não se
resolvem só com código: alguém precisa configurar no provedor.

## Checklist

| # | Controle | Onde | Estado |
|---|----------|------|--------|
| 1 | HTTPS + HSTS | `src/app.js` (redirect + HSTS em produção) · **[infra]** certificado | código ✅ · infra ⏳ |
| 2 | Senhas com bcrypt (custo 12) | `src/utils/senha.js` | ✅ |
| 3 | Rate limit no login e nas APIs | `src/middlewares/rateLimitMiddleware.js` + bloqueio por e-mail (RN19) | ✅ |
| 4 | Autorização por recurso (IDOR) | services de pedido/cotação/chat + RLS no PostgreSQL | ✅ (testado) |
| 5 | Queries parametrizadas | Drizzle ORM + `sql` template (nenhuma concatenação de SQL) | ✅ |
| 6 | Validação de entrada com schema | `src/validacao/esquemas.js` (zod) | ✅ |
| 7 | Preço e total recalculados no servidor | `PedidoService` (preço, atacado, frete) | ✅ |
| 8 | Webhook de pagamento validado | `src/services/PagamentoService.js` | ✅ · **[infra]** cadastrar no gateway |
| 9 | Cookies HttpOnly, Secure, SameSite | `src/utils/sessao.js` + CSRF double submit | ✅ |
| 10 | CORS restrito | `CORS_ORIGINS` | ✅ |
| 11 | Headers de segurança + CSP | Helmet (API) · `Agromundo/public/_headers` (front) | ✅ · **[infra]** headers no host do front |
| 12 | Segredos fora do Git | `.gitignore` + gitleaks no CI | ✅ |
| 13 | Debug desligado em produção | `errorMiddleware` + `validarAmbiente()` | ✅ |
| 14 | Upload de arquivos seguro | `src/config/multer.js` | ✅ |
| 15 | npm audit + Dependabot | `.github/dependabot.yml`, `.github/workflows/seguranca.yml` | ✅ · **[infra]** ativar alertas no GitHub |
| 16 | Backups testados | `npm run db:backup` / `npm run db:backup:test` | ✅ · **[infra]** agendar + cópia externa |
| 17 | MFA no admin | TOTP (`src/services/MfaService.js`) | ✅ |
| 18 | Logs sem dados sensíveis | redação automática em `src/utils/logger.js` | ✅ |
| 19 | WAF/Cloudflare | **[infra]** — ver seção abaixo | ⏳ |
| 20 | LGPD | `/privacidade`, `GET /api/users/data-export`, `DELETE /api/users/account` | ✅ · preencher dados do controlador |

### Segunda rodada (474 itens)

O mapa completo, item por item, está em [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md).
Principais adições: sessões no servidor (lista de aparelhos, "sair de todos",
inatividade de 8 h, queda geral ao trocar/redefinir senha), códigos de
recuperação do MFA, pepper + senhas longas + bloqueio de senhas comuns/vazadas,
alertas por e-mail, JWT com algoritmo fixo, código de reset com hash, CPF/CNPJ
cifrado, imagens reprocessadas sem EXIF, `no-store`/`Clear-Site-Data`/
`X-Request-Id`, security.txt, CodeQL e Actions fixadas por SHA.

## Variáveis de produção

Com `NODE_ENV=production`, o servidor **não sobe** se a configuração for insegura
(`src/config/seguranca.js → validarAmbiente`). Obrigatórias:

| Variável | Para quê |
|----------|----------|
| `JWT_SECRET` | ≥ 32 caracteres aleatórios. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `CORS_ORIGINS` | Origens do front, ex: `https://agromundo.com.br,https://www.agromundo.com.br` |
| `MFA_ENCRYPTION_KEY` | ≥ 32 caracteres; cifra os segredos TOTP. Trocar invalida os MFAs cadastrados. |
| `PAYMENT_WEBHOOK_SECRET` | Segredo de assinatura fornecido pelo gateway |
| `CRON_SECRET` | Exigido em `POST /api/ads/cleanup` (cabeçalho `X-Cron-Secret`) |
| `TRUST_PROXY` | Nº de proxies na frente da API (Cloudflare + Render = `2`) |
| `COOKIE_DOMAIN` | Se front e API estão em subdomínios: `.agromundo.com.br` (sem ele, o cookie usa o prefixo `__Host-`) |
| `PASSWORD_PEPPER` | ≥ 32 caracteres; segredo extra do hash de senha. **Nunca troque depois de definido** (as senhas deixariam de conferir). Guarde cópia no cofre. |
| `DATA_ENCRYPTION_KEY` | Opcional; cifra CPF/CNPJ. Sem ela, usa a `MFA_ENCRYPTION_KEY`. Trocar = documentos antigos ilegíveis. |
| `API_PUBLIC_URL` | URL pública da API (host fixo do redirect HTTPS e do security.txt) |
| `SECURITY_CONTACT` | Ex.: `mailto:seguranca@agromundo.com.br` (security.txt) |
| `SESSION_IDLE_MINUTES` | Inatividade até a sessão cair (padrão 480) |

Guarde segredos no painel do provedor (Render → Environment), nunca em arquivos
commitados. Se um segredo vazar: troque-o, faça deploy e (no caso do
`JWT_SECRET`) todas as sessões caem — é o comportamento desejado.

## 1. HTTPS + HSTS **[infra]**

- Em produção a API redireciona HTTP → HTTPS (301) e envia
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- O certificado é do provedor (Render/Cloudflare emitem automaticamente).
- Depois de tudo rodando em HTTPS por algumas semanas, inscreva o domínio em
  https://hstspreload.org.
- App Android: `capacitor.config.json` usa `androidScheme: "http"` e
  `cleartext: true` para falar com o backend local. Para a versão de loja,
  mude para `"androidScheme": "https"` e remova `cleartext` (a API de produção
  já é HTTPS).

## 3. Rate limit

| Limitador | Escopo | Padrão |
|-----------|--------|--------|
| `apiLimiter` | todo `/api`, por IP | 300 req/min |
| `authLimiter` | login, cadastro, Google, MFA, recuperação de senha | 20 req / 15 min |
| `escritaLimiter` | chat, cotações, perguntas, reclamações | 30 req/min |
| RN19 | por e-mail: 3 falhas → bloqueio de 15 min | `LOGIN_MAX_ATTEMPTS` |
| Código de recuperação | por e-mail: 5 códigos errados → bloqueio de 15 min | fixo |

O contador fica em memória: com mais de uma instância da API, troque por um
store compartilhado (`rate-limit-redis`) ou limite também no Cloudflare.

## 4. IDOR (autorização por recurso)

Duas camadas: o service confere se o usuário é comprador/vendedor (pedido),
cliente/produtor (cotação) ou participante (chat) e o **RLS do PostgreSQL**
repete a regra no banco. Os controllers nunca deixam o corpo da requisição
sobrescrever `userId`. Coberto por `test/integration/hardening.test.js` e
`test/integration/rls.test.js`.

## 8. Webhook de pagamento **[infra]**

`POST /api/payments/webhook`

- Assinatura: `X-Webhook-Signature: t=<unix>,v1=<hex>`, onde
  `v1 = HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<t>.<corpo bruto>")`.
- Recusa timestamp com mais de 5 min de diferença (replay).
- Idempotente: cada `id` de evento é processado uma única vez.
- O valor pago precisa bater com o total do pedido calculado no servidor.
- Em produção é o **único** caminho para um pedido virar `PAGO` (o botão
  "pagar" do comprador só existe com `PAGAMENTO_SIMULADO` fora de produção).

Ao integrar o gateway real (Mercado Pago, Pagar.me, Stripe...), adapte
`lerEvento()` e `verificarAssinatura()` ao formato dele, mantendo as 4 regras.

## 9. Sessão e CSRF

- Navegador: JWT em cookie `agrostand_session` (HttpOnly, Secure em produção,
  SameSite=Strict). O JavaScript do front não tem acesso ao token.
- Escritas autenticadas por cookie exigem `X-CSRF-Token` igual ao cookie
  `agrostand_csrf` (double submit).
- App nativo (Capacitor): `Authorization: Bearer` (não sofre CSRF).
- Logout revoga o JWT (denylist) e apaga os cookies.

## 11. Headers do front **[infra]**

`Agromundo/public/_headers` já funciona no Cloudflare Pages e no Netlify. Em
outro host, replique os mesmos cabeçalhos. **Antes de publicar**, troque
`https://api.agromundo.com.br` na CSP pela URL real da API. Valide em
https://securityheaders.com e no console do navegador (erros de CSP).

## 14. Uploads

Nome aleatório gerado no servidor, extensão derivada do tipo (nunca do nome
enviado), 10 MB por arquivo, até 10 arquivos, conferência dos *magic bytes*
(JPEG/PNG/WEBP de verdade) e os arquivos são servidos com `nosniff` e CSP
`sandbox`. Para escalar, mova para um bucket (S3/R2) em domínio separado.

## 15. Dependências **[infra]**

- `npm run audit` localmente; o workflow `seguranca.yml` roda audit, gitleaks
  e os testes a cada push/PR e toda segunda-feira.
- No GitHub: Settings → Code security → ative *Dependabot alerts*,
  *Dependabot security updates* e *Secret scanning*.

## 16. Backups **[infra]**

```bash
npm run db:backup        # pg_dump → backups/agrostand-AAAAMMDD-HHMMSS.dump(.enc)
npm run db:backup:test   # restaura num banco temporário, confere e apaga
```

- Defina `BACKUP_ENCRYPTION_KEY` (guarde a chave num cofre, fora do servidor).
- Agende `db:backup` diariamente (Render Cron Job, cron ou Agendador do Windows).
- Copie os arquivos para outro provedor/região (S3, Backblaze B2, R2).
- Rode `db:backup:test` **todo mês** e registre a data — backup que nunca foi
  restaurado não é backup.
- Se usar Postgres gerenciado (Render, Neon, Supabase), ative também o
  backup/PITR do provedor; o script continua útil como cópia independente.

## 17. MFA do admin

- Admins (`ADMIN_EMAILS`) só acessam `/api/admin/*` com sessão que passou pelo
  TOTP. Em produção é sempre exigido.
- Primeiro acesso: a página Administração mostra a configuração (chave para o
  Google Authenticator / Authy). Qualquer usuário pode ativar em Meu Perfil.
- Ao ativar, a pessoa recebe **10 códigos de recuperação** (uso único). Na
  tela de login, o campo do código aceita o código do app ou um de recuperação.
  Novos códigos: Meu Perfil → Segurança → "Novos códigos".
- Perdeu o celular **e** os códigos? Um operador com acesso ao banco remove:
  `DELETE FROM "MfaUsuario" WHERE usuario_id = <id>; DELETE FROM "MfaCodigoRecuperacao" WHERE usuario_id = <id>;`
  e a pessoa cadastra de novo. Registre quem fez e por quê.

## Sessões

- Cada login cria uma linha em `Sessao` (id = `jti` do JWT, IP, navegador).
  O token só vale enquanto a linha existir, não estiver revogada e tiver sido
  usada nas últimas `SESSION_IDLE_MINUTES`.
- Meu Perfil → Segurança lista os aparelhos, encerra um específico ou todos.
- Trocar a senha encerra os outros aparelhos; redefinir pelo e-mail encerra todos.
- Derrubar todas as sessões de uma pessoa (incidente):
  `UPDATE "Sessao" SET revogada_em = to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS') WHERE usuario_id = <id>;`

## 18. Logs

`src/utils/logger.js` remove automaticamente senha, token, cookie, código,
segredo, CPF/CNPJ e cartão, e mascara e-mail/telefone (`jo***@gmail.com`).
Em produção, o fallback de e-mail **não** imprime códigos de recuperação.
Retenha logs de acesso por 6 meses (Marco Civil, art. 15) e não mais que o
necessário.

## 19. WAF / Cloudflare **[infra]**

1. Coloque o domínio no Cloudflare (DNS com proxy laranja ligado) para o front
   e para a API.
2. SSL/TLS → modo **Full (strict)**; ative *Always Use HTTPS* e *HSTS*.
3. Security → WAF → *Managed rules*: ative o **Cloudflare Managed Ruleset** e o
   **OWASP Core Ruleset**.
4. Security → WAF → *Rate limiting rules*: ex. `/api/auth/*` → 20 req/min por IP
   (bloqueio de 10 min).
5. Security → Bots: *Bot Fight Mode*.
6. Na origem (Render), aceite só tráfego vindo do Cloudflare (Authenticated
   Origin Pulls ou allowlist dos IPs do Cloudflare) e configure `TRUST_PROXY`.
7. Opcional: Cloudflare Turnstile no cadastro e no "esqueci minha senha".

## 20. LGPD

- Política de privacidade em `/privacidade` (link no rodapé e no cadastro).
  **Preencha** razão social, CNPJ e encarregado (DPO) em
  `Agromundo/src/app/components/agro/PrivacyPage.tsx` antes de publicar.
- Acesso/portabilidade: Meu Perfil → *Baixar meus dados*
  (`GET /api/users/data-export`).
- Exclusão: Meu Perfil → *Excluir conta* (`DELETE /api/users/account`, em cascata).
- Mantenha um registro das operações de tratamento (art. 37) e um contrato com
  cada operador (hospedagem, e-mail, pagamento).

## Resposta a incidentes

1. Conter: revogue segredos (`JWT_SECRET` derruba todas as sessões), bloqueie IPs
   no Cloudflare, tire do ar o que for preciso.
2. Investigar: `logs/audit.log` + logs do provedor.
3. Comunicar: se houver risco aos titulares, avisar a ANPD e os afetados em
   prazo razoável (Resolução CD/ANPD nº 15/2024: 3 dias úteis).
4. Corrigir e registrar o que aconteceu e o que mudou.

Para relatar uma vulnerabilidade: veja `/.well-known/security.txt` (defina
`SECURITY_CONTACT` e o arquivo `Agromundo/public/.well-known/security.txt`).
