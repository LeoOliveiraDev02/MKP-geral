import { useEffect, useState } from 'react';
import { Package, ChevronRight, Store } from 'lucide-react';
import { formatCurrency } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, FONT } from './theme';
import { Card, EmptyState, PageShell, STATUS_PEDIDO, StatusPedidoPill, formatDateTime, imagemCover } from './ui';
import { useApp } from '../../AppContext';
import { PedidoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Pedido, StatusPedido } from '../../api/types';

const FILTROS: Array<{ valor: StatusPedido | ''; rotulo: string }> = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'AGUARDANDO_PAGAMENTO', rotulo: STATUS_PEDIDO.AGUARDANDO_PAGAMENTO.rotulo },
  { valor: 'PAGO', rotulo: 'Pagos' },
  { valor: 'ENVIADO', rotulo: 'A caminho' },
  { valor: 'ENTREGUE', rotulo: 'Entregues' },
  { valor: 'CANCELADO', rotulo: 'Cancelados' },
];

/** Minhas compras (um pedido por produtor). */
export function OrdersPage() {
  const app = useApp();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [filtro, setFiltro] = useState<StatusPedido | ''>('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setPedidos(null);
    PedidoService.compras(filtro || undefined)
      .then(setPedidos)
      .catch(err => setErro(getErrorMessage(err)));
  }, [filtro]);

  return (
    <PageShell titulo="Meus pedidos" subtitulo="Acompanhe pagamento, envio e entrega das suas compras.">
      <ListaPedidos
        pedidos={pedidos}
        erro={erro}
        filtro={filtro}
        onFiltro={setFiltro}
        papel="COMPRADOR"
        onAbrir={id => app.go(`/pedidos/${id}`)}
        vazio={{ titulo: 'Nenhum pedido por aqui', texto: 'Quando você comprar, seus pedidos aparecem nesta página.', acao: { rotulo: 'Ver produtos', onClick: () => app.go('/') } }}
      />
    </PageShell>
  );
}

/** Lista reaproveitada em "Meus pedidos" e em "Pedidos recebidos" do vendedor. */
export function ListaPedidos({ pedidos, erro, filtro, onFiltro, papel, onAbrir, vazio }: {
  pedidos: Pedido[] | null;
  erro: string | null;
  filtro: StatusPedido | '';
  onFiltro: (f: StatusPedido | '') => void;
  papel: 'COMPRADOR' | 'VENDEDOR';
  onAbrir: (id: number) => void;
  vazio: { titulo: string; texto?: string; acao?: { rotulo: string; onClick: () => void } };
}) {
  return (
    <div style={{ fontFamily: FONT }}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
        {FILTROS.map(f => (
          <button
            key={f.valor || 'todos'}
            onClick={() => onFiltro(f.valor)}
            style={{
              padding: '7px 14px', borderRadius: '999px', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: FONT,
              border: `1px solid ${filtro === f.valor ? C.orange : C.border}`,
              background: filtro === f.valor ? C.orangeSoft : C.surface,
              color: filtro === f.valor ? C.brown : C.text, fontWeight: filtro === f.valor ? 600 : 500,
            }}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p style={{ color: C.danger }}>{erro}</p>
      ) : pedidos === null ? (
        <p style={{ color: C.muted, padding: '40px 0', textAlign: 'center' }}>Carregando pedidos...</p>
      ) : pedidos.length === 0 ? (
        <EmptyState icone={<Package size={42} />} {...vazio} />
      ) : (
        <div className="flex flex-col gap-3">
          {pedidos.map(p => (
            <Card key={p.id} padding="0">
              <button
                onClick={() => onAbrir(p.id)}
                className="hover:bg-[#FBFAF7]"
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', fontFamily: FONT, color: C.text }}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                  <strong style={{ fontSize: '15px' }}>Pedido #{p.id}</strong>
                  <StatusPedidoPill status={p.status} />
                  {p.origem !== 'CARRINHO' && (
                    <span style={{ fontSize: '12px', color: C.brown }}>{p.origem === 'COTACAO' ? 'Cotação de atacado' : 'Cesta por assinatura'}</span>
                  )}
                  <span style={{ fontSize: '12.5px', color: C.muted, marginLeft: 'auto' }}>{formatDateTime(p.data_criacao)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-3">
                    {p.itens.slice(0, 3).map(i => (
                      <div key={i.id} style={{ width: '52px', height: '52px', borderRadius: '10px', overflow: 'hidden', border: `2px solid ${C.surface}`, background: C.border }}>
                        {i.imagem_url && <ImageWithFallback src={i.imagem_url} alt="" style={imagemCover} />}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.itens.map(i => `${i.quantidade}× ${i.nome}`).join(', ')}
                    </div>
                    <div className="flex items-center gap-1" style={{ fontSize: '12.5px', color: C.muted, marginTop: '2px' }}>
                      <Store size={13} /> {papel === 'COMPRADOR' ? p.vendedor_nome : `Comprador: ${p.comprador_nome}`}
                      {' · '}{p.tipo_entrega === 'ENTREGA' ? 'Entrega' : 'Retirada no local'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: C.orange }}>{formatCurrency(p.total)}</div>
                  </div>
                  <ChevronRight size={18} color={C.muted} />
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
