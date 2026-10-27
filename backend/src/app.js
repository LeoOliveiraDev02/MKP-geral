/**
 * @file app.js
 * @description Arquivo de inicialização e configuração do aplicativo Express.
 * Aqui configuramos todos os middlewares globais, rotas e manipuladores de erro.
 * Um junior dev deve entender este arquivo como o "coração" da configuração do servidor.
 */

// Importa o framework Express para criação de rotas e servidores HTTP
const express = require('express');

// Importa o CORS (Cross-Origin Resource Sharing), que permite que o frontend (em outra porta/domínio) acesse a API
const cors = require('cors');

// Cabeçalhos de segurança (CSP, HSTS, nosniff, frame-ancestors...) e leitura de cookies
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Importa o módulo 'path' nativo do Node.js, usado para trabalhar com caminhos de arquivos e diretórios
const path = require('path');
const crypto = require('crypto');

// Importa as rotas unificadas da API definidas na pasta de rotas
const apiRoutes = require('./routes');

// Importa o middleware personalizado para registrar logs de requisições HTTP recebidas
const loggerMiddleware = require('./middlewares/loggerMiddleware');

// Importa o middleware centralizador que trata erros que acontecem durante o fluxo das requisições
const errorMiddleware = require('./middlewares/errorMiddleware');

// Limite de requisições por IP para toda a API (limites mais rígidos ficam nas rotas de login etc.)
const { apiLimiter } = require('./middlewares/rateLimitMiddleware');

const { isProduction, origensPermitidas, trustProxy } = require('./config/seguranca');
const logger = require('./utils/logger');

// Cria uma instância do aplicativo Express
const app = express();

// ==========================================
// 0. Segurança de transporte e cabeçalhos
// ==========================================

// Não anuncia "X-Powered-By: Express" (menos informação para quem ataca)
app.disable('x-powered-by');

// Atrás de Cloudflare/Render/Nginx: confia no X-Forwarded-* para saber o IP real
// (rate limit) e se a conexão original era HTTPS (req.secure).
app.set('trust proxy', trustProxy());

// Correlation ID: cada requisição ganha um id (ou reaproveita o do proxy, se
// for um id bem-formado) que vai para os logs e volta no cabeçalho X-Request-Id.
app.use((req, res, next) => {
  const recebido = req.get('x-request-id');
  req.id = recebido && /^[A-Za-z0-9._-]{8,64}$/.test(recebido) ? recebido : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// HTTPS obrigatório em produção: HTTP é redirecionado (o /health fica livre
// para o health check interno da plataforma). O host do redirect vem de
// API_PUBLIC_URL quando definido — não do cabeçalho Host, que o cliente controla.
if (isProduction()) {
  const hostFixo = process.env.API_PUBLIC_URL ? new URL(process.env.API_PUBLIC_URL).host : null;
  app.use((req, res, next) => {
    if (req.secure || req.path === '/health') return next();
    return res.redirect(301, `https://${hostFixo || req.headers.host}${req.originalUrl}`);
  });
}

// A API só devolve JSON (e imagens): a CSP mais restrita possível.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'unsafe-inline'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // HSTS só em produção (em localhost travaria o navegador em HTTPS).
    strictTransportSecurity: isProduction()
      ? { maxAge: 63072000, includeSubDomains: true, preload: true }
      : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  })
);

// A API não usa nenhum recurso sensível do navegador.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
});

// Relatórios de violação de CSP enviados pelo navegador (report-uri do front).
// Só registra no log (sem dados do usuário além da URL); corpo pequeno e rate limit.
app.post(
  '/csp-report',
  apiLimiter,
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '10kb' }),
  (req, res) => {
    const r = (req.body && (req.body['csp-report'] || (Array.isArray(req.body) ? req.body[0]?.body : req.body))) || {};
    logger.warn('Violação de CSP', {
      documento: String(r['document-uri'] || r.documentURL || '').slice(0, 300),
      diretiva: String(r['violated-directive'] || r.effectiveDirective || '').slice(0, 100),
      bloqueado: String(r['blocked-uri'] || r.blockedURL || '').slice(0, 300),
    });
    res.status(204).end();
  }
);

