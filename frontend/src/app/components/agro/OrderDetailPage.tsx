import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import {
  Check, Copy, MapPin, MessageCircle, PackageCheck, ShieldAlert, Star, Store, Truck, User, Camera, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, UNIDADES } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import {
  Card, EmptyState, Modal, PageShell, Pill, SectionTitle, StatusPedidoPill, STATUS_PEDIDO,
  botaoContorno, botaoPerigo, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime, imagemCover, rotulo,
} from './ui';
import { useApp } from '../../AppContext';
import { AvaliacaoService, ChatService, PedidoService, ReclamacaoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { ItemPedido, MotivoReclamacao, PedidoDetalhe, StatusPedido } from '../../api/types';

const ROTULO_ACAO: Record<StatusPedido, string> = {
  AGUARDANDO_PAGAMENTO: '',
  PAGO: 'Pagar (simulação)',
  EM_PREPARACAO: 'Iniciar preparo',
  ENVIADO: 'Marcar como enviado',
  PRONTO_RETIRADA: 'Pronto para retirada',
  ENTREGUE: 'Confirmar entrega',
  CANCELADO: 'Cancelar pedido',
};

const ETAPAS_ENTREGA: StatusPedido[] = ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'ENVIADO', 'ENTREGUE'];
const ETAPAS_RETIRADA: StatusPedido[] = ['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'PRONTO_RETIRADA', 'ENTREGUE'];

const MOTIVOS: Record<MotivoReclamacao, string> = {
  NAO_RECEBIDO: 'Não recebi o produto',
  PRODUTO_DIFERENTE: 'Produto diferente do anunciado',
  PRODUTO_DANIFICADO: 'Produto chegou danificado',
  QUALIDADE: 'Problema de qualidade',
  OUTRO: 'Outro motivo',
};

/** Detalhe do pedido para comprador (/pedidos/:id) e vendedor (/vender/pedidos/:id). */
export function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const app = useApp();
  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modalEnvio, setModalEnvio] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [avaliando, setAvaliando] = useState<ItemPedido | null>(null);
  const [reclamando, setReclamando] = useState(false);

  const carregar = useCallback(() => {
    if (!id) return;
    PedidoService.detalhe(id).then(setPedido).catch(err => setErro(getErrorMessage(err)));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const voltar = () => app.go(location.pathname.startsWith('/vender') ? '/vender/pedidos' : '/pedidos');

  if (erro) return <PageShell titulo="Pedido" onVoltar={voltar}><EmptyState titulo={erro} /></PageShell>;
  if (!pedido) return <PageShell titulo="Pedido" onVoltar={voltar}><p style={{ color: C.muted }}>Carregando...</p></PageShell>;

  const vendedor = pedido.papel === 'VENDEDOR';
  const executar = async (status: StatusPedido, extra?: { codigoRastreio?: string }) => {
    if (status === 'CANCELADO' && !window.confirm('Cancelar este pedido? O estoque volta para o anúncio.')) return;
    setEnviando(true);
    try {
      const atualizado = await PedidoService.alterarStatus(pedido.id, status, extra);
      setPedido(atualizado);
      toast.success(`Pedido ${STATUS_PEDIDO[status].rotulo.toLowerCase()}.`);
      app.atualizarContadores();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
      setModalEnvio(false);
    }
  };

  const etapas = pedido.tipo_entrega === 'ENTREGA' ? ETAPAS_ENTREGA : ETAPAS_RETIRADA;
  const indiceAtual = etapas.indexOf(pedido.status);
  const dataDe = (s: StatusPedido) => pedido.historico.find(h => h.status === s)?.data;
  const outraParte = vendedor ? pedido.comprador_nome : pedido.vendedor_nome;
  const telefone = vendedor ? pedido.comprador_telefone : pedido.vendedor_telefone;
  const podeReclamar = !vendedor && !pedido.reclamacao && ['ENVIADO', 'PRONTO_RETIRADA', 'ENTREGUE'].includes(pedido.status);

  const conversar = async () => {
    const anuncio = pedido.itens.find(i => i.anuncio_id);
    if (!anuncio?.anuncio_id) {
      app.go('/mensagens');
      return;
    }
    try {
      const conversa = await ChatService.iniciar(anuncio.anuncio_id, `Olá! Sobre o pedido #${pedido.id}.`);
      app.go(`/mensagens/${conversa}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <PageShell
      titulo={<span className="flex flex-wrap items-center gap-3">Pedido #{pedido.id} <StatusPedidoPill status={pedido.status} /></span>}
      subtitulo={`Criado em ${formatDateTime(pedido.data_criacao)}${pedido.origem === 'COTACAO' ? ' · cotação de atacado' : pedido.origem === 'ASSINATURA' ? ' · cesta por assinatura' : ''}`}
      onVoltar={voltar}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="flex flex-col gap-5">
          {/* Linha do tempo / rastreio */}
          <Card>
            <SectionTitle>Acompanhamento</SectionTitle>
            {pedido.status === 'CANCELADO' ? (
              <p style={{ color: C.danger, fontSize: '14px' }}>Pedido cancelado em {formatDateTime(dataDe('CANCELADO'))}.</p>
            ) : (
              <ol className="grid grid-cols-5 gap-1" style={{ listStyle: 'none', padding: 0 }}>
                {etapas.map((etapa, i) => {
                  const feito = i <= indiceAtual;
                  return (
                    <li key={etapa} style={{ textAlign: 'center', position: 'relative' }}>
                      {i > 0 && (
                        <span style={{ position: 'absolute', top: '15px', right: '50%', width: '100%', height: '3px', background: i <= indiceAtual ? C.orange : C.border, zIndex: 0 }} />
                      )}
                      <span style={{
                        position: 'relative', zIndex: 1, width: '32px', height: '32px', borderRadius: '50%', margin: '0 auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: feito ? C.orange : C.surface, border: `2px solid ${feito ? C.orange : C.border}`, color: '#fff',
                      }}>
                        {feito && <Check size={16} />}
                      </span>
                      <div style={{ fontSize: '12px', fontWeight: feito ? 600 : 500, marginTop: '6px', color: feito ? C.text : C.muted }}>
                        {STATUS_PEDIDO[etapa].rotulo}
                      </div>
                      {dataDe(etapa) && <div style={{ fontSize: '11px', color: C.muted }}>{formatDateTime(dataDe(etapa))}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
            {pedido.codigo_rastreio && (
              <div className="flex flex-wrap items-center gap-2 mt-4" style={{ background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', fontSize: '14px' }}>
                <Truck size={16} color={C.brown} /> Código de rastreio: <strong>{pedido.codigo_rastreio}</strong>
                <button
                  onClick={() => navigator.clipboard.writeText(pedido.codigo_rastreio!).then(() => toast.success('Código copiado.'))}
                  style={{ ...botaoSecundario, padding: '4px 10px', marginLeft: 'auto' }}
                >
                  <Copy size={14} /> Copiar
                </button>
              </div>
            )}
            {pedido.historico.length > 0 && (
              <details style={{ marginTop: '14px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '13px', color: C.brown, fontWeight: 600 }}>Histórico completo</summary>
                <ul style={{ marginTop: '8px', fontSize: '13px', color: '#4A4A45' }}>
                  {pedido.historico.map((h, i) => (
                    <li key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                      <strong>{STATUS_PEDIDO[h.status as StatusPedido]?.rotulo ?? (h.status === 'REEMBOLSO' ? 'Reembolso' : h.status)}</strong>
                      {' · '}{formatDateTime(h.data)}
                      {h.observacao && <div style={{ color: C.muted }}>{h.observacao}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {/* Itens */}
          <Card>
            <SectionTitle>Itens</SectionTitle>
            <div className="flex flex-col">
              {pedido.itens.map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-3" style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: '58px', height: '58px', borderRadius: '10px', overflow: 'hidden', background: C.border, flexShrink: 0 }}>
                    {item.imagem_url && <ImageWithFallback src={item.imagem_url} alt="" style={imagemCover} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.anuncio_id ? (
                      <button onClick={() => app.go(`/produto/${item.anuncio_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, fontSize: '14.5px', color: C.text, fontFamily: FONT, textAlign: 'left' }}>
                        {item.nome}
                      </button>
                    ) : <strong style={{ fontSize: '14.5px' }}>{item.nome}</strong>}
                    <div style={{ fontSize: '13px', color: C.muted }}>
                      {item.quantidade} {UNIDADES[item.unidade]?.curto} × {formatCurrency(item.preco_unitario)}
                    </div>
                  </div>
                  <strong>{formatCurrency(item.preco_unitario * item.quantidade)}</strong>
                  {!vendedor && pedido.status === 'ENTREGUE' && item.anuncio_id && (
                    item.avaliado
                      ? <Pill tom="verde"><Check size={13} /> Avaliado</Pill>
                      : <button onClick={() => setAvaliando(item)} style={{ ...botaoContorno, padding: '7px 12px' }}><Star size={15} /> Avaliar</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 mt-4" style={{ fontSize: '14px' }}>
              <div className="flex justify-between"><span style={{ color: C.muted }}>Produtos</span><span>{formatCurrency(pedido.subtotal)}</span></div>
              <div className="flex justify-between"><span style={{ color: C.muted }}>Frete</span><span>{pedido.frete ? formatCurrency(pedido.frete) : 'Grátis'}</span></div>
              <div className="flex justify-between" style={{ fontSize: '17px', fontWeight: 700, marginTop: '4px' }}>
                <span>Total</span><span style={{ color: C.orange }}>{formatCurrency(pedido.total)}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: C.muted }}>
                Pagamento: {{ PIX: 'Pix', CARTAO: 'Cartão', BOLETO: 'Boleto' }[pedido.forma_pagamento]} (simulado no ambiente de teste)
              </div>
            </div>
          </Card>
        </div>

        {/* Lateral: ações, entrega e contato */}
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle>Ações</SectionTitle>
            {pedido.acoes.length === 0 ? (
              <p style={{ fontSize: '13.5px', color: C.muted }}>
                {pedido.status === 'ENTREGUE' ? 'Pedido concluído.' : pedido.status === 'CANCELADO' ? 'Pedido cancelado.' : vendedor ? 'Aguardando o comprador.' : 'Aguardando o produtor.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pedido.acoes.filter(a => a !== 'CANCELADO').map(acao => (
                  <button
                    key={acao}
                    disabled={enviando}
                    onClick={() => (acao === 'ENVIADO' ? setModalEnvio(true) : executar(acao))}
                    style={{ ...desabilitado(botaoPrimario, enviando), width: '100%' }}
                  >
                    {acao === 'ENTREGUE' && !vendedor ? 'Confirmar que recebi' : ROTULO_ACAO[acao]}
                  </button>
                ))}
                {pedido.acoes.includes('CANCELADO') && (
                  <button disabled={enviando} onClick={() => executar('CANCELADO')} style={{ ...botaoPerigo, width: '100%' }}>
                    Cancelar pedido
                  </button>
                )}
              </div>
            )}
            {pedido.reclamacao ? (
              <button onClick={() => app.go(`/reclamacoes/${pedido.reclamacao!.id}`)} style={{ ...botaoSecundario, width: '100%', marginTop: '10px' }}>
                <ShieldAlert size={15} /> Ver reclamação
              </button>
            ) : podeReclamar && (
              <button onClick={() => setReclamando(true)} style={{ ...botaoSecundario, width: '100%', marginTop: '10px' }}>
                <ShieldAlert size={15} /> Tive um problema
              </button>
            )}
          </Card>

          <Card>
            <SectionTitle>{pedido.tipo_entrega === 'ENTREGA' ? 'Entrega' : 'Retirada no local'}</SectionTitle>
            {pedido.tipo_entrega === 'ENTREGA' ? (
              <p className="flex gap-2" style={{ fontSize: '14px' }}>
                <MapPin size={16} color={C.brown} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{pedido.entrega_rua}, {pedido.entrega_numero} · {pedido.entrega_bairro}<br />{pedido.entrega_cidade}/{pedido.entrega_uf}{pedido.entrega_cep ? ` · ${pedido.entrega_cep}` : ''}</span>
              </p>
            ) : (
              <p className="flex gap-2" style={{ fontSize: '14px' }}>
                <PackageCheck size={16} color={C.brown} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Combine dia e horário com {vendedor ? 'o comprador' : 'o produtor'} pela conversa.</span>
              </p>
            )}
            {pedido.observacao && <p style={{ fontSize: '13px', color: C.muted, marginTop: '8px' }}>Obs.: {pedido.observacao}</p>}
          </Card>

          <Card>
            <SectionTitle>{vendedor ? 'Comprador' : 'Produtor'}</SectionTitle>
            <p className="flex items-center gap-2" style={{ fontSize: '14.5px', fontWeight: 600 }}>
              {vendedor ? <User size={16} /> : <Store size={16} color={C.brown} />} {outraParte}
            </p>
            <div className="flex flex-col gap-2 mt-3">
              {!vendedor && (
                <button onClick={conversar} style={{ ...botaoContorno, width: '100%' }}>
                  <MessageCircle size={16} /> Conversar pelo site
                </button>
              )}
              {vendedor && (
                <button onClick={() => app.go('/mensagens')} style={{ ...botaoSecundario, width: '100%' }}>
                  <MessageCircle size={16} /> Ver mensagens
                </button>
              )}
              {telefone && (
                <a
                  href={`https://wa.me/55${telefone.replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(`Olá! Sobre o pedido #${pedido.id} no AgroMundo.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...botaoSecundario, width: '100%', textDecoration: 'none' }}
                >
                  WhatsApp
                </a>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal titulo="Marcar como enviado" aberto={modalEnvio} onFechar={() => setModalEnvio(false)}>
        <label style={rotulo}>Código de rastreio (opcional)</label>
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ex.: BR123456789BR" style={campo} />
        <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '6px' }}>O comprador recebe o código no aviso e por e-mail.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModalEnvio(false)} style={botaoSecundario}>Voltar</button>
          <button disabled={enviando} onClick={() => executar('ENVIADO', { codigoRastreio: codigo.trim() || undefined })} style={desabilitado(botaoPrimario, enviando)}>
            Confirmar envio
          </button>
        </div>
      </Modal>

      {avaliando && (
        <ModalAvaliacao
          item={avaliando}
          pedidoId={pedido.id}
          onFechar={() => setAvaliando(null)}
          onConcluir={() => { setAvaliando(null); carregar(); }}
        />
      )}

      {reclamando && (
        <ModalReclamacao
          pedidoId={pedido.id}
          onFechar={() => setReclamando(false)}
          onCriada={idReclamacao => app.go(`/reclamacoes/${idReclamacao}`)}
        />
      )}
    </PageShell>
  );
}

