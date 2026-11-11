import fs from 'node:fs';
import path from 'node:path';
import { pressureSpans, messageVerdict } from '../src/pause';
const here = path.dirname(new URL(import.meta.url).pathname);

/** Scores Pause's message check. A message counts as "flagged" when at least one kind of pressure wording is found,
 *  and as "blocked" when the app's rule fails it (money outside the held deal, card or login details, or two kinds of pressure). */
const file = process.argv[2] ?? 'dev.json';
const rows: { text: string; risky: boolean }[] = JSON.parse(fs.readFileSync(path.join(here, file), 'utf8'));
const verdict = (t: string) => messageVerdict(pressureSpans(t)).status;

function score(name: string, pred: (t: string) => boolean) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const miss: string[] = [], wrong: string[] = [];
  for (const r of rows) {
    const p = pred(r.text);
    if (r.risky && p) tp++; else if (r.risky && !p) { fn++; miss.push(r.text); }
    else if (!r.risky && p) { fp++; wrong.push(r.text); } else tn++;
  }
  const prec = tp / Math.max(1, tp + fp), rec = tp / Math.max(1, tp + fn);
  console.log(`${name.padEnd(8)} precision ${(prec * 100).toFixed(1)}%  recall ${(rec * 100).toFixed(1)}%  false alarms ${fp}/${tn + fp}  missed ${fn}/${tp + fn}`);
  return { miss, wrong };
}
const total = rows.length, risky = rows.filter(r => r.risky).length;
console.log(`${file}: ${total} messages (${risky} risky, ${total - risky} ordinary)`);
const f = score('flagged', t => verdict(t) !== 'pass');
const b = score('blocked', t => verdict(t) === 'fail');
if (process.argv.includes('-v')) { console.log('\nmissed (flagged):', f.miss, '\nfalse alarms (flagged):', f.wrong, '\nnot blocked:', b.miss); }
