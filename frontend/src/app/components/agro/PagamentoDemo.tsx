import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, CreditCard, Loader2, QrCode, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from './data';
import { C } from './theme';
import { Modal, botaoPrimario, botaoSecundario, desabilitado } from './ui';
import type { FormaPagamento } from '../../api/types';

/**
 * Tela de pagamento da demonstração (Pix, cartão ou boleto).
 *
 * Nada aqui cobra de verdade: o QR Code e o código "copia e cola" só contêm um
 * texto de demonstração (apps de banco recusam) e o cartão não pede dados — não
 * queremos ninguém digitando um cartão real numa apresentação. Ao confirmar,
 * chama `onPagar`, que marca o pedido como PAGO no backend (PAGAMENTO_DEMO=on).
 */
export function PagamentoDemo({ aberto, pedidoId, total, forma, onFechar, onPagar }: {
  aberto: boolean;
  pedidoId: number;
  total: number;
  forma: FormaPagamento;
  onFechar: () => void;
  onPagar: () => Promise<void>;
}) {
  const [etapa, setEtapa] = useState<'aguardando' | 'processando' | 'aprovado'>('aguardando');
  const [qr, setQr] = useState<string | null>(null);
  const [restante, setRestante] = useState(30 * 60);

  const codigo = `AGROMUNDO-DEMONSTRACAO|PEDIDO-${pedidoId}|${total.toFixed(2)}|SEM-COBRANCA-REAL`;
  const linhaBoleto = `00190.00009 0${String(pedidoId).padStart(4, '0')}.000000 00000.000000 1 ${String(Math.round(total * 100)).padStart(10, '0')}`;

  useEffect(() => {
    if (!aberto) return;
    setEtapa('aguardando');
    setRestante(30 * 60);
    if (forma === 'PIX') {
      QRCode.toDataURL(codigo, { width: 220, margin: 1, color: { dark: C.graphite, light: '#ffffff' } })
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [aberto, forma, codigo]);

  useEffect(() => {
    if (!aberto || forma !== 'PIX' || etapa !== 'aguardando') return;
    const t = window.setInterval(() => setRestante(s => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [aberto, forma, etapa]);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Código copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const confirmar = async () => {
    setEtapa('processando');
    // Pequena espera para imitar a confirmação do banco/operadora
    await new Promise(r => setTimeout(r, forma === 'CARTAO' ? 1800 : 1200));
    try {
      await onPagar();
      setEtapa('aprovado');
    } catch {
      setEtapa('aguardando');
    }
  };

  const titulo = { PIX: 'Pagar com Pix', CARTAO: 'Pagar com cartão', BOLETO: 'Pagar com boleto' }[forma];
  const ocupado = etapa === 'processando';

  return (
    <Modal titulo={titulo} aberto={aberto} onFechar={ocupado ? () => undefined : onFechar} largura={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: C.muted }}>Pedido #{pedidoId}</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: C.orange }}>{formatCurrency(total)}</div>
        </div>

        {etapa === 'aprovado' ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <span style={{
              width: '64px', height: '64px', borderRadius: '50%', background: C.success, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={34} />
            </span>
            <p style={{ fontSize: '17px', fontWeight: 700, marginTop: '12px' }}>Pagamento aprovado!</p>
            <p style={{ fontSize: '13.5px', color: C.muted, marginTop: '4px' }}>O produtor já foi avisado e vai preparar o seu pedido.</p>
            <button onClick={onFechar} style={{ ...botaoPrimario, width: '100%', marginTop: '16px' }}>Acompanhar pedido</button>
          </div>
        ) : (
          <>
            {forma === 'PIX' && (
              <div style={{ textAlign: 'center' }}>
                {qr
                  ? <img src={qr} alt="QR Code Pix de demonstração" width={200} height={200} style={{ margin: '0 auto', borderRadius: '8px', border: `1px solid ${C.border}` }} />
                  : <QrCode size={120} color={C.muted} style={{ margin: '0 auto' }} />}
                <p style={{ fontSize: '13px', color: C.muted, marginTop: '8px' }}>
                  Escaneie com o app do banco ou use o Pix copia e cola.
                  {' '}Expira em <strong style={{ color: C.text }}>{String(Math.floor(restante / 60)).padStart(2, '0')}:{String(restante % 60).padStart(2, '0')}</strong>
                </p>
                <button onClick={() => copiar(codigo)} style={{ ...botaoSecundario, width: '100%', marginTop: '10px' }}>
                  <Copy size={15} /> Copiar código Pix
                </button>
              </div>
            )}

            {forma === 'CARTAO' && (
              <div style={{
                borderRadius: '14px', padding: '18px', color: '#fff',
                background: `linear-gradient(135deg, ${C.graphite}, ${C.graphiteSoft})`,
              }}>
                <CreditCard size={26} />
                <div style={{ fontSize: '18px', letterSpacing: '2px', marginTop: '18px', fontFamily: 'monospace' }}>•••• •••• •••• 4242</div>
                <div className="flex justify-between" style={{ fontSize: '12px', marginTop: '10px', opacity: 0.8 }}>
                  <span>CARTÃO DE DEMONSTRAÇÃO</span><span>12/30</span>
                </div>
              </div>
            )}

            {forma === 'BOLETO' && (
              <div style={{ border: `1px dashed ${C.border}`, borderRadius: '12px', padding: '14px' }}>
                <div className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: '14px' }}><Receipt size={18} /> Linha digitável</div>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '8px', wordBreak: 'break-all' }}>{linhaBoleto}</div>
                <button onClick={() => copiar(linhaBoleto)} style={{ ...botaoSecundario, width: '100%', marginTop: '10px' }}>
                  <Copy size={15} /> Copiar linha digitável
                </button>
              </div>
            )}

            <button onClick={confirmar} disabled={ocupado} style={desabilitado({ ...botaoPrimario, width: '100%' }, ocupado)}>
              {ocupado
                ? <><Loader2 size={16} className="animate-spin" /> {forma === 'CARTAO' ? 'Autorizando com a operadora...' : 'Confirmando com o banco...'}</>
                : forma === 'CARTAO' ? 'Pagar agora' : 'Já paguei'}
            </button>
            <p style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>
              Demonstração: nenhuma cobrança real é feita.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
