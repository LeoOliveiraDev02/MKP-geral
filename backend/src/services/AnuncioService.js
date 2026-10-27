/**
 * @file AnuncioService.js
 * @description Camada de serviço: ciclo de vida dos anúncios.
 * Orquestra o agregado de domínio (`Anuncio` + `Produto` + `Imagem` + ...),
 * os DAOs e o upload de arquivos; lança erros de `src/errors`.
 *
 * Nota de transação:
 * - Upload/remoção de arquivos ocorre ANTES ou DEPOIS da transação, nunca
 *   dentro de `db.transaction(async (tx) => ...)` (arquivos não fazem rollback).
 * - `httpReq` (Express) é usado SOMENTE para descobrir protocolo/host na
 *   montagem da URL pública do upload — nada de HTTP além disso.
 */

const AnuncioDAO = require('../dao/AnuncioDAO');
const EventoAnuncioDAO = require('../dao/EventoAnuncioDAO');
const GeocodificacaoService = require('./GeocodificacaoService');
const ImagemDAO = require('../dao/ImagemDAO');
const EnderecoDAO = require('../dao/EnderecoDAO');
const CategoriaDAO = require('../dao/CategoriaDAO');
const ArmazenamentoService = require('./armazenamentoService');
const { getDb } = require('../db');
const { runAsSystem } = require('../db/context');
const { generateWhatsAppLink } = require('../utils/whatsapp');
const logger = require('../utils/logger');
const {
  Anuncio,
  Produto,
  Imagem,
  Endereco,
  reconstituirAnunciante,
  reconstituirCategoria,
  reconstituirEndereco,
  reconstituirAgregadoAnuncio,
} = require('../domain/factories');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/AppError');

const UNIDADES = ['un', 'kg', 'g', 'dz', 'maco', 'bandeja', 'litro', 'saca', 'caixa', 'pe'];
const CERTIFICACOES = ['ORGANICO', 'SIF', 'SIE', 'SIM', 'SISBI'];
const ORDENACOES = ['recentes', 'menor_preco', 'maior_preco', 'mais_avaliados', 'proximos'];

function numeroOuNulo(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

function booleano(valor) {
  if (valor === undefined) return undefined;
  return valor === true || valor === 'true' || valor === '1' || valor === 'on';
}

function lerJson(valor, campo) {
  if (valor === undefined || valor === '') return undefined;
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    throw new BadRequestError(`O campo ${campo} deve ser um JSON válido.`);
  }
}

/**
 * Lê e valida os campos de venda do corpo (multipart chega como string).
 * Campo ausente = `undefined` (na edição, mantém o valor atual).
 */
