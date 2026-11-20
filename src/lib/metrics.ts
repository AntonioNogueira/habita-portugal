export type Level = 'distrito' | 'concelho' | 'freguesia';

export interface AreaProps {
  id: string;
  name: string;
  parent?: string;
  aproximado?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface Meta {
  built: string;
  familyArea: number;
  rentArea: number;
  national: Record<string, number | null>;
  periods: Record<string, string>;
  sources: Record<string, string>;
}

export interface Metric {
  key: string;
  label: string;
  short: string;
  group: 'Mercado' | 'Casa de família' | 'Oferta';
  format: (v: number) => string;
  /** What the number means, shown under the selector. */
  help: string;
  period: keyof Meta['periods'];
}

const nf = new Intl.NumberFormat('pt-PT');
const eur = (v: number) => `${nf.format(Math.round(v))} €`;
const eurK = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} M€` : `${nf.format(Math.round(v / 1000))} mil €`);

export const METRICS: Metric[] = [
  { key: 'preco_m2', label: 'Preço mediano de venda (€/m²)', short: '€/m²', group: 'Mercado', format: v => `${eur(v)}/m²`, period: 'preco',
    help: 'Valor mediano por m² das casas vendidas nos últimos 12 meses (todas as tipologias).' },
  { key: 'vendas', label: 'Número de vendas (12 meses)', short: 'vendas', group: 'Mercado', format: v => nf.format(v), period: 'vendas',
    help: 'Casas (alojamentos familiares) vendidas nos últimos 12 meses.' },
  { key: 'preco_existentes', label: 'Preço €/m² — casas usadas', short: '€/m² usadas', group: 'Mercado', format: v => `${eur(v)}/m²`, period: 'preco',
    help: 'Valor mediano por m² das casas existentes (não novas).' },
  { key: 'preco_novos', label: 'Preço €/m² — casas novas', short: '€/m² novas', group: 'Mercado', format: v => `${eur(v)}/m²`, period: 'preco',
    help: 'Valor mediano por m² das casas novas. Muitos concelhos não têm vendas suficientes de casas novas.' },
  { key: 'renda_m2', label: 'Renda mediana (€/m²/mês)', short: 'renda €/m²', group: 'Mercado', format: v => `${v.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} €/m²`, period: 'renda',
    help: 'Renda mediana por m² dos novos contratos de arrendamento.' },
  { key: 'preco_familia_m2', label: 'Preço €/m² de um T2/T3', short: '€/m² T2/T3', group: 'Casa de família', format: v => `${eur(v)}/m²`, period: 'tipologia',
    help: 'Média dos preços medianos por m² dos T2 e dos T3, as tipologias típicas de uma família de classe média. Onde o INE não publica preços por tipologia, usa-se o preço geral.' },
  { key: 'casa_familia', label: 'Preço de uma casa de família (100 m²)', short: 'casa 100 m²', group: 'Casa de família', format: eurK, period: 'tipologia',
    help: 'Preço estimado de um T2/T3 com 100 m² ao preço mediano local.' },
  { key: 'anos_rendimento', label: 'Anos de rendimento para comprar', short: 'anos de rendimento', group: 'Casa de família', format: v => `${v.toLocaleString('pt-PT')} anos`, period: 'tipologia',
    help: 'Preço da casa de família ÷ rendimento bruto anual mediano dos agregados fiscais do território (IRS). O agregado fiscal mediano ganha menos do que uma família de dois salários: compare sobretudo entre territórios e com a média nacional.' },
  { key: 'esforco_renda', label: 'Taxa de esforço da renda (90 m²)', short: 'esforço renda', group: 'Casa de família', format: v => `${v} %`, period: 'renda',
    help: 'Renda anual de um T2/T3 de 90 m² em % do rendimento bruto mediano do agregado fiscal. Acima de 35 % considera-se sobrecarga.' },
  { key: 'rendimento', label: 'Rendimento mediano do agregado (€/ano)', short: 'rendimento', group: 'Casa de família', format: eur, period: 'rendimento',
    help: 'Rendimento bruto declarado mediano por agregado fiscal (IRS).' },
  { key: 'pct_parque_familia', label: '% de casas com 4–5 divisões (≈T2/T3)', short: '% parque T2/T3', group: 'Oferta', format: v => `${v.toLocaleString('pt-PT')} %`, period: 'censos',
    help: 'Parte das casas de residência habitual com 4 ou 5 divisões (≈T2/T3), nos Censos 2021. É uma aproximação: o INE não publica as vendas por tipologia a nível local.' },
  { key: 'pct_novos_t2t3', label: '% de casas novas que são T2/T3', short: '% novas T2/T3', group: 'Oferta', format: v => `${v.toLocaleString('pt-PT')} %`, period: 'obras',
    help: 'Parte dos fogos acabados de construir que são T2 ou T3.' },
  { key: 'fogos_novos', label: 'Casas novas concluídas', short: 'casas novas', group: 'Oferta', format: v => nf.format(v), period: 'obras',
    help: 'Fogos concluídos em construções novas para habitação familiar.' },
];

export const metricByKey = Object.fromEntries(METRICS.map(m => [m.key, m]));

export const LEVEL_LABEL: Record<Level, string> = { distrito: 'Distrito', concelho: 'Concelho', freguesia: 'Freguesia' };

/** Zoom thresholds where the map changes level. */
export const ZOOM_CONCELHO = 7.4;
export const ZOOM_FREGUESIA = 9.8;
export const levelForZoom = (z: number): Level => (z < ZOOM_CONCELHO ? 'distrito' : z < ZOOM_FREGUESIA ? 'concelho' : 'freguesia');