// /.well-known/security.txt (RFC 9116): onde relatar vulnerabilidades.
app.get('/.well-known/security.txt', (req, res) => {
  const contato = process.env.SECURITY_CONTACT || 'mailto:seguranca@agromundo.com.br';
  const site = (process.env.FRONTEND_URL || 'https://agromundo.com.br').replace(/\/$/, '');
  const expira = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
  res.type('text/plain; charset=utf-8').send(
    `Contact: ${contato}\nExpires: ${expira}\nPreferred-Languages: pt-BR, en\nPolicy: ${site}/privacidade\nCanonical: ${process.env.API_PUBLIC_URL || site}/.well-known/security.txt\n`
  );
});

// ==========================================
// 1. Middlewares Globais de Configuração
// ==========================================

// CORS restrito: só as origens listadas em CORS_ORIGINS (front web e app).
// Requisições sem Origin (curl, health check, servidor-a-servidor) seguem;
// origens desconhecidas não recebem os cabeçalhos CORS e o navegador bloqueia.
const origens = origensPermitidas();
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || origens.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600,
  })
);

// Webhook de pagamento precisa do corpo BRUTO para validar a assinatura HMAC
// (registrado antes do express.json, que consumiria o corpo).
app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '100kb' }));

// Escritas só aceitam JSON ou multipart (uploads): outro Content-Type → 415.
app.use('/api', (req, res, next) => {
  const temCorpo = Number(req.get('content-length') || 0) > 0 || !!req.get('transfer-encoding');
  if (!temCorpo || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.is('application/json') || req.is('multipart/form-data') || req.path === '/payments/webhook') return next();
  return res.status(415).json({ status: 'error', message: 'Content-Type não suportado. Envie JSON.' });
});

// Permite que o Express leia e interprete requisições que enviam dados no formato JSON (no corpo/body).
// Limite de tamanho evita DoS com corpos gigantes (uploads vão por multipart/Multer).
// O reviver descarta chaves de prototype pollution (__proto__, constructor, prototype).
const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);
app.use(express.json({ limit: '100kb', reviver: (chave, valor) => (CHAVES_PROIBIDAS.has(chave) ? undefined : valor) }));

// Permite que o Express leia dados enviados via formulários HTML (URL Encoded)
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 200 }));

// Lê os cookies (sessão HttpOnly + CSRF)
app.use(cookieParser());

// ==========================================
// 2. Middlewares Customizados e Arquivos Estáticos
// ==========================================

// Aplica o middleware de log para todas as requisições, ajudando a monitorar quem acessa o quê (RS06)
app.use(loggerMiddleware);

// Define que arquivos dentro da pasta de uploads podem ser acessados diretamente via URL HTTP (Ex: http://localhost:3000/uploads/imagem.jpg)
// O 'express.static' expõe a pasta publicamente, o que é ideal para buscar as imagens de anúncios (RS02).
// Os arquivos são servidos como imagem inerte: sem listagem, sem dotfiles,
// nosniff e CSP "sandbox" (um arquivo malicioso não executa script nesta origem).
app.use(
  '/uploads',
  express.static(process.env.UPLOAD_DIR || path.join(__dirname, '../public/uploads'), {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
      // Imagens são exibidas pelo front e pelo app (outras origens).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// ==========================================
// 3. Definição de Rotas
// ==========================================

// Respostas da API podem conter dados pessoais: nada fica em cache de
// navegador, proxy ou CDN.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Todas as rotas da API começarão com o prefixo '/api' (Ex: /api/users, /api/ads)
app.use('/api', apiLimiter, apiRoutes);

// Links de compartilhamento com prévia (Open Graph) para WhatsApp e redes sociais
app.use('/share', require('./routes/shareRoutes'));

// Rota raiz (welcome route) para verificar se a API está online e dar as boas-vindas
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Bem-vindo ao Backend do Agrostand API'
  });
});

// Endpoint de Health Check (verificação de saúde da aplicação)
// Usado por sistemas de monitoramento para saber se o servidor está ativo (UP)
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString() // Retorna a data/hora atual no padrão ISO
  });
});

// Rota inexistente: JSON padronizado (sem a página HTML padrão do Express)
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Recurso não encontrado.' });
});

// ==========================================
// 4. Tratamento de Erros
// ==========================================

// Middleware centralizado de tratamento de erros. Deve ser SEMPRE o último a ser registrado
// Qualquer erro gerado nas rotas ou middlewares anteriores será capturado aqui (RNF12, RS06)
app.use(errorMiddleware);

// Exporta o aplicativo Express configurado para ser iniciado no arquivo server.js
module.exports = app;