function lerCamposVenda(body, precoBase) {
  const venda = {};

  if (body.unidade !== undefined) {
    if (!UNIDADES.includes(body.unidade)) {
      throw new BadRequestError(`Unidade inválida. Use uma de: ${UNIDADES.join(', ')}.`);
    }
    venda.unidade = body.unidade;
  }

  if (body.estoque !== undefined) {
    const estoque = numeroOuNulo(body.estoque);
    if (estoque !== null && (!Number.isInteger(estoque) || estoque < 0)) {
      throw new BadRequestError('O estoque deve ser um número inteiro maior ou igual a zero.');
    }
    venda.estoque = estoque;
  }

  if (body.pesoKg !== undefined) {
    const peso = numeroOuNulo(body.pesoKg);
    if (peso !== null && (Number.isNaN(peso) || peso <= 0)) {
      throw new BadRequestError('O peso deve ser maior que zero.');
    }
    venda.pesoKg = peso;
  }

  if (body.precoPromocional !== undefined) {
    const promo = numeroOuNulo(body.precoPromocional);
    if (promo !== null && (Number.isNaN(promo) || promo <= 0 || promo >= precoBase)) {
      throw new BadRequestError('O preço promocional deve ser maior que zero e menor que o preço normal.');
    }
    venda.precoPromocional = promo;
  }

  if (body.promocaoAte !== undefined) {
    const ate = body.promocaoAte || null;
    if (ate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      throw new BadRequestError('A data de fim da promoção deve estar no formato AAAA-MM-DD.');
    }
    venda.promocaoAte = ate;
  }

  venda.permiteEntrega = booleano(body.permiteEntrega);
  venda.permiteRetirada = booleano(body.permiteRetirada);
  if (venda.permiteEntrega === false && venda.permiteRetirada === false) {
    throw new BadRequestError('O anúncio precisa aceitar entrega, retirada ou os dois.');
  }

  const atacado = lerJson(body.atacado, 'atacado');
  if (atacado !== undefined) {
    if (!Array.isArray(atacado)) throw new BadRequestError('O campo atacado deve ser uma lista de faixas.');
    const vistos = new Set();
    venda.atacado = atacado.map((faixa) => {
      const quantidadeMinima = Number(faixa.quantidadeMinima ?? faixa.quantidade_minima);
      const preco = Number(faixa.preco);
      if (!Number.isInteger(quantidadeMinima) || quantidadeMinima < 2) {
        throw new BadRequestError('Cada faixa de atacado precisa de uma quantidade mínima inteira a partir de 2.');
      }
      if (!Number.isFinite(preco) || preco <= 0 || preco >= precoBase) {
        throw new BadRequestError('O preço de atacado deve ser maior que zero e menor que o preço normal.');
      }
      if (vistos.has(quantidadeMinima)) throw new BadRequestError('Há faixas de atacado com a mesma quantidade mínima.');
      vistos.add(quantidadeMinima);
      return { quantidadeMinima, preco };
    });
  }

  const certs = lerJson(body.certificacoes, 'certificacoes');
  if (certs !== undefined) {
    if (!Array.isArray(certs)) throw new BadRequestError('O campo certificacoes deve ser uma lista.');
    const tipos = new Set();
    venda.certificacoes = certs.map((c) => {
      const tipo = String(c.tipo || '').toUpperCase();
      if (!CERTIFICACOES.includes(tipo)) {
        throw new BadRequestError(`Certificação inválida. Use uma de: ${CERTIFICACOES.join(', ')}.`);
      }
      if (tipos.has(tipo)) throw new BadRequestError('Certificação repetida.');
      tipos.add(tipo);
      return { tipo, numero: c.numero ? String(c.numero).trim().slice(0, 60) : null };
    });
  }

  return venda;
}

class AnuncioService {
  static async list(query) {
    const parsedPage = parseInt(query.page) || 1;
    const parsedLimit = Math.min(parseInt(query.limit) || 10, 50);
    // Querystring usa `categoriaId` (PT); aceita `categoryId` (EN) como alias.
    const rawCategory = query.categoriaId ?? query.categoryId;
    const search = query.search || null;
    const sort = ORDENACOES.includes(query.sort) ? query.sort : 'recentes';
    const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
    const zona = query.zona ? String(query.zona).toUpperCase() : undefined;
    if (zona && zona !== 'URBANA' && zona !== 'RURAL') {
      throw new BadRequestError('A zona deve ser URBANA ou RURAL.');
    }
    return AnuncioDAO.findAll({
      page: parsedPage,
      limit: parsedLimit,
      categoryId: rawCategory ? parseInt(rawCategory) : null,
      anuncianteId: query.anuncianteId ? parseInt(query.anuncianteId) : null,
      search,
      status: 'ATIVO',
      precoMin: num(query.precoMin),
      precoMax: num(query.precoMax),
      uf: query.uf || undefined,
      cidade: query.cidade || undefined,
      zona,
      ofertas: query.ofertas === 'true' || query.ofertas === '1',
      lat: num(query.lat),
      lng: num(query.lng),
      raioKm: num(query.raioKm),
      excluirIds: query.excluir ? String(query.excluir).split(',').map(Number).filter(Number.isInteger) : [],
      sort,
    });
  }

  /** Sugestões enquanto o usuário digita (mínimo 2 letras). */
  static async suggest({ q }) {
    const termo = String(q || '').trim();
    if (termo.length < 2) return { produtos: [], categorias: [] };
    return AnuncioDAO.suggest(termo.slice(0, 60));
  }

