import { useEffect, useMemo, useState } from 'react';
import { MapPin, Store, Truck, CreditCard, QrCode, FileText, ShieldCheck, Plus, Info, BadgeCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, UNIDADES, type Product } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import { Card, EmptyState, PageShell, SectionTitle, botaoPrimario, botaoSecundario, campo, desabilitado } from './ui';
import { useApp } from '../../AppContext';
import { EnderecoService, PedidoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Endereco, FormaPagamento, GrupoCarrinho, TipoEntrega } from '../../api/types';

const PAGAMENTOS: { valor: FormaPagamento; rotulo: string; icone: React.ReactNode }[] = [
  { valor: 'PIX', rotulo: 'Pix', icone: <QrCode size={18} /> },
  { valor: 'CARTAO', rotulo: 'Cartão', icone: <CreditCard size={18} /> },
  { valor: 'BOLETO', rotulo: 'Boleto', icone: <FileText size={18} /> },
];

const FAIXAS = { MESMA_CIDADE: 'mesma cidade', MESMO_ESTADO: 'mesmo estado', OUTRO_ESTADO: 'outro estado' };

function prazo(min: number, max: number) {
  return min === max ? `${min} dia${min > 1 ? 's' : ''} útil` : `${min} a ${max} dias úteis`;
}

