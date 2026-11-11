import { useEffect, useRef, useState } from 'react';
import { speak } from './voice';
import type { AppState, Commitment, Deal, Highlight, PauseReport } from '../../../shared/types';
import { useT } from '../i18n';
import { post, usd, usd0, num } from '../api';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/* ---------- PayPal popup for the live buyer ---------- */
declare global { interface Window { paypal?: any } }
let sdkPromise: Promise<void> | null = null;
function loadSdk(clientId: string) {
  if (window.paypal) return Promise.resolve();
  sdkPromise ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=authorize&components=buttons`;
    s.onload = () => res();
    s.onerror = () => { sdkPromise = null; rej(new Error('Could not load PayPal')); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function PayPalBlock({ commitment, clientId, act }: { commitment: Commitment; clientId: string; act: Act }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  useEffect(() => {
    let dead = false;
    loadSdk(clientId).then(() => {
      if (dead || !ref.current || !window.paypal) return;
      ref.current.innerHTML = '';
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 42 },
        createOrder: async () => (await post<{ orderId: string }>(`/api/commitments/${commitment.id}/paypal/order`)).orderId,
        onApprove: async (data: { orderID: string }) => { await act(() => post(`/api/commitments/${commitment.id}/paypal/authorize`, { orderId: data.orderID })); },
      }).render(ref.current);
    }).catch(() => { /* error shown by act on use */ });
    return () => { dead = true; };
  }, [commitment.id, clientId]);
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('join.paypal')}</div>
      <div ref={ref} style={{ maxWidth: 340 }} />
    </div>
  );
}

/* ---------- Join ---------- */
export function JoinPanel({ state, deal, viewAs, act }: { state: AppState; deal: Deal; viewAs: string; act: Act }) {
  const { t } = useT();
  const me = state.commitments.find(c => c.dealId === deal.id && c.buyerId === viewAs && (c.status === 'held' || c.status === 'awaiting_paypal'));
  const buyer = state.buyers.find(b => b.id === viewAs)!;
  const [qty, setQty] = useState(100);
  const [max, setMax] = useState(0.75);
  const total = state.commitments.filter(c => c.dealId === deal.id && c.status === 'held').reduce((a, c) => a + c.qty, 0);
  const hold = Math.round(qty * max * 100) / 100;
  const sandbox = state.config.paypalMode === 'sandbox';

  return (
    <section className="card">
      <h2>{t('join.title')}</h2>
      {!me ? (
        <>
          <div className="grid2">
            <label className="f">{t('join.qty', { u: deal.product.unit + 's' })}<input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} /></label>
            <label className="f">{t('join.max')}<input type="number" step="0.01" min={0.01} value={max} onChange={e => setMax(Number(e.target.value))} /></label>
          </div>
          <p className="muted" style={{ margin: '10px 0' }}>{t('join.hint')}</p>
          <button className="btn" disabled={!(qty > 0 && max > 0)} onClick={() => act(() => post(`/api/deals/${deal.id}/join`, { buyerId: viewAs, qty, maxUnitPrice: max, interactive: sandbox }))}>
            {t('join.hold', { a: usd0(hold) })}
          </button>
        </>
      ) : me.status === 'awaiting_paypal' && state.config.paypalClientId ? (
        <PayPalBlock commitment={me} clientId={state.config.paypalClientId} act={act} />
      ) : (
        <>
          <p style={{ fontWeight: 600 }}>{t('join.in', { u: deal.product.unit + 's', n: num(me.qty), a: usd0(me.hold?.authorized ?? 0) })}</p>
          <div className="row">
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={buyer.autonomy === 'auto'} onChange={e => act(() => post(`/api/buyers/${buyer.id}/autonomy`, { autonomy: e.target.checked ? 'auto' : 'ask' }))} />
              <span>{t('agent.auto')}</span>
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {total >= deal.targetQty ? (
              <button className="btn saffron" onClick={() => act(() => post(`/api/deals/${deal.id}/negotiate`))}>{t('agent.start')}</button>
            ) : (
              <span className="stamp waiting">{t('agent.need', { u: deal.product.unit + 's', n: num(deal.targetQty - total) })}</span>
            )}
            <button className="btn ghost sm" onClick={() => act(() => post(`/api/commitments/${me.id}/withdraw`))}>{t('join.leave')}</button>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- Pause checks (shared with the side panel) ---------- */
export function Checks({ report }: { report: PauseReport }) {
  return (
    <ul className="checks">
      {report.checks.map(c => (
        <li key={c.id}>
          <span className={`ic ${c.status}`} aria-label={c.status}>{c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✕'}</span>
          <div><b>{c.title}</b><span className="d">{c.detail}</span></div>
        </li>
      ))}
    </ul>
  );
}

function Highlighted({ text, marks }: { text: string; marks: Highlight[] }) {
  if (!marks.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start < at) continue;
    out.push(text.slice(at, m.start));
    out.push(<mark key={m.start} title={m.label}>{text.slice(m.start, m.end)}</mark>);
    at = m.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/* ---------- Negotiation board ---------- */
export function Negotiation({ state, deal }: { state: AppState; deal: Deal }) {
  const { t } = useT();
  const sellers = new Map(state.sellers.map(s => [s.id, s]));
  const live = deal.rounds.filter(r => deal.quotes.find(q => q.sellerId === r.sellerId)?.status !== 'rejected' || r.n > 0);
  return (
    <section className="card">
      <h2>{t('neg.title')}</h2>
      <div className="grid2">
        {deal.quotes.map(q => {
          const s = sellers.get(q.sellerId)!;
          const rep = deal.pause[q.sellerId];
          const stampKey = q.status === 'rejected' ? (rep?.decision === 'block' ? 'blocked' : 'returned') : q.status === 'agreed' ? 'agreed' : q.status === 'countering' ? 'live' : 'waiting';
          const label = q.status === 'rejected' ? (rep?.decision === 'block' ? t('neg.blocked') : t('neg.rejected')) : q.status === 'agreed' ? t('neg.agreed') : q.status === 'countering' ? t('neg.counter') : t('neg.quote');
          return (
            <div key={q.sellerId} className={`quote ${q.status === 'rejected' && rep?.decision === 'block' ? 'blocked' : q.status === 'agreed' ? 'agreed' : ''}`}>
              <h3><span>{s.name}</span><span className={`stamp ${stampKey}`}>{label}</span></h3>
              <div className="muted" style={{ fontSize: 13 }}>{s.verified ? t('neg.verified') : t('neg.unverified')}</div>
              <div className="num qp">{usd(q.unitPrice)} <small className="muted" style={{ fontSize: 14, fontFamily: 'var(--body)' }}>{t('neg.each')}</small></div>
              <div className="msg"><Highlighted text={q.message} marks={q.highlights} /></div>
              {rep && <Checks report={rep} />}
            </div>
          );
        })}
      </div>
      {live.length > 0 && (
        <div className="rounds" aria-live="polite">
          {deal.rounds.map(r => (
            <div key={`${r.sellerId}-${r.n}`} className={`rd ${r.by}`}>
              <span className="num">{usd(r.unitPrice)}</span>{r.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Review: approve, undo, pay ---------- */
export function Review({ state, deal, viewAs, act }: { state: AppState; deal: Deal; viewAs: string; act: Act }) {
  const { t } = useT();
  const price = deal.finalUnitPrice!;
  const seller = state.sellers.find(s => s.id === deal.chosenSellerId)!;
  const held = state.commitments.filter(c => c.dealId === deal.id && c.status === 'held');
  const total = state.commitments.filter(c => c.dealId === deal.id && (c.status === 'held' || c.status === 'captured')).reduce((a, c) => a + c.qty, 0);
  const now = useNow(Boolean(deal.undoUntil));
  const left = deal.undoUntil ? Math.max(0, deal.undoUntil - now) : 0;
  const open = Boolean(deal.undoUntil) && left > 0;
  const mine = held.find(c => c.buyerId === viewAs);
  const decision = deal.pause[seller.id]?.decision ?? 'clear';
  const spanRef = useRef(1000);
  if (left > spanRef.current) spanRef.current = left;
  const span = spanRef.current;

  return (
    <section className="card">
      <h2>{t('review.title', { s: seller.name, p: usd(price) })}</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        {t('review.save', { m: usd(deal.marketPrice), t: usd0((deal.marketPrice - price) * total) })} {t('review.pause', { d: t(`pause.${decision}` as any) })}
      </p>
      <div className="grid2">
        {held.map(c => {
          const b = state.buyers.find(x => x.id === c.buyerId)!;
          const amt = Math.round(c.qty * price * 100) / 100;
          const back = Math.round(((c.hold?.authorized ?? 0) - amt) * 100) / 100;
          return (
            <div key={c.id} className="chit" style={{ ['--c' as any]: b.color }}>
              <h3><span>{b.name}{b.id === viewAs ? ` (${t('review.you')})` : ''}</span><span className={`stamp ${c.approval === 'yes' ? 'yes' : 'waiting'}`}>{c.approval === 'yes' ? t('review.yes') : t('review.wait')}</span></h3>
              <div className="calc">{t('review.cost', { u: deal.product.unit + 's', q: num(c.qty), p: usd(price), a: usd0(amt) })}</div>
              <div className="num amt">{usd0(amt)}</div>
              <div className="back">{t('review.back', { a: usd0(back) })}</div>
              {b.id === viewAs && c.approval === 'pending' && <HelperBox c={c} act={act} />}
              {b.id === viewAs && c.approval === 'pending' && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn good sm" disabled={Boolean(c.helperName && !c.helperOk)} onClick={() => act(() => post(`/api/commitments/${c.id}/approve`, { decision: 'yes' }))}>{t('review.approve')}</button>
                  <button className="btn ghost sm" onClick={() => act(() => post(`/api/commitments/${c.id}/approve`, { decision: 'no' }))}>{t('review.no')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {deal.undoUntil && (
        <div className="undo" role="status">
          <div style={{ flex: '1 1 220px' }}>
            <b>{t('undo.title')}</b>
            <div>{open ? t('undo.hint', { s: Math.ceil(left / 1000) }) : t('undo.ready')}</div>
          </div>
          <div className="bar2" aria-hidden><i style={{ width: `${open ? (left / span) * 100 : 0}%` }} /></div>
          {mine && <button className="btn ghost sm" disabled={!open} onClick={() => act(() => post(`/api/commitments/${mine.id}/withdraw`))}>{t('undo.btn')}</button>}
          <button className="btn good" disabled={open} onClick={() => act(() => post(`/api/deals/${deal.id}/settle`))}>{t('undo.pay')}</button>
        </div>
      )}
    </section>
  );
}

function HelperBox({ c, act }: { c: Commitment; act: Act }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?helper=${c.id}`;
  if (c.helperName) {
    return (
      <div className="helperbox">
        <div className="muted" style={{ fontWeight: 600 }}>{c.helperOk ? t('helper.ok', { n: c.helperName }) : t('helper.waiting', { n: c.helperName })}</div>
        {!c.helperOk && (
          <div className="row" style={{ marginTop: 6 }}>
            <input type="text" readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label={t('helper.link')} />
            <button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { /* ignore */ }); }}>{copied ? t('helper.copied') : t('helper.copy')}</button>
          </div>
        )}
      </div>
    );
  }
  return open ? (
    <div className="row helperbox" style={{ marginTop: 8 }}>
      <input type="text" value={name} placeholder={t('helper.name')} onChange={e => setName(e.target.value)} aria-label={t('helper.name')} />
      <button className="btn sm" disabled={name.trim().length < 2} onClick={() => act(() => post(`/api/commitments/${c.id}/helper`, { name }))}>{t('helper.save')}</button>
    </div>
  ) : <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>{t('helper.add')}</button>;
}

