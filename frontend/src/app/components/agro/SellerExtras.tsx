/**
 * @file SellerExtras.tsx
 * @description Abas do painel do vendedor além dos anúncios: estatísticas,
 * pedidos recebidos, cotações de atacado, cestas por assinatura e perfil
 * público (apresentação, vídeo, foto e verificação).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Eye, MessageCircle, ShoppingBag, Clock, BadgeCheck, Camera, ShoppingBasket, Users, Truck, Edit, Plus, Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, UNIDADES } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import {
  Card, EmptyState, Modal, Pill, SectionTitle, botaoContorno, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime,
  formatDia, imagemCover, rotulo,
} from './ui';
import { ListaPedidos } from './OrdersPage';
import { STATUS_COTACAO } from './QuotesPage';
import { FREQUENCIA } from './BasketsPage';
import { useApp } from '../../AppContext';
import {
  AnuncioService, AssinaturaService, CestaService, CotacaoService, PedidoService, ProdutorService, VerificacaoService, type CestaInput,
} from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type {
  Assinante, Cesta, Cotacao, Estatisticas, Frequencia, Pedido, PerfilPublico, StatusPedido, Verificacao,
} from '../../api/types';

// ─── Estatísticas ───

export function SellerStats() {
  const app = useApp();
  const [dias, setDias] = useState(30);
  const [stats, setStats] = useState<Estatisticas | null>(null);
  const [resumo, setResumo] = useState<Array<{ status: StatusPedido; total: number; valor: number }>>([]);

  useEffect(() => {
    setStats(null);
    AnuncioService.estatisticas(dias).then(setStats).catch(err => toast.error(getErrorMessage(err)));
  }, [dias]);
  useEffect(() => {
    PedidoService.vendas().then(r => setResumo(r.resumo)).catch(() => undefined);
  }, []);

  const contar = (s: StatusPedido[]) => resumo.filter(r => s.includes(r.status)).reduce((a, r) => a + r.total, 0);
  const vendido = resumo.filter(r => r.status === 'ENTREGUE').reduce((a, r) => a + r.valor, 0);
  // Série completa do período (dias sem visita = 0), em UTC como o backend
  const porDia = new Map((stats?.serie ?? []).map(d => [d.dia, d]));
  const serie = Array.from({ length: dias }, (_, i) => {
    const dia = new Date(Date.now() - (dias - 1 - i) * 86400000).toISOString().slice(0, 10);
    return porDia.get(dia) ?? { dia, visualizacoes: 0, cliques_whatsapp: 0 };
  });
  const maxSerie = Math.max(1, ...serie.map(d => d.visualizacoes));

  const cartoes = [
    { icone: <Eye size={20} />, rotulo: `Visitas (${dias} dias)`, valor: stats?.totais.visualizacoes ?? '—' },
    { icone: <MessageCircle size={20} />, rotulo: 'Cliques no WhatsApp', valor: stats?.totais.cliques_whatsapp ?? '—' },
    { icone: <Clock size={20} />, rotulo: 'Pedidos a atender', valor: contar(['PAGO', 'EM_PREPARACAO']), acao: () => app.go('/vender/pedidos') },
    { icone: <ShoppingBag size={20} />, rotulo: 'Vendido (entregue)', valor: formatCurrency(vendido) },
  ];

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: FONT }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Desempenho</h2>
        <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...campo, width: 'auto', padding: '7px 10px' }}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartoes.map(c => (
          <button key={c.rotulo} onClick={c.acao} disabled={!c.acao}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '16px', textAlign: 'left', cursor: c.acao ? 'pointer' : 'default', fontFamily: FONT }}>
            <span style={{ color: C.orange }}>{c.icone}</span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: C.text, marginTop: '6px' }}>{c.valor}</div>
            <div style={{ fontSize: '12.5px', color: C.muted }}>{c.rotulo}</div>
          </button>
        ))}
      </div>

      <Card>
        <SectionTitle>Visitas por dia</SectionTitle>
        {!stats ? <p style={{ color: C.muted }}>Carregando...</p> : stats.serie.length === 0 ? (
          <p style={{ color: C.muted, fontSize: '14px' }}>Sem visitas no período.</p>
        ) : (
          <>
            <div className="flex items-end" style={{ height: '140px', gap: dias > 40 ? '1px' : '3px' }} role="img" aria-label={`Visitas por dia nos últimos ${dias} dias`}>
              {serie.map(d => (
                <div key={d.dia} title={`${formatDia(d.dia)}: ${d.visualizacoes} visitas, ${d.cliques_whatsapp} cliques no WhatsApp`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ height: `${(d.visualizacoes / maxSerie) * 100}%`, minHeight: d.visualizacoes ? '3px' : '1px', background: d.visualizacoes ? C.orange : C.border, borderRadius: '3px 3px 0 0' }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between" style={{ fontSize: '11.5px', color: C.muted, marginTop: '6px' }}>
              <span>{formatDia(serie[0].dia)}</span>
              <span>máx. {maxSerie} visita{maxSerie > 1 ? 's' : ''}/dia</span>
              <span>{formatDia(serie[serie.length - 1].dia)}</span>
            </div>
          </>
        )}
      </Card>

      <Card padding="0">
        <div style={{ padding: '16px 16px 8px' }}><SectionTitle>Por anúncio</SectionTitle></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '480px' }}>
            <thead>
              <tr style={{ background: '#FBFAF7', textAlign: 'left' }}>
                <th style={{ padding: '8px 16px' }}>Anúncio</th>
                <th style={{ padding: '8px' }}>Visitas no período</th>
                <th style={{ padding: '8px' }}>Cliques WhatsApp</th>
                <th style={{ padding: '8px' }}>Total de visitas</th>
                <th style={{ padding: '8px 16px' }}>Conversão</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.por_anuncio ?? []).map(a => (
                <tr key={a.anuncio_id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 16px' }}>
                    <button onClick={() => app.go(`/produto/${a.anuncio_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text, fontFamily: FONT }}>
                      {a.nome}
                    </button>
                    {a.status !== 'ATIVO' && <Pill tom="cinza" style={{ marginLeft: '6px' }}>{a.status === 'PAUSADO' ? 'pausado' : 'lixeira'}</Pill>}
                  </td>
                  <td style={{ padding: '8px' }}>{a.visualizacoes_periodo}</td>
                  <td style={{ padding: '8px' }}>{a.cliques_periodo}</td>
                  <td style={{ padding: '8px' }}>{a.visualizacoes}</td>
                  <td style={{ padding: '8px 16px' }}>{a.visualizacoes ? `${Math.round((a.cliques_whatsapp / a.visualizacoes) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Pedidos recebidos ───

export function SellerOrders() {
  const app = useApp();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [filtro, setFiltro] = useState<StatusPedido | ''>('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setPedidos(null);
    PedidoService.vendas(filtro || undefined).then(r => setPedidos(r.pedidos)).catch(err => setErro(getErrorMessage(err)));
  }, [filtro]);

  return (
    <ListaPedidos
      pedidos={pedidos}
      erro={erro}
      filtro={filtro}
      onFiltro={setFiltro}
      papel="VENDEDOR"
      onAbrir={id => app.go(`/vender/pedidos/${id}`)}
      vazio={{ titulo: 'Nenhum pedido recebido', texto: 'Quando alguém comprar seus produtos, os pedidos aparecem aqui.' }}
    />
  );
}

// ─── Cotações recebidas ───

export function SellerQuotes() {
  const [lista, setLista] = useState<Cotacao[] | null>(null);
  const [respondendo, setRespondendo] = useState<Cotacao | null>(null);

  const carregar = useCallback(() => {
    CotacaoService.recebidas().then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (lista === null) return <p style={{ color: C.muted }}>Carregando...</p>;
  if (lista.length === 0) return <EmptyState titulo="Nenhum pedido de cotação" texto="Compradores de atacado podem pedir cotação na página dos seus produtos." />;

  return (
    <div className="flex flex-col gap-3" style={{ fontFamily: FONT }}>
      {lista.map(c => {
        const un = UNIDADES[c.anuncio_unidade]?.curto ?? 'un';
        return (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{c.quantidade} {un} de {c.anuncio_nome}</strong>
              <Pill tom={STATUS_COTACAO[c.status].tom}>{STATUS_COTACAO[c.status].rotulo}</Pill>
              <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{formatDateTime(c.data_criacao)}</span>
            </div>
            <div style={{ fontSize: '13px', color: C.muted, marginTop: '3px' }}>
              Cliente: {c.cliente_nome} · seu preço de vitrine {formatCurrency(c.anuncio_preco)}/{un} (total {formatCurrency(c.anuncio_preco * c.quantidade)})
            </div>
            {c.mensagem && <p style={{ fontSize: '14px', marginTop: '6px' }}>“{c.mensagem}”</p>}
            {c.preco_unitario !== null && (
              <p style={{ fontSize: '13.5px', marginTop: '6px' }}>
                Sua proposta: <strong>{formatCurrency(c.preco_unitario)}/{un}</strong>{c.prazo_entrega ? ` · ${c.prazo_entrega}` : ''}
              </p>
            )}
            {(c.status === 'PENDENTE' || c.status === 'RESPONDIDA') && (
              <button onClick={() => setRespondendo(c)} style={{ ...botaoContorno, marginTop: '10px' }}>
                {c.status === 'PENDENTE' ? 'Responder' : 'Alterar proposta'}
              </button>
            )}
            {c.pedido_id && <p style={{ fontSize: '13px', color: C.success, marginTop: '6px' }}>Virou o pedido #{c.pedido_id}.</p>}
          </Card>
        );
      })}
      {respondendo && <ModalResponderCotacao cotacao={respondendo} onFechar={() => setRespondendo(null)} onFeito={() => { setRespondendo(null); carregar(); }} />}
    </div>
  );
}

function ModalResponderCotacao({ cotacao, onFechar, onFeito }: { cotacao: Cotacao; onFechar: () => void; onFeito: () => void }) {
  const [preco, setPreco] = useState(String(cotacao.preco_unitario ?? cotacao.anuncio_preco));
  const [prazo, setPrazo] = useState(cotacao.prazo_entrega ?? '');
  const [resposta, setResposta] = useState(cotacao.resposta ?? '');
  const [enviando, setEnviando] = useState(false);
  const un = UNIDADES[cotacao.anuncio_unidade]?.curto ?? 'un';

  const enviar = async (recusar: boolean) => {
    setEnviando(true);
    try {
      await CotacaoService.responder(cotacao.id, recusar
        ? { recusar: true, resposta: resposta.trim() || undefined }
        : { precoUnitario: Number(preco), prazoEntrega: prazo.trim() || undefined, resposta: resposta.trim() || undefined });
      toast.success(recusar ? 'Cotação recusada.' : 'Proposta enviada ao cliente.');
      onFeito();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={`Cotação: ${cotacao.quantidade} ${un} de ${cotacao.anuncio_nome}`} aberto onFechar={onFechar}>
      <label style={rotulo}>Preço por {un} (R$)</label>
      <input type="number" min={0.01} step={0.01} value={preco} onChange={e => setPreco(e.target.value)} style={campo} />
      <p style={{ fontSize: '13px', color: C.muted, marginTop: '4px' }}>Total: {formatCurrency((Number(preco) || 0) * cotacao.quantidade)}</p>
      <label style={{ ...rotulo, marginTop: '12px' }}>Prazo de entrega</label>
      <input value={prazo} onChange={e => setPrazo(e.target.value)} placeholder="Ex.: 3 dias úteis" style={campo} />
      <label style={{ ...rotulo, marginTop: '12px' }}>Mensagem</label>
      <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={3} style={{ ...campo, resize: 'vertical' }} />
      <div className="flex flex-wrap justify-end gap-2 mt-5">
        <button onClick={() => enviar(true)} disabled={enviando} style={botaoSecundario}>Recusar</button>
        <button onClick={() => enviar(false)} disabled={enviando || !(Number(preco) > 0)} style={desabilitado(botaoPrimario, enviando || !(Number(preco) > 0))}>
          Enviar proposta
        </button>
      </div>
    </Modal>
  );
}

// ─── Cestas ───

const CESTA_VAZIA: CestaInput = { nome: '', descricao: '', itens: '', preco: '', frequencia: 'SEMANAL', ativa: true, imagem: null };

export function SellerBaskets() {
  const [cestas, setCestas] = useState<Cesta[] | null>(null);
  const [editando, setEditando] = useState<{ id: number | null; dados: CestaInput } | null>(null);
  const [assinantesDe, setAssinantesDe] = useState<Cesta | null>(null);

  const carregar = useCallback(() => {
    CestaService.minhas().then(setCestas).catch(err => toast.error(getErrorMessage(err)));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={{ fontFamily: FONT }}>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <p style={{ fontSize: '14px', color: C.muted, maxWidth: '560px' }}>
          Monte cestas recorrentes (ex.: verduras da semana). Clientes assinam e você gera o pedido de cada entrega.
        </p>
        <button onClick={() => setEditando({ id: null, dados: CESTA_VAZIA })} style={botaoPrimario}><Plus size={16} /> Nova cesta</button>
      </div>
      {cestas === null ? <p style={{ color: C.muted }}>Carregando...</p> : cestas.length === 0 ? (
        <EmptyState icone={<ShoppingBasket size={40} />} titulo="Você ainda não tem cestas" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cestas.map(c => (
            <Card key={c.id}>
              <div className="flex gap-3">
                <div style={{ width: '80px', height: '80px', borderRadius: '10px', overflow: 'hidden', background: C.orangeSoft, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.imagem_url ? <ImageWithFallback src={c.imagem_url} alt="" style={imagemCover} /> : <ShoppingBasket size={30} color={C.brown} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{c.nome}</strong>
                    <Pill tom={c.ativa ? 'verde' : 'cinza'}>{c.ativa ? 'Ativa' : 'Pausada'}</Pill>
                  </div>
                  <div style={{ fontSize: '13px', color: C.muted }}>{formatCurrency(c.preco)} {FREQUENCIA[c.frequencia]}</div>
                  <div className="flex items-center gap-1" style={{ fontSize: '13px', color: C.brown }}><Users size={14} /> {c.assinantes} assinante(s) ativo(s)</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditando({ id: c.id, dados: { nome: c.nome, descricao: c.descricao, itens: c.itens, preco: c.preco, frequencia: c.frequencia, ativa: c.ativa, imagem: null } })} style={botaoSecundario}>
                  <Edit size={15} /> Editar
                </button>
                <button onClick={() => setAssinantesDe(c)} style={botaoContorno}><Users size={15} /> Assinantes</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editando && <ModalCesta inicial={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}
      {assinantesDe && <ModalAssinantes cesta={assinantesDe} onFechar={() => setAssinantesDe(null)} />}
    </div>
  );
}

function ModalCesta({ inicial, onFechar, onSalvo }: { inicial: { id: number | null; dados: CestaInput }; onFechar: () => void; onSalvo: () => void }) {
  const [dados, setDados] = useState<CestaInput>(inicial.dados);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof CestaInput>(k: K, v: CestaInput[K]) => setDados(prev => ({ ...prev, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try {
      if (inicial.id) await CestaService.editar(inicial.id, dados);
      else await CestaService.criar(dados);
      toast.success('Cesta salva.');
      onSalvo();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={inicial.id ? 'Editar cesta' : 'Nova cesta'} aberto onFechar={onFechar}>
      <label style={rotulo}>Nome</label>
      <input value={dados.nome} onChange={e => set('nome', e.target.value)} placeholder="Cesta da semana" style={campo} />
      <label style={{ ...rotulo, marginTop: '12px' }}>Descrição</label>
      <textarea value={dados.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...campo, resize: 'vertical' }} />
      <label style={{ ...rotulo, marginTop: '12px' }}>O que vem na cesta</label>
      <textarea value={dados.itens} onChange={e => set('itens', e.target.value)} rows={2} placeholder="Alface, couve, cenoura 1 kg, 6 ovos..." style={{ ...campo, resize: 'vertical' }} />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label style={{ fontSize: '13px', fontWeight: 500 }}>
          Preço por entrega (R$)
          <input type="number" min={0.01} step={0.01} value={dados.preco} onChange={e => set('preco', e.target.value)} style={{ ...campo, marginTop: '6px' }} />
        </label>
        <label style={{ fontSize: '13px', fontWeight: 500 }}>
          Frequência
          <select value={dados.frequencia} onChange={e => set('frequencia', e.target.value as Frequencia)} style={{ ...campo, marginTop: '6px' }}>
            <option value="SEMANAL">Semanal</option>
            <option value="QUINZENAL">Quinzenal</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 mt-3" style={{ fontSize: '14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={dados.ativa ?? true} onChange={e => set('ativa', e.target.checked)} style={{ accentColor: C.orange }} />
        Aceitando novas assinaturas
      </label>
      <label style={{ ...botaoSecundario, marginTop: '12px', cursor: 'pointer' }}>
        <Camera size={15} /> {dados.imagem ? dados.imagem.name : 'Foto da cesta (opcional)'}
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => set('imagem', e.target.files?.[0] ?? null)} />
      </label>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Cancelar</button>
        <button onClick={salvar} disabled={salvando} style={desabilitado(botaoPrimario, salvando)}>Salvar</button>
      </div>
    </Modal>
  );
}

function ModalAssinantes({ cesta, onFechar }: { cesta: Cesta; onFechar: () => void }) {
  const app = useApp();
  const [lista, setLista] = useState<Assinante[] | null>(null);

  const carregar = useCallback(() => {
    CestaService.assinantes(cesta.id).then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, [cesta.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const gerar = async (a: Assinante) => {
    try {
      const pedido = await AssinaturaService.gerarPedidoDaEntrega(a.id);
      toast.success(`Pedido #${pedido} criado para ${a.cliente_nome}.`, { action: { label: 'Abrir', onClick: () => app.go(`/vender/pedidos/${pedido}`) } });
      carregar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Modal titulo={`Assinantes — ${cesta.nome}`} aberto onFechar={onFechar} largura={680}>
      {lista === null ? <p style={{ color: C.muted }}>Carregando...</p> : lista.length === 0 ? (
        <p style={{ color: C.muted }}>Ninguém assinou esta cesta ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(a => (
            <div key={a.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px' }}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{a.cliente_nome}</strong>
                <Pill tom={a.status === 'ATIVA' ? 'verde' : 'laranja'}>{a.status === 'ATIVA' ? 'Ativa' : 'Pausada'}</Pill>
                <span style={{ fontSize: '12.5px', color: C.muted, marginLeft: 'auto' }}>Próxima: {formatDia(a.proxima_entrega)}</span>
              </div>
              <div className="flex items-center gap-1" style={{ fontSize: '13px', color: C.muted, marginTop: '4px' }}>
                <Truck size={14} />
                {a.tipo_entrega === 'ENTREGA' ? `${a.rua}, ${a.numero} · ${a.bairro} · ${a.cidade}/${a.uf}` : 'Retira com você'}
                {' · '}{a.cliente_telefone}
              </div>
              {a.status === 'ATIVA' && (
                <button onClick={() => gerar(a)} style={{ ...botaoContorno, marginTop: '8px', padding: '6px 12px' }}>Gerar pedido da entrega</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Perfil público e verificação ───

export function SellerPublicProfile() {
  const app = useApp();
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [bio, setBio] = useState('');
  const [video, setVideo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [verificacao, setVerificacao] = useState<Verificacao | null | undefined>(undefined);
  const [tipoDoc, setTipoDoc] = useState<'CPF' | 'CNPJ'>('CPF');
  const [doc, setDoc] = useState('');
  const [car, setCar] = useState('');

  useEffect(() => {
    ProdutorService.meuPerfilPublico().then(p => { setPerfil(p); setBio(p.bio ?? ''); setVideo(p.video_url ?? ''); }).catch(() => undefined);
    VerificacaoService.minha().then(setVerificacao).catch(() => setVerificacao(null));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    try {
      setPerfil(await ProdutorService.atualizarPerfilPublico({ bio, videoUrl: video.trim() }));
      toast.success('Perfil público atualizado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  const trocarFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try {
      setPerfil(await ProdutorService.atualizarFoto(arquivo));
      toast.success('Foto atualizada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const solicitar = async () => {
    try {
      setVerificacao(await VerificacaoService.solicitar({ tipoDocumento: tipoDoc, documento: doc, car: car.trim() || undefined }));
      toast.success('Documentos enviados para análise.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const podeEnviar = verificacao === null || verificacao?.status === 'REJEITADA';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ fontFamily: FONT }}>
      <Card>
        <SectionTitle acao={<button onClick={() => app.go(`/produtor/${app.user?.id}`)} style={{ ...botaoSecundario, padding: '6px 12px' }}>Ver minha loja</button>}>
          Perfil público
        </SectionTitle>
        <div className="flex items-center gap-4 mb-4">
          <div style={{ width: '84px', height: '84px', borderRadius: '50%', overflow: 'hidden', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {perfil?.foto_url ? <ImageWithFallback src={perfil.foto_url} alt="" style={imagemCover} /> : <Camera size={28} color={C.brown} />}
          </div>
          <label style={{ ...botaoSecundario, cursor: 'pointer' }}>
            <Camera size={15} /> Trocar foto ou logo
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => trocarFoto(e.target.files?.[0])} />
          </label>
        </div>
        <label style={rotulo}>Apresentação (história da propriedade, como produz)</label>
        <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 1500))} rows={5} style={{ ...campo, resize: 'vertical' }} />
        <label style={{ ...rotulo, marginTop: '12px' }} className="flex items-center gap-1"><Video size={14} /> Vídeo da propriedade (YouTube ou Vimeo)</label>
        <input value={video} onChange={e => setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." style={campo} />
        <p style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>Aparece como “Conheça o produtor” nos seus anúncios.</p>
        <button onClick={salvar} disabled={salvando} style={{ ...desabilitado(botaoPrimario, salvando), marginTop: '14px' }}>Salvar perfil</button>
      </Card>

      <Card>
        <SectionTitle><span className="flex items-center gap-2"><BadgeCheck size={18} color={C.success} /> Selo de produtor verificado</span></SectionTitle>
        <p style={{ fontSize: '13.5px', color: C.muted, marginBottom: '12px' }}>
          Envie seu CPF ou CNPJ (e o número do CAR, se tiver). A administração confere e, se aprovado, o selo aparece nos seus anúncios.
        </p>
        {verificacao === undefined ? <p style={{ color: C.muted }}>Carregando...</p> : verificacao && verificacao.status !== 'REJEITADA' ? (
          <div style={{ background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', fontSize: '14px' }}>
            <Pill tom={verificacao.status === 'APROVADA' ? 'verde' : 'laranja'}>{verificacao.status === 'APROVADA' ? 'Verificado' : 'Em análise'}</Pill>
            <div style={{ marginTop: '8px' }}>{verificacao.tipo_documento}: {verificacao.documento}{verificacao.car ? ` · CAR ${verificacao.car}` : ''}</div>
            <div style={{ fontSize: '12.5px', color: C.muted }}>Enviado em {formatDateTime(verificacao.data_envio)}</div>
          </div>
        ) : (
          <>
            {verificacao?.status === 'REJEITADA' && (
              <p style={{ fontSize: '13.5px', color: C.danger, marginBottom: '10px' }}>Não aprovado: {verificacao.observacao}. Corrija e envie de novo.</p>
            )}
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value as 'CPF' | 'CNPJ')} style={campo}>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
              </select>
              <input value={doc} onChange={e => setDoc(e.target.value)} placeholder={tipoDoc === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'} style={campo} />
            </div>
            <label style={{ ...rotulo, marginTop: '12px' }}>Número do CAR (opcional)</label>
            <input value={car} onChange={e => setCar(e.target.value)} placeholder="UF-0000000-XXXX..." style={campo} />
            <button onClick={solicitar} disabled={!podeEnviar || doc.replace(/\D/g, '').length < 11} style={{ ...desabilitado(botaoPrimario, !podeEnviar || doc.replace(/\D/g, '').length < 11), marginTop: '14px' }}>
              Enviar para análise
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
