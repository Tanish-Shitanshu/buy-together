// Checks the live site end to end without spending credits. Run: npm run verify:live -- https://your-site.onrender.com
const base = (process.argv[2] ?? 'https://buy-together-scx9.onrender.com').replace(/\/$/, '');
let failed = 0;
const check = async (name, fn) => {
  try { const m = await fn(); console.log(`  OK    ${name}${m ? ` (${m})` : ''}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const j = async (p, o) => { const r = await fetch(base + p, o); if (!r.ok) throw new Error(`status ${r.status}`); return r.json(); };
const post = (p, body, extra = {}) => j(p, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

console.log(`\nChecking ${base} (a sleeping free instance can take about a minute)\n`);
await check('server awake', async () => {
  const h = await j('/api/health');
  if (!h.ok) throw new Error('not ok');
  if (typeof h.languageService !== 'string') throw new Error(`language service: ${JSON.stringify(h.languageService)}. Status 402 means the Sarvam account has no credits.`);
  return 'language service ok';
});
await check('PayPal sandbox keys active', async () => {
  const c = await j('/api/config');
  if (c.paypalMode !== 'sandbox') throw new Error(`mode is "${c.paypalMode}": check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV=sandbox in Render`);
});
await check('Pause blocks a scam message', async () => {
  const r = await post('/api/pause/check-message', { text: 'Only today! Send the advance to my UPI id, no refunds.' });
  if (r.verdict !== 'fail') throw new Error(`verdict ${r.verdict}`);
});
await check('Pause passes a normal message', async () => {
  const r = await post('/api/pause/check-message', { text: 'We deliver in 5 days, payment through the held deal.' });
  if (r.verdict !== 'pass') throw new Error(`verdict ${r.verdict}`);
});
await check('Ronnie answers', async () => {
  const r = await post('/api/assistant', { dealId: 'deal_water', buyerId: 'b_ravi', text: 'where do we stand', lang: 'en' });
  if (!r.reply) throw new Error('no reply');
});
await check('MCP lists tools', async () => {
  const r = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { accept: 'application/json, text/event-stream' });
  if (!r.result?.tools?.length) throw new Error('no tools');
  return `${r.result.tools.length} tools`;
});
await check('Channel3 prices', async () => {
  const r = await j('/api/market/search?q=sparkling%20water');
  if (!r.items?.length) throw new Error('no prices: check CHANNEL3_API_KEY in Render');
  return `${r.items.length} items`;
});
await check('Web app and logo served', async () => {
  for (const p of ['/', '/favicon.svg']) { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p} status ${r.status}`); }
});
await check('Translations ready (Tamil)', async () => {
  const r = await post('/api/i18n', { lang: 'ta', strings: { 'top.next': 'Next step' } });
  if (r.__pending || r['top.next'] === 'Next step') throw new Error('not translated yet: run npm run warm, push the seed, or give Sarvam credits');
  return r['top.next'];
});

console.log(failed ? `\n${failed} check(s) failed.\n` : '\nEverything checks out.\n');
process.exit(failed ? 1 : 0);
