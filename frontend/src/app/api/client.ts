/**
 * @file client.ts
 * @description Cliente HTTP do Agrostand. Espelha o contrato da API:
 * - toda resposta vem no envelope `{ status: 'success' | 'error', message?, data? }`;
 * - erros de negócio (AppError no backend) chegam como `{ status: 'error', message }`
 *   com o HTTP code correspondente e viram `ApiError` aqui;
 * - sessão: no navegador o JWT fica num cookie HttpOnly (JavaScript não lê →
 *   XSS não rouba a sessão) e escritas levam o cabeçalho X-CSRF-Token; no app
 *   nativo (Capacitor) o JWT vai em `Authorization: Bearer <jwt>`.
 */

import { LIMITE_ENVIO, reduzirImagensDoForm } from './imagem';

// Em dev o Vite faz proxy de /api e /uploads para o backend (vite.config.ts).
// Em produção, defina VITE_API_URL (ex: https://api.agrostand.com/api).
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const TOKEN_KEY = 'agrostand.token';
// Web: guarda só o token CSRF (não é credencial; sem o cookie HttpOnly não vale nada).
const CSRF_KEY = 'agrostand.csrf';

/** App Android/iOS (Capacitor): cookies entre origens não são confiáveis lá → Bearer. */
function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

// Migração: versões antigas guardavam o JWT no localStorage do navegador.
if (!isNative()) {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage indisponível */ }
}

function lerCookie(nome: string): string | null {
  const par = document.cookie.split('; ').find(c => c.startsWith(`${nome}=`));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
}

export type ApiEnvelope<T> = {
  status: 'success' | 'error';
  message?: string;
  data?: T;
};

/** Equivalente front do AppError: carrega o HTTP code e a mensagem do backend. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const tokenStorage = {
  /** Há sessão? (app: o JWT; web: o marcador CSRF — o JWT está no cookie HttpOnly). */
  get(): string | null {
    try { return localStorage.getItem(isNative() ? TOKEN_KEY : CSRF_KEY); } catch { return null; }
  },
  /** Chamado após login/cadastro com o envelope da sessão. */
  set(token: string, csrfToken?: string) {
    try {
      if (isNative()) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.setItem(CSRF_KEY, csrfToken || lerCookie('agrostand_csrf') || '1');
    } catch { /* storage indisponível */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CSRF_KEY);
    } catch { /* storage indisponível */ }
  },
  /** JWT para o cabeçalho Authorization (só no app nativo). */
  bearer(): string | null {
    if (!isNative()) return null;
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  /** Token CSRF para escritas autenticadas por cookie. */
  csrf(): string | null {
    if (isNative()) return null;
    try { return lerCookie('agrostand_csrf') || localStorage.getItem(CSRF_KEY); } catch { return null; }
  },
};

// Notifica o app quando o backend rejeita o token (expirado, revogado no logout, usuário excluído).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | null | undefined>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  /** Objeto (enviado como JSON) ou FormData (multipart, para uploads via Multer). */
  body?: unknown;
  /** true = exige login; 'optional' = envia o token se houver (rotas públicas que personalizam). */
  auth?: boolean | 'optional';
};

function buildUrl(path: string, query?: Query): string {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Executa a requisição e devolve a resposta completa do envelope
 * (`message` + `data`). Lança `ApiError` para qualquer status != 2xx.
 */
export async function request<T = undefined>(
  path: string,
  { method = 'GET', query, body, auth = false }: RequestOptions = {}
): Promise<{ message?: string; data: T }> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (body instanceof FormData) {
    // o browser define o boundary do multipart
    const { form, tamanho } = await reduzirImagensDoForm(body);
    if (tamanho > LIMITE_ENVIO) {
      throw new ApiError(413, 'As fotos ficaram grandes demais para um envio só. Envie menos fotos de cada vez.');
    }
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  if (auth === true && !tokenStorage.get()) {
    throw new ApiError(401, 'Acesso negado. Token não fornecido.');
  }
  if (auth) {
    const bearer = tokenStorage.bearer();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const csrf = tokenStorage.csrf();
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
  }

  let response: Response;
  try {
    // credentials: envia o cookie HttpOnly de sessão também para a API em outro subdomínio.
    response = await fetch(buildUrl(path, query), { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua conexão.');
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = await response.json();
  } catch {
    // resposta sem corpo JSON (ex: proxy fora do ar)
  }

  if (!response.ok || !envelope || envelope.status !== 'success') {
    if (response.status === 401 && auth === true) {
      tokenStorage.clear();
      onUnauthorized?.();
    }
    throw new ApiError(
      response.status,
      envelope?.message || 'Ocorreu um erro inesperado. Tente novamente.'
    );
  }

  return { message: envelope.message, data: envelope.data as T };
}

/** Mensagem amigável para exibir na UI a partir de qualquer erro. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}
