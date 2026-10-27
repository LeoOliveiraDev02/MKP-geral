# Checklist de segurança (474 itens) — situação do AgroMundo / Agrostand

Revisado em 2026-10-18. Complementa o [SECURITY.md](SECURITY.md) (como operar e
configurar). Cada item da lista recebeu um dos estados abaixo.

| Marca | Significado |
|-------|-------------|
| ✅ | Já estava implementado (rodada anterior) e foi conferido |
| 🆕 | Implementado nesta rodada |
| 🔧 | Depende de configuração no provedor (Render, Cloudflare, DNS, GitHub, Play Console) — não se resolve só com código |
| 📋 | Processo/rotina da equipe (documento, revisão, treinamento) |
| ⚠️ | Parcial ou com decisão pendente (ver observação) |
| ➖ | Não se aplica a este sistema |

## 1. Transporte e HTTPS (1–22)

- ✅ 1, 2, 10 — redirect 301 para HTTPS e HSTS (`max-age=63072000; includeSubDomains; preload`) em produção (`src/app.js`).
- 🆕 2 — o redirect usa `API_PUBLIC_URL` como host fixo (não confia no cabeçalho `Host`).
- ✅ 14 — `upgrade-insecure-requests` na CSP do front; 18 — `*.pem`, `*.key` etc. no `.gitignore`.
- 🆕 15 — documentado `?sslmode=require` na `DATABASE_URL` para banco fora da rede privada.
- 🔧 3–9, 11–13, 16, 17, 19–22 — certificado, versões de TLS, cifras, OCSP, CAA, CT, SSL Labs e HTTP/2 são do terminador TLS (Cloudflare/Render). Ver SECURITY.md §19. Inscrever em hstspreload.org depois de semanas em HTTPS.

## 2. Headers HTTP (23–45)

- ✅ 25–29, 31, 33, 38, 43, 44 — Helmet na API; `_headers` no front.
- 🆕 32 — API agora com `X-Frame-Options: DENY`.
- 🆕 30 — `report-uri` na CSP do front + endpoint `POST /csp-report` (vai para o log).
- 🆕 34 — `Permissions-Policy` também na API (o front já tinha).
- 🆕 37 — `Cross-Origin-Resource-Policy: same-origin` no front (API fica `same-site`, servida a partir do subdomínio).
- 🆕 41 — `Cache-Control: no-store` em todo `/api`.
- 🆕 42 — `Clear-Site-Data: "cache", "cookies"` no logout e no "sair de todos".
- ⚠️ 23 — `script-src` sem `unsafe-inline`/`unsafe-eval` ✅; `style-src` mantém `'unsafe-inline'` porque MUI/Emotion e animações injetam `<style>` (risco baixo; scripts continuam bloqueados).
- ➖ 24 — não há script inline para precisar de nonce.
- ✅ 35 — API `same-origin`; front `same-origin-allow-popups` (necessário para o popup do Google).
- ➖ 36 — COEP quebraria embeds do YouTube/Google; não há recurso que o exija.
- ✅ 39, ➖ 40 — Express não envia `Server`/versões; o `Server` do proxy é 🔧.
- 🔧 45 — conferir em securityheaders.com após publicar.

## 3. Autenticação (46–88)

