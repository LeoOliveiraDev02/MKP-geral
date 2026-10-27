import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ShieldAlert, Scale, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { C, FONT } from './theme';
import {
  Card, EmptyState, PageShell, Pill, SectionTitle, botaoContorno, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime,
} from './ui';
import { useApp } from '../../AppContext';
import { ReclamacaoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Reclamacao, StatusReclamacao } from '../../api/types';
import { MOTIVOS } from './OrderDetailPage';

export const STATUS_RECLAMACAO: Record<StatusReclamacao, { rotulo: string; tom: 'laranja' | 'marrom' | 'cinza' | 'verde' | 'vermelho' | 'grafite' }> = {
  ABERTA: { rotulo: 'Aguardando produtor', tom: 'laranja' },
  RESPONDIDA: { rotulo: 'Respondida', tom: 'marrom' },
  EM_MEDIACAO: { rotulo: 'Em mediação', tom: 'grafite' },
  RESOLVIDA_COMPRADOR: { rotulo: 'Resolvida a favor do comprador', tom: 'verde' },
  RESOLVIDA_VENDEDOR: { rotulo: 'Resolvida a favor do produtor', tom: 'cinza' },
  ENCERRADA: { rotulo: 'Encerrada', tom: 'cinza' },
};

/** /reclamacoes (lista) e /reclamacoes/:id (detalhe). */
export function ClaimsPage() {
  const { id } = useParams();
  return id ? <DetalheReclamacao id={id} /> : <ListaReclamacoes />;
}

