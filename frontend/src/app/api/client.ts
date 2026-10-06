/**
 * @file client.ts
 * @description Cliente HTTP do Agrostand. Espelha o contrato da API:
 * - toda resposta vem no envelope `{ status: 'success' | 'error', message?, data? }`;
 * - erros de negócio (AppError no backend) chegam como `{ status: 'error', message }`
 *   com o HTTP code correspondente e viram `ApiError` aqui;
 * - rotas protegidas exigem `Authorization: Bearer <jwt>` (authMiddleware).
 */

// Em dev o Vite faz proxy de /api e /uploads para o backend (vite.config.ts).
// Em produção, defina VITE_API_URL (ex: https://api.agrostand.com/api).
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const TOKEN_KEY = 'agrostand.token';

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
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage indisponível */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage indisponível */ }
  },
};

// Notifica o app quando o backend rejeita o token (expirado, revogado no logout, usuário excluído).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | null | undefined>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Query;
  /** Objeto (enviado como JSON) ou FormData (multipart, para uploads via Multer). */
  body?: unknown;
  auth?: boolean;
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
    payload = body; // o browser define o boundary do multipart
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const token = tokenStorage.get();
  if (auth) {
    if (!token) throw new ApiError(401, 'Acesso negado. Token não fornecido.');
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body: payload });
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
    if (response.status === 401 && auth) {
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
