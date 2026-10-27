/**
 * @file esquemas.js
 * @description Schemas zod das rotas JSON. Campos ficam opcionais no schema
 * quando o service já devolve a mensagem de negócio de "campo obrigatório";
 * aqui o foco é tipo, tamanho e formato (um objeto onde se espera texto, um
 * texto de 1 MB, um id que não é número etc.).
 */

const { z } = require('zod');

// Texto livre com teto de tamanho. Aceita número (ex: numero/cep vindos como number).
const texto = (max) =>
  z.union([z.string(), z.number()]).transform(String).pipe(z.string().max(max, `máximo de ${max} caracteres`));

// Senha: só string, sem transformar (espaços fazem parte da senha).
const senha = z.string().max(128, 'máximo de 128 caracteres');

const id = z.coerce.number({ message: 'deve ser um número' }).int('deve ser inteiro').positive('deve ser positivo');

// Número "solto": tipo checado aqui, faixa/regra checada no service (mensagem de negócio).
const numero = z.union([z.number(), z.string().max(20, 'valor muito longo')]);

const paramsId = z.object({ id });


const endereco = {
  rua: texto(200).optional(),
  numero: texto(20).optional(),
  bairro: texto(120).optional(),
  cep: texto(12).optional().nullable(),
  cidade: texto(120).optional(),
  uf: texto(2).optional(),
  zona: texto(10).optional(),
};

const itensCarrinho = z
  .array(z.object({ anuncioId: numero, quantidade: numero }))
  .max(100, 'máximo de 100 itens')
  .optional();

// ─── /auth ───
const auth = {
  register: z.object({
    nome: texto(80).optional(),
    sobrenome: texto(120).optional(),
    email: texto(254).optional(),
    telefone: texto(20).optional(),
    senha: senha.optional(),
    ...endereco,
  }),
  login: z.object({ email: texto(254).optional(), senha: senha.optional() }),
  google: z.object({ credential: z.string().max(4096).optional() }),
  forgot: z.object({ email: texto(254).optional() }),
  reset: z.object({
    email: texto(254).optional(),
    codigo: texto(10).optional(),
    novaSenha: senha.optional(),
  }),
  // codigo: 6 dígitos do app ou código de recuperação (XXXXX-XXXXX)
  mfaVerify: z.object({ mfaToken: z.string().max(2048), codigo: texto(20) }),
  mfaCodigo: z.object({ codigo: texto(20) }),
  sessaoParams: z.object({ sessaoId: z.string().uuid('sessão inválida') }),
};

// ─── /users ───
const usuarios = {
  perfil: z.object({
    nome: texto(80).optional(),
    sobrenome: texto(120).optional(),
    email: texto(254).optional(),
    telefone: texto(20).optional(),
    // exigida só quando o e-mail muda
    senhaAtual: senha.optional(),
  }),
  senha: z.object({
    senhaAtual: senha.optional(),
    novaSenha: senha.optional(),
    confirmarNovaSenha: senha.optional(),
  }),
};

// ─── /addresses ───
const enderecos = { corpo: z.object(endereco) };

// ─── /orders ───
const pedidos = {
  cotar: z.object({ itens: itensCarrinho, cidade: texto(120).optional(), uf: texto(2).optional() }),
  checkout: z.object({
    itens: itensCarrinho,
    entregas: z.record(z.string().max(12), z.string().max(20)).optional(),
    enderecoId: numero.optional().nullable(),
    formaPagamento: z.string().max(20).optional(),
    observacao: texto(500).optional().nullable(),
  }),
  status: z.object({
    status: z.string().max(30).optional(),
    codigoRastreio: texto(60).optional().nullable(),
    observacao: texto(300).optional().nullable(),
  }),
  listar: z.object({ status: z.string().max(30).optional() }),
};

// ─── /quotes ───
const cotacoes = {
  solicitar: z.object({
    anuncioId: numero.optional(),
    quantidade: numero.optional(),
    mensagem: texto(1000).optional().nullable(),
  }),
  responder: z.object({
    precoUnitario: numero.optional().nullable(),
    prazoEntrega: texto(100).optional().nullable(),
    resposta: texto(1000).optional().nullable(),
    recusar: z.boolean().optional(),
  }),
  aceitar: z.object({
    tipoEntrega: z.string().max(20).optional(),
    enderecoId: numero.optional().nullable(),
    formaPagamento: z.string().max(20).optional(),
  }),
};

// ─── /chats ───
const chats = {
  iniciar: z.object({ anuncioId: numero.optional(), texto: texto(2000).optional() }),
  enviar: z.object({ texto: texto(2000).optional() }),
  mensagens: z.object({ depoisDe: numero.optional() }),
};

module.exports = { paramsId, auth, usuarios, enderecos, pedidos, cotacoes, chats };
