# MKP-geral

Monorepo do marketplace AgroStand, com front-end e back-end separados.

| Pasta | Conteúdo |
|-------|----------|
| [`backend/`](backend) | API Node.js (Drizzle ORM, PostgreSQL) |
| [`frontend/`](frontend) | App React + Vite |

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