- ✅ 46–48 — bcrypt custo 12 com salt.
- 🆕 49 — **pepper** (`PASSWORD_PEPPER`, fora do banco): HMAC-SHA256 antes do bcrypt. Hashes antigos migram sozinhos no próximo login.
- ✅ 50 — mínimo 8.
- 🆕 51 — até 128 caracteres, Unicode normalizado (NFC); o pré-hash elimina o corte silencioso do bcrypt em 72 bytes.
- 🆕 52 — senhas vazadas recusadas via Have I Been Pwned (k-anonymity: só 5 caracteres do SHA-1 saem do servidor; se o serviço cair, o cadastro segue).
- 🆕 53 — senhas óbvias recusadas (palavra comum + números/símbolos, leetspeak desfeito, ex. `P@ssw0rd!`, `Brasil@2026`) e senhas com nome/e-mail da pessoa. Não é a lista top-10k literal, mas o HIBP cobre essas e muitas mais.
- ⚠️ 54 — sem troca periódica forçada ✅; as regras de composição (maiúscula, número, símbolo) foram mantidas porque são requisito do projeto (RS07). NIST recomenda removê-las — decisão de vocês.
- ✅ 55, 56, 58 — TOTP; obrigatório para admin; sem SMS.
- ⚠️ 57 — passkeys/WebAuthn não implementado (próximo passo sugerido).
- 🆕 59 — **10 códigos de recuperação do MFA** (formato `XXXXX-XXXXX`, uso único, guardados como HMAC). Mostrados uma vez ao ativar; dá para gerar novos em Meu Perfil → Segurança.
- ✅ 60, 61, 63, 64, 66, 67 — rate limit por IP, bloqueio por e-mail, mensagem genérica, tempo constante.
- 🔧 62 — CAPTCHA: ativar Cloudflare Turnstile (SECURITY.md §19.7).
- ⚠️ 65 — login e recuperação não revelam se o e-mail existe ✅; o **cadastro** ainda responde "e-mail já cadastrado". Resolver de vez exige verificação de e-mail no cadastro (item 87).
- 🆕 68 — e-mail + notificação quando a conta entra de um navegador/aparelho nunca usado antes.
- 🆕 69 — e-mail em troca de senha, redefinição de senha, troca de e-mail (enviado para o endereço **antigo**), ativação/desativação do MFA e uso de código de recuperação.
- 🆕 70 — trocar o e-mail agora exige a senha atual (trocar senha já exigia; MFA exige código).
- ⚠️ 71 — excluir a conta exige sessão + confirmação digitada, mas não a senha.
- ✅ 72, 75 — login Google valida assinatura, `iss`, `aud`, `exp` e `email_verified` (google-auth-library). ➖ 73, 74 — não há fluxo OAuth com redirect.
- 🆕 76, 77 — JWT com algoritmo fixo HS256 + `iss`/`aud` obrigatórios (`alg: none` e tokens de outro emissor são recusados — testado).
- ✅ 78 — produção não sobe com `JWT_SECRET` < 32 caracteres.
- ⚠️ 79–81 — não há refresh token: o JWT dura 24 h, mas **cada sessão agora existe no servidor** (tabela `Sessao`) e pode ser revogada, com timeout por inatividade de 8 h. Na prática cobre o objetivo de 79–81.
- 🆕 82–84 — logout invalida a sessão no servidor; **"Sair de todos os aparelhos"**; **lista de aparelhos conectados** com opção de encerrar cada um.
- 🆕 85 — `npm run db:seed` (contas demo, inclusive admin com senha pública) se recusa a rodar em produção.
- ✅ 86, 88.
- ⚠️ 87 — verificação de e-mail no cadastro **não** foi feita: muda o fluxo do produto (o que a conta não verificada pode fazer?). Precisa da decisão de vocês.

## 4. Recuperação de senha (89–99)

- ⚠️ 89 — código de 6 dígitos (não 128 bits), compensado por validade de 15 min, bloqueio após 5 erros por e-mail e rate limit por IP.
- ✅ 90, 91, 93, 96, 98, 99.
- 🆕 92 — o código agora é guardado como HMAC (nunca em claro).
- 🆕 94 — redefinir a senha derruba todas as sessões; trocar a senha no perfil derruba as dos outros aparelhos.
- 🆕 95 — a redefinição responde a mesma mensagem para e-mail inexistente e código errado.
- ✅ 97 — e-mails usam `FRONTEND_URL` fixo.

## 5. Sessões e cookies (100–115)

- ✅ 100–103, 105, 106, 108, 110–114.
- 🆕 104 — em produção (sem `COOKIE_DOMAIN`) o cookie vira `__Host-agrostand_session`.
- 🆕 107 — timeout por inatividade (`SESSION_IDLE_MINUTES`, padrão 480).
- 🆕 109 — sessão destruída no servidor (tabela `Sessao`), não só denylist.
- ⚠️ 114 (app) — no app Android o token fica no armazenamento do WebView; ver item 443.
- ➖ 115 — opcional; o alerta de aparelho novo (68) cobre o principal.

## 6. Autorização (116–135)

