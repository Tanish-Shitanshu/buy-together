# Plug and play setup

Everything is built. You only add keys. Do the steps in order. Never paste a key into chat, code or a commit; keys go only into `.env` (local) or the Render dashboard.

Check any time how far you are:

```bash
npm run doctor        # checks the keys in your local .env (prints no secrets)
npm run verify:live   # checks the live site end to end (free)
```

## 0. Local run (optional, 2 minutes)
```bash
npm install
cp .env.example .env      # then fill the keys below
npm run dev               # http://localhost:5173
```
Without keys it still runs with simulated holds and English only.

## 1. Sarvam: languages and voice (the live site shows English until this is done)
1. https://dashboard.sarvam.ai, sign up with an email never used for Sarvam (new users get about 100 rupees free). Billing must show a positive balance.
2. API Keys, create a key, copy it right away (shown once).
3. Local `.env`: `SARVAM_API_KEY=...`. Render: service `buy-together`, Environment, `SARVAM_API_KEY`, Save (auto redeploys, about 2 minutes).
4. Warm up all translations once and keep them in the repo (costs about 7 rupees per language):
   ```bash
   npm run doctor     # must say translation works
   npm run warm       # translates the whole interface in 9 languages, writes server/seed/i18n.json
   git add server/seed/i18n.json
   git commit -m "Warmed translations"
   git push origin main
   ```
   After this, redeploys never pay for translation again.

## 2. PayPal (sandbox)
The live site already shows PayPal sandbox mode with working keys. If you use your own:
1. https://developer.paypal.com/dashboard/applications/sandbox, create an app (Merchant). Copy Client ID and Secret key 1.
2. `.env` and Render: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`.
3. Webhook: in the same app, Webhooks, add `https://buy-together-v008.onrender.com/api/paypal/webhook`, pick authorization and capture events plus checkout order approved. Copy the Webhook ID into Render as `PAYPAL_WEBHOOK_ID`.
4. Buyer test (once): https://developer.paypal.com/dashboard/accounts, open a US Personal sandbox account (View/Edit shows its email and password). On the live site click Reset demo, view as Ravi, Hold and join, log in with that account in the pop-up, then run the story to the end. In the sandbox business account check there is an authorization, a partial capture of the exact share, and the rest released. Click Reset demo when done.

## 3. Channel3 (shop prices)
Live site already returns prices. To use your own: https://trychannel3.com/sign-up/developer, key at https://trychannel3.com/dashboard/api, set `CHANNEL3_API_KEY` in `.env` and Render.

## 4. Render
- Service `buy-together` auto deploys from `main` (about 2 minutes). Free instance sleeps; the first load takes about 50 seconds.
- Environment variables to have set: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `SARVAM_API_KEY`, `CHANNEL3_API_KEY`. Optional: `I18N_DUMP_TOKEN` (any long random string) lets you download the live translation cache at `/api/i18n/dump?token=...` instead of running `npm run warm` locally.
- Saving an environment variable redeploys automatically, and a redeploy resets the demo state.

## 5. Final checks
```bash
npm run verify:live -- https://buy-together-v008.onrender.com
```
All lines must say OK. Then click through the live site once (desktop and phone): Reset, join, chat, Munim, Pause blocks FastBulk, helper link, delivery drag, receipt, order book, ledger, new deal, Ronnie (type, mic, speaker on and off, Stop). Optional, costs credits, run once: `/api/pause/eval?set=holdout3&model=1` (quote a model number only if it beats `model=0`, which is 80%).

## 6. Video and submission
1. APIMatic (only if truly used): `npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview`, then the claim form on the hackathon page.
2. Record following `docs/VIDEO_SCRIPT.md` (under 3 minutes, no music). Wake the site first, click Reset demo, view as Ravi, language Haryanvi, PayPal sandbox buyer logged in in the same browser.
3. Upload to YouTube. Take 5 screenshots.
4. Clean the repo before making it public:
   ```bash
   git rm HANDOFF.md HANDOVER_TO_TANISH.md PROGRESS.md SETUP.md
   git commit -m "Remove internal notes" && git push origin main
   ```
   Also remove anything in `PLAN.md` that reads as a roadmap. Check `git ls-files .env data` prints nothing. Then GitHub, Settings, Danger Zone, Change visibility, Public.
5. Devpost: paste `docs/DEVPOST.md`, add the YouTube link, repo link, live URL, screenshots, pick the sponsor prizes. Submit well before Nov 12, 12:00 pm PST (Nov 13, 1:30 am IST).

## Reference
- Tests: `UNDO_SECONDS=1 npm test`. Build: `npm run build`. Types: `npm run typecheck`.
- Pause evaluation (free, local): `npm run eval:pause -- holdout3.json`. `holdout2` and `holdout3` are unseen sets; do not tune rules on them.
