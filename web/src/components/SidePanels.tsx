import { useEffect, useRef, useState } from 'react';
import type { AppState, AssistantReply, ChatMessage, Deal } from '../../../shared/types';
import { useT } from '../i18n';
import { post } from '../api';
import { speak, useListen } from './voice';
import { Checks } from './Stage';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

function Mic({ speechLang, onText }: { speechLang: string; onText: (t: string) => void }) {
  const { t } = useT();
  const { on, supported, start, stop } = useListen(speechLang);
  if (!supported) return null;
  return (
    <button className={`mic${on ? ' on' : ''}`} aria-label={on ? t('ask.listening') : t('ask.mic')} title={on ? t('ask.listening') : t('ask.mic')}
      onClick={() => (on ? stop() : start(txt => onText(txt)))}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    </button>
  );
}

function useEnd(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [dep]);
  return ref;
}

/* ---------- Group chat, translated per reader ---------- */
function Chat({ state, deal, viewAs, lang, act }: { state: AppState; deal: Deal; viewAs: string; lang: string; act: Act }) {
  const { t } = useT();
  const me = state.buyers.find(b => b.id === viewAs)!;
  const msgs = state.messages.filter(m => m.dealId === deal.id);
  const [text, setText] = useState('');
  const end = useEnd(msgs.length + (msgs[msgs.length - 1] ? Object.keys(msgs[msgs.length - 1].translations).length : 0));
  const speech = state.config.languages.find(l => l.code === me.lang)?.speech ?? 'en-IN';
  const langName = (c: string) => state.config.languages.find(l => l.code === c)?.name ?? c;

  const send = () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    act(() => post('/api/chat', { dealId: deal.id, buyerId: viewAs, text: v, lang: me.lang }));
  };
  const show = (m: ChatMessage) => (m.lang === lang ? m.text : m.translations[lang as keyof ChatMessage['translations']] ?? (lang === 'bgc' ? m.translations.hi : undefined) ?? m.translations.en ?? m.text);

  return (
    <>
      <div className="scroll" ref={end}>
        {msgs.length === 0 && <p className="muted">{t('chat.empty')}</p>}
        {msgs.map(m => {
          const b = m.buyerId ? state.buyers.find(x => x.id === m.buyerId) : undefined;
          const translated = m.lang !== lang && m.translations[lang as keyof ChatMessage['translations']];
          return (
            <div key={m.id} className={`bubble${m.buyerId === viewAs ? ' me' : ''}${m.from === 'agent' ? ' agent' : ''}`}>
              <div className="who" style={{ color: b?.color }}>{m.from === 'agent' ? state.config.agentName : b?.name ?? ''}</div>
              <div>{show(m)}</div>
              {translated && (
                <small>
                  <details><summary>{t('chat.from', { l: langName(m.lang) })}. {t('chat.original')}</summary><p>{m.text}</p></details>
                </small>
              )}
            </div>
          );
        })}
      </div>
      <div className="composer">
        <input type="text" value={text} placeholder={t('chat.ph')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} lang={me.lang} />
        <Mic speechLang={speech} onText={setText} />
        <button className="btn sm" onClick={send}>{t('chat.send')}</button>
      </div>
    </>
  );
}

/* ---------- Munim: ask in your language ---------- */
interface Turn { who: 'me' | 'bot'; text: string; suggest?: AssistantReply['suggest'] }

