/**
 * @file schema.js
 * @description Schema Drizzle ORM — fonte única de verdade das tabelas PostgreSQL.
 *
 * Convenções:
 * - Nomes de TABELAS e COLUNAS preservam o legado (Usuario, Endereco, ... + snake_case)
 *   (herdados do SQLite) — no PostgreSQL ficam entre aspas ("Usuario", ...).
 * - Nomes de PROPRIEDADES JS usam camelCase idiomático do Drizzle
 *   (ex: `clienteId` <-> coluna `cliente_id`).
 * - A camada de DAOs (`src/dao`) traduz a saída para o formato snake_case legado
 *   esperado pelos Controllers (`cliente_id`, `senha_hash`, `anunciante_id`, ...),
 *   mantendo a API HTTP estável.
 */

const { pgTable, text, integer, bigint, doublePrecision, boolean, index, uniqueIndex, check } = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// Timestamps seguem como TEXT no formato do legado SQLite (UTC 'YYYY-MM-DD HH:MM:SS'),
// preservando o contrato da API e as comparações lexicográficas com ISO-8601.
const AGORA_UTC = sql`to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')`;

// ─── Usuario ───
const usuarios = pgTable(
  'Usuario',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    nome: text('nome').notNull(),
    sobrenome: text('sobrenome').notNull(),
    email: text('email').notNull().unique(),
    telefone: text('telefone').notNull(),
    senhaHash: text('senha_hash').notNull(),
    bio: text('bio'),
    videoUrl: text('video_url'),
    fotoUrl: text('foto_url'),
    dataCadastro: text('data_cadastro')
      .default(AGORA_UTC)
      .notNull(),
  },
  (t) => [
    index('idx_usuario_email').on(t.email),
  ]
);

// ─── Endereco ───
const enderecos = pgTable(
  'Endereco',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    clienteId: integer('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    rua: text('rua').notNull(),
    numero: text('numero').notNull(),
    bairro: text('bairro').notNull(),
    cep: text('cep'),
    cidade: text('cidade').notNull(),
    uf: text('uf').notNull(),
    zona: text('zona').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
  },
  (t) => [
    index('idx_endereco_cliente').on(t.clienteId),
    check('chk_endereco_zona', sql`${t.zona} IN ('URBANA', 'RURAL')`),
  ]
);

// ─── Categoria ───
const categorias = pgTable('Categoria', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
});

// ─── Anuncio ───
const anuncios = pgTable(
  'Anuncio',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    anuncianteId: integer('anunciante_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    categoriaId: integer('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    enderecoId: integer('endereco_id')
      .notNull()
      .references(() => enderecos.id, { onDelete: 'restrict' }),
    nome: text('nome').notNull(),
    descricao: text('descricao').notNull(),
    preco: doublePrecision('preco').notNull(),
    dataPublicacao: text('data_publicacao')
      .default(AGORA_UTC)
      .notNull(),
    status: text('status').default('ATIVO').notNull(),
    dataRemocao: text('data_remocao'),
    unidade: text('unidade').default('un').notNull(),
    estoque: integer('estoque'),
    pesoKg: doublePrecision('peso_kg'),
    precoPromocional: doublePrecision('preco_promocional'),
    promocaoAte: text('promocao_ate'),
    permiteEntrega: boolean('permite_entrega').default(true).notNull(),
    permiteRetirada: boolean('permite_retirada').default(true).notNull(),
  },
  (t) => [
    index('idx_anuncio_anunciante_status').on(t.anuncianteId, t.status),
    index('idx_anuncio_categoria_status').on(t.categoriaId, t.status),
    index('idx_anuncio_endereco').on(t.enderecoId),
    check(
      'chk_anuncio_status',
      sql`${t.status} IN ('ATIVO', 'PAUSADO', 'EM_LIXEIRA', 'REMOVIDO')`
    ),
  ]
);