- ✅ 116–124, 126, 128, 130, 132, 133 — checagem por recurso nos services + RLS no PostgreSQL; schemas descartam campos extras.
- 🆕 134 — além das ações de admin, falhas 401/403 agora também vão para `logs/audit.log`.
- ⚠️ 125 — IDs numéricos sequenciais nas URLs; mitigado por autorização + RLS (trocar por UUID é migração grande).
- ⚠️ 127 — admin com MFA ✅; restrição por IP/VPN é 🔧 (regra no Cloudflare para `/api/admin/*`).
- ➖ 129, 131 — não é multi-tenant; não há WebSocket/GraphQL.
- 📋 135 — revisão periódica de contas admin (`ADMIN_EMAILS`).

## 7. Validação de entrada (136–162)

- ✅ 136–141, 143, 146–149, 151, 154, 156, 159, 160 — zod, Drizzle parametrizado, ordenação por allowlist (`ORDENACOES`), `spawnSync` com argumentos separados no backup, logs em JSON (quebras de linha escapadas).
- 🆕 152 — `__proto__`, `constructor`, `prototype` descartados do JSON antes de qualquer código.
- 🆕 157 — escritas com Content-Type diferente de JSON/multipart recebem 415.
- 🆕 158 — senha normalizada (NFC) antes do hash.
- ✅ 155 — corpo limitado a 100 KB (limita profundidade na prática).
- ⚠️ 153, 161, 162 — regex simples (sem backtracking aninhado); e-mail/telefone validados por regex própria, não biblioteca.
- ➖ 142, 144, 145, 150 — sem NoSQL, LDAP, XPath ou EL.

## 8. XSS e front-end (163–184)

- ✅ 163–165, 167, 168, 171, 173–179, 181–184 — React com auto-escape; único `innerHTML` é para limpar o botão do Google; sem source maps no build; JWT fora do localStorage na web.
- ➖ 166, 169, 172 — sem HTML rico; único script de terceiro é o do Google (servido dinamicamente, sem suporte a SRI).
- ⚠️ 170 — Trusted Types não ativado (exigiria adaptar a biblioteca do Google).
- ✅ 180 — navegação interna; não há parâmetro de redirect.

## 9. CSRF e CORS (185–196)

- ✅ 185, 186, 188, 189, 191–195.
- 🆕 190 — como o login só aceita JSON (item 157), um formulário de outro site não consegue forjar login; logout já exigia CSRF.
- ⚠️ 187 — `Origin`/`Referer` não são checados (double submit + SameSite=Strict já cobrem).
- ➖ 196 — sem WebSocket.

## 10. SSRF, XXE, desserialização (197–208)

- ✅ 197–201, 203 — o servidor só chama hosts fixos (Nominatim, Google, HIBP); URLs de vídeo dos usuários são validadas e nunca buscadas pelo servidor.
- ✅ 206–208 — só JSON; JWT e webhook assinados.
- ➖ 204, 205 — sem XML. 🔧 202 — IMDSv2 se for para AWS.

## 11. Upload (209–225)

- ✅ 209–212, 216, 225 — magic bytes, extensão pelo tipo, 10 MB, nome aleatório.
- 🆕 218, 219, 223, 224 — **toda imagem é reprocessada** (sharp): sai sem EXIF/GPS, sem bytes extras (polyglot), no máximo 2560 px, decodificação limitada a 40 MP (pixel flood).
- ⚠️ 213, 214, 222 — arquivos em disco local fora do código, servidos com `nosniff` + CSP `sandbox`; mover para bucket privado em domínio separado é 🔧.
- ⚠️ 215 — imagens são exibidas inline (necessário); o download de dados LGPD usa `attachment`.
- 🔧 217 — antivírus (ClamAV) — o reprocessamento já elimina payloads em imagens.
- ⚠️ 221 — limite por requisição (10), não por usuário.
- ➖ 220 — não aceita ZIP.

## 12. APIs (226–250)