/* ---------- Receipt ---------- */
export function Receipt({ state, deal, viewAs }: { state: AppState; deal: Deal; viewAs: string }) {
  const { t, lang } = useT();
  const s = deal.summary!;
  const paid = state.commitments.filter(c => c.dealId === deal.id && c.status === 'captured');
  return (
    <section className="card receipt">
      <h2 style={{ marginBottom: 6 }}>{t('paid.title')}</h2>
      <div className="num save">{t('paid.saved', { t: usd0(s.savedTotal) })}</div>
      <p className="muted">{t('paid.total', { u: deal.product.unit + 's', a: usd0(s.paidTotal), q: num(s.totalQty) })}. {t('paid.each', { p: usd(s.finalPrice), m: usd(deal.marketPrice) })}</p>
      <button className="btn ghost sm" onClick={() => {
        const me = state.buyers.find(b => b.id === viewAs) ?? state.buyers[0];
        const mine = paid.find(c => c.buyerId === me.id);
        const text = `${t('paid.title')} ${t('paid.saved', { t: usd0(s.savedTotal) })}. ${mine ? t('paid.total', { u: deal.product.unit + 's', a: usd0(mine.captured ?? 0), q: num(mine.qty) }) + '.' : ''} ${t('paid.each', { p: usd(s.finalPrice), m: usd(deal.marketPrice) })}`;
        speak(text, lang, state.config.languages.find(l => l.code === lang)?.speech ?? 'en-IN', state.config.aiMode === 'live');
      }}>{t('paid.read')}</button>
      <div className="grid2" style={{ textAlign: 'left', marginTop: 12 }}>
        {paid.map(c => {
          const b = state.buyers.find(x => x.id === c.buyerId)!;
          return (
            <div key={c.id} className="chit" style={{ ['--c' as any]: b.color }}>
              <h3><span>{b.name}</span><span className="stamp paid">{t('stamp.paid')}</span></h3>
              <div className="num amt">{usd0(c.captured ?? 0)}</div>
              <div className="back">{t('review.back', { a: usd0((c.hold?.authorized ?? 0) - (c.captured ?? 0)) })}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
