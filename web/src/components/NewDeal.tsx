import { useState } from 'react';
import type { AppState, Deal, MarketItem } from '../../../shared/types';
import { useT } from '../i18n';
import { post, usd } from '../api';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

export function NewDeal({ state, viewAs, act, onCreated }: { state: AppState; viewAs: string; act: Act; onCreated: (id: string) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [pack, setPack] = useState('');
  const [unit, setUnit] = useState('piece');
  const [price, setPrice] = useState('');
  const [target, setTarget] = useState('500');
  const [items, setItems] = useState<MarketItem[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [src, setSrc] = useState('');

  const lookup = () => act(async () => {
    setLooking(true);
    try {
      const r = await fetch(`/api/market/search?q=${encodeURIComponent(name)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lookup failed');
      setItems(j.items);
    } finally { setLooking(false); }
  });

  const median = items && items.length ? [...items].map(i => i.price).sort((a, b) => a - b)[Math.floor(items.length / 2)] : null;

  return (
    <section className="card newdeal">
      <h2>{t('new.title')}</h2>
      <p className="muted">{t('new.sub')}</p>
      <div className="grid2">
        <label className="f">{t('new.product')}<input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Basmati rice" /></label>
        <label className="f">{t('new.pack')}<input type="text" value={pack} onChange={e => setPack(e.target.value)} placeholder="5 kg bag" /></label>
        <label className="f">{t('new.unit')}<input type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="bag" /></label>
        <label className="f">{t('new.price')}<input type="number" min={0.2} step={0.01} value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></label>
        <label className="f">{t('new.target')}<input type="number" min={10} value={target} onChange={e => setTarget(e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost" disabled={looking || name.trim().length < 2} onClick={lookup}>{looking ? t('new.looking') : t('new.lookup')}</button>
        <button className="btn primary" disabled={name.trim().length < 2 || !(Number(price) >= 0.2)} onClick={() => act(async () => {
          const d = await post<Deal>('/api/deals', { productName: name, pack, unit, marketPrice: Number(price), targetQty: Number(target), buyerId: viewAs, marketSource: src });
          setName(''); setPack(''); setPrice(''); setItems(null); setSrc('');
          onCreated(d.id);
        })}>{t('new.create')}</button>
      </div>
      {items && (
        <div className="found">
          <div className="muted" style={{ fontWeight: 600, margin: '12px 0 6px' }}>{items.length ? t('new.found') : t('new.none')}</div>
          {items.slice(0, 6).map((it, i) => (
            <div key={i} className="found-row">
              {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="ttl">{it.title}<small>{it.merchant ?? it.brand ?? ''}</small></span>
              <b className="num">{usd(it.price)}</b>
              <button className="btn sm ghost" onClick={() => { setPrice(String(it.price)); setSrc(`Channel3, ${it.merchant ?? 'shop listing'}`); }}>{t('new.use', { p: usd(it.price) })}</button>
            </div>
          ))}
          {median != null && items.length > 2 && (
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { setPrice(String(median)); setSrc(`Channel3, middle of ${items.length} listings`); }}>{t('new.use', { p: usd(median) })} (middle of {items.length})</button>
          )}
        </div>
      )}
    </section>
  );
}
