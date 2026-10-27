/**
 * @file types.ts
 * @description Tipos dos DTOs devolvidos pela API do Agrostand. Mantêm os nomes
 * exatamente como o backend responde (snake_case legado dos DAOs + camelCase
 * dos campos de entrada), para não haver tradução implícita entre as camadas.
 */

export type Zona = 'URBANA' | 'RURAL';
export type StatusAnuncio = 'ATIVO' | 'PAUSADO' | 'EM_LIXEIRA' | 'REMOVIDO';

// ─── Usuário ───
export type Usuario = {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  data_cadastro?: string;
  /** E-mail listado em ADMIN_EMAILS no backend (só em GET /users/profile). */
  is_admin?: boolean;
};

export type SessaoDTO = {
  token: string;
  usuario: Usuario;
  /** Token CSRF da sessão por cookie (web). */
  csrfToken?: string;
};

/** Login de conta com verificação em duas etapas: falta o código do autenticador. */
export type DesafioMfa = {
  mfaRequired: true;
  mfaToken: string;
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
  // Campos de venda (opcionais; ausentes na edição = mantém o valor atual)
  unidade?: Unidade;
  /** '' = sem controle de estoque */
  estoque?: number | '';
  pesoKg?: number | '';
  /** '' = sem promoção */
  precoPromocional?: number | '';
  /** AAAA-MM-DD ou '' (sem data de fim) */
  promocaoAte?: string;
  permiteEntrega?: boolean;
  permiteRetirada?: boolean;
  atacado?: Array<{ quantidadeMinima: number; preco: number }>;
  certificacoes?: Array<{ tipo: TipoCertificacao; numero?: string | null }>;
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

// ─── Venda (campos do anúncio) ───
export type Unidade = 'un' | 'kg' | 'g' | 'dz' | 'maco' | 'bandeja' | 'litro' | 'saca' | 'caixa' | 'pe';
export type TipoCertificacao = 'ORGANICO' | 'SIF' | 'SIE' | 'SIM' | 'SISBI';
export type FaixaAtacado = { quantidade_minima: number; preco: number };
export type CertificacaoDTO = { tipo: TipoCertificacao; numero: string | null };

export type CamposVenda = {
  unidade: Unidade;
  estoque: number | null;
  peso_kg: number | null;
  preco_promocional: number | null;
  promocao_ate: string | null;
  em_oferta: boolean;
  preco_efetivo: number;
  permite_entrega: boolean;
  permite_retirada: boolean;
  nota_media: number | null;
  total_avaliacoes: number;
};

export type AnuncioResumoVenda = AnuncioResumo & CamposVenda & {
  vendedor_verificado: boolean;
  latitude: number | null;
  longitude: number | null;
  distancia_km: number | null;
};

export type AnuncioDetalheVenda = AnuncioDetalhe & CamposVenda & {
  atacado: FaixaAtacado[];
  certificacoes: CertificacaoDTO[];
  vendedor: AnuncioDetalhe['vendedor'] & { foto_url: string | null; desde: string; verificado: boolean };
};

export type Estatisticas = {
  periodo_dias: number;
  totais: { visualizacoes: number; cliques_whatsapp: number };
  por_anuncio: Array<{
    anuncio_id: number; nome: string; status: StatusAnuncio;
    visualizacoes: number; cliques_whatsapp: number; visualizacoes_periodo: number; cliques_periodo: number;
  }>;
  serie: Array<{ dia: string; visualizacoes: number; cliques_whatsapp: number }>;
};

// ─── Pedidos ───
export type StatusPedido =
  | 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'EM_PREPARACAO' | 'ENVIADO' | 'PRONTO_RETIRADA' | 'ENTREGUE' | 'CANCELADO';
export type TipoEntrega = 'ENTREGA' | 'RETIRADA';
export type FormaPagamento = 'PIX' | 'CARTAO' | 'BOLETO';

export type OpcaoEntrega = {
  tipo: TipoEntrega;
  valor: number;
  prazo_min: number;
  prazo_max: number;
  gratis: boolean;
  faixa?: 'MESMA_CIDADE' | 'MESMO_ESTADO' | 'OUTRO_ESTADO';
  endereco?: { cidade: string; uf: string; bairro: string; rua: string; numero: string };
};

export type GrupoCarrinho = {
  vendedor_id: number;
  vendedor_nome: string;
  itens: Array<{
    anuncio_id: number; nome: string; unidade: Unidade; quantidade: number;
    preco_unitario: number; total: number; imagem_url: string | null;
  }>;
  subtotal: number;
  peso_kg: number;
  opcoes: OpcaoEntrega[];
};

export type ItemPedido = {
  id: number; anuncio_id: number | null; nome: string; unidade: Unidade;
  preco_unitario: number; quantidade: number; imagem_url: string | null; avaliado?: boolean;
};

export type Pedido = {
  id: number;
  comprador_id: number;
  vendedor_id: number;
  status: StatusPedido;
  tipo_entrega: TipoEntrega;
  forma_pagamento: FormaPagamento;
  entrega_rua: string | null; entrega_numero: string | null; entrega_bairro: string | null;
  entrega_cep: string | null; entrega_cidade: string | null; entrega_uf: string | null;
  subtotal: number; frete: number; total: number;
  codigo_rastreio: string | null;
  observacao: string | null;
  origem: 'CARRINHO' | 'COTACAO' | 'ASSINATURA';
  data_criacao: string; data_atualizacao: string;
  comprador_nome: string; comprador_telefone: string;
  vendedor_nome: string; vendedor_telefone: string;
  itens: ItemPedido[];
};

export type PedidoDetalhe = Pedido & {
  papel: 'COMPRADOR' | 'VENDEDOR';
  acoes: StatusPedido[];
  historico: Array<{ status: string; observacao: string | null; data: string }>;
  reclamacao: { id: number; status: StatusReclamacao } | null;
};

// ─── Notificações ───
export type Notificacao = {
  id: number; tipo: string; titulo: string; mensagem: string | null; link: string | null; lida: boolean; data: string;
};

// ─── Reputação ───
export type Avaliacao = {
  id: number; anuncio_id: number; anuncio_nome: string; nota: number; comentario: string | null;
  resposta_vendedor: string | null; data: string; autor_nome: string; fotos: string[];
};
export type ResumoAvaliacoes = { media: number | null; total: number; distribuicao: Record<1 | 2 | 3 | 4 | 5, number> };

export type Pergunta = {
  id: number; autor_id: number; autor_nome: string; texto: string;
  resposta: string | null; data_pergunta: string; data_resposta: string | null;
};

export type Reputacao = {
  vendas_concluidas: number; cancelamentos: number; taxa_cancelamento: number;
  reclamacoes_resolvidas_contra: number; nota_media: number | null; total_avaliacoes: number;
  anuncios_ativos: number; nivel: 0 | 1 | 2 | 3 | 4 | 5; rotulo: string;
};

export type PerfilProdutor = {
  produtor: {
    id: number; nome: string; bio: string | null; video_url: string | null; foto_url: string | null;
    desde: string; verificado: boolean; cidade: string | null; uf: string | null; zona: Zona | null;
    latitude: number | null; longitude: number | null;
  };
  reputacao: Reputacao;
  avaliacoes: Avaliacao[];
  resumo_avaliacoes: ResumoAvaliacoes;
};

export type PerfilPublico = { bio: string | null; video_url: string | null; foto_url: string | null };

export type Verificacao = {
  id: number; tipo_documento: 'CPF' | 'CNPJ'; documento: string; car: string | null;
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA'; observacao: string | null; data_envio: string; data_decisao: string | null;
  usuario_nome?: string; usuario_email?: string;
};

// ─── Chat ───
export type Conversa = {
  id: number; comprador_id: number; vendedor_id: number; anuncio_id: number | null; anuncio_nome: string | null;
  anuncio_imagem: string | null; data_atualizacao: string; ultima_mensagem: string | null; nao_lidas: number;
  papel: 'COMPRADOR' | 'VENDEDOR'; outra_parte: string;
};
export type Mensagem = { id: number; autor_id: number; texto: string; data: string; lida: boolean };

// ─── Reclamações ───
export type MotivoReclamacao = 'NAO_RECEBIDO' | 'PRODUTO_DIFERENTE' | 'PRODUTO_DANIFICADO' | 'QUALIDADE' | 'OUTRO';
export type StatusReclamacao =
  | 'ABERTA' | 'RESPONDIDA' | 'EM_MEDIACAO' | 'RESOLVIDA_COMPRADOR' | 'RESOLVIDA_VENDEDOR' | 'ENCERRADA';
export type Reclamacao = {
  id: number; pedido_id: number; comprador_id: number; vendedor_id: number; motivo: MotivoReclamacao;
  descricao: string; pedido_devolucao: boolean; status: StatusReclamacao; resposta_vendedor: string | null;
  decisao_mediacao: string | null; data_abertura: string; data_atualizacao: string; pedido_total: number;
  comprador_nome: string; vendedor_nome: string; papel?: 'COMPRADOR' | 'VENDEDOR' | 'ADMIN';
};

// ─── Cotações e cestas ───
export type StatusCotacao = 'PENDENTE' | 'RESPONDIDA' | 'ACEITA' | 'RECUSADA' | 'CANCELADA';
export type Cotacao = {
  id: number; anuncio_id: number; anuncio_nome: string; anuncio_unidade: Unidade; anuncio_preco: number;
  cliente_id: number; vendedor_id: number; cliente_nome: string; vendedor_nome: string; quantidade: number;
  mensagem: string | null; status: StatusCotacao; preco_unitario: number | null; prazo_entrega: string | null;
  resposta: string | null; pedido_id: number | null; data_criacao: string; data_resposta: string | null;
};

export type Frequencia = 'SEMANAL' | 'QUINZENAL' | 'MENSAL';
export type Cesta = {
  id: number; vendedor_id: number; vendedor_nome: string; nome: string; descricao: string; itens: string;
  preco: number; frequencia: Frequencia; imagem_url: string | null; ativa: boolean; data_criacao: string;
  assinantes: number; cidade: string | null; uf: string | null;
};
export type Assinatura = {
  id: number; status: 'ATIVA' | 'PAUSADA' | 'CANCELADA'; tipo_entrega: TipoEntrega; proxima_entrega: string;
  data_inicio: string; cesta_id: number; cesta_nome: string; cesta_preco: number; cesta_frequencia: Frequencia;
  cesta_imagem: string | null; vendedor_nome: string;
};
export type Assinante = {
  id: number; cliente_id: number; cliente_nome: string; cliente_telefone: string; status: Assinatura['status'];
  tipo_entrega: TipoEntrega; proxima_entrega: string; data_inicio: string;
  rua: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null;
};
