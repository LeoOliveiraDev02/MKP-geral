import { useCallback, useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, UNIDADES } from './data';
import { C } from './theme';
import {
  Card, EmptyState, Modal, PageShell, Pill, botaoContorno, botaoPrimario, botaoSecundario, campo, desabilitado, formatDateTime, rotulo,
} from './ui';
import { useApp } from '../../AppContext';
import { CotacaoService, EnderecoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Cotacao, Endereco, FormaPagamento, StatusCotacao, TipoEntrega } from '../../api/types';

export const STATUS_COTACAO: Record<StatusCotacao, { rotulo: string; tom: 'laranja' | 'marrom' | 'cinza' | 'verde' | 'vermelho' }> = {
  PENDENTE: { rotulo: 'Aguardando proposta', tom: 'laranja' },
  RESPONDIDA: { rotulo: 'Proposta recebida', tom: 'marrom' },
  ACEITA: { rotulo: 'Aceita', tom: 'verde' },
  RECUSADA: { rotulo: 'Recusada', tom: 'vermelho' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'cinza' },
};

/** Cotações de atacado pedidas pelo comprador. */
export function QuotesPage() {
  const app = useApp();
  const [lista, setLista] = useState<Cotacao[] | null>(null);
  const [aceitando, setAceitando] = useState<Cotacao | null>(null);

  const carregar = useCallback(() => {
    CotacaoService.minhas().then(setLista).catch(err => toast.error(getErrorMessage(err)));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cancelar = async (c: Cotacao) => {
    try {
      await CotacaoService.cancelar(c.id);
      toast.success('Cotação cancelada.');
      carregar();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <PageShell titulo="Minhas cotações" subtitulo="Pedidos de preço para compras em quantidade (restaurantes, mercados, revenda)." largura="estreita">
      {lista === null ? <p style={{ color: C.muted }}>Carregando...</p> : lista.length === 0 ? (
        <EmptyState icone={<Boxes size={40} />} titulo="Nenhuma cotação" texto="Na página de um produto, use “Pedir cotação ao produtor” para comprar em quantidade." />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(c => {
            const un = UNIDADES[c.anuncio_unidade]?.curto ?? 'un';
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => app.go(`/produto/${c.anuncio_id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '15px', color: C.text }}>
                    {c.quantidade} {un} de {c.anuncio_nome}
                  </button>
                  <Pill tom={STATUS_COTACAO[c.status].tom}>{STATUS_COTACAO[c.status].rotulo}</Pill>
                  <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{formatDateTime(c.data_criacao)}</span>
                </div>
                <div style={{ fontSize: '13px', color: C.muted, marginTop: '4px' }}>
                  Produtor: {c.vendedor_nome} · preço de vitrine {formatCurrency(c.anuncio_preco)}/{un}
                </div>
                {c.mensagem && <p style={{ fontSize: '13.5px', marginTop: '6px' }}>Você: “{c.mensagem}”</p>}
                {c.preco_unitario !== null && (
                  <div style={{ marginTop: '10px', background: '#FBFAF7', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', fontSize: '14px' }}>
                    Proposta: <strong style={{ color: C.orange }}>{formatCurrency(c.preco_unitario)}/{un}</strong>
                    {' '}· total <strong>{formatCurrency(c.preco_unitario * c.quantidade)}</strong>
                    {c.prazo_entrega && <> · prazo {c.prazo_entrega}</>}
                    {c.resposta && <div style={{ color: C.muted, marginTop: '4px' }}>“{c.resposta}”</div>}
                  </div>
                )}
                {c.status === 'RECUSADA' && c.resposta && <p style={{ fontSize: '13px', color: C.muted, marginTop: '6px' }}>Motivo: {c.resposta}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                  {c.status === 'RESPONDIDA' && <button onClick={() => setAceitando(c)} style={botaoPrimario}>Aceitar e fazer pedido</button>}
                  {(c.status === 'PENDENTE' || c.status === 'RESPONDIDA') && <button onClick={() => cancelar(c)} style={botaoSecundario}>Cancelar</button>}
                  {c.pedido_id && <button onClick={() => app.go(`/pedidos/${c.pedido_id}`)} style={botaoContorno}>Ver pedido #{c.pedido_id}</button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {aceitando && <ModalAceite cotacao={aceitando} onFechar={() => setAceitando(null)} onPedido={id => app.go(`/pedidos/${id}`)} />}
    </PageShell>
  );
}

function ModalAceite({ cotacao, onFechar, onPedido }: { cotacao: Cotacao; onFechar: () => void; onPedido: (id: number) => void }) {
  const [tipo, setTipo] = useState<TipoEntrega>('RETIRADA');
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [pagamento, setPagamento] = useState<FormaPagamento>('PIX');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    EnderecoService.list().then(l => { setEnderecos(l); if (l.length) setEnderecoId(l[0].id); }).catch(() => undefined);
  }, []);

  const aceitar = async () => {
    setEnviando(true);
    try {
      const id = await CotacaoService.aceitar(cotacao.id, { tipoEntrega: tipo, enderecoId: tipo === 'ENTREGA' ? enderecoId : null, formaPagamento: pagamento });
      toast.success('Proposta aceita! Seu pedido foi criado.');
      onPedido(id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Aceitar proposta" aberto onFechar={onFechar}>
      <label style={rotulo}>Como você quer receber?</label>
      <select value={tipo} onChange={e => setTipo(e.target.value as TipoEntrega)} style={campo}>
        <option value="RETIRADA">Retirar no local do produtor (grátis)</option>
        <option value="ENTREGA">Entrega (frete estimado)</option>
      </select>
      {tipo === 'ENTREGA' && (
        <>
          <label style={{ ...rotulo, marginTop: '12px' }}>Endereço</label>
          <select value={enderecoId ?? ''} onChange={e => setEnderecoId(Number(e.target.value))} style={campo}>
            {enderecos.map(e => <option key={e.id} value={e.id}>{e.rua}, {e.numero} · {e.cidade}/{e.uf}</option>)}
          </select>
        </>
      )}
      <label style={{ ...rotulo, marginTop: '12px' }}>Pagamento (simulado)</label>
      <select value={pagamento} onChange={e => setPagamento(e.target.value as FormaPagamento)} style={campo}>
        <option value="PIX">Pix</option>
        <option value="CARTAO">Cartão</option>
        <option value="BOLETO">Boleto</option>
      </select>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onFechar} style={botaoSecundario}>Voltar</button>
        <button onClick={aceitar} disabled={enviando || (tipo === 'ENTREGA' && !enderecoId)} style={desabilitado(botaoPrimario, enviando || (tipo === 'ENTREGA' && !enderecoId))}>
          Criar pedido
        </button>
      </div>
    </Modal>
  );
}