  /** Registra visualização ou clique no WhatsApp (anônimo ou logado). */
  static async registrarEvento({ id, tipo, sessao, usuarioId }) {
    if (tipo !== 'VISUALIZACAO' && tipo !== 'CLIQUE_WHATSAPP') {
      throw new BadRequestError('Tipo de evento inválido.');
    }
    const ad = await AnuncioDAO.findById(id);
    if (!ad) throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    // O próprio vendedor olhando o anúncio não conta como visita
    if (usuarioId && usuarioId === ad.anunciante_id) return;
    await EventoAnuncioDAO.create({
      anuncioId: ad.id,
      tipo,
      usuarioId: usuarioId || null,
      sessao: sessao ? String(sessao).slice(0, 64) : null,
    });
  }

  /** "Quem viu também viu"; sem histórico suficiente, completa com a mesma categoria. */
  static async recomendacoes({ id, limit = 8 }) {
    const ad = await AnuncioDAO.findById(id);
    if (!ad) throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    const co = await runAsSystem(() => EventoAnuncioDAO.coVisualizados(ad.id, limit));
    let itens = await AnuncioDAO.findManyByIds(co.map((r) => r.anuncio_id));
    if (itens.length < limit) {
      const { data } = await AnuncioDAO.findAll({
        page: 1,
        limit: limit - itens.length,
        categoryId: ad.categoria_id,
        status: 'ATIVO',
        excluirIds: [ad.id, ...itens.map((i) => i.id)],
      });
      itens = itens.concat(data);
    }
    return { anuncios: itens, baseado_em_visitas: co.length > 0 };
  }

  /** Painel do vendedor: visitas e cliques por anúncio + série diária. */
  static async estatisticas({ anuncianteId, dias }) {
    const periodo = Math.min(Math.max(parseInt(dias) || 30, 1), 365);
    const porAnuncio = await EventoAnuncioDAO.statsByAnunciante(anuncianteId, periodo);
    const serie = await EventoAnuncioDAO.seriePorDia(anuncianteId, periodo);
    const soma = (campo) => porAnuncio.reduce((acc, r) => acc + r[campo], 0);
    return {
      periodo_dias: periodo,
      totais: {
        visualizacoes: soma('visualizacoes_periodo'),
        cliques_whatsapp: soma('cliques_periodo'),
      },
      por_anuncio: porAnuncio,
      serie,
    };
  }

  /** Pausa (some da vitrine) ou reativa um anúncio. */
  static async alterarStatus({ anunciantePublic, id, status }) {
    if (status !== 'ATIVO' && status !== 'PAUSADO') {
      throw new BadRequestError('Status inválido. Use ATIVO ou PAUSADO.');
    }
    const ad = await runAsSystem(() => AnuncioDAO.findById(id, true));
    if (!ad) throw new NotFoundError('Anúncio não encontrado.');
    if (ad.anunciante_id !== anunciantePublic.id) {
      throw new ForbiddenError('Você não possui permissão para alterar anúncios de outros usuários.');
    }
    if (ad.status !== 'ATIVO' && ad.status !== 'PAUSADO') {
      throw new BadRequestError('Só é possível pausar ou reativar anúncios publicados.');
    }
    await AnuncioDAO.setStatus(id, status);
    logger.audit(status === 'PAUSADO' ? 'Anúncio pausado' : 'Anúncio reativado', {
      userId: anunciantePublic.id,
      anuncioId: Number(id),
    });
    return { status };
  }

