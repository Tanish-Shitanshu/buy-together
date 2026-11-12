/** Checks every key you put in .env, without printing any secret. Run: npm run doctor */
import { execSync } from 'node:child_process';
import { config } from '../src/config';
import { translateText } from '../src/sarvam';
import { searchMarket } from '../src/market';

let failed = 0;
const ok = (m: string) => console.log(`  OK    ${m}`);
const bad = (m: string, fix: string) => { console.log(`  FAIL  ${m}\n        -> ${fix}`); failed++; };
const skip = (m: string) => console.log(`  SKIP  ${m}`);

console.log('\nBuy Together setup check\n');

console.log('PayPal');
const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
const env = process.env.PAYPAL_ENV ?? 'sandbox';
if (!id || !secret) skip('no PayPal keys: the app runs with simulated holds');
else {
  try {
    const base = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const r = await fetch(`${base}/v1/oauth2/token`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15000) });
    if (r.ok) ok(`PayPal ${env} keys accepted`);
    else bad(`PayPal rejected the keys (status ${r.status})`, 'Copy Client ID and Secret key 1 from the same sandbox app (developer.paypal.com > Apps and Credentials > Sandbox). PAYPAL_ENV must be sandbox.');
  } catch (e) { bad(`PayPal not reachable: ${(e as Error).message}`, 'Check your internet connection.'); }
  if (process.env.PAYPAL_WEBHOOK_ID) ok('PAYPAL_WEBHOOK_ID is set');
  else skip('PAYPAL_WEBHOOK_ID not set (only needed on the live site; add it in Render after creating the webhook)');
}

console.log('\nSarvam (languages and voice)');
if (!config.ai.sarvamKey) skip('no SARVAM_API_KEY: the app stays in English with scripted text');
else {
  const out = await translateText('Hello', 'en', 'hi');
  if (out) ok(`translation works ("Hello" -> "${out}")`);
  else bad('Sarvam did not answer', 'Create the key at dashboard.sarvam.ai > API Keys and check that Billing has credits (status 402 means no credits).');
}

console.log('\nChannel3 (shop prices)');
if (!config.channel3Key) skip('no CHANNEL3_API_KEY: New deal asks for the price by hand');
else {
  const items = await searchMarket('sparkling water', 1).catch(() => []);
  if (items.length) ok(`prices found (${items[0].title})`);
  else bad('Channel3 returned nothing', 'Create the key at trychannel3.com/dashboard/api and paste it in .env.');
}

console.log('\nSecrets safety');
let tracked = '';
try { tracked = execSync('git ls-files .env', { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
if (tracked) bad('.env is tracked by git', 'Run: git rm --cached .env');
else ok('.env is not tracked by git');

console.log(failed ? `\n${failed} problem(s) above.\n` : '\nAll configured services work.\n');
process.exit(failed ? 1 : 0);
