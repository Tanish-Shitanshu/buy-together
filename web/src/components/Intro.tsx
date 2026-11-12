import { useT } from '../i18n';

const Icon = ({ d, c }: { d: string; c: string }) => (
  <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const STEPS = [
  { k: 'pool', c: '#4C4BC4', d: 'M24 12a5 5 0 1 0 .01 0M13 21a4 4 0 1 0 .01 0M35 21a4 4 0 1 0 .01 0M15 39c0-7 4-10 9-10s9 3 9 10M5 36c0-4 3-6 7-6M43 36c0-4-3-6-7-6' },
  { k: 'talk', c: '#E8590C', d: 'M8 12h32v20H24l-8 7v-7H8zM16 20h16M16 26h10' },
  { k: 'check', c: '#D6336C', d: 'M24 6l14 5v11c0 9-6 15-14 20C16 37 10 31 10 22V11zM17 24l5 5 9-10' },
  { k: 'pay', c: '#2F9E44', d: 'M6 14h36v22H6zM6 22h36M14 31h8' },
] as const;

/** Four plain steps that say what this is, shown before the demo starts. */
export function Intro({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <section className="intro" aria-label={t('intro.title')}>
      <div className="introhead">
        <div>
          <h1>{t('intro.title')}</h1>
          <p>{t('intro.sub')}</p>
          <p className="introronnie">{t('intro.ronnie')}</p>
        </div>
        <button className="btn sm ghost" onClick={onClose} aria-label={t('intro.close')}>{t('intro.close')}</button>
      </div>
      <ol className="introsteps">
        {STEPS.map(s => (
          <li key={s.k} style={{ ['--c' as string]: s.c }}>
            <Icon d={s.d} c={s.c} />
            <b>{t(`intro.${s.k}` as any)}</b>
            <span>{t(`intro.${s.k}.d` as any)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