// ─── Imagem ───
const imagens = pgTable(
  'Imagem',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    anuncioId: integer('anuncio_id')
      .notNull()
      .references(() => anuncios.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    tipo: text('tipo').notNull(),
    ordem: integer('ordem').notNull(),
  },
  (t) => [
    index('idx_imagem_anuncio').on(t.anuncioId),
    check('chk_imagem_tipo', sql`${t.tipo} IN ('PRINCIPAL', 'SECUNDARIA')`),
    // Garante no nível do banco no máximo 1 PRINCIPAL por anúncio.
    // Equivalente ao índice parcial legado:
    //   CREATE UNIQUE INDEX ... ON Imagem(anuncio_id) WHERE tipo = 'PRINCIPAL'
    uniqueIndex('idx_anuncio_imagem_principal')
      .on(t.anuncioId)
      .where(sql`${t.tipo} = 'PRINCIPAL'`),
  ]
);

// ─── RecuperacaoSenha ───
const recuperacaoSenhas = pgTable(
  'RecuperacaoSenha',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    usuarioId: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    expiraEm: text('expira_em').notNull(),
    usado: integer('usado').default(0).notNull(),
  },
  (t) => [index('idx_recuperacaosenha_usuario').on(t.usuarioId)]
);

// ─── Favorito ───
// RN17: um cliente não favorita o mesmo anúncio duas vezes (UNIQUE).
const favoritos = pgTable(
  'Favorito',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    clienteId: integer('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    anuncioId: integer('anuncio_id')
      .notNull()
      .references(() => anuncios.id, { onDelete: 'cascade' }),
    dataFavorito: text('data_favorito')
      .default(AGORA_UTC)
      .notNull(),
  },
  (t) => [
    index('idx_favorito_cliente').on(t.clienteId),
    index('idx_favorito_anuncio').on(t.anuncioId),
    uniqueIndex('uq_favorito_cliente_anuncio').on(t.clienteId, t.anuncioId),
  ]
);

// ─── TentativaLogin (RN19) ───
// Contador de falhas consecutivas por e-mail para bloqueio temporário.
// Sem janela de expiração: só um login bem-sucedido zera a contagem.
const tentativasLogin = pgTable(
  'TentativaLogin',
  {
    email: text('email').primaryKey(),
    tentativas: integer('tentativas').default(0).notNull(),
    bloqueadoAte: text('bloqueado_ate'),
    atualizadoEm: text('atualizado_em')
      .default(AGORA_UTC)
      .notNull(),
  },
  (t) => [index('idx_tentativalogin_bloqueio').on(t.bloqueadoAte)]
);

// ─── TokenRevogado (UC13 logout) ───
// Denylist de JWTs: guarda o hash SHA-256 do token até sua expiração.
// Linhas expiradas são purgadas de forma amortizada a cada logout.
const tokensRevogados = pgTable(
  'TokenRevogado',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    tokenHash: text('token_hash').notNull().unique(),
    expiraEm: text('expira_em').notNull(),
    revogadoEm: text('revogado_em')
      .default(AGORA_UTC)
      .notNull(),
  },
  (t) => [
    index('idx_tokenrevogado_hash').on(t.tokenHash),
    index('idx_tokenrevogado_expira').on(t.expiraEm),
  ]
);

// ─── Marketplace: atacado, certificações, eventos ───
const precosAtacado = pgTable('PrecoAtacado', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  quantidadeMinima: integer('quantidade_minima').notNull(),
  preco: doublePrecision('preco').notNull(),
});

const certificacoes = pgTable('Certificacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),
  numero: text('numero'),
});

const eventosAnuncio = pgTable('EventoAnuncio', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  sessao: text('sessao'),
  data: text('data').default(AGORA_UTC).notNull(),
});

// ─── Pedidos ───
const pedidos = pgTable('Pedido', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  compradorId: integer('comprador_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  status: text('status').default('AGUARDANDO_PAGAMENTO').notNull(),
  tipoEntrega: text('tipo_entrega').notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  entregaRua: text('entrega_rua'),
  entregaNumero: text('entrega_numero'),
  entregaBairro: text('entrega_bairro'),
  entregaCep: text('entrega_cep'),
  entregaCidade: text('entrega_cidade'),
  entregaUf: text('entrega_uf'),
  subtotal: doublePrecision('subtotal').notNull(),
  frete: doublePrecision('frete').default(0).notNull(),
  total: doublePrecision('total').notNull(),
  codigoRastreio: text('codigo_rastreio'),
  observacao: text('observacao'),
  origem: text('origem').default('CARRINHO').notNull(),
  dataCriacao: text('data_criacao').default(AGORA_UTC).notNull(),
  dataAtualizacao: text('data_atualizacao').default(AGORA_UTC).notNull(),
});

