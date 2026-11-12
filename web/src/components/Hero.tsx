import type { AppState, Deal } from '../../../shared/types';
import { useT } from '../i18n';
import { num, usd } from '../api';

export function tierFor(deal: Deal, qty: number) {
  let t = deal.tiers[0];
  for (const x of deal.tiers) if (qty >= x.minQty) t = x;
  return t;
}

export function Hero({ state, deal }: { state: AppState; deal: Deal }) {
  const { t } = useT();
  const live = state.commitments.filter(c => c.dealId === deal.id && (c.status === 'held' || c.status === 'awaiting_paypal' || c.status === 'captured'));
  const counted = live.filter(c => c.status !== 'awaiting_paypal');
  const total = counted.reduce((a, c) => a + c.qty, 0);
  const tier = tierFor(deal, total);
  const next = deal.tiers.find(x => x.minQty > total);
  const unitS = deal.product.unit + 's';
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(10, deal.targetQty))) - 1));
  const scale = Math.max(Math.ceil((deal.targetQty * 1.2) / step) * step, Math.ceil((total * 1.08) / step) * step);
  const price = deal.finalUnitPrice ?? tier.unitPrice;
  const buyerOf = (id: string) => state.buyers.find(b => b.id === id)!;

  return (
    <section className="card hero" aria-label={deal.title}>
      <div className="hero-top">
        <div>
          <div className="muted" style={{ fontWeight: 600 }}>{deal.title}</div>
          <div className="num price-big" key={price} aria-live="polite">{total ? usd(price) : usd(deal.tiers[0].unitPrice)}<small>{t('hero.price')}</small></div>
        </div>
        <div className="hero-meta">
          <div className="big">{t('hero.together', { n: num(total), u: unitS })}</div>
          <div className="strike">{t('hero.market', { p: usd(deal.marketPrice) })}</div>
          <div style={{ fontWeight: 600, color: next ? 'var(--indigo)' : 'var(--leaf)' }}>
            {total === 0 ? t('hero.empty') : next ? t('hero.more', { n: num(next.minQty - total), p: usd(next.unitPrice), u: unitS }) : t('hero.top')}
          </div>
        </div>
      </div>

      <div className="trackwrap">
      <div className="track" role="img" aria-label={`${total} / ${scale}`}>
        {live.map(c => {
          const b = buyerOf(c.buyerId);
          return (
            <div key={c.id} className={`blk${c.status === 'awaiting_paypal' ? ' ghost' : ''}`} style={{ width: `${(c.qty / scale) * 100}%`, background: b.color }} title={`${b.name}: ${c.qty}`}>
              <div className="who">{b.name}</div>
              <div className="q">{num(c.qty)}</div>
            </div>
          );
        })}
      </div>
        <div className="ticks">
          {deal.tiers.filter(x => x.minQty > 1).map(x => (
            <div key={x.minQty} className={`tick${total >= x.minQty ? ' hit' : ''}`} style={{ left: `${(x.minQty / scale) * 100}%` }}>
              <span>{usd(x.unitPrice)} at {num(x.minQty)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rate" aria-label={t('rate.title')}>
        {deal.tiers.map(x => (
          <div key={x.minQty} className={tier.minQty === x.minQty && total > 0 ? 'on' : ''}>
            <span className="num p">{usd(x.unitPrice)}</span>
            <span className="m">{t('rate.from', { n: num(x.minQty), u: unitS })}</span>
          </div>
        ))}
        <div className="mkt"><span className="num p strike">{usd(deal.marketPrice)}</span><span className="m">{t('rate.market')}</span></div>
      </div>
    </section>
  );
}
