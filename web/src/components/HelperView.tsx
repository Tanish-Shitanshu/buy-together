import { useEffect, useState } from 'react';
import type { AppState } from '../../../shared/types';
import { useT } from '../i18n';
import { post, usd, usd0, num } from '../api';
import { Checks } from './Stage';
import { speak } from './voice';
import type { LangCode } from '../../../shared/types';

/** The page a family member opens from a link. It shows one buyer's share in the buyer's language and nothing else. */
export function HelperView({ state, commitmentId }: { state: AppState; commitmentId: string }) {
  const { t, setLang, lang } = useT();
  const c = state.commitments.find(x => x.id === commitmentId);
  const buyer = c && state.buyers.find(b => b.id === c.buyerId);
  const deal = c && state.deals.find(d => d.id === c.dealId);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (buyer && buyer.lang !== lang) setLang(buyer.lang as LangCode); }, [buyer?.lang]);

  if (!c || !buyer || !deal || deal.status !== 'review' || !c.helperName || c.status !== 'held') {
    return <div className="helper"><section className="card"><h2>{t('helper.none')}</h2></section></div>;
  }
  const price = deal.finalUnitPrice ?? 0;
  const amt = Math.round(c.qty * price * 100) / 100;
  const seller = state.sellers.find(s => s.id === deal.chosenSellerId);
  const report = seller ? deal.pause[seller.id] : undefined;
  const line = t('helper.says', { b: buyer.name, q: num(c.qty), u: deal.product.unit + 's', a: usd0(amt) }) + ' ' + t('hero.price') + ' ' + usd(price) + '. ' + t('hero.market', { p: usd(deal.marketPrice) });
  const answer = async (d: 'yes' | 'no') => {
    try { await post(`/api/commitments/${c.id}/helper/answer`, { decision: d }); setDone(true); } catch (e) { setErr((e as Error).message); }
  };
  const speech = state.config.languages.find(l => l.code === buyer.lang)?.speech ?? 'en-IN';

  return (
    <div className="helper">
      <section className="card">
        <h2>{t('helper.title', { b: buyer.name })}</h2>
        <p className="muted">{t('helper.sub', { b: buyer.name })}</p>
        <div className="num price-big" style={{ fontSize: 56 }}>{usd(price)}<small>{t('hero.price')}</small></div>
        <p style={{ fontWeight: 600 }}>{line}</p>
        <button className="btn ghost sm" onClick={() => speak(line, buyer.lang, speech, state.config.aiMode === 'live')}>{t('helper.read')}</button>
        {report && <div style={{ marginTop: 14 }}><Checks report={report} /></div>}
        {err && <div className="err" role="alert">{err}</div>}
        {done ? <p style={{ fontWeight: 600, marginTop: 14 }}>{t('helper.done', { b: buyer.name })}</p> : (
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn good" onClick={() => answer('yes')}>{t('helper.fine')}</button>
            <button className="btn bad" onClick={() => answer('no')}>{t('helper.stop')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
