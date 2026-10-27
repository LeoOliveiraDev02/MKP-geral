import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ShoppingBasket, MapPin, CalendarClock, Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import {
  Card, EmptyState, Modal, PageShell, Pill, botaoContorno, botaoPerigo, botaoPrimario, botaoSecundario, campo, desabilitado, formatDia, imagemCover, rotulo,
} from './ui';
import { useApp } from '../../AppContext';
import { AssinaturaService, CestaService, EnderecoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Assinatura, Cesta, Endereco, Frequencia, TipoEntrega } from '../../api/types';

export const FREQUENCIA: Record<Frequencia, string> = { SEMANAL: 'toda semana', QUINZENAL: 'a cada 15 dias', MENSAL: 'todo mês' };

/** Cestas recorrentes dos produtores e as assinaturas do cliente. */
export function BasketsPage() {
  const app = useApp();
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'assinaturas' ? 'assinaturas' : 'cestas';
  const destaque = params.get('cesta');
  const [cestas, setCestas] = useState<Cesta[] | null>(null);
  const [assinaturas, setAssinaturas] = useState<Assinatura[] | null>(null);
  const [assinando, setAssinando] = useState<Cesta | null>(null);

  useEffect(() => {
    CestaService.publicas().then(setCestas).catch(err => toast.error(getErrorMessage(err)));
  }, []);

  const carregarAssinaturas = useCallback(() => {
    if (!app.user) return;
    AssinaturaService.minhas().then(setAssinaturas).catch(err => toast.error(getErrorMessage(err)));
  }, [app.user]);
  useEffect(() => { carregarAssinaturas(); }, [carregarAssinaturas]);

  useEffect(() => {
    if (destaque) setTimeout(() => document.getElementById(`cesta-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }, [destaque, cestas]);

  const alterar = async (a: Assinatura, status: Assinatura['status']) => {
    if (status === 'CANCELADA' && !window.confirm('Cancelar esta assinatura?')) return;
    try {
      await AssinaturaService.alterar(a.id, status);
      toast.success(status === 'ATIVA' ? 'Assinatura retomada.' : status === 'PAUSADA' ? 'Assinatura pausada.' : 'Assinatura cancelada.');
      carregarAssinaturas();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <PageShell titulo="Cestas por assinatura" subtitulo="Receba uma seleção fresca do produtor com regularidade. Pause ou cancele quando quiser.">
      <div className="flex gap-2 mb-5">
        {(['cestas', 'assinaturas'] as const).map(a => (
          <button key={a} onClick={() => setParams(a === 'cestas' ? {} : { aba: a })}
            style={{ ...botaoSecundario, borderColor: aba === a ? C.orange : C.border, color: aba === a ? C.orange : C.text, fontWeight: 600 }}>
            {a === 'cestas' ? 'Cestas disponíveis' : 'Minhas assinaturas'}
          </button>
        ))}
      </div>

      {aba === 'cestas' ? (
        cestas === null ? <p style={{ color: C.muted }}>Carregando...</p> : cestas.length === 0 ? (
          <EmptyState icone={<ShoppingBasket size={42} />} titulo="Nenhuma cesta disponível ainda" texto="Produtores podem criar cestas no Painel do vendedor." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {cestas.map(c => (
              <Card key={c.id} padding="0" style={{ overflow: 'hidden', outline: destaque === String(c.id) ? `2px solid ${C.orange}` : undefined }}>
                <div id={`cesta-${c.id}`} style={{ height: '170px', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.imagem_url ? <ImageWithFallback src={c.imagem_url} alt={c.nome} style={imagemCover} /> : <ShoppingBasket size={56} color={C.brown} strokeWidth={1.3} />}
                </div>
                <div style={{ padding: '16px' }}>
                  <div className="flex items-center gap-2">
                    <strong style={{ fontSize: '16px' }}>{c.nome}</strong>
                    <Pill tom="marrom" style={{ marginLeft: 'auto' }}>{FREQUENCIA[c.frequencia]}</Pill>
                  </div>
                  <button onClick={() => app.go(`/produtor/${c.vendedor_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', color: C.brown, fontFamily: FONT, marginTop: '2px' }}>
                    {c.vendedor_nome}
                  </button>
                  {c.cidade && <div className="flex items-center gap-1" style={{ fontSize: '12.5px', color: C.muted }}><MapPin size={12} /> {c.cidade}/{c.uf}</div>}
                  <p style={{ fontSize: '13.5px', marginTop: '8px' }}>{c.descricao}</p>
                  <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '6px' }}><strong>Vem na cesta:</strong> {c.itens}</p>
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: C.orange }}>{formatCurrency(c.preco)}</span>
                      <span style={{ fontSize: '12.5px', color: C.muted }}> por entrega</span>
                    </div>
                    <button
                      onClick={() => (app.user ? setAssinando(c) : app.pedirLogin(`/cestas?cesta=${c.id}`))}
                      disabled={String(c.vendedor_id) === String(app.user?.id)}
                      style={desabilitado(botaoPrimario, String(c.vendedor_id) === String(app.user?.id))}
                    >
                      Assinar
                    </button>
                  </div>
                  {c.assinantes > 0 && <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>{c.assinantes} assinante{c.assinantes > 1 ? 's' : ''}</div>}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : !app.user ? (
        <EmptyState titulo="Entre para ver suas assinaturas" acao={{ rotulo: 'Entrar', onClick: () => app.pedirLogin('/cestas?aba=assinaturas') }} />
      ) : assinaturas === null ? <p style={{ color: C.muted }}>Carregando...</p> : assinaturas.length === 0 ? (
        <EmptyState icone={<ShoppingBasket size={42} />} titulo="Você ainda não assina nenhuma cesta" acao={{ rotulo: 'Ver cestas', onClick: () => setParams({}) }} />
      ) : (
        <div className="flex flex-col gap-3">
          {assinaturas.map(a => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center gap-3">
                <div style={{ width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.cesta_imagem ? <ImageWithFallback src={a.cesta_imagem} alt="" style={imagemCover} /> : <ShoppingBasket size={28} color={C.brown} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{a.cesta_nome}</strong>
                    <Pill tom={a.status === 'ATIVA' ? 'verde' : a.status === 'PAUSADA' ? 'laranja' : 'cinza'}>
                      {a.status === 'ATIVA' ? 'Ativa' : a.status === 'PAUSADA' ? 'Pausada' : 'Cancelada'}
                    </Pill>
                  </div>
                  <div style={{ fontSize: '13px', color: C.muted }}>
                    {a.vendedor_nome} · {formatCurrency(a.cesta_preco)} {FREQUENCIA[a.cesta_frequencia]} · {a.tipo_entrega === 'ENTREGA' ? 'entrega' : 'retirada'}
                  </div>
                  {a.status === 'ATIVA' && (
                    <div className="flex items-center gap-1" style={{ fontSize: '13px', color: C.brown, marginTop: '2px' }}>
                      <CalendarClock size={14} /> Próxima entrega prevista: {formatDia(a.proxima_entrega)}
                    </div>
                  )}
                </div>
                {a.status !== 'CANCELADA' && (
                  <div className="flex gap-2">
                    {a.status === 'ATIVA'
                      ? <button onClick={() => alterar(a, 'PAUSADA')} style={botaoSecundario}><Pause size={15} /> Pausar</button>
                      : <button onClick={() => alterar(a, 'ATIVA')} style={botaoContorno}><Play size={15} /> Retomar</button>}
                    <button onClick={() => alterar(a, 'CANCELADA')} style={botaoPerigo}><X size={15} /> Cancelar</button>
                  </div>
                )}
              </div>
            </Card>
          ))}
          <p style={{ fontSize: '12.5px', color: C.muted }}>
            Ambiente de teste: não há cobrança recorrente. A cada entrega o produtor gera um pedido, que você confirma com o pagamento simulado.
          </p>
        </div>
      )}

      {assinando && (
        <ModalAssinar cesta={assinando} onFechar={() => setAssinando(null)} onConcluir={() => { setAssinando(null); setParams({ aba: 'assinaturas' }); carregarAssinaturas(); }} />
      )}
    </PageShell>
  );
}