const itensPedido = pgTable('ItemPedido', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  pedidoId: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  anuncioId: integer('anuncio_id').references(() => anuncios.id, { onDelete: 'set null' }),
  nome: text('nome').notNull(),
  unidade: text('unidade').default('un').notNull(),
  precoUnitario: doublePrecision('preco_unitario').notNull(),
  quantidade: integer('quantidade').notNull(),
  imagemUrl: text('imagem_url'),
});

const historicoPedido = pgTable('HistoricoPedido', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  pedidoId: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  observacao: text('observacao'),
  data: text('data').default(AGORA_UTC).notNull(),
});

// ─── Reputação: avaliações e perguntas ───
const avaliacoes = pgTable('Avaliacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  pedidoId: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  autorId: integer('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  nota: integer('nota').notNull(),
  comentario: text('comentario'),
  respostaVendedor: text('resposta_vendedor'),
  data: text('data').default(AGORA_UTC).notNull(),
});

const avaliacaoFotos = pgTable('AvaliacaoFoto', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  avaliacaoId: integer('avaliacao_id').notNull().references(() => avaliacoes.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
});

const perguntas = pgTable('Pergunta', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  autorId: integer('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  texto: text('texto').notNull(),
  resposta: text('resposta'),
  dataPergunta: text('data_pergunta').default(AGORA_UTC).notNull(),
  dataResposta: text('data_resposta'),
});

// ─── Comunicação: chat e notificações ───
const conversas = pgTable('Conversa', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  compradorId: integer('comprador_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  anuncioId: integer('anuncio_id').references(() => anuncios.id, { onDelete: 'set null' }),
  dataAtualizacao: text('data_atualizacao').default(AGORA_UTC).notNull(),
});

const mensagens = pgTable('Mensagem', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  conversaId: integer('conversa_id').notNull().references(() => conversas.id, { onDelete: 'cascade' }),
  autorId: integer('autor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  texto: text('texto').notNull(),
  lida: boolean('lida').default(false).notNull(),
  data: text('data').default(AGORA_UTC).notNull(),
});

const notificacoes = pgTable('Notificacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(),
  titulo: text('titulo').notNull(),
  mensagem: text('mensagem'),
  link: text('link'),
  lida: boolean('lida').default(false).notNull(),
  data: text('data').default(AGORA_UTC).notNull(),
});

// ─── Pós-venda e confiança ───
const reclamacoes = pgTable('Reclamacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  pedidoId: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  compradorId: integer('comprador_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  motivo: text('motivo').notNull(),
  descricao: text('descricao').notNull(),
  pedidoDevolucao: boolean('pedido_devolucao').default(false).notNull(),
  status: text('status').default('ABERTA').notNull(),
  respostaVendedor: text('resposta_vendedor'),
  decisaoMediacao: text('decisao_mediacao'),
  dataAbertura: text('data_abertura').default(AGORA_UTC).notNull(),
  dataAtualizacao: text('data_atualizacao').default(AGORA_UTC).notNull(),
});

const verificacoes = pgTable('Verificacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  tipoDocumento: text('tipo_documento').notNull(),
  documento: text('documento').notNull(),
  car: text('car'),
  status: text('status').default('PENDENTE').notNull(),
  observacao: text('observacao'),
  dataEnvio: text('data_envio').default(AGORA_UTC).notNull(),
  dataDecisao: text('data_decisao'),
});

// ─── Cestas por assinatura e cotações ───
const cestas = pgTable('Cesta', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  descricao: text('descricao').notNull(),
  itens: text('itens').notNull(),
  preco: doublePrecision('preco').notNull(),
  frequencia: text('frequencia').notNull(),
  imagemUrl: text('imagem_url'),
  ativa: boolean('ativa').default(true).notNull(),
  dataCriacao: text('data_criacao').default(AGORA_UTC).notNull(),
});

