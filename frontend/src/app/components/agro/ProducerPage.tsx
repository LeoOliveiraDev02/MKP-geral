import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { MapPin, Calendar, Package, Star, MessageCircle, Share2, Play, ShoppingBasket } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from './data';
import { ProductCard } from './ProductCard';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { C, CONTAINER, FONT } from './theme';
import { Card, EmptyState, Estrelas, Pill, SeloVerificado, botaoContorno, botaoSecundario, formatDateTime, imagemCover } from './ui';
import { useApp } from '../../AppContext';
import { AnuncioService, CestaService, ProdutorService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { anuncioResumoToProduct } from '../../api/mappers';
import type { Cesta, PerfilProdutor } from '../../api/types';

const NIVEIS = ['#D64545', '#F08A3E', '#F2C14E', '#9BC25B', '#2E9E5B'];

function embed(url: string | null): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}

/** Loja pública do produtor: apresentação, vídeo, reputação, avaliações e anúncios. */
export function ProducerPage() {
  const { id } = useParams();
  const app = useApp();
  const [perfil, setPerfil] = useState<PerfilProdutor | null>(null);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [cestas, setCestas] = useState<Cesta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setPerfil(null);
    ProdutorService.perfil(id).then(setPerfil).catch(err => setErro(getErrorMessage(err)));
    AnuncioService.list({ anuncianteId: Number(id), limit: 48 })
      .then(r => setProdutos(r.data.map(anuncioResumoToProduct)))
      .catch(() => undefined);
    CestaService.publicas().then(l => setCestas(l.filter(c => String(c.vendedor_id) === id))).catch(() => undefined);
  }, [id]);

  if (erro) return <EmptyState titulo={erro} acao={{ rotulo: 'Voltar ao início', onClick: () => app.go('/') }} />;
  if (!perfil) return <p style={{ padding: '100px', textAlign: 'center', color: C.muted, fontFamily: FONT }}>Carregando produtor...</p>;

  const { produtor, reputacao, avaliacoes, resumo_avaliacoes } = perfil;
  const video = embed(produtor.video_url);
  const iniciais = produtor.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  const compartilhar = async () => {
    await navigator.clipboard.writeText(`${import.meta.env.VITE_SHARE_URL || window.location.origin}/share/produtor/${produtor.id}`).catch(() => undefined);
    toast.success('Link da loja copiado.');
  };

  return (
    <div style={{ background: C.bg, fontFamily: FONT, color: C.text }}>
      <div style={{ background: C.graphite }}>
        <div className={`${CONTAINER} py-8`}>
          <div className="flex flex-wrap items-center gap-5">
            <div style={{ width: '104px', height: '104px', borderRadius: '50%', overflow: 'hidden', border: '4px solid #fff', background: C.brown, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px', fontWeight: 700, flexShrink: 0 }}>
              {produtor.foto_url ? <ImageWithFallback src={produtor.foto_url} alt={produtor.nome} style={imagemCover} /> : iniciais}
            </div>
            <div className="min-w-0 flex-1" style={{ color: '#fff' }}>
              <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 700 }}>{produtor.nome}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                {produtor.cidade && <span className="flex items-center gap-1"><MapPin size={14} /> {produtor.cidade}/{produtor.uf}{produtor.zona === 'RURAL' ? ' · zona rural' : ''}</span>}
                <span className="flex items-center gap-1"><Calendar size={14} /> No AgroMundo desde {formatDateTime(produtor.desde).slice(0, 10)}</span>
                <span className="flex items-center gap-1"><Package size={14} /> {reputacao.anuncios_ativos} produtos</span>
              </div>
              {produtor.verificado && <div className="mt-2" style={{ background: '#fff', display: 'inline-block', padding: '3px 10px', borderRadius: '999px' }}><SeloVerificado /></div>}
            </div>
            <button onClick={compartilhar} style={{ ...botaoSecundario, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              <Share2 size={15} /> Compartilhar loja
            </button>
          </div>
        </div>
      </div>

      <div className={`${CONTAINER} py-6`}>
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
          <div className="flex flex-col gap-4">
            <Card>
              <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Reputação</h2>
              {reputacao.nivel === 0 ? (
                <p style={{ fontSize: '14px', color: C.muted }}>Este produtor ainda não concluiu vendas pelo AgroMundo.</p>
              ) : (
                <>
                  <div className="flex gap-1 mb-2">
                    {NIVEIS.map((cor, i) => (
                      <span key={cor} style={{ flex: 1, height: i + 1 === reputacao.nivel ? '10px' : '6px', borderRadius: '4px', background: cor, opacity: i + 1 === reputacao.nivel ? 1 : 0.25, alignSelf: 'center' }} />
                    ))}
                  </div>
                  <strong style={{ fontSize: '17px' }}>{reputacao.rotulo}</strong>
                  <ul style={{ fontSize: '13.5px', color: '#4A4A45', marginTop: '10px', lineHeight: 1.9 }}>
                    <li><strong>{reputacao.vendas_concluidas}</strong> vendas concluídas</li>
                    <li><strong>{reputacao.taxa_cancelamento}%</strong> de cancelamentos</li>
                    {reputacao.nota_media !== null && <li className="flex items-center gap-1"><Star size={14} color={C.orange} fill={C.orange} /> <strong>{reputacao.nota_media.toLocaleString('pt-BR')}</strong> em {reputacao.total_avaliacoes} avaliações</li>}
                    {reputacao.reclamacoes_resolvidas_contra > 0 && <li>{reputacao.reclamacoes_resolvidas_contra} reclamação(ões) resolvida(s) a favor do comprador</li>}
                  </ul>
                </>
              )}
            </Card>

            {produtor.bio && (
              <Card>
                <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Sobre</h2>
                <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '14.5px', lineHeight: 1.7, whiteSpace: 'pre-line', color: '#3d3d39' }}>{produtor.bio}</p>
              </Card>
            )}

            {produtos[0] && (
              <button
                onClick={() => app.go(`/produto/${produtos[0].id}`)}
                style={{ ...botaoContorno, width: '100%', height: '44px' }}
              >
                <MessageCircle size={17} /> Conversar com o produtor
              </button>
            )}
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            {video && (
              <Card padding="0" style={{ overflow: 'hidden' }}>
                <div className="flex items-center gap-2" style={{ padding: '12px 16px', fontWeight: 700 }}><Play size={16} color={C.orange} /> Conheça a propriedade</div>
                <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
                  <iframe src={video} title="Vídeo do produtor" allow="encrypted-media; picture-in-picture" allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                </div>
              </Card>
            )}

            {cestas.length > 0 && (
              <section>
                <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '12px' }}>Cestas por assinatura</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cestas.map(c => (
                    <Card key={c.id}>
                      <div className="flex items-center gap-2" style={{ fontWeight: 700 }}><ShoppingBasket size={17} color={C.brown} /> {c.nome}</div>
                      <p style={{ fontSize: '13px', color: C.muted, marginTop: '4px' }}>{c.descricao}</p>
                      <button onClick={() => app.go(`/cestas?cesta=${c.id}`)} style={{ ...botaoContorno, marginTop: '10px', padding: '7px 12px' }}>Ver cesta</button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '12px' }}>Produtos ({produtos.length})</h2>
              {produtos.length === 0 ? (
                <p style={{ color: C.muted }}>Nenhum produto disponível agora.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                  {produtos.map((p, i) => (
                    <ProductCard key={p.id} index={i} product={p} isFavorite={app.favorites.includes(p.id)}
                      onFavorite={app.toggleFavorite} onAddToCart={app.carrinho.adicionar} onClick={prod => app.go(`/produto/${prod.id}`)} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '12px' }}>
                Avaliações {resumo_avaliacoes.total > 0 && <span style={{ color: C.muted, fontWeight: 500 }}>({resumo_avaliacoes.total})</span>}
              </h2>
              {avaliacoes.length === 0 ? (
                <p style={{ color: C.muted }}>Ainda sem avaliações de compradores.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {avaliacoes.map(a => (
                    <Card key={a.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Estrelas nota={a.nota} />
                        <strong style={{ fontSize: '14px' }}>{a.autor_nome}</strong>
                        <Pill tom="cinza">{a.anuncio_nome}</Pill>
                        <span style={{ fontSize: '12px', color: C.muted, marginLeft: 'auto' }}>{formatDateTime(a.data)}</span>
                      </div>
                      {a.comentario && <p style={{ fontSize: '14px', marginTop: '6px' }}>{a.comentario}</p>}
                      {a.resposta_vendedor && <p style={{ fontSize: '13px', color: C.brown, marginTop: '6px' }}><strong>Resposta:</strong> {a.resposta_vendedor}</p>}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
