/**
 * @file services.ts
 * @description Services do front — um por Controller do backend, com os mesmos
 * nomes de operação e os mesmos nomes de campo que a API espera. Cada método
 * devolve o `data` do envelope já tipado; erros sobem como `ApiError`.
 *
 * Mapa de rotas (src/routes do agrostand-backend):
 *   /auth       → AutenticacaoService
 *   /users      → UsuarioService
 *   /addresses  → EnderecoService
 *   /categories → CategoriaService
 *   /ads        → AnuncioService
 *   /favorites  → FavoritoService
 */

import { request, tokenStorage } from './client';
import type {
  AnuncioDetalhe,
  AnuncioInput,
  AnuncioResumo,
  Categoria,
  Endereco,
  EnderecoInput,
  Favorito,
  ListaPaginada,
  SessaoDTO,
  ToggleFavoritoDTO,
  Usuario,
} from './types';

// ─── /auth ───
export type RegisterInput = {
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  senha: string;
} & EnderecoInput;

export const AutenticacaoService = {
  /** POST /auth/register — cria usuário + endereço e já devolve o JWT. */
  async register(input: RegisterInput): Promise<SessaoDTO> {
    const { data } = await request<SessaoDTO>('/auth/register', { method: 'POST', body: input });
    tokenStorage.set(data.token);
    return data;
  },

  /** POST /auth/login — 401 credenciais inválidas, 429 bloqueio temporário (RN19). */
  async login(email: string, senha: string): Promise<SessaoDTO> {
    const { data } = await request<SessaoDTO>('/auth/login', { method: 'POST', body: { email, senha } });
    tokenStorage.set(data.token);
    return data;
  },

  /** POST /auth/google — valida o ID token do Google; cria a conta no primeiro acesso. */
  async loginWithGoogle(credential: string): Promise<SessaoDTO & { novoUsuario: boolean }> {
    const { data } = await request<SessaoDTO & { novoUsuario: boolean }>('/auth/google', {
      method: 'POST',
      body: { credential },
    });
    tokenStorage.set(data.token);
    return data;
  },

  /** POST /auth/logout — revoga o JWT atual (UC13). Limpa o token local mesmo se falhar. */
  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST', auth: true });
    } finally {
      tokenStorage.clear();
    }
  },

  /** POST /auth/forgot-password — sempre responde sucesso (anti-enumeração). */
  async forgotPassword(email: string): Promise<string | undefined> {
    const { message } = await request('/auth/forgot-password', { method: 'POST', body: { email } });
    return message;
  },

  /** POST /auth/reset-password — código de 6 dígitos enviado por e-mail. */
  async resetPassword(email: string, codigo: string, novaSenha: string): Promise<string | undefined> {
    const { message } = await request('/auth/reset-password', {
      method: 'POST',
      body: { email, codigo, novaSenha },
    });
    return message;
  },

  isAuthenticated(): boolean {
    return !!tokenStorage.get();
  },
};

// ─── /users ───
export const UsuarioService = {
  /** GET /users/profile */
  async getProfile(): Promise<Usuario> {
    const { data } = await request<{ usuario: Usuario }>('/users/profile', { auth: true });
    return data.usuario;
  },

  /** PUT /users/profile */
  async updateProfile(input: Pick<Usuario, 'nome' | 'sobrenome' | 'email' | 'telefone'>): Promise<Usuario> {
    const { data } = await request<{ usuario: Usuario }>('/users/profile', {
      method: 'PUT',
      body: input,
      auth: true,
    });
    return data.usuario;
  },

  /** PUT /users/password */
  async updatePassword(senhaAtual: string, novaSenha: string, confirmarNovaSenha: string): Promise<void> {
    await request('/users/password', {
      method: 'PUT',
      body: { senhaAtual, novaSenha, confirmarNovaSenha },
      auth: true,
    });
  },

  /** DELETE /users/account — exclusão definitiva (LGPD). */
  async deleteAccount(): Promise<void> {
    await request('/users/account', { method: 'DELETE', auth: true });
    tokenStorage.clear();
  },
};

// ─── /addresses ───
export const EnderecoService = {
  /** GET /addresses */
  async list(): Promise<Endereco[]> {
    const { data } = await request<{ enderecos: Endereco[] }>('/addresses', { auth: true });
    return data.enderecos;
  },

  /** POST /addresses */
  async create(input: EnderecoInput): Promise<Endereco> {
    const { data } = await request<{ endereco: Endereco }>('/addresses', {
      method: 'POST',
      body: input,
      auth: true,
    });
    return data.endereco;
  },

  /** PUT /addresses/:id */
  async update(id: number, input: EnderecoInput): Promise<Endereco> {
    const { data } = await request<{ endereco: Endereco }>(`/addresses/${id}`, {
      method: 'PUT',
      body: input,
      auth: true,
    });
    return data.endereco;
  },

  /** DELETE /addresses/:id */
  async delete(id: number): Promise<void> {
    await request(`/addresses/${id}`, { method: 'DELETE', auth: true });
  },
};