const assinaturas = pgTable('Assinatura', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  cestaId: integer('cesta_id').notNull().references(() => cestas.id, { onDelete: 'cascade' }),
  clienteId: integer('cliente_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  status: text('status').default('ATIVA').notNull(),
  tipoEntrega: text('tipo_entrega').notNull(),
  enderecoId: integer('endereco_id').references(() => enderecos.id, { onDelete: 'set null' }),
  proximaEntrega: text('proxima_entrega').notNull(),
  dataInicio: text('data_inicio').default(AGORA_UTC).notNull(),
});

const cotacoes = pgTable('Cotacao', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  anuncioId: integer('anuncio_id').notNull().references(() => anuncios.id, { onDelete: 'cascade' }),
  clienteId: integer('cliente_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  vendedorId: integer('vendedor_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  quantidade: integer('quantidade').notNull(),
  mensagem: text('mensagem'),
  status: text('status').default('PENDENTE').notNull(),
  precoUnitario: doublePrecision('preco_unitario'),
  prazoEntrega: text('prazo_entrega'),
  resposta: text('resposta'),
  pedidoId: integer('pedido_id').references(() => pedidos.id, { onDelete: 'set null' }),
  dataCriacao: text('data_criacao').default(AGORA_UTC).notNull(),
  dataResposta: text('data_resposta'),
});

// ─── Segurança: MFA (TOTP) e eventos do gateway de pagamento ───
const mfaUsuarios = pgTable('MfaUsuario', {
  usuarioId: integer('usuario_id').primaryKey().references(() => usuarios.id, { onDelete: 'cascade' }),
  segredoCifrado: text('segredo_cifrado').notNull(),
  ativo: boolean('ativo').default(false).notNull(),
  ultimoPasso: bigint('ultimo_passo', { mode: 'number' }).default(0).notNull(),
  criadoEm: text('criado_em').default(AGORA_UTC).notNull(),
});

const pagamentoEventos = pgTable('PagamentoEvento', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  eventoId: text('evento_id').notNull().unique('PagamentoEvento_evento_id_unique'),
  pedidoId: integer('pedido_id').references(() => pedidos.id, { onDelete: 'set null' }),
  tipo: text('tipo').notNull(),
  valor: doublePrecision('valor'),
  resultado: text('resultado').notNull(),
  recebidoEm: text('recebido_em').default(AGORA_UTC).notNull(),
});

// ─── Sessões no servidor (id = jti do JWT) e códigos de recuperação do MFA ───
const sessoes = pgTable(
  'Sessao',
  {
    id: text('id').primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    criadaEm: text('criada_em').default(AGORA_UTC).notNull(),
    ultimoUso: text('ultimo_uso').default(AGORA_UTC).notNull(),
    expiraEm: text('expira_em').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    mfa: boolean('mfa').default(false).notNull(),
    revogadaEm: text('revogada_em'),
  },
  (t) => [index('idx_sessao_usuario').on(t.usuarioId), index('idx_sessao_expira').on(t.expiraEm)]
);

const mfaCodigosRecuperacao = pgTable(
  'MfaCodigoRecuperacao',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    codigoHash: text('codigo_hash').notNull(),
    usadoEm: text('usado_em'),
  },
  (t) => [index('idx_mfarecuperacao_usuario').on(t.usuarioId)]
);

module.exports = {
  sessoes,
  mfaCodigosRecuperacao,
  usuarios,
  enderecos,
  categorias,
  anuncios,
  imagens,
  recuperacaoSenhas,
  favoritos,
  tentativasLogin,
  tokensRevogados,
  precosAtacado,
  certificacoes,
  eventosAnuncio,
  pedidos,
  itensPedido,
  historicoPedido,
  avaliacoes,
  avaliacaoFotos,
  perguntas,
  conversas,
  mensagens,
  notificacoes,
  reclamacoes,
  verificacoes,
  cestas,
  assinaturas,
  cotacoes,
  mfaUsuarios,
  pagamentoEventos,
};
