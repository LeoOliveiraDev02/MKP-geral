
  # AgroMundo Platform Design

  This is a code bundle for AgroMundo Platform Design. The original project is available at https://www.figma.com/design/edCzMdMd5OLzucGPbVFPpM/AgroMundo-Platform-Design.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Integração com o backend (agrostand-backend)

  1. Suba a API: `cd ../agrostand-backend && npm install && npm run dev` (porta 3000).
  2. Suba o front: `npm install && npm run dev`. O Vite faz proxy de `/api` e `/uploads`
     para `http://localhost:3000` (altere com `VITE_BACKEND_URL`; veja `.env.example`).

  A camada de acesso à API fica em `src/app/api/`:

  - `client.ts` — `fetch` com o envelope `{ status, message, data }`, JWT Bearer e `ApiError`;
  - `services.ts` — um service por controller do backend (`AutenticacaoService`, `UsuarioService`,
    `EnderecoService`, `CategoriaService`, `AnuncioService`, `FavoritoService`);
  - `types.ts` — DTOs exatamente como a API responde (snake_case);
  - `mappers.ts` — conversão DTO → modelos de tela (`Product`, `Category`).

  ## Páginas e rotas (React Router)

  `/` vitrine com filtros · `/ofertas` · `/produto/:id` · `/produtor/:id` · `/carrinho` (salvo no navegador)
  · `/checkout` · `/pedidos` e `/pedidos/:id` · `/mensagens` · `/cotacoes` · `/reclamacoes` · `/cestas`
  · `/mapa` · `/safra` · `/vender/:aba` (resumo, anuncios, novo, pedidos, cotacoes, cestas, perfil) · `/admin`.

  Estado global (sessão, carrinho, favoritos, avisos) em `src/app/AppContext.tsx`.

  ## App instalável (PWA)

  `public/manifest.webmanifest`, `public/sw.js` e ícones em `public/icons`
  (regerar com `node scripts/gerar-icones.mjs`). O botão "Instalar app" aparece no rodapé
  quando o navegador permite.

  ## App Android (APK de teste, Capacitor)

  - Configuração: `capacitor.config.json` e projeto nativo em `android/`.
  - O app fala com a API pela rede local: ajuste o IP em `.env.android` (`VITE_API_URL`).
  - JDK 21 e Android SDK ficam em `../.android-tools` (fora do git).
  - Gerar o APK (PowerShell):

    ```powershell
    $env:JAVA_HOME='C:\projetos\laboratorio\.android-tools\jdk-21.0.12.1+1'
    $env:ANDROID_HOME='C:\projetos\laboratorio\.android-tools\sdk'
    npm run android:apk
    ```

    Saída: `android/app/build/outputs/apk/debug/app-debug.apk`.
  - Ícones e tela de abertura: `node scripts/gerar-icones-android.mjs`.
  - No app, login com Google fica oculto (exige domínio autorizado); use e-mail e senha.
  