function Assistant({ state, deal, viewAs, lang, act }: { state: AppState; deal: Deal; viewAs: string; lang: string; act: Act }) {
  const { t } = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [aloud, setAloud] = useState(true);
  const end = useEnd(turns.length);
  const l = state.config.languages.find(x => x.code === lang);
  const speech = l?.speech ?? 'en-IN';
  const mine = state.commitments.find(c => c.dealId === deal.id && c.buyerId === viewAs && c.status === 'held');

  const ask = async (q: string) => {
    const v = q.trim();
    if (!v || busy) return;
    setText(''); setBusy(true);
    setTurns(x => [...x, { who: 'me', text: v }]);
    try {
      const r = await post<AssistantReply>('/api/assistant', { dealId: deal.id, buyerId: viewAs, text: v, lang });
      setTurns(x => [...x, { who: 'bot', text: r.reply, suggest: r.suggest }]);
      if (aloud) speak(r.reply, state.config.languages.find(z => z.code === r.lang)?.speech ?? speech);
    } catch (e) {
      setTurns(x => [...x, { who: 'bot', text: (e as Error).message }]);
    } finally { setBusy(false); }
  };

  const doIt = (a: NonNullable<AssistantReply['suggest']>['action']) => {
    if (a === 'approve' && mine) return act(() => post(`/api/commitments/${mine.id}/approve`, { decision: 'yes' }));
    if (a === 'reject' && mine) return act(() => post(`/api/commitments/${mine.id}/approve`, { decision: 'no' }));
    if (a === 'withdraw' && mine) return act(() => post(`/api/commitments/${mine.id}/withdraw`));
    if (a === 'negotiate') return act(() => post(`/api/deals/${deal.id}/negotiate`));
    if (a === 'join') document.getElementById('join-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <div className="scroll" ref={end}>
        <p className="muted">{t('ask.hi')}</p>
        <div className="chips">
          {(['ask.q1', 'ask.q2', 'ask.q3'] as const).map(k => <button key={k} className="chip" onClick={() => ask(t(k))}>{t(k)}</button>)}
        </div>
        {turns.map((m, i) => (
          <div key={i} className={`bubble${m.who === 'me' ? ' me' : ' agent'}`}>
            <div>{m.text}</div>
            {m.suggest && <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => doIt(m.suggest!.action)}>{t('ask.do')}: {m.suggest.label}</button></div>}
          </div>
        ))}
        {busy && <div className="bubble agent muted">…</div>}
      </div>
      <div className="composer">
        <input type="text" value={text} placeholder={t('ask.ph')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(text)} lang={lang} />
        <Mic speechLang={speech} onText={v => { setText(v); }} />
        <button className="btn sm" disabled={busy} onClick={() => ask(text)}>{t('chat.send')}</button>
      </div>
      <label className="row" style={{ padding: '0 14px 10px', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={aloud} onChange={e => { setAloud(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} />{t('ask.speak')}
      </label>
    </>
  );
}

export function TopPanel(props: { state: AppState; deal: Deal; viewAs: string; lang: string; act: Act }) {
  const { t } = useT();
  const [tab, setTab] = useState<'chat' | 'ask'>('chat');
  return (
    <section className="card panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>{t('chat.tab')}</button>
        <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>{t('ask.tab')}</button>
      </div>
      {tab === 'chat' ? <Chat {...props} /> : <Assistant {...props} />}
    </section>
  );
}

/* ---------- Pause + shared list, and the timeline ---------- */
function PauseTab({ state, deal }: { state: AppState; deal: Deal }) {
  const { t } = useT();
  const [txt, setTxt] = useState('');
  const [marks, setMarks] = useState<{ start: number; end: number; label: string }[] | null>(null);
  const reports = Object.values(deal.pause);
  const test = async () => { const r = await post<{ highlights: typeof marks }>('/api/pause/check-message', { text: txt }); setMarks(r.highlights); };
  return (
    <div className="scroll">
      {reports.length === 0 && <p className="muted">{t('pause.empty')}</p>}
      {reports.map(r => (
        <div key={r.sellerId} className="warnrow" style={r.decision === 'clear' ? { borderColor: '#BFE3C9', background: '#F5FBF7' } : undefined}>
          <b>{state.sellers.find(s => s.id === r.sellerId)?.name}</b> <span className={`stamp ${r.decision === 'block' ? 'blocked' : r.decision === 'warn' ? 'waiting' : 'paid'}`}>{t(`pause.${r.decision}` as any)}</span>
          <div style={{ marginTop: 6 }}><Checks report={r} /></div>
        </div>
      ))}
      <h3 style={{ fontSize: 15, marginTop: 6 }}>{t('pause.shared')}</h3>
      {state.scamList.map(e => (
        <div key={e.key} className="warnrow"><b>{e.name}</b><div className="muted">{t('pause.groups', { r: e.reports, f: e.families })}</div></div>
      ))}
      <label className="f" style={{ marginTop: 6 }}>{t('pause.test')}
        <textarea rows={3} value={txt} onChange={e => { setTxt(e.target.value); setMarks(null); }} />
      </label>
      <div><button className="btn sm" onClick={test} disabled={!txt.trim()}>{t('pause.testbtn')}</button></div>
      {marks && (
        <div className="msg">
          {marks.length === 0 ? '✓' : (() => {
            const out: React.ReactNode[] = []; let at = 0;
            for (const m of marks) { if (m.start < at) continue; out.push(txt.slice(at, m.start), <mark key={m.start} title={m.label}>{txt.slice(m.start, m.end)}</mark>); at = m.end; }
            out.push(txt.slice(at)); return out;
          })()}
        </div>
      )}
    </div>
  );
}

function TimelineTab({ state, deal }: { state: AppState; deal: Deal }) {
  const { t } = useT();
  const ev = state.events.filter(e => e.dealId === deal.id).slice().reverse();
  return (
    <div className="scroll">
      {ev.length === 0 && <p className="muted">{t('time.empty')}</p>}
      {ev.map(e => (
        <div key={e.id} className={`ev ${e.tone}`}><i /><div>{e.text}<time>{new Date(e.ts).toLocaleTimeString()}</time></div></div>
      ))}
    </div>
  );
}

export function BottomPanel({ state, deal }: { state: AppState; deal: Deal }) {
  const { t } = useT();
  const [tab, setTab] = useState<'pause' | 'time'>('pause');
  return (
    <section className="card panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pause'} onClick={() => setTab('pause')}>{t('pause.tab')}</button>
        <button role="tab" aria-selected={tab === 'time'} onClick={() => setTab('time')}>{t('time.tab')}</button>
      </div>
      {tab === 'pause' ? <PauseTab state={state} deal={deal} /> : <TimelineTab state={state} deal={deal} />}
    </section>
  );
}
