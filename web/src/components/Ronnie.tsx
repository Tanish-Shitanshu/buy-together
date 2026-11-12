import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, AssistantReply, Deal, LangCode } from '../../../shared/types';
import { useT } from '../i18n';
import { post } from '../api';
import { speak, stopSpeaking, useListen } from './voice';

type Act = (fn: () => Promise<unknown>) => Promise<void>;
interface Turn { who: 'me' | 'bot'; text: string; suggest?: AssistantReply['suggest'] }

/** The name Ronnie answers to, in Latin and in each app script, at the start of an utterance. */
const NAME = /^\s*(?:(?:hey|hi|hello|ok|okay|ए|अरे|हे)\s+)?(?:ronnie|ronni|roni|rony|रोनी|रॉनी|ரோனி|రోనీ|రోని|ਰੌਨੀ|ਰੋਨੀ|রনি|রোনি|ರೋನಿ|ರೊನಿ|રોની)(?![\p{L}\p{M}])[\s,:;.!?\-–—।]*/iu;
export function stripName(text: string): { heard: boolean; rest: string } {
  const m = text.match(NAME);
  return m ? { heard: true, rest: text.slice(m[0].length).trim() } : { heard: false, rest: text.trim() };
}

/** Which app language a spoken or typed sentence is in. Falls back to the language chosen in the app. */
const SCRIPTS: [RegExp, LangCode][] = [[/[஀-௿]/, 'ta'], [/[ఀ-౿]/, 'te'], [/[਀-੿]/, 'pa'], [/[ঀ-৿]/, 'bn'], [/[઀-૿]/, 'gu'], [/[ಀ-೿]/, 'kn']];
export function detectLang(text: string, sttLang: string | undefined, fallback: LangCode): LangCode {
  for (const [re, code] of SCRIPTS) if (re.test(text)) return code;
  if (/[ऀ-ॿ]/.test(text)) return fallback === 'mr' || fallback === 'bgc' ? fallback : sttLang?.startsWith('mr') ? 'mr' : 'hi';
  const p = (sttLang ?? '').slice(0, 2).toLowerCase();
  if (p && ['hi', 'ta', 'te', 'bn', 'mr', 'gu', 'pa', 'kn'].includes(p)) return p as LangCode;
  return fallback;
}

