import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, CONTAINER, FONT } from './theme';
import { EmptyState, Pill, botaoPrimario, campo, desabilitado, formatDateTime, imagemCover } from './ui';
import { useApp } from '../../AppContext';
import { ChatService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Conversa, Mensagem } from '../../api/types';

const POLL_CONVERSA_MS = 5000;
const POLL_LISTA_MS = 15000;

/** Chat interno: lista de conversas + conversa aberta (atualiza a cada 5 s). */
export function MessagesPage() {
  const { id } = useParams();
  const app = useApp();
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const aberta = id ? Number(id) : null;

  const carregarLista = useCallback(() => {
    ChatService.conversas().then(setConversas).catch(err => toast.error(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    carregarLista();
    const t = setInterval(carregarLista, POLL_LISTA_MS);
    return () => clearInterval(t);
  }, [carregarLista]);

  const conversa = conversas?.find(c => c.id === aberta) ?? null;

  return (
    <div style={{ background: C.bg, fontFamily: FONT, color: C.text }}>
      <div className={`${CONTAINER} py-6`}>
        <h1 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 700, marginBottom: '16px' }}>Mensagens</h1>
        <div
          className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]"
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', minHeight: '560px' }}
        >
          <aside className={aberta ? 'hidden md:block' : ''} style={{ borderRight: `1px solid ${C.border}`, overflowY: 'auto', maxHeight: '70vh' }}>
            {conversas === null ? (
              <p style={{ padding: '20px', color: C.muted }}>Carregando...</p>
            ) : conversas.length === 0 ? (
              <EmptyState icone={<MessageCircle size={36} />} titulo="Nenhuma conversa" texto="Use “Conversar pelo site” na página de um produto para falar com o produtor." />
            ) : conversas.map(c => (
              <button
                key={c.id}
                onClick={() => app.go(`/mensagens/${c.id}`)}
                className="hover:bg-[#FBFAF7]"
                style={{
                  display: 'flex', gap: '10px', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none',
                  borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: FONT,
                  background: c.id === aberta ? C.orangeSoft : undefined,
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '10px', overflow: 'hidden', background: C.border, flexShrink: 0 }}>
                  {c.anuncio_imagem && <ImageWithFallback src={c.anuncio_imagem} alt="" style={imagemCover} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong style={{ fontSize: '14px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.outra_parte}</strong>
                    {c.nao_lidas > 0 && <span style={{ marginLeft: 'auto', background: C.orange, color: '#fff', borderRadius: '999px', fontSize: '11px', fontWeight: 700, padding: '1px 7px' }}>{c.nao_lidas}</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: C.brown }}>{c.anuncio_nome ?? 'Anúncio removido'} · {c.papel === 'COMPRADOR' ? 'você comprando' : 'você vendendo'}</div>
                  <div style={{ fontSize: '12.5px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultima_mensagem}</div>
                </div>
              </button>
            ))}
          </aside>

          <section className={aberta ? '' : 'hidden md:flex'} style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
            {aberta && conversa ? (
              <ConversaAberta key={aberta} conversa={conversa} onLida={carregarLista} />
            ) : (
              <div style={{ margin: 'auto', color: C.muted, textAlign: 'center', padding: '20px' }}>
                <MessageCircle size={40} style={{ margin: '0 auto 10px' }} />
                Escolha uma conversa
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ConversaAberta({ conversa, onLida }: { conversa: Conversa; onLida: () => void }) {
  const app = useApp();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const ultimoId = useRef(0);

  const buscar = useCallback(async (inicial = false) => {
    try {
      const novas = await ChatService.mensagens(conversa.id, inicial ? undefined : ultimoId.current || undefined);
      if (novas.length) {
        ultimoId.current = novas[novas.length - 1].id;
        setMensagens(prev => (inicial ? novas : [...prev, ...novas.filter(n => !prev.some(p => p.id === n.id))]));
        onLida();
        app.atualizarContadores();
      }
    } catch (err) {
      if (inicial) toast.error(getErrorMessage(err));
    }
  }, [conversa.id, onLida, app]);

  useEffect(() => {
    ultimoId.current = 0;
    buscar(true);
    const t = setInterval(() => buscar(false), POLL_CONVERSA_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  // Rola só a caixa de mensagens (não a página) até a mais recente
  useEffect(() => {
    const el = caixa.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [mensagens.length]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
    setEnviando(true);
    try {
      const msg = await ChatService.enviar(conversa.id, conteudo);
      ultimoId.current = Math.max(ultimoId.current, msg.id);
      setMensagens(prev => [...prev, msg]);
      setTexto('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  const meuId = app.user?.id;

  return (
    <>
      <header className="flex items-center gap-3" style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => app.go('/mensagens')} className="md:hidden" aria-label="Voltar" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <strong style={{ fontSize: '15px' }}>{conversa.outra_parte}</strong>
          <div style={{ fontSize: '12.5px', color: C.muted }}>
            {conversa.anuncio_id ? (
              <button onClick={() => app.go(`/produto/${conversa.anuncio_id}`)} style={{ background: 'none', border: 'none', padding: 0, color: C.brown, cursor: 'pointer', fontSize: '12.5px', fontFamily: FONT }}>
                {conversa.anuncio_nome}
              </button>
            ) : 'Anúncio removido'}
          </div>
        </div>
        <Pill tom="cinza">{conversa.papel === 'COMPRADOR' ? 'Produtor' : 'Cliente'}</Pill>
      </header>

      <div ref={caixa} style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#FBFAF7', maxHeight: '58vh' }}>
        {mensagens.map(m => {
          const minha = m.autor_id === meuId;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: minha ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
              <div style={{
                maxWidth: '78%', padding: '9px 12px', borderRadius: minha ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: minha ? C.orange : C.surface, color: minha ? '#fff' : C.text,
                border: minha ? 'none' : `1px solid ${C.border}`, fontSize: '14px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}>
                {m.texto}
                <div style={{ fontSize: '10.5px', opacity: 0.75, marginTop: '3px', textAlign: 'right' }}>
                  {formatDateTime(m.data).slice(-5)}{minha && m.lida ? ' · lida' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={enviar} className="flex gap-2" style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value.slice(0, 2000))}
          placeholder="Escreva sua mensagem..."
          aria-label="Mensagem"
          style={{ ...campo, flex: 1 }}
        />
        <button type="submit" disabled={!texto.trim() || enviando} style={desabilitado(botaoPrimario, !texto.trim() || enviando)} aria-label="Enviar">
          <Send size={17} />
        </button>
      </form>
    </>
  );
}