- ✅ 226, 228–231, 233, 234, 241–246, 248, 249 — `routes/index.js` é o inventário; listagens com teto de 50; DTOs sem hash de senha.
- 🆕 227 — rate limit por IP ✅; por usuário fica no Cloudflare (🔧).
- 🆕 250 — timeouts: HIBP 3 s, geocodificação 8 s, consultas ao banco 15 s (`statement_timeout`), conexão ao banco 10 s.
- 🆕 389 (relacionado) — `X-Request-Id` em toda resposta e nos logs; erros 500 devolvem o id para o suporte.
- ⚠️ 232 — sem `/v1` no caminho.
- ➖ 235–240 — sem Swagger público, GraphQL ou API keys de terceiros (o CRON usa segredo em cabeçalho ✅).
- 🔧 247 — alinhar proxy e back (Cloudflare/Render já normalizam).

## 13. Lógica de negócio (251–266)

- ✅ 251–253, 256–259, 265, 266 — preço/frete/estoque no servidor, transições de pedido validadas, webhook é o único caminho para PAGO.
- 🔧/⚠️ 263, 264 — rate limit ✅; Turnstile e Bot Fight Mode no Cloudflare.
- ⚠️ 260, 261 — sem limites de valor por usuário nem detecção de fraude (avaliar quando houver pagamento real).
- ➖ 254, 255, 262 — sem cupons, saldo ou programa de indicação.

## 14. Criptografia (267–284)

- ✅ 267–272, 278–280, 283, 284 — AES-256-GCM com IV aleatório, `crypto.randomBytes`/`randomInt`, sem cartão (gateway), backups cifrados.
- 🆕 276 — **CPF/CNPJ da verificação de produtor agora é cifrado no banco** (`utils/cifra.js`). Registros antigos em texto puro continuam legíveis e passam a ser cifrados quando reenviados.
- 🆕 275 — produção recusa `MFA_ENCRYPTION_KEY` igual ao `JWT_SECRET`; chaves derivadas com rótulo por finalidade.
- ✅ 277 — documento mascarado para o usuário; só o admin vê completo.
- 🔧 273, 274, 281 — KMS/Vault, rotação, discos cifrados.
- ➖ 282.

## 15. Segredos e configuração (285–299)

- ✅ 285–287, 291–293, 295–298.
- 🆕 294 — seed de contas demo bloqueado em produção.
- 🔧 289, 290, 299 — segredos no painel do Render, diferentes por ambiente; restringir o Client ID do Google às origens oficiais.
- 📋 288 — se algum segredo vazar: trocar e limpar o histórico.

## 16. Banco de dados (300–315)

- ✅ 301, 302, 305, 306, 312, 314 — role da API sem DDL/superuser/BYPASSRLS; RLS; scripts de backup e teste de restauração.
- 🆕 304, 407 — `sslmode` documentado; pool com limite e `statement_timeout`.
- 🔧 300, 303, 307–310 — rede privada, senha forte, backup externo imutável, PITR, logs e patches do provedor.
- ⚠️ 313 — exclusão de conta é definitiva (LGPD); não há soft delete com retenção.
- ➖ 311, 315.

## 17–18. Infraestrutura, containers e cloud (316–355)

- 🔧 316–337, 340–355 — tudo isso é do provedor (Render/Cloudflare/AWS). Se usar Render: o processo já roda sem root e sem SSH; ative alertas de billing e MFA na conta.
- ✅ 338, 339 — ambientes separados (laboratório com banco próprio; testes em bancos temporários).

## 19. Dependências (356–368)

- ✅ 356, 357, 359, 360.
- 🆕 364 — GitHub Actions fixadas por SHA de commit (Dependabot atualiza).
- 🆕 365 — SBOM CycloneDX gerado no CI (`npm sbom`) e guardado como artefato.
- 🆕 366 — `npm audit signatures` no CI.
- 🆕 367 — `npm ci --ignore-scripts` no job de auditoria (o npm local também já bloqueia scripts de instalação).
- ⚠️ 358 — Snyk/Dependency-Check não configurados (npm audit + Dependabot cobrem o básico).
- 📋 361–363 — revisar dependências novas (nesta rodada entrou só `sharp`, pacote amplamente usado, versão fixada).
- ➖ 368 — sem pacotes privados.

## 20. SDLC (369–382)