function ModalAssinar({ cesta, onFechar, onConcluir }: { cesta: Cesta; onFechar: () => void; onConcluir: () => void }) {
  const [tipo, setTipo] = useState<TipoEntrega>('ENTREGA');
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    EnderecoService.list().then(l => { setEnderecos(l); if (l.length) setEnderecoId(l[0].id); }).catch(() => undefined);
  }, []);

  const assinar = async () => {
    setEnviando(true);
    try {
      await CestaService.assinar(cesta.id, tipo, tipo === 'ENTREGA' ? enderecoId : null);
      toast.success('Assinatura confirmada!');
      onConcluir();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={`Assinar ${cesta.nome}`} aberto onFechar={onFechar}>
      <p style={{ fontSize: '14px', marginBottom: '12px' }}>
        {formatCurrency(cesta.preco)} {FREQUENCIA[cesta.frequencia]}. Você pode pausar ou cancelar quando quiser.
      </p>
      <label style={rotulo}>Como receber</label>
      <select value={tipo} onChange={e => setTipo(e.target.value as TipoEntrega)} style={campo}>
        <option value="ENTREGA">Entrega no meu endereço</option>
        <option value="RETIRADA">Retirar com o produtor</option>
      </select>
      {tipo === 'ENTREGA' && (
        <>
          <label style={{ ...rotulo, marginTop: '12px' }}>Endereço</label>
          {enderecos.length === 0 ? (
            <p style={{ fontSize: '13px', color: C.danger }}>Cadastre um endereço no seu perfil.</p>
          ) : (
            <select value={enderecoId ?? ''} onChange={e => setEnderecoId(Number(e.target.value))} style={campo}>
              {enderecos.map(e => <option key={e.id} value={e.id}>{e.rua}, {e.numero} · {e.cidade}/{e.uf}</option>)}
            </select>
          )}
        </>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Voltar</button>
        <button onClick={assinar} disabled={enviando || (tipo === 'ENTREGA' && !enderecoId)} style={desabilitado(botaoPrimario, enviando || (tipo === 'ENTREGA' && !enderecoId))}>
          Confirmar assinatura
        </button>
      </div>
    </Modal>
  );
}
