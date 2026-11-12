/** Translates the whole interface into every language once and saves it to server/seed/i18n.json.
 *  Needs SARVAM_API_KEY in .env (about 1 rupee per language). Run: npm run warm
 *  Then commit server/seed/i18n.json and push: redeploys never pay for translation again. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, LANGUAGES } from '../src/config';
import { translateStrings, i18nCache } from '../src/chat';
import { sarvamOn } from '../src/sarvam';
import { STR } from '../../web/src/i18n';

if (!sarvamOn()) { console.error('SARVAM_API_KEY is not set in .env. Add it, then run npm run warm again.'); process.exit(1); }
const langs = LANGUAGES.map(l => l.code).filter(c => c !== 'en');
for (const lang of langs) {
  let pending = 1;
  for (let pass = 1; pass <= 8 && pending > 0; pass++) {
    const r = await translateStrings(lang, { ...STR } as Record<string, string>, 90000);
    pending = Number(r.__pending ?? 0);
    console.log(`${lang}: pass ${pass}, ${pending} left`);
    if (pending > 0) await new Promise(res => setTimeout(res, 3000));
  }
}
const file = path.join(ROOT, 'server', 'seed', 'i18n.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(i18nCache()));
console.log(`\nSaved ${file}.\nNow run: git add server/seed/i18n.json && git commit -m "Warmed translations" && git push`);
