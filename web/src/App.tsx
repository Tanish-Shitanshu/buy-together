import { useEffect, useState } from 'react';
import { post, useAppState } from './api';
import { useT } from './i18n';
import { Hero } from './components/Hero';
import { OrderBook } from './components/OrderBook';
import { Ledger } from './components/Ledger';
import { JoinPanel, Negotiation, Receipt, Review } from './components/Stage';
import { BottomPanel, TopPanel } from './components/SidePanels';
import { NewDeal } from './components/NewDeal';
import { AgentRequests } from './components/AgentRequests';
import { HelperView } from './components/HelperView';
import { Delivery } from './components/Delivery';
import type { LangCode } from '../../shared/types';

export function App() {
  const { state, online } = useAppState();
  const { t, lang, setLang } = useT();
  const [viewAs, setViewAs] = useState('b_ravi');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dealId, setDealId] = useState('');
  const [showNew, setShowNew] = useState(false);

  // Follow the chosen buyer's language until the user picks one by hand.
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!state || manual) return;
    const b = state.buyers.find(x => x.id === viewAs);
    if (b && b.lang !== lang) setLang(b.lang);
  }, [state?.buyers.length, viewAs, manual]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message || t('err.generic')); }
  };
  const director = async (fn: () => Promise<unknown>) => { setBusy(true); await act(fn); setBusy(false); };

  if (!state) return <div className="app"><div className="bar"><span className="brand">Buy Together</span><span className="tag">{online ? '…' : 'Connecting'}</span></div></div>;
  const helperId = new URLSearchParams(location.search).get('helper');
  if (helperId) return <HelperView state={state} commitmentId={helperId} />;
  const deal = state.deals.find(d => d.id === dealId) ?? state.deals[0];

  return (
    <div className="app">
      <header className="bar">
        <span className="brand"><i><b style={{ background: '#E8590C' }} /><b style={{ background: '#1C7C7D' }} /><b style={{ background: '#4C4BC4' }} /></i>Buy Together</span>
        <span className="tag">{t('app.tag')}</span>
        <span className="sp" />
        <span className={`pill${state.config.paypalMode === 'sandbox' ? ' live' : ''}`}>{state.config.paypalMode === 'sandbox' ? t('mode.sandbox') : t('mode.simulated')}</span>
        <label>{t('deal.pick')}
          <select value={deal.id} onChange={e => { setDealId(e.target.value); setShowNew(false); }}>
            {state.deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => setShowNew(v => !v)}>{t('new.open')}</button>
        <label>{t('top.viewing')}
          <select value={viewAs} onChange={e => { setViewAs(e.target.value); setManual(false); }}>
            {state.buyers.map(b => <option key={b.id} value={b.id}>{b.name}, {b.city}</option>)}
          </select>
        </label>
        <label>{t('top.language')}
          <select value={lang} onChange={e => { setManual(true); setLang(e.target.value as LangCode); }}>
            {state.config.languages.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
        </label>
        <span className="pill">{t('top.step', { n: state.storyStep, total: state.storyTotal })}</span>
        <button className="btn primary" disabled={busy || state.storyStep >= state.storyTotal} onClick={() => director(() => post('/api/demo/step'))}>{t('top.next')}</button>
        <button className="btn" disabled={busy || state.storyStep >= state.storyTotal} onClick={() => director(() => post('/api/demo/run'))}>{t('top.run')}</button>
        <button className="btn" onClick={() => director(async () => { await post('/api/reset'); })}>{t('top.reset')}</button>
      </header>

      <div className="layout">
        <main className="main">
          {showNew && <NewDeal state={state} viewAs={viewAs} act={act} onCreated={id => { setDealId(id); setShowNew(false); }} />}
          <Hero state={state} deal={deal} />
          {err && <div className="err" role="alert">{err}</div>}
          <AgentRequests state={state} viewAs={viewAs} dealId={deal.id} act={act} />
          {deal.status === 'open' && <div id="join-panel"><JoinPanel state={state} deal={deal} viewAs={viewAs} act={act} /></div>}
          {deal.status === 'review' && <Review state={state} deal={deal} viewAs={viewAs} act={act} />}
          {(deal.status === 'review' || deal.status === 'paid') && deal.delivery && <Delivery key={deal.id + deal.status} state={state} deal={deal} act={act} />}
          {deal.status === 'paid' && deal.summary && <Receipt state={state} deal={deal} viewAs={viewAs} />}
          {deal.status === 'cancelled' && <section className="card"><h2>{t('cancel.title')}</h2></section>}
          {deal.quotes.length > 0 && <Negotiation state={state} deal={deal} />}
          <OrderBook state={state} dealId={deal.id} />
          <Ledger state={state} dealId={deal.id} />
        </main>
        <aside className="side">
          <TopPanel state={state} deal={deal} viewAs={viewAs} lang={lang} act={act} />
          <BottomPanel state={state} deal={deal} />
        </aside>
      </div>
    </div>
  );
}
