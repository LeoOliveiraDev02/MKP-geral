// Paleta e medidas compartilhadas da identidade visual do AgroMundo
// (branco quente, grafite, laranja e terroso). Verde só em indicadores semânticos.

export const C = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  graphite: '#252522',
  graphiteSoft: '#33332F',
  orange: '#F4770B',
  orangeDark: '#D9650A',
  orangeSoft: '#FCE7D2',
  brown: '#8C5A32',
  text: '#252522',
  muted: '#727272',
  border: '#E8E5DF',
  success: '#2E9E5B',
  danger: '#D64545',
} as const;

export const FONT = "'Inter', system-ui, -apple-system, sans-serif";

/** Largura máxima do conteúdo, igual no cabeçalho, página e rodapé. */
export const CONTAINER = 'max-w-[1640px] mx-auto px-4 md:px-6';

export const HEADER_IMAGE =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=75';

export const SHADOW_SM = '0 1px 2px rgba(37,37,34,0.04), 0 2px 8px rgba(37,37,34,0.04)';