  static async get({ id }) {
    const ad = await AnuncioDAO.findById(id);
    if (!ad) {
      throw new NotFoundError('Anúncio indisponível ou não encontrado.');
    }

    // RF07/RS01 — link WhatsApp (redação contratada na resposta da API).
    const whatsappMsg = `Olá ${ad.vendedor_nome}, vi seu anúncio do produto "${ad.nome}" por R$ ${ad.preco_efetivo.toFixed(2)} no Marketplace e gostaria de negociar.`;
    const linkWhatsapp = generateWhatsAppLink(ad.vendedor_telefone, whatsappMsg);

    return {
      id: ad.id,
      nome: ad.nome,
      descricao: ad.descricao,
      preco: ad.preco,
      data_publicacao: ad.data_publicacao,
      status: ad.status,
      categoria: { id: ad.categoria_id, nome: ad.categoria_nome },
      localizacao: {
        id: ad.endereco_id,
        rua: ad.rua,
        numero: ad.numero,
        bairro: ad.bairro,
        cep: ad.cep,
        cidade: ad.cidade,
        uf: ad.uf,
        zona: ad.zona,
      },
      vendedor: {
        id: ad.anunciante_id,
        nome: `${ad.vendedor_nome} ${ad.vendedor_sobrenome}`,
        telefone: ad.vendedor_telefone,
        link_whatsapp: linkWhatsapp,
        foto_url: ad.vendedor_foto,
        desde: ad.vendedor_desde,
        verificado: ad.vendedor_verificado,
      },
      imagens: ad.imagens,
      unidade: ad.unidade,
      estoque: ad.estoque,
      peso_kg: ad.peso_kg,
      preco_promocional: ad.preco_promocional,
      promocao_ate: ad.promocao_ate,
      em_oferta: ad.em_oferta,
      preco_efetivo: ad.preco_efetivo,
      permite_entrega: ad.permite_entrega,
      permite_retirada: ad.permite_retirada,
      atacado: ad.atacado,
      certificacoes: ad.certificacoes,
      nota_media: ad.nota_media,
      total_avaliacoes: ad.total_avaliacoes,
    };
  }

  static async create({ anunciantePublic, body, files, httpReq }) {
    const anuncianteId = anunciantePublic.id;
    const { nome, descricao, preco, categoriaId, enderecoId } = body;

    if (!nome || !descricao || !preco || !categoriaId) {
      throw new BadRequestError('Os campos nome, descrição, preço e categoriaId são obrigatórios.');
    }

    const parsedPreco = parseFloat(preco);
    if (isNaN(parsedPreco) || parsedPreco <= 0) {
      throw new BadRequestError('O preço informado deve ser um número maior que zero.');
    }

    const category = await CategoriaDAO.findById(categoriaId);
    if (!category) {
      throw new BadRequestError('A categoria informada não existe.');
    }

    const venda = lerCamposVenda(body, parsedPreco);

    // RN04 — imagem principal obrigatória
    const primaryImageFile = files && files.imagemPrincipal ? files.imagemPrincipal[0] : null;
    if (!primaryImageFile) {
      throw new BadRequestError('Todo anúncio deve conter obrigatoriamente uma imagem principal.');
    }

    // RN06 — resolve endereço (validação antes da tx; criação dentro da tx).
    // A presença dos campos do novo endereço é invariante da entidade Endereco.
    let resolvedEnderecoId = enderecoId ? parseInt(enderecoId) : null;
    let novoEnderecoEnt = null;
    let enderecoEnt = null;

    if (!resolvedEnderecoId) {
      const { rua, numero, bairro, cep, cidade, uf, zona } = body;
      novoEnderecoEnt = new Endereco({ clienteId: anuncianteId, rua, numero, bairro, cep, cidade, uf, zona });
      if (!novoEnderecoEnt.validar()) {
        throw new BadRequestError('Informe um enderecoId existente ou todos os campos para cadastrar um novo endereço para o anúncio.');
      }
      const upperZona = String(zona).toUpperCase();
      if (upperZona !== 'URBANA' && upperZona !== 'RURAL') {
        throw new BadRequestError('A zona do novo endereço deve ser classificada como URBANA ou RURAL.');
      }
      novoEnderecoEnt.zona = upperZona;
      enderecoEnt = novoEnderecoEnt;
    } else {
      // Pré-checagem como sistema: distingue 404 de 403 (RLS esconderia o alheio)
      const address = await runAsSystem(() => EnderecoDAO.findById(resolvedEnderecoId));
      if (!address) {
        throw new BadRequestError('O endereço informado não existe.');
      }
      if (address.cliente_id !== anuncianteId) {
        throw new ForbiddenError('Você só pode vincular anúncios a endereços de sua propriedade.');
      }
      enderecoEnt = reconstituirEndereco(address);
    }

    // Uploads ANTES da tx (I/O assíncrono fora da transação síncrona)
    const primaryUrl = await ArmazenamentoService.uploadImage(primaryImageFile, httpReq);
    const secondaryFiles = files && files.imagensSecundarias ? files.imagensSecundarias : [];
    const secondaryUrls = [];
    for (const file of secondaryFiles) {
      secondaryUrls.push(await ArmazenamentoService.uploadImage(file, httpReq));
    }

    // Domínio: monta o agregado e publica via anunciante — `publicar()` barra
    // anúncios inconsistentes (sem produto/categoria/endereço/imagem).
    const anuncianteEnt = reconstituirAnunciante(anunciantePublic);
    const anuncioEnt = new Anuncio({
      produto: new Produto({ nome, descricao, preco: parsedPreco }),
      imagens: [
        new Imagem({ url: primaryUrl, tipo: 'PRINCIPAL', ordem: 1 }),
        ...secondaryUrls.map((url, i) => new Imagem({ url, tipo: 'SECUNDARIA', ordem: i + 2 })),
      ],
      anunciante: anuncianteEnt,
      categoria: reconstituirCategoria(category),
      endereco: enderecoEnt,
      status: 'ATIVO',
    });
    try {
      anuncianteEnt.publicarAnuncio(anuncioEnt);
    } catch (err) {
      throw new BadRequestError(err.message);
    }

    // Transação atômica: endereço (se novo) + anúncio + imagens, do estado da entidade
    const adId = await getDb().transaction(async (tx) => {
      let enderecoFinal = resolvedEnderecoId;
      if (!enderecoFinal) {
        enderecoFinal = await EnderecoDAO.create({
          clienteId: anuncianteId,
          rua: novoEnderecoEnt.rua,
          numero: novoEnderecoEnt.numero,
          bairro: novoEnderecoEnt.bairro,
          cep: novoEnderecoEnt.cep,
          cidade: novoEnderecoEnt.cidade,
          uf: novoEnderecoEnt.uf,
          zona: novoEnderecoEnt.zona,
        }, tx);
      }
      const id = await AnuncioDAO.create({
        anuncianteId: anuncianteEnt.id,
        categoriaId,
        enderecoId: enderecoFinal,
        nome: anuncioEnt.produto.nome,
        descricao: anuncioEnt.produto.descricao,
        preco: anuncioEnt.produto.preco,
        ...venda,
      }, tx);
      for (const img of anuncioEnt.imagens) {
        await ImagemDAO.create({ anuncioId: id, url: img.url, tipo: img.tipo, ordem: img.ordem }, tx);
      }
      if (venda.atacado) await AnuncioDAO.replaceAtacado(id, venda.atacado, tx);
      if (venda.certificacoes) await AnuncioDAO.replaceCertificacoes(id, venda.certificacoes, tx);
      return id;
    });

    if (!resolvedEnderecoId) GeocodificacaoService.agendarPendentes(anuncianteId);

    logger.audit('Novo anúncio de produto publicado', {
      userId: anuncianteId,
      anuncioId: adId,
      preco: parsedPreco,
    });

    return AnuncioDAO.findById(adId);
  }