function ModalAvaliacao({ item, pedidoId, onFechar, onConcluir }: {
  item: ItemPedido; pedidoId: number; onFechar: () => void; onConcluir: () => void;
}) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!nota) {
      toast.error('Escolha de 1 a 5 estrelas.');
      return;
    }
    setEnviando(true);
    try {
      await AvaliacaoService.criar({ pedidoId, anuncioId: item.anuncio_id!, nota, comentario: comentario.trim(), fotos });
      toast.success('Obrigado pela avaliação!');
      onConcluir();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={`Avaliar ${item.nome}`} aberto onFechar={onFechar}>
      <div className="flex gap-1 mb-4" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setNota(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} role="radio" aria-checked={nota === n}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
            <Star size={32} color={C.orange} fill={n <= nota ? C.orange : 'none'} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <label style={rotulo}>Conte como foi (opcional)</label>
      <textarea value={comentario} onChange={e => setComentario(e.target.value.slice(0, 1000))} rows={4} style={{ ...campo, resize: 'vertical' }}
        placeholder="Qualidade, sabor, embalagem, atendimento..." />
      <label style={{ ...rotulo, marginTop: '14px' }}>Fotos (até 3)</label>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <div key={i} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '10px', overflow: 'hidden' }}>
            <img src={URL.createObjectURL(f)} alt="" style={imagemCover} />
            <button onClick={() => setFotos(fotos.filter((_, j) => j !== i))} aria-label="Remover foto"
              style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={12} />
            </button>
          </div>
        ))}
        {fotos.length < 3 && (
          <label style={{ width: '72px', height: '72px', borderRadius: '10px', border: `1.5px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted }}>
            <Camera size={20} />
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) setFotos([...fotos, f]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Cancelar</button>
        <button onClick={enviar} disabled={enviando} style={desabilitado(botaoPrimario, enviando)}>
          {enviando ? 'Enviando...' : 'Publicar avaliação'}
        </button>
      </div>
    </Modal>
  );
}

function ModalReclamacao({ pedidoId, onFechar, onCriada }: { pedidoId: number; onFechar: () => void; onCriada: (id: number) => void }) {
  const [motivo, setMotivo] = useState<MotivoReclamacao>('QUALIDADE');
  const [descricao, setDescricao] = useState('');
  const [devolucao, setDevolucao] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await ReclamacaoService.abrir({ pedidoId, motivo, descricao: descricao.trim(), pedidoDevolucao: devolucao });
      toast.success('Reclamação aberta. O produtor foi avisado.');
      onCriada(r.id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Tive um problema com o pedido" aberto onFechar={onFechar}>
      <label style={rotulo}>O que aconteceu?</label>
      <select value={motivo} onChange={e => setMotivo(e.target.value as MotivoReclamacao)} style={campo}>
        {Object.entries(MOTIVOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <label style={{ ...rotulo, marginTop: '14px' }}>Descreva o problema</label>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value.slice(0, 2000))} rows={4} style={{ ...campo, resize: 'vertical' }}
        placeholder="Quanto mais detalhes, mais fácil resolver." />
      <label className="flex items-center gap-2 mt-3" style={{ fontSize: '14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={devolucao} onChange={e => setDevolucao(e.target.checked)} style={{ accentColor: C.orange }} />
        Quero devolver o produto e receber o reembolso
      </label>
      <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '10px' }}>
        O produtor responde primeiro. Se vocês não chegarem a um acordo, qualquer um pode pedir a mediação do AgroMundo.
      </p>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Cancelar</button>
        <button onClick={enviar} disabled={enviando || descricao.trim().length < 10} style={desabilitado(botaoPrimario, enviando || descricao.trim().length < 10)}>
          Abrir reclamação
        </button>
      </div>
    </Modal>
  );
}

export { MOTIVOS };
