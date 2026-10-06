
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
  