  static async update({ anunciantePublic, id, body, files, httpReq }) {
    const anuncianteId = anunciantePublic.id;
    const { nome, descricao, preco, categoriaId, enderecoId } = body;

    // Pré-checagem como sistema: distingue 404 de 403 (RLS esconderia o alheio)
    const ad = await runAsSystem(() => AnuncioDAO.findById(id, true));
    if (!ad) {
      throw new NotFoundError('Anúncio não encontrado.');
    }

    // RN10 — ownership
    if (ad.anunciante_id !== anuncianteId) {
      throw new ForbiddenError('Você não possui permissão para editar anúncios de outros usuários.');
    }

    if (ad.status === 'REMOVIDO') {
      throw new BadRequestError('Não é possível editar um anúncio que foi removido permanentemente.');
    }

    if (!nome || !descricao || !preco || !categoriaId || !enderecoId) {
      throw new BadRequestError('Os campos nome, descrição, preço, categoriaId e enderecoId são obrigatórios.');
    }

    const parsedPreco = parseFloat(preco);
    if (isNaN(parsedPreco) || parsedPreco <= 0) {
      throw new BadRequestError('O preço informado deve ser um número maior que zero.');
    }

    const category = await CategoriaDAO.findById(categoriaId);
    if (!category) {
      throw new BadRequestError('A categoria informada não existe.');
    }

    const address = await runAsSystem(() => EnderecoDAO.findById(enderecoId));
    if (!address || address.cliente_id !== anuncianteId) {
      throw new BadRequestError('O endereço informado não existe ou não pertence a você.');
    }

    const venda = lerCamposVenda(body, parsedPreco);
    // Promoção existente precisa continuar abaixo de um novo preço base
    if (venda.precoPromocional === undefined && ad.preco_promocional !== null && ad.preco_promocional >= parsedPreco) {
      throw new BadRequestError('O preço promocional atual ficaria maior que o novo preço. Ajuste ou remova a promoção.');
    }

    // Normaliza lista de exclusão (string "1,2" ou array — artefato do multipart)
    let deleteImageIds = body.deletarImagensIds;
    if (typeof deleteImageIds === 'string') {
      deleteImageIds = deleteImageIds.split(',').map((n) => parseInt(n)).filter(Number.isInteger);
    }
    deleteImageIds = Array.isArray(deleteImageIds) ? deleteImageIds.map(Number).filter(Number.isInteger) : [];

    // Validação antecipada: não permitir excluir PRINCIPAL sem substituir
    const newPrimaryFile = files && files.imagemPrincipal ? files.imagemPrincipal[0] : null;
    if (deleteImageIds.length > 0) {
      for (const imgId of deleteImageIds) {
        const rec = await ImagemDAO.findById(imgId);
        if (rec && rec.anuncio_id === parseInt(id) && rec.tipo === 'PRINCIPAL') {
          throw new BadRequestError('Não é permitido excluir a imagem principal sem substituí-la.');
        }
      }
    }

    // Uploads ANTES da tx
    let newPrimaryUrl = null;
    if (newPrimaryFile) {
      newPrimaryUrl = await ArmazenamentoService.uploadImage(newPrimaryFile, httpReq);
    }
    const newSecondaryFiles = files && files.imagensSecundarias ? files.imagensSecundarias : [];
    const newSecondaryUrls = [];
    for (const file of newSecondaryFiles) {
      newSecondaryUrls.push(await ArmazenamentoService.uploadImage(file, httpReq));
    }

    const oldPrimary = ad.imagens.find((img) => img.tipo === 'PRINCIPAL');
    const currentSecondaries = ad.imagens.filter((img) => img.tipo === 'SECUNDARIA');
    const nextOrderBase =
      currentSecondaries.length > 0 ? Math.max(...currentSecondaries.map((img) => img.ordem)) + 1 : 2;

    // Domínio: reconstitui o agregado no estado atual e aplica a edição nele —
    // `editar()` revalida as invariantes antes de qualquer escrita.
    const deleteIdSet = new Set(deleteImageIds);
    try {
      const agregadoAtual = reconstituirAgregadoAnuncio(ad, reconstituirAnunciante(anunciantePublic));
      agregadoAtual.editar({
        produto: new Produto({ id: Number(id), nome, descricao, preco: parsedPreco }),
        categoria: reconstituirCategoria(category),
        endereco: reconstituirEndereco(address),
        imagens: [
          ...ad.imagens
            .filter((img) => !deleteIdSet.has(img.id) && !(newPrimaryUrl && img.tipo === 'PRINCIPAL'))
            .map((img) => new Imagem({ id: img.id, url: img.url, tipo: img.tipo, ordem: img.ordem })),
          ...(newPrimaryUrl ? [new Imagem({ url: newPrimaryUrl, tipo: 'PRINCIPAL', ordem: 1 })] : []),
          ...newSecondaryUrls.map((url, i) => new Imagem({ url, tipo: 'SECUNDARIA', ordem: nextOrderBase + i })),
        ],
      });
    } catch (err) {
      if (err.expose) throw err;
      throw new BadRequestError(err.message);
    }

    // Coleta arquivos físicos a remover APÓS o commit
    const filesToDelete = [];

    await getDb().transaction(async (tx) => {
      await AnuncioDAO.update(id, {
        categoriaId, enderecoId, nome, descricao, preco: parsedPreco, ...venda,
      }, tx);
      if (venda.atacado) await AnuncioDAO.replaceAtacado(id, venda.atacado, tx);
      if (venda.certificacoes) await AnuncioDAO.replaceCertificacoes(id, venda.certificacoes, tx);

      if (newPrimaryUrl) {
        if (oldPrimary) {
          await ImagemDAO.delete(oldPrimary.id, tx);
          filesToDelete.push(oldPrimary.url);
        }
        await ImagemDAO.create({ anuncioId: id, url: newPrimaryUrl, tipo: 'PRINCIPAL', ordem: 1 }, tx);
      }

      let nextOrder = nextOrderBase;
      for (const url of newSecondaryUrls) {
        await ImagemDAO.create({ anuncioId: id, url, tipo: 'SECUNDARIA', ordem: nextOrder++ }, tx);
      }

      for (const imgId of deleteImageIds) {
        const rec = await ImagemDAO.findById(imgId, tx);
        if (rec && rec.anuncio_id === parseInt(id) && rec.tipo !== 'PRINCIPAL') {
          await ImagemDAO.delete(imgId, tx);
          filesToDelete.push(rec.url);
        }
      }
    });

    // Limpeza física pós-commit
    for (const url of filesToDelete) {
      await ArmazenamentoService.deleteImage(url);
    }

    logger.audit('Anúncio de produto editado', { userId: anuncianteId, anuncioId: id });

    return AnuncioDAO.findById(id, true);
  }