function ListaReclamacoes() {
  const app = useApp();
  const [lista, setLista] = useState<Reclamacao[] | null>(null);
  useEffect(() => {
    ReclamacaoService.listar().then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, []);

  return (
    <PageShell titulo="Reclamações" subtitulo="Problemas com pedidos, devoluções e mediação do AgroMundo." largura="estreita">
      {lista === null ? <p style={{ color: C.muted }}>Carregando...</p> : lista.length === 0 ? (
        <EmptyState icone={<ShieldAlert size={40} />} titulo="Nenhuma reclamação" texto="Se algo der errado com um pedido, abra uma reclamação pela página do pedido." />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(r => (
            <Card key={r.id} padding="0">
              <button onClick={() => app.go(`/reclamacoes/${r.id}`)} className="hover:bg-[#FBFAF7]"
                style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT, color: C.text }}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>Pedido #{r.pedido_id}</strong>
                    <Pill tom={STATUS_RECLAMACAO[r.status].tom}>{STATUS_RECLAMACAO[r.status].rotulo}</Pill>
                  </div>
                  <div style={{ fontSize: '13px', color: C.muted, marginTop: '3px' }}>
                    {MOTIVOS[r.motivo]} · {r.papel === 'COMPRADOR' ? `produtor ${r.vendedor_nome}` : `cliente ${r.comprador_nome}`} · {formatDateTime(r.data_abertura)}
                  </div>
                </div>
                <ChevronRight size={18} color={C.muted} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function DetalheReclamacao({ id }: { id: string }) {
  const app = useApp();
  const [r, setR] = useState<Reclamacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    ReclamacaoService.detalhe(id).then(setR).catch(err => setErro(getErrorMessage(err)));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <PageShell titulo="Reclamação" onVoltar={() => app.go('/reclamacoes')}><EmptyState titulo={erro} /></PageShell>;
  if (!r) return <PageShell titulo="Reclamação" onVoltar={() => app.go('/reclamacoes')}><p style={{ color: C.muted }}>Carregando...</p></PageShell>;

  const acao = async (fn: () => Promise<Reclamacao>, msg: string) => {
    setEnviando(true);
    try {
      setR(await fn());
      toast.success(msg);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const aberta = ['ABERTA', 'RESPONDIDA', 'EM_MEDIACAO'].includes(r.status);
  const comprador = r.papel === 'COMPRADOR';
  const vendedor = r.papel === 'VENDEDOR';

  return (
    <PageShell
      titulo={<span className="flex flex-wrap items-center gap-3">Reclamação do pedido #{r.pedido_id} <Pill tom={STATUS_RECLAMACAO[r.status].tom}>{STATUS_RECLAMACAO[r.status].rotulo}</Pill></span>}
      subtitulo={`Aberta em ${formatDateTime(r.data_abertura)} · pedido de ${formatCurrency(r.pedido_total)}`}
      onVoltar={() => app.go('/reclamacoes')}
      acoes={<button onClick={() => app.go(vendedor ? `/vender/pedidos/${r.pedido_id}` : `/pedidos/${r.pedido_id}`)} style={botaoSecundario}>Ver pedido</button>}
      largura="estreita"
    >
      <div className="flex flex-col gap-4">
        <Card>
          <SectionTitle>{r.comprador_nome} (cliente)</SectionTitle>
          <Pill tom="cinza">{MOTIVOS[r.motivo]}</Pill>
          {r.pedido_devolucao && <Pill tom="laranja" style={{ marginLeft: '6px' }}>Quer devolver e receber o reembolso</Pill>}
          <p style={{ fontSize: '14.5px', marginTop: '10px', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{r.descricao}</p>
        </Card>

        {r.resposta_vendedor && (
          <Card>
            <SectionTitle>{r.vendedor_nome} (produtor)</SectionTitle>
            <p style={{ fontSize: '14.5px', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{r.resposta_vendedor}</p>
          </Card>
        )}

        {r.decisao_mediacao && (
          <Card style={{ borderColor: C.graphite }}>
            <SectionTitle><span className="flex items-center gap-2"><Scale size={18} /> Decisão da mediação</span></SectionTitle>
            <p style={{ fontSize: '14.5px', whiteSpace: 'pre-line' }}>{r.decisao_mediacao}</p>
            {r.status === 'RESOLVIDA_COMPRADOR' && (
              <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '8px' }}>Ambiente de teste: o reembolso foi registrado no histórico do pedido (sem dinheiro real).</p>
            )}
          </Card>
        )}

        {vendedor && (r.status === 'ABERTA' || r.status === 'RESPONDIDA') && (
          <Card>
            <SectionTitle>Responder ao cliente</SectionTitle>
            <textarea value={resposta} onChange={e => setResposta(e.target.value.slice(0, 2000))} rows={4} style={{ ...campo, resize: 'vertical' }}
              placeholder="Explique o que aconteceu ou proponha uma solução." />
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <button disabled={enviando || resposta.trim().length < 5}
                onClick={() => acao(() => ReclamacaoService.responder(r.id, resposta.trim(), true), 'Reclamação resolvida a favor do cliente.')}
                style={desabilitado(botaoContorno, enviando || resposta.trim().length < 5)}>
                Aceitar e reembolsar
              </button>
              <button disabled={enviando || resposta.trim().length < 5}
                onClick={() => acao(() => ReclamacaoService.responder(r.id, resposta.trim(), false), 'Resposta enviada.')}
                style={desabilitado(botaoPrimario, enviando || resposta.trim().length < 5)}>
                Enviar resposta
              </button>
            </div>
          </Card>
        )}

        {aberta && r.status !== 'EM_MEDIACAO' && (
          <Card>
            <SectionTitle>Próximos passos</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {comprador && (
                <button disabled={enviando} onClick={() => acao(() => ReclamacaoService.encerrar(r.id), 'Reclamação encerrada.')} style={botaoSecundario}>
                  Problema resolvido, encerrar
                </button>
              )}
              {(r.status === 'RESPONDIDA' || vendedor) && (
                <button disabled={enviando} onClick={() => acao(() => ReclamacaoService.pedirMediacao(r.id), 'Mediação solicitada.')} style={botaoContorno}>
                  <Scale size={15} /> Pedir mediação do AgroMundo
                </button>
              )}
            </div>
            {comprador && r.status === 'ABERTA' && (
              <p style={{ fontSize: '12.5px', color: C.muted, marginTop: '8px' }}>Aguarde a resposta do produtor. Depois dela, você pode pedir mediação se não houver acordo.</p>
            )}
          </Card>
        )}

        {r.status === 'EM_MEDIACAO' && (
          <p style={{ fontSize: '13.5px', color: C.muted }}>
            A equipe do AgroMundo está analisando o caso e avisará as duas partes da decisão.
          </p>
        )}
      </div>
    </PageShell>
  );
}