/** Fechamento do carrinho: endereço, entrega/retirada por produtor e pagamento (simulado). */
export function CheckoutPage() {
  const app = useApp();
  const { itens } = app.carrinho;
  const [enderecos, setEnderecos] = useState<Endereco[] | null>(null);
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [grupos, setGrupos] = useState<GrupoCarrinho[] | null>(null);
  const [entregas, setEntregas] = useState<Record<number, TipoEntrega>>({});
  const [pagamento, setPagamento] = useState<FormaPagamento>('PIX');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    EnderecoService.list()
      .then(lista => {
        setEnderecos(lista);
        if (lista.length) setEnderecoId(lista[0].id);
      })
      .catch(err => setErro(getErrorMessage(err)));
  }, []);

  const endereco = enderecos?.find(e => e.id === enderecoId) ?? null;
  const chaveItens = itens.map(i => `${i.product.id}:${i.quantity}`).join(',');

  useEffect(() => {
    if (itens.length === 0 || enderecos === null) return;
    let cancelado = false;
    PedidoService.cotar(
      itens.map(i => ({ anuncioId: Number(i.product.id), quantidade: i.quantity })),
      endereco ? { cidade: endereco.cidade, uf: endereco.uf } : null
    )
      .then(r => {
        if (cancelado) return;
        setGrupos(r.grupos);
        setErro(null);
        // Padrão: entrega quando existe; senão retirada. Preserva escolhas já feitas.
        setEntregas(prev => {
          const novo: Record<number, TipoEntrega> = {};
          for (const g of r.grupos) {
            const atual = prev[g.vendedor_id];
            novo[g.vendedor_id] = atual && g.opcoes.some(o => o.tipo === atual) ? atual : g.opcoes[0]?.tipo ?? 'RETIRADA';
          }
          return novo;
        });
      })
      .catch(err => { if (!cancelado) setErro(getErrorMessage(err)); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveItens, enderecoId, enderecos]);

  const totais = useMemo(() => {
    let produtos = 0;
    let frete = 0;
    for (const g of grupos ?? []) {
      produtos += g.subtotal;
      const opcao = g.opcoes.find(o => o.tipo === entregas[g.vendedor_id]);
      frete += opcao?.valor ?? 0;
    }
    return { produtos, frete, total: produtos + frete };
  }, [grupos, entregas]);

  if (itens.length === 0) {
    return (
      <PageShell titulo="Finalizar compra" onVoltar={() => app.go('/carrinho')}>
        <EmptyState titulo="Seu carrinho está vazio" acao={{ rotulo: 'Ver produtos', onClick: () => app.go('/') }} />
      </PageShell>
    );
  }

  const precisaEndereco = Object.values(entregas).includes('ENTREGA');
  const podeFinalizar = !!grupos && !erro && !enviando && (!precisaEndereco || !!endereco);

  const finalizar = async () => {
    if (!grupos) return;
    setEnviando(true);
    try {
      const r = await PedidoService.checkout({
        itens: itens.map(i => ({ anuncioId: Number(i.product.id), quantidade: i.quantity })),
        entregas,
        enderecoId: precisaEndereco ? enderecoId : null,
        formaPagamento: pagamento,
        observacao: observacao.trim() || undefined,
      });
      app.carrinho.limpar();
      toast.success(r.message || 'Pedido criado!');
      app.go(r.pedidos.length === 1 ? `/pedidos/${r.pedidos[0].id}` : '/pedidos');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PageShell titulo="Finalizar compra" onVoltar={() => app.go('/carrinho')}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="flex flex-col gap-5">
          {/* Endereço */}
          <Card>
            <SectionTitle acao={
              <button onClick={() => app.go('/perfil')} style={{ ...botaoSecundario, padding: '6px 12px' }}>
                <Plus size={14} /> Gerenciar endereços
              </button>
            }>
              Endereço de entrega
            </SectionTitle>
            {enderecos === null ? (
              <p style={{ color: C.muted, fontSize: '14px' }}>Carregando endereços...</p>
            ) : enderecos.length === 0 ? (
              <p style={{ color: C.muted, fontSize: '14px' }}>
                Você não tem endereço cadastrado. Cadastre um no seu perfil ou escolha retirar no local.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {enderecos.map(e => (
                  <label
                    key={e.id}
                    style={{
                      display: 'flex', gap: '10px', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                      border: `1.5px solid ${e.id === enderecoId ? C.orange : C.border}`,
                      background: e.id === enderecoId ? 'rgba(244,119,11,0.05)' : C.surface,
                    }}
                  >
                    <input type="radio" name="endereco" checked={e.id === enderecoId} onChange={() => setEnderecoId(e.id)} style={{ accentColor: C.orange }} />
                    <span style={{ fontSize: '13.5px' }}>
                      <strong>{e.rua}, {e.numero}</strong><br />
                      <span style={{ color: C.muted }}>{e.bairro} · {e.cidade}/{e.uf}{e.cep ? ` · ${e.cep}` : ''}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Entrega por produtor */}
          {erro && (
            <div style={{ background: '#FBE7E7', border: '1px solid rgba(214,69,69,0.3)', borderRadius: '12px', padding: '12px 14px', color: '#9B2C2C', fontSize: '14px' }}>
              {erro} <button onClick={() => app.go('/carrinho')} style={{ background: 'none', border: 'none', color: '#9B2C2C', textDecoration: 'underline', cursor: 'pointer' }}>Voltar ao carrinho</button>
            </div>
          )}
          {(grupos ?? []).map(g => (
            <Card key={g.vendedor_id}>
              <div className="flex items-center gap-2 mb-3" style={{ fontSize: '15px', fontWeight: 600 }}>
                <Store size={17} color={C.brown} /> {g.vendedor_nome}
              </div>
              <div className="flex flex-col gap-3" style={{ marginBottom: '16px' }}>
                {g.itens.map(i => (
                  <ItemConferencia
                    key={i.anuncio_id}
                    item={i}
                    produto={itens.find(c => c.product.id === String(i.anuncio_id))?.product}
                    onAbrir={() => app.go(`/produto/${i.anuncio_id}`)}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.opcoes.map(o => (
                  <label
                    key={o.tipo}
                    style={{
                      display: 'flex', gap: '10px', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                      border: `1.5px solid ${entregas[g.vendedor_id] === o.tipo ? C.orange : C.border}`,
                      background: entregas[g.vendedor_id] === o.tipo ? 'rgba(244,119,11,0.05)' : C.surface,
                    }}
                  >
                    <input
                      type="radio"
                      name={`entrega-${g.vendedor_id}`}
                      checked={entregas[g.vendedor_id] === o.tipo}
                      onChange={() => setEntregas(prev => ({ ...prev, [g.vendedor_id]: o.tipo }))}
                      style={{ accentColor: C.orange }}
                    />
                    <span style={{ fontSize: '13.5px' }}>
                      {o.tipo === 'ENTREGA' ? (
                        <>
                          <strong className="flex items-center gap-1"><Truck size={15} /> Entrega · {o.gratis ? 'grátis' : formatCurrency(o.valor)}</strong>
                          <span style={{ color: C.muted }}>{prazo(o.prazo_min, o.prazo_max)} · {o.faixa ? FAIXAS[o.faixa] : ''}</span>
                        </>
                      ) : (
                        <>
                          <strong className="flex items-center gap-1"><MapPin size={15} /> Retirar no local · grátis</strong>
                          <span style={{ color: C.muted }}>{o.endereco ? `${o.endereco.bairro}, ${o.endereco.cidade}/${o.endereco.uf}` : 'Combine o horário com o produtor'}</span>
                        </>
                      )}
                    </span>
                  </label>
                ))}
                {g.opcoes.length === 0 && (
                  <p style={{ fontSize: '13px', color: C.danger }}>
                    Escolha um endereço de entrega: este produtor não oferece retirada para todos os itens.
                  </p>
                )}
              </div>
            </Card>
          ))}

          {/* Pagamento */}
          <Card>
            <SectionTitle>Pagamento</SectionTitle>
            <div className="flex flex-wrap gap-3">
              {PAGAMENTOS.map(p => (
                <button
                  key={p.valor}
                  onClick={() => setPagamento(p.valor)}
                  style={{
                    ...botaoSecundario, padding: '12px 18px',
                    borderColor: pagamento === p.valor ? C.orange : C.border,
                    color: pagamento === p.valor ? C.orange : C.text,
                    background: pagamento === p.valor ? 'rgba(244,119,11,0.05)' : C.surface,
                    fontWeight: 600,
                  }}
                  aria-pressed={pagamento === p.valor}
                >
                  {p.icone} {p.rotulo}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3" style={{ fontSize: '12.5px', color: C.brown, background: C.orangeSoft, borderRadius: '10px', padding: '10px 12px' }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              Ambiente de teste: nenhuma cobrança real é feita. Depois de criar o pedido, use "Pagar (simulação)" para confirmar o pagamento.
            </div>
            <label style={{ display: 'block', marginTop: '16px', fontSize: '13px', fontWeight: 500 }}>
              Observação para os produtores (opcional)
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Ex.: entregar depois das 14h"
                style={{ ...campo, marginTop: '6px', resize: 'vertical', fontFamily: FONT }}
              />
            </label>
          </Card>
        </div>

        <Card style={{ position: 'sticky', top: '72px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>Resumo do pedido</h2>
          <Linha rotulo="Produtos" valor={formatCurrency(totais.produtos)} />
          <Linha rotulo="Frete (estimado)" valor={totais.frete === 0 ? 'Grátis' : formatCurrency(totais.frete)} />
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '12px 0' }} />
          <div className="flex justify-between items-baseline">
            <span style={{ fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: '24px', fontWeight: 800, color: C.orange }}>{formatCurrency(totais.total)}</span>
          </div>
          {(grupos?.length ?? 0) > 1 && (
            <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '6px' }}>
              Serão criados {grupos!.length} pedidos, um por produtor.
            </p>
          )}
          <button
            onClick={finalizar}
            disabled={!podeFinalizar}
            style={{ ...desabilitado(botaoPrimario, !podeFinalizar), width: '100%', height: '50px', marginTop: '16px', fontSize: '15px' }}
          >
            {enviando ? 'Criando pedido...' : 'Confirmar pedido'}
          </button>
          {precisaEndereco && !endereco && (
            <p style={{ fontSize: '12.5px', color: C.danger, marginTop: '8px' }}>Escolha um endereço para a entrega.</p>
          )}
          <p className="flex items-center gap-1.5" style={{ fontSize: '12px', color: C.muted, marginTop: '12px' }}>
            <ShieldCheck size={14} /> Preços e frete são recalculados no servidor ao confirmar.
          </p>
        </Card>
      </div>
    </PageShell>
  );
}

/** Cartão de conferência do item: o comprador confirma que é exatamente esse produto. */
function ItemConferencia({ item, produto, onAbrir }: {
  item: GrupoCarrinho['itens'][number];
  produto?: Product;
  onAbrir: () => void;
}) {
  const unidade = UNIDADES[item.unidade];
  const precoCheio = produto && produto.price > item.preco_unitario ? produto.price : null;
  return (
    <div className="flex gap-3" style={{ border: `1px solid ${C.border}`, borderRadius: '12px', padding: '12px', background: C.surface }}>
      <div style={{ width: '96px', height: '96px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: C.bg }}>
        <ImageWithFallback
          src={item.imagem_url ?? produto?.image ?? ''}
          alt={item.nome}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-3 items-start">
          <div className="min-w-0">
            <div style={{ fontSize: '15px', fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{item.nome}</div>
            {produto && (
              <div className="flex flex-wrap items-center gap-x-2" style={{ fontSize: '12.5px', color: C.muted, marginTop: '2px' }}>
                {produto.category && <span>{produto.category}</span>}
                {produto.location && <span className="flex items-center gap-1"><MapPin size={12} /> {produto.location}</span>}
                {produto.vendedorVerificado && <span className="flex items-center gap-1" style={{ color: '#2E7D32' }}><BadgeCheck size={12} /> Produtor verificado</span>}
              </div>
            )}
          </div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{formatCurrency(item.total)}</span>
        </div>
        {produto?.description && (
          <p style={{
            fontSize: '13px', color: '#4A4A45', marginTop: '6px', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {produto.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: '13px', marginTop: '8px' }}>
          <span>
            <span style={{ color: C.muted }}>Preço: </span>
            {precoCheio !== null && <span style={{ color: C.muted, textDecoration: 'line-through', marginRight: '4px' }}>{formatCurrency(precoCheio)}</span>}
            <strong>{formatCurrency(item.preco_unitario)}</strong> / {unidade?.curto ?? item.unidade}
          </span>
          <span>
            <span style={{ color: C.muted }}>Quantidade: </span>
            <strong>{item.quantidade} {unidade?.curto ?? item.unidade}</strong>
          </span>
          <button
            onClick={onAbrir}
            className="flex items-center gap-1"
            style={{ background: 'none', border: 'none', color: C.orange, fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0, marginLeft: 'auto' }}
          >
            Ver anúncio <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between" style={{ fontSize: '14px', marginBottom: '8px' }}>
      <span style={{ color: C.muted }}>{rotulo}</span>
      <span style={{ fontWeight: 600 }}>{valor}</span>
    </div>
  );
}