  static async remove({ anunciantePublic, id }) {
    const anuncianteId = anunciantePublic.id;

    // Pré-checagem como sistema: distingue 404 de 403 (RLS esconderia o alheio)
    const ad = await runAsSystem(() => AnuncioDAO.findById(id, true));
    if (!ad) {
      throw new NotFoundError('Anúncio não encontrado.');
    }
    if (ad.anunciante_id !== anuncianteId) {
      throw new ForbiddenError('Você não possui permissão para remover anúncios de outros usuários.');
    }

    // Domínio: transição de estado na entidade (RS09 — soft delete)
    const anuncioEnt = reconstituirAgregadoAnuncio(ad, reconstituirAnunciante(anunciantePublic));
    anuncioEnt.moverParaLixeira();

    await AnuncioDAO.moveToLixeira(id);

    logger.audit('Anúncio enviado para a lixeira', { userId: anuncianteId, anuncioId: id });
  }

  static async restore({ anunciantePublic, id }) {
    const anuncianteId = anunciantePublic.id;

    // Pré-checagem como sistema: distingue 404 de 403 (RLS esconderia o alheio)
    const ad = await runAsSystem(() => AnuncioDAO.findById(id, true));
    if (!ad) {
      throw new NotFoundError('Anúncio não encontrado.');
    }
    if (ad.anunciante_id !== anuncianteId) {
      throw new ForbiddenError('Você não possui permissão para restaurar anúncios de outros usuários.');
    }
    if (ad.status !== 'EM_LIXEIRA') {
      throw new BadRequestError('Este anúncio já está ativo ou já foi removido permanentemente.');
    }

    const anuncioEnt = reconstituirAgregadoAnuncio(ad, reconstituirAnunciante(anunciantePublic));
    anuncioEnt.restaurar();

    await AnuncioDAO.restoreFromLixeira(id);

    logger.audit('Anúncio restaurado da lixeira', { userId: anuncianteId, anuncioId: id });
  }

  static async myProducts({ anuncianteId, query }) {
    const parsedPage = parseInt(query.page) || 1;
    const parsedLimit = parseInt(query.limit) || 10;
    const status = query.status || 'ATIVO';

    if (status !== 'ATIVO' && status !== 'PAUSADO' && status !== 'EM_LIXEIRA') {
      throw new BadRequestError('Status inválido. Escolha ATIVO, PAUSADO ou EM_LIXEIRA.');
    }

    return AnuncioDAO.findAll({ page: parsedPage, limit: parsedLimit, anuncianteId, status });
  }

  static async triggerCleanup() {
    // Purga CRON (sem usuário): apaga anúncios de terceiros → contexto de sistema no RLS
    const deletedCount = await runAsSystem(() => AnuncioDAO.cleanupLixeira());

    logger.info('Limpeza de lixeira executada', { deletedCount });

    return { anuncios_excluidos_definitivamente: deletedCount };
  }
}

AnuncioService.UNIDADES = UNIDADES;
AnuncioService.CERTIFICACOES = CERTIFICACOES;

module.exports = AnuncioService;