- 🆕 373 — CodeQL (`security-extended`) no CI.
- ✅ 375, 380, 381 — testes de segurança automatizados (180 testes, incluindo IDOR, CSRF, MFA, sessões); workflow com `permissions: contents: read`.
- 🔧 369–372 — branch protection, review obrigatório e MFA no GitHub (Settings).
- ⚠️ 374, 379 — DAST (OWASP ZAP) e eslint-plugin-security não configurados.
- 📋 376–378, 382.

## 21. Logs e resposta (383–399)

- ✅ 385, 388, 395, 397 — redação automática de dados sensíveis; UTC; plano de incidente no SECURITY.md; `JWT_SECRET` novo derruba todas as sessões.
- 🆕 383, 384 — logins, logins de aparelho novo, trocas de senha/e-mail, MFA e **todas as respostas 401/403** vão para `logs/audit.log`.
- 🆕 389 — correlation ID por requisição.
- 🔧 386, 387, 390–394 — centralizar logs, alertas de pico 401/403/500, uptime, Sentry.
- 📋 396, 398, 399 — contatos de emergência, post-mortem, feature flags.

## 22. Disponibilidade (400–409)

- ✅ 400, 402 — rate limit global; `/health`.
- 🆕 407, 408, 409 — timeouts de banco, limite de pixels, `no-store` na API.
- 🔧 401, 403–406 — auto-scaling, circuit breaker, filas, DR multi-AZ.

## 23. DNS, domínio e e-mail (410–421)

- 🔧 410–420 — registrador com MFA e lock, DNSSEC, SPF, DKIM, DMARC `p=quarantine`, MTA-STS: tudo no DNS/provedor de e-mail.
- ✅ 421 — e-mails só apontam para `FRONTEND_URL`.

## 24. Privacidade (422–438)

- ✅ 422, 427, 428, 436, 437 — política em `/privacidade`, exportação e exclusão, sem analytics de terceiros, pagamento via gateway.
- ✅ 424 — só cookies/armazenamento essenciais (sessão, CSRF, carrinho), sem rastreamento → banner de consentimento não é exigido. Se adicionarem analytics, precisa de opt-in.
- ⚠️ 423 — não há página de termos de uso.
- 📋 425, 426, 429–435, 438 — base legal, DPO (preencher em `PrivacyPage.tsx`), registro de operações, RIPD, contratos, retenção.

## 25. App Android (439–454)

- ✅ 439, 445, 446, 448, 454.
- 🆕 444 — `android:allowBackup="false"`.
- ⚠️ 442 — `usesCleartextTraffic="true"` continua por causa do backend local em desenvolvimento; **na versão de loja** trocar para `androidScheme: "https"` e remover `cleartext` (SECURITY.md §1).
- ⚠️ 443 — o token do app fica no armazenamento do WebView; o ideal é um plugin de armazenamento seguro (Keystore).
- ⚠️ 440 — `minifyEnabled false` no release (ativar R8 exige testar os plugins do Capacitor).
- ➖ 441, 447, 449 — sem pinning, deep links ou detecção de root (opcionais).
- 🔧 450, 453 — Play Integrity e Play App Signing no Play Console. ⚠️ 451, 452 — revisar logs e FLAG_SECURE antes de publicar.

## 26. Testes contínuos (455–464)

- 🆕 457, 458 — `/.well-known/security.txt` na API e no front (troque o e-mail de contato pelo real).
- ✅ 456, 463 — CI semanal; `npm run db:backup:test`.
- 📋/🔧 455, 459–462, 464 — pentest, ASVS, teste de carga, Prowler, simulações.

## 27. Pessoas e processos (465–474)

- 📋 465–474 — MFA em todas as contas da equipe (e-mail, Render, GitHub, registrador, gateway), gerenciador de senhas, offboarding, revisões trimestrais.

## Pendências que dependem de decisão de vocês

1. **Verificação de e-mail no cadastro** (87, 65, 263): o que uma conta não verificada pode fazer?
2. **Regras de composição de senha** (54): manter (requisito RS07) ou seguir o NIST?
3. **Passkeys/WebAuthn** (57).
4. **App de loja**: HTTPS sem cleartext, armazenamento seguro do token, R8 (440–443).
5. **E-mail de contato de segurança** real em `security.txt` / `SECURITY_CONTACT`.
