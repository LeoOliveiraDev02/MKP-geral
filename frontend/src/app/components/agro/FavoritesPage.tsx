import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from './data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { FavoritoService } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import type { Favorito } from '../../api/types';

type FavoritesPageProps = {
  onBack: () => void;
  onProductClick: (product: { id: string }) => void;
  /** Mantém os corações do resto do app em sincronia (ids de anúncio). */
  onChange: (anuncioIds: string[]) => void;
};

export function FavoritesPage({ onBack, onProductClick, onChange }: FavoritesPageProps) {
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    FavoritoService.list()
      .then(list => {
        setFavoritos(list);
        onChange(list.map(f => String(f.anuncio_id)));
      })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [onChange]);

  const handleRemove = async (fav: Favorito) => {
    try {
      await FavoritoService.remove(fav.id);
      const next = favoritos.filter(f => f.id !== fav.id);
      setFavoritos(next);
      onChange(next.map(f => String(f.anuncio_id)));
      toast.success('Favorito removido.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div style={{ background: '#040e07', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(74,250,130,0.15)',
              borderRadius: '10px', padding: '8px 16px',
              color: 'rgba(255,255,255,0.7)', fontSize: '13px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '26px', fontWeight: 800, color: '#fff' }}>
            Meus Favoritos
          </h1>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '60px 0' }}>Carregando favoritos...</p>
        ) : error ? (
          <p style={{ color: '#f87171', textAlign: 'center', padding: '60px 0' }}>{error}</p>
        ) : favoritos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.4)' }}>
            <Heart size={48} style={{ margin: '0 auto 16px', color: 'rgba(74,250,130,0.4)' }} />
            <p style={{ fontSize: '18px', marginBottom: '8px', color: 'rgba(255,255,255,0.6)' }}>
              Você ainda não favoritou nenhum anúncio
            </p>
            <p style={{ fontSize: '14px' }}>Toque no coração de um produto para salvá-lo aqui.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {favoritos.map(fav => {
              const disponivel = fav.disponivel && fav.anuncio;
              return (
                <div
                  key={fav.id}
                  onClick={() => disponivel && onProductClick({ id: String(fav.anuncio_id) })}
                  style={{
                    background: 'rgba(10, 28, 15, 0.8)',
                    border: '1px solid rgba(74,250,130,0.12)',
                    borderRadius: '14px', padding: '12px',
                    display: 'flex', gap: '14px', alignItems: 'center',
                    cursor: disponivel ? 'pointer' : 'default',
                    opacity: disponivel ? 1 : 0.55,
                  }}
                >
                  <div style={{ width: '72px', height: '72px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)' }}>
                    {fav.anuncio?.imagem_principal && (
                      <ImageWithFallback
                        src={fav.anuncio.imagem_principal}
                        alt={fav.anuncio.nome}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fav.anuncio?.nome ?? 'Anúncio removido'}
                    </div>
                    {fav.anuncio && (
                      <div style={{ fontSize: '17px', fontWeight: 700, color: '#4afa82', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {formatCurrency(fav.anuncio.preco)}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                      {disponivel ? `Favoritado em ${formatDate(fav.data_favorito) ?? '—'}` : 'Anúncio indisponível'}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleRemove(fav); }}
                    title="Remover dos favoritos"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: '8px', padding: '8px',
                      cursor: 'pointer', color: '#f87171', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
