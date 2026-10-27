import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Leaf, Truck, ShieldCheck, Headphones, Sprout, Download } from 'lucide-react';
import { C, CONTAINER, FONT } from './theme';

// Os textos refletem o que o sistema oferece hoje: frete grátis acima de R$ 500
// (regra do carrinho), Pix/cartão/boleto no checkout e o canal de atendimento.
const HIGHLIGHTS = [
  { icon: Leaf, title: 'Produtos frescos', text: 'Direto do produtor' },
  { icon: Truck, title: 'Entrega e frete', text: 'Frete grátis acima de R$ 500' },
  { icon: ShieldCheck, title: 'Pagamento seguro', text: 'Pix, cartão e boleto' },
  { icon: Headphones, title: 'Atendimento', text: '0800 123 4567 · Seg–Sex' },
];

export function Footer() {
  return (
    <footer id="sobre" style={{ background: C.graphite, color: '#fff', fontFamily: FONT, marginTop: '48px' }}>
      <div className={`${CONTAINER} py-7`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-y-6 lg:gap-0 items-center">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className={`flex items-center gap-4 lg:px-6 ${i > 0 ? 'lg:border-l' : 'lg:pl-0'}`}
              style={{ borderColor: 'rgba(255,255,255,0.14)' }}
            >
              <Icon size={30} strokeWidth={1.5} color="#fff" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.62)', marginTop: '2px' }}>{text}</div>
              </div>
            </div>
          ))}

          <div className="hidden lg:flex items-center gap-4 pl-8">
            <div style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive", fontSize: '19px', lineHeight: 1.25, transform: 'rotate(-6deg)' }}>
              O agro move<br />
              <span style={{ marginLeft: '14px', borderBottom: `2px solid ${C.orange}`, paddingBottom: '2px' }}>o nosso futuro</span>
            </div>
            <Sprout size={38} strokeWidth={1.2} color="rgba(255,255,255,0.7)" />
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className={`${CONTAINER} py-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between`} style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.55)' }}>
          <p style={{ maxWidth: '720px', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff', fontWeight: 600 }}>Sobre o AgroMundo:</strong> marketplace que aproxima produtores rurais
            e compradores, com negociação direta e sem intermediários.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <BotaoInstalar />
            <Link to="/privacidade" style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'underline' }}>Privacidade e termos</Link>
            <span>© {new Date().getFullYear()} AgroMundo. Todos os direitos reservados.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

type EventoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Instalar app": aparece quando o navegador permite instalar o AgroMundo como aplicativo. */
function BotaoInstalar() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacao);
    };
    const aoInstalar = () => setEvento(null);
    window.addEventListener('beforeinstallprompt', aoOferecer);
    window.addEventListener('appinstalled', aoInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', aoOferecer);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, []);

  if (!evento) return null;
  return (
    <button
      onClick={async () => {
        await evento.prompt();
        await evento.userChoice;
        setEvento(null);
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', background: C.orange, color: '#fff', border: 'none',
        borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
      }}
    >
      <Download size={15} /> Instalar app
    </button>
  );
}
