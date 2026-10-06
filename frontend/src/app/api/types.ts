/**
 * @file types.ts
 * @description Tipos dos DTOs devolvidos pela API do Agrostand. Mantêm os nomes
 * exatamente como o backend responde (snake_case legado dos DAOs + camelCase
 * dos campos de entrada), para não haver tradução implícita entre as camadas.
 */

export type Zona = 'URBANA' | 'RURAL';
export type StatusAnuncio = 'ATIVO' | 'EM_LIXEIRA' | 'REMOVIDO';

// ─── Usuário ───
export type Usuario = {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  data_cadastro?: string;
};

export type SessaoDTO = {
  token: string;
  usuario: Usuario;
};

// ─── Endereço ───
export type Endereco = {
  id: number;
  cliente_id: number;
  rua: string;
  numero: string;
  bairro: string;
  cep: string | null;
  cidade: string;
  uf: string;
  zona: Zona;
};

export type EnderecoInput = {
  rua: string;
  numero: string;
  bairro: string;
  cep?: string;
  cidade: string;
  uf: string;
  zona: Zona;
};

// ─── Categoria ───
export type Categoria = {
  id: number;
  nome: string;
  descricao: string | null;
};

// ─── Anúncio ───
export type Imagem = {
  id: number;
  url: string;
  tipo: 'PRINCIPAL' | 'SECUNDARIA';
  ordem: number;
};

/** Item de listagem (GET /ads e GET /ads/me/products). */
export type AnuncioResumo = {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  data_publicacao: string;
  status: StatusAnuncio;
  anunciante_id: number;
  categoria_id: number;
  endereco_id: number;
  vendedor_nome: string;
  vendedor_sobrenome: string;
  categoria_nome: string;
  cidade: string;
  uf: string;
  zona: Zona;
  imagem_principal: string | null;
};

export type Paginacao = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type ListaPaginada<T> = {
  data: T[];
  pagination: Paginacao;
};

/** Detalhe público (GET /ads/:id) — inclui link do WhatsApp (RF07/RS01). */
export type AnuncioDetalhe = {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  data_publicacao: string;
  status: StatusAnuncio;
  categoria: { id: number; nome: string };
  localizacao: {
    id: number;
    rua: string;
    numero: string;
    bairro: string;
    cep: string | null;
    cidade: string;
    uf: string;
    zona: Zona;
  };
  vendedor: {
    id: number;
    nome: string;
    telefone: string;
    link_whatsapp: string | null;
  };
  imagens: Imagem[];
};

/** Campos de texto do multipart de POST/PUT /ads. */
export type AnuncioInput = {
  nome: string;
  descricao: string;
  preco: number | string;
  categoriaId: number | string;
  /** Endereço existente do anunciante; se ausente (só no POST), envie `novoEndereco`. */
  enderecoId?: number | string;
  novoEndereco?: EnderecoInput;
  imagemPrincipal?: File | null;
  imagensSecundarias?: File[];
  /** Só no PUT: ids de imagens secundárias a remover. */
  deletarImagensIds?: number[];
};

// ─── Favorito ───
export type Favorito = {
  id: number;
  cliente_id: number;
  anuncio_id: number;
  data_favorito: string;
  disponivel: boolean;
  anuncio: {
    id: number;
    nome: string;
    preco: number;
    status: StatusAnuncio;
    imagem_principal: string | null;
  } | null;
};

export type ToggleFavoritoDTO = {
  favoritado: boolean;
  id: number | null;
};