const store = {
  get(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

function Face({ look, listening, speaking }: { look: { x: number; y: number }; listening: boolean; speaking: boolean }) {
  return (
    <svg viewBox="0 0 96 104" width="72" height="78" aria-hidden="true" className={`ronnie-svg${listening ? ' listen' : ''}${speaking ? ' talk' : ''}`}>
      <defs>
        <linearGradient id="rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2F8CF0" /><stop offset="1" stopColor="#0B3FB0" /></linearGradient>
      </defs>
      <ellipse cx="48" cy="98" rx="22" ry="4" fill="#001C64" opacity=".18" />
      <line x1="48" y1="10" x2="48" y2="2" stroke="#001C64" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="4" r="4.5" fill="#FFC439" />
      <rect x="10" y="12" width="76" height="76" rx="34" fill="url(#rb)" />
      <rect x="20" y="28" width="56" height="38" rx="19" fill="#fff" />
      <g className="eyes" style={{ transform: `translate(${look.x * 4}px, ${look.y * 3}px)` }}>
        <ellipse className="eye" cx="38" cy="46" rx="5" ry="6.5" fill="#001C64" />
        <ellipse className="eye" cx="58" cy="46" rx="5" ry="6.5" fill="#001C64" />
        <circle cx="40" cy="43.5" r="1.6" fill="#fff" /><circle cx="60" cy="43.5" r="1.6" fill="#fff" />
      </g>
      <path className="mouth" d={speaking ? 'M41 57q7 9 14 0z' : 'M41 57q7 6 14 0'} fill={speaking ? '#D6336C' : 'none'} stroke="#001C64" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="29" cy="58" r="3.4" fill="#FF8FA3" opacity=".7" /><circle cx="67" cy="58" r="3.4" fill="#FF8FA3" opacity=".7" />
      <path d="M30 80h36l-3 12a4 4 0 0 1-4 3H37a4 4 0 0 1-4-3z" fill="#FFC439" />
      <path d="M40 80v-3a8 8 0 0 1 16 0v3" fill="none" stroke="#001C64" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Ronnie({ state, deal, viewAs, lang, act, openSignal }: { state: AppState; deal: Deal; viewAs: string; lang: string; act: Act; openSignal: number }) {
  const { t } = useT();
  const live = state.config.aiMode === 'live';
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [aloud, setAloud] = useState(() => store.get('ronnie.aloud', '0') === '1');
  const [speaking, setSpeaking] = useState(false);
  const [follow, setFollow] = useState(() => store.get('ronnie.follow', '1') === '1');
  const [look, setLook] = useState({ x: 0, y: 0 });
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const roams = follow && !reduced && !coarse;

  const host = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastSpeak = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const mine = state.commitments.find(c => c.dealId === deal.id && c.buyerId === viewAs && c.status === 'held');
  const appLang = (state.buyers.find(b => b.id === viewAs)?.lang ?? lang) as LangCode;
  const speechOf = (c: string) => state.config.languages.find(l => l.code === c)?.speech ?? 'en-IN';

  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);
  useEffect(() => { end.current?.scrollTo({ top: end.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }); }, [turns.length, busy, open, reduced]);
  useEffect(() => { store.set('ronnie.aloud', aloud ? '1' : '0'); if (!aloud) { stopSpeaking(); setSpeaking(false); } }, [aloud]);
  useEffect(() => { store.set('ronnie.follow', follow ? '1' : '0'); }, [follow]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  // Follow the pointer with easing. On touch screens, with reduced motion or when pinned, Ronnie sits in the corner and can be dragged.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const home = () => ({ x: window.innerWidth - 96, y: window.innerHeight - 190 });
    if (pos.current.x === 0) { pos.current = home(); target.current = home(); }
    if (!roams) { const h = home(); pos.current = { x: Math.min(pos.current.x, h.x), y: Math.min(pos.current.y, h.y) }; }
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (!roams) return;
      target.current = { x: Math.min(window.innerWidth - 84, e.clientX + 26), y: Math.min(window.innerHeight - 170, e.clientY + 26) };
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      setLook({ x: dx / d, y: dy / d });
    };
    const tick = () => {
      if (roams) { pos.current.x += (target.current.x - pos.current.x) * 0.12; pos.current.y += (target.current.y - pos.current.y) * 0.12; }
      el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    const resize = () => { const h = home(); pos.current = { x: Math.min(pos.current.x, h.x), y: Math.min(pos.current.y, h.y) }; };
    window.addEventListener('pointermove', move); window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); window.removeEventListener('resize', resize); };
  }, [roams]);

  const onDown = (e: React.PointerEvent) => {
    if (roams) return;
    drag.current = { x: e.clientX - pos.current.x, y: e.clientY - pos.current.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 84, e.clientX - d.x));
    const ny = Math.max(0, Math.min(window.innerHeight - 170, e.clientY - d.y));
    if (Math.abs(nx - pos.current.x) + Math.abs(ny - pos.current.y) > 3) d.moved = true;
    pos.current = { x: nx, y: ny };
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };
  const onClick = () => { if (drag.current?.moved) return; setOpen(o => !o); };

  const say = useCallback(async (reply: string, l: LangCode, byVoice: boolean) => {
    if (!(aloud || byVoice)) return;
    const now = Date.now();
    if (now - lastSpeak.current < 2000) return;
    lastSpeak.current = now;
    setSpeaking(true);
    try { await speak(reply.slice(0, 300), l, speechOf(l), live); } finally { setSpeaking(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aloud, live, state.config.languages]);

  const ask = async (raw: string, byVoice = false, sttLang?: string) => {
    const { heard, rest } = stripName(raw);
    if (byVoice && !heard) { setOpen(true); setStatus(t('ronnie.sayname', { heard: raw })); return; }
    const q = (heard ? rest : raw).trim();
    if (!q) { setStatus(t('ronnie.yes')); setOpen(true); return; }
    if (busy) return;
    const l = detectLang(q, sttLang, appLang);
    setText(''); setBusy(true); setStatus(''); setOpen(true);
    setTurns(x => [...x, { who: 'me', text: q }]);
    try {
      const r = await post<AssistantReply>('/api/assistant', { dealId: deal.id, buyerId: viewAs, text: q, lang: l });
      setTurns(x => [...x, { who: 'bot', text: r.reply, suggest: r.suggest }]);
      void say(r.reply, r.lang, byVoice);
    } catch {
      setTurns(x => [...x, { who: 'bot', text: t('ronnie.err') }]);
    } finally { setBusy(false); }
  };

  const { on, supported, start, stop } = useListen(appLang, speechOf(appLang), live);
  const listen = () => {
    if (on) { stop(); return; }
    stopSpeaking(); setSpeaking(false);
    void start((txt, final, l) => { if (final) void ask(txt, true, l); });
  };
  const hush = () => { stopSpeaking(); setSpeaking(false); };

  const doIt = (a: NonNullable<AssistantReply['suggest']>['action']) => {
    if (a === 'approve' && mine) return act(() => post(`/api/commitments/${mine.id}/approve`, { decision: 'yes' }));
    if (a === 'reject' && mine) return act(() => post(`/api/commitments/${mine.id}/approve`, { decision: 'no' }));
    if (a === 'withdraw' && mine) return act(() => post(`/api/commitments/${mine.id}/withdraw`));
    if (a === 'negotiate') return act(() => post(`/api/deals/${deal.id}/negotiate`));
    if (a === 'join') { setOpen(false); document.getElementById('join-panel')?.scrollIntoView({ behavior: 'smooth' }); }
  };

  const last = [...turns].reverse().find(x => x.who === 'bot');
  return (
    <>
      <div className={`ronnie${roams ? ' roams' : ' pinned'}${speaking ? ' speaking' : ''}`} ref={host}>
        {!open && last && <div className="ronnie-hint" role="status">{last.text.slice(0, 90)}{last.text.length > 90 ? '…' : ''}</div>}
        <button className="ronnie-btn" aria-label={t('ronnie.label')} aria-expanded={open} title={t('ronnie.label')}
          onClick={onClick} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          <Face look={look} listening={on} speaking={speaking} />
        </button>
      </div>

      {open && (
        <section className="ronnie-panel" role="dialog" aria-label={t('ronnie.label')}>
          <header>
            <b>Ronnie</b><span className="muted">{t('ronnie.role')}</span>
            <span className="sp" />
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t('ronnie.close')}>×</button>
          </header>
          <div className="ronnie-scroll" ref={end}>
            <p className="muted">{t('ronnie.hi')}</p>
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
            {on && <p className="muted" role="status">{t('ask.listening')}</p>}
            {status && <p className="muted" role="status">{status}</p>}
          </div>
          <div className="composer">
            <input ref={input} type="text" value={text} placeholder={t('ronnie.ph')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(text)} lang={lang} aria-label={t('ronnie.ph')} />
            {supported && (
              <button className={`mic${on ? ' on' : ''}`} onClick={listen} aria-label={on ? t('ask.listening') : t('ask.mic')} title={on ? t('ask.listening') : t('ask.mic')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            )}
            <button className="btn sm" disabled={busy} onClick={() => ask(text)}>{t('chat.send')}</button>
          </div>
          <footer>
            <button className={`toggle${aloud ? ' on' : ''}`} role="switch" aria-checked={aloud} onClick={() => setAloud(a => !a)}>
              <span aria-hidden>{aloud ? '🔊' : '🔇'}</span> {aloud ? t('ronnie.speakon') : t('ronnie.speakoff')}
            </button>
            {speaking && <button className="btn sm bad" onClick={hush}>{t('ronnie.stop')}</button>}
            {!coarse && !reduced && (
              <button className={`toggle${follow ? ' on' : ''}`} role="switch" aria-checked={follow} onClick={() => setFollow(f => !f)}>{t('ronnie.follow')}</button>
            )}
          </footer>
          <p className="ronnie-tip">{t('ronnie.tip')}</p>
        </section>
      )}
    </>
  );
}