// ─── /categories ───
export const CategoriaService = {
  /** GET /categories (público) */
  async list(): Promise<Categoria[]> {
    const { data } = await request<{ categorias: Categoria[] }>('/categories');
    return data.categorias;
  },
};

// ─── /ads ───
export type ListarAnunciosQuery = {
  page?: number;
  limit?: number;
  categoriaId?: number | null;
  search?: string | null;
};

/** Monta o multipart esperado pelo Multer (`imagemPrincipal` + `imagensSecundarias`). */
function toAnuncioFormData(input: AnuncioInput): FormData {
  const form = new FormData();
  form.append('nome', input.nome);
  form.append('descricao', input.descricao);
  form.append('preco', String(input.preco));
  form.append('categoriaId', String(input.categoriaId));

  if (input.enderecoId) {
    form.append('enderecoId', String(input.enderecoId));
  } else if (input.novoEndereco) {
    for (const [key, value] of Object.entries(input.novoEndereco)) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
  }

  if (input.imagemPrincipal) form.append('imagemPrincipal', input.imagemPrincipal);
  for (const file of input.imagensSecundarias ?? []) form.append('imagensSecundarias', file);
  if (input.deletarImagensIds?.length) form.append('deletarImagensIds', input.deletarImagensIds.join(','));

  return form;
}

export const AnuncioService = {
  /** GET /ads — vitrine pública (só ATIVOS), paginada, com filtro e busca. */
  async list(query: ListarAnunciosQuery = {}): Promise<ListaPaginada<AnuncioResumo>> {
    const { data } = await request<ListaPaginada<AnuncioResumo>>('/ads', { query });
    return data;
  },

  /** GET /ads/:id — detalhe + vendedor + link WhatsApp. */
  async get(id: number | string): Promise<AnuncioDetalhe> {
    const { data } = await request<{ anuncio: AnuncioDetalhe }>(`/ads/${id}`);
    return data.anuncio;
  },

  /** GET /ads/me/products — painel do anunciante (ATIVO | EM_LIXEIRA). */
  async myProducts(
    query: { page?: number; limit?: number; status?: 'ATIVO' | 'EM_LIXEIRA' } = {}
  ): Promise<ListaPaginada<AnuncioResumo>> {
    const { data } = await request<ListaPaginada<AnuncioResumo>>('/ads/me/products', { query, auth: true });
    return data;
  },

  /** POST /ads — multipart; imagem principal obrigatória (RN04). */
  async create(input: AnuncioInput): Promise<{ message?: string }> {
    const { message } = await request('/ads', { method: 'POST', body: toAnuncioFormData(input), auth: true });
    return { message };
  },

  /** PUT /ads/:id — multipart; enderecoId obrigatório na edição. */
  async update(id: number, input: AnuncioInput): Promise<{ message?: string }> {
    const { message } = await request(`/ads/${id}`, {
      method: 'PUT',
      body: toAnuncioFormData(input),
      auth: true,
    });
    return { message };
  },

  /** DELETE /ads/:id — envia para a lixeira (soft delete, RS09). */
  async remove(id: number): Promise<string | undefined> {
    const { message } = await request(`/ads/${id}`, { method: 'DELETE', auth: true });
    return message;
  },

  /** POST /ads/:id/restore — tira da lixeira. */
  async restore(id: number): Promise<string | undefined> {
    const { message } = await request(`/ads/${id}/restore`, { method: 'POST', auth: true });
    return message;
  },
};

// ─── /favorites ───
export const FavoritoService = {
  /** POST /favorites/toggle — liga/desliga o coração (só anúncios ATIVOS). */
  async toggle(anuncioId: number | string): Promise<ToggleFavoritoDTO> {
    const { data } = await request<ToggleFavoritoDTO>('/favorites/toggle', {
      method: 'POST',
      body: { anuncioId: Number(anuncioId) },
      auth: true,
    });
    return data;
  },

  /** GET /favorites — recentes primeiro, indisponíveis sinalizados. */
  async list(): Promise<Favorito[]> {
    const { data } = await request<{ favoritos: Favorito[] }>('/favorites', { auth: true });
    return data.favoritos;
  },

  /** DELETE /favorites/:id — id do favorito (não do anúncio). */
  async remove(id: number): Promise<void> {
    await request(`/favorites/${id}`, { method: 'DELETE', auth: true });
  },
};
