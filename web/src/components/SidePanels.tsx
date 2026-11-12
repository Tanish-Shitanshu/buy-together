import { useEffect, useRef, useState } from 'react';
import type { AppState, ChatMessage, Deal } from '../../../shared/types';
import { useT } from '../i18n';
import { post } from '../api';
import { useListen } from './voice';
import { Checks } from './Stage';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

function Mic({ lang, speechLang, server, onText }: { lang: string; speechLang: string; server: boolean; onText: (t: string) => void }) {
  const { t } = useT();
  const { on, supported, start, stop } = useListen(lang, speechLang, server);
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
        <Mic lang={me.lang} speechLang={speech} server={state.config.aiMode === 'live'} onText={setText} />
        <button className="btn sm" onClick={send}>{t('chat.send')}</button>
      </div>
    </>
  );
}

export function TopPanel(props: { state: AppState; deal: Deal; viewAs: string; lang: string; act: Act }) {
  const { t } = useT();
  const [tab, setTab] = useState<'chat' | 'ask'>('chat');
  return (
    <section className="card panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected="true">{t('chat.tab')}</button>
      </div>
      <Chat {...props} />
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
