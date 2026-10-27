/**
 * @file ui.tsx
 * @description Peças visuais compartilhadas pelas páginas do marketplace
 * (layout de página, cartão, botões, selos, estrelas, estado vazio), seguindo
 * a paleta de theme.ts.
 */

import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Star, Wheat } from 'lucide-react';
import { C, CONTAINER, FONT, SHADOW_SM } from './theme';
import type { StatusPedido } from '../../api/types';

// ─── Layout ───

export function PageShell({
  titulo, subtitulo, onVoltar, acoes, children, largura = 'normal',
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  onVoltar?: () => void;
  acoes?: ReactNode;
  children: ReactNode;
  largura?: 'normal' | 'estreita';
}) {
  return (
    <div style={{ background: C.bg, minHeight: '70vh', fontFamily: FONT, color: C.text }}>
      <div className={`${CONTAINER} py-6`} style={largura === 'estreita' ? { maxWidth: '960px' } : undefined}>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {onVoltar && (
            <button onClick={onVoltar} style={botaoSecundario} aria-label="Voltar">
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 700, lineHeight: 1.2 }}>{titulo}</h1>
            {subtitulo && <p style={{ color: C.muted, fontSize: '14px', marginTop: '4px' }}>{subtitulo}</p>}
          </div>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, style, className, padding = '20px' }: {
  children: ReactNode; style?: CSSProperties; className?: string; padding?: string;
}) {
  return (
    <div
      className={className}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding, boxShadow: SHADOW_SM, ...style }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{children}</h2>
      {acao}
    </div>
  );
}

export function EmptyState({ titulo, texto, acao, icone }: {
  titulo: string; texto?: string; acao?: { rotulo: string; onClick: () => void }; icone?: ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 20px', color: C.muted, fontFamily: FONT }}>
      <div style={{ width: 'fit-content', margin: '0 auto 14px', color: C.brown }}>{icone ?? <Wheat size={42} />}</div>
      <p style={{ fontSize: '17px', fontWeight: 600, color: C.text }}>{titulo}</p>
      {texto && <p style={{ fontSize: '14px', marginTop: '6px', maxWidth: '460px', marginInline: 'auto' }}>{texto}</p>}
      {acao && (
        <button onClick={acao.onClick} style={{ ...botaoPrimario, marginTop: '18px', marginInline: 'auto' }}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

// ─── Botões e campos ───

export const botaoPrimario: CSSProperties = {
  background: C.orange, color: '#fff', border: 'none', borderRadius: '10px',
  padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
};

export const botaoSecundario: CSSProperties = {
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: '10px',
  padding: '9px 16px', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: FONT,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
};

export const botaoContorno: CSSProperties = {
  ...botaoSecundario, color: C.orange, borderColor: C.orange, fontWeight: 600,
};

export const botaoPerigo: CSSProperties = {
  ...botaoSecundario, color: C.danger, borderColor: 'rgba(214,69,69,0.4)',
};

export const campo: CSSProperties = {
  width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
  padding: '10px 12px', fontSize: '14px', color: C.text, outline: 'none', fontFamily: FONT,
};

export const rotulo: CSSProperties = { fontSize: '13px', color: '#4A4A45', marginBottom: '6px', display: 'block', fontWeight: 500 };

export function desabilitado(estilo: CSSProperties, off: boolean): CSSProperties {
  return off ? { ...estilo, opacity: 0.55, cursor: 'not-allowed' } : estilo;
}

// ─── Selos ───

export function Pill({ children, tom = 'laranja', style }: {
  children: ReactNode; tom?: 'laranja' | 'marrom' | 'cinza' | 'verde' | 'vermelho' | 'grafite'; style?: CSSProperties;
}) {
  const cores = {
    laranja: { bg: C.orangeSoft, fg: C.brown },
    marrom: { bg: '#F3E9DF', fg: C.brown },
    cinza: { bg: '#F1EEE8', fg: '#4A4A45' },
    verde: { bg: '#E3F3EA', fg: '#1F6F43' },
    vermelho: { bg: '#FBE7E7', fg: '#9B2C2C' },
    grafite: { bg: C.graphite, fg: '#fff' },
  }[tom];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px', background: cores.bg, color: cores.fg,
      fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  );
}

export function SeloVerificado({ compacto = false }: { compacto?: boolean }) {
  return (
    <span title="Documento conferido pela administração do AgroMundo"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: C.success, fontSize: '12px', fontWeight: 600 }}>
      <BadgeCheck size={compacto ? 15 : 16} />
      {!compacto && 'Produtor verificado'}
    </span>
  );
}

export function Estrelas({ nota, tamanho = 15 }: { nota: number; tamanho?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: '1px' }} aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={tamanho}
          color={C.orange}
          fill={i <= Math.round(nota) ? C.orange : 'none'}
          strokeWidth={1.6}
        />
      ))}
    </span>
  );
}

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; tom: 'laranja' | 'marrom' | 'cinza' | 'verde' | 'vermelho' | 'grafite' }> = {
  AGUARDANDO_PAGAMENTO: { rotulo: 'Aguardando pagamento', tom: 'laranja' },
  PAGO: { rotulo: 'Pago', tom: 'marrom' },
  EM_PREPARACAO: { rotulo: 'Em preparação', tom: 'marrom' },
  ENVIADO: { rotulo: 'Enviado', tom: 'grafite' },
  PRONTO_RETIRADA: { rotulo: 'Pronto para retirada', tom: 'grafite' },
  ENTREGUE: { rotulo: 'Entregue', tom: 'verde' },
  CANCELADO: { rotulo: 'Cancelado', tom: 'vermelho' },
};

export function StatusPedidoPill({ status }: { status: StatusPedido }) {
  const s = STATUS_PEDIDO[status];
  return <Pill tom={s.tom}>{s.rotulo}</Pill>;
}

// ─── Formatação ───

/** "2026-10-11 19:16:06" (UTC do backend) → "11/10/2026 16:16". */
export function formatDateTime(valor: string | null | undefined): string {
  if (!valor) return '';
  const iso = valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? valor
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "2026-10-18" → "18/10/2026" (sem fuso). */
export function formatDia(valor: string | null | undefined): string {
  if (!valor) return '';
  const [a, m, d] = valor.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : valor;
}

export const imagemCover: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

// ─── Janela modal ───

export function Modal({ titulo, aberto, onFechar, children, largura = 520 }: {
  titulo: string; aberto: boolean; onFechar: () => void; children: ReactNode; largura?: number;
}) {
  if (!aberto) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={onFechar}
      onKeyDown={e => { if (e.key === 'Escape') onFechar(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(25,24,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: FONT,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, borderRadius: '16px', width: '100%', maxWidth: `${largura}px`,
          maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', color: C.text,
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: C.muted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}
