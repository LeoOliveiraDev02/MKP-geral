# MKP-geral

Monorepo do marketplace AgroStand, com front-end e back-end separados.

| Pasta | Conteúdo |
|-------|----------|
| [`backend/`](backend) | API Node.js (Drizzle ORM, PostgreSQL) |
| [`frontend/`](frontend) | App React + Vite |
| [`apresentacao/`](apresentacao) | Slides (HTML e PDF), telas e QR Code do site |

## Rodando localmente

```bash
# Backend (porta 3000)
cd backend
cp .env.example .env   # preencha as variáveis
npm install
npm run dev

# Frontend (em outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Em dev, o Vite faz proxy de `/api` para `http://localhost:3000`. Em produção, defina `VITE_API_URL` apontando para o backend publicado.

Cada pasta é independente (`package.json` próprio) e pode ser publicada separadamente.

## Arquitetura (MVC)

A API segue MVC em camadas; o front React é a camada de View para o usuário.

| Camada | Pasta | Responsabilidade |
|--------|-------|------------------|
| Rotas | `backend/src/routes` | Só ligam URL + middlewares ao controller |
| Controller | `backend/src/controllers` | Adaptador HTTP: lê `req`, chama o service, responde |
| Model (regras) | `backend/src/services`, `backend/src/domain` | Regras de negócio, sem conhecer o Express |
| Model (dados) | `backend/src/dao`, `backend/src/db` | Acesso ao PostgreSQL (Drizzle + RLS) |
| View | `frontend/` e `backend/src/views` | Telas React; HTML de prévia de compartilhamento |

A segurança fica em middlewares transversais (sessão, CSRF, rate limit, validação Zod, Helmet) e no banco (RLS), sem quebrar as camadas.

## Publicação (Vercel)

- Site: https://agromundo-beryl.vercel.app (projeto `agromundo`, pasta `frontend/`). O `vercel.json` repassa `/api`, `/uploads` e `/share` para a API.
- API: https://agromundo-api.vercel.app (projeto `agromundo-api`, pasta `backend/`), função serverless em `backend/api/index.js`.
- Banco: Postgres Neon; fotos: Vercel Blob. O schema/RLS é aplicado com `npm run db:init`, fora da Vercel.
- Segredos de produção ficam só nas variáveis de ambiente da Vercel, nunca no repositório.

Para publicar de novo: `vercel deploy --prod` dentro de cada pasta.
