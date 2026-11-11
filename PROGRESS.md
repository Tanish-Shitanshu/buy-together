# Progress report

Live site: https://buy-together-v008.onrender.com (auto-deploys from `main` on Render; free instance sleeps, first load takes about 50 s)
Repo: https://github.com/Tanish-Shitanshu/buy-together (private until the team makes it public)
Hackathon: PayPal AI Hackathon, deadline Nov 12, 12:00 pm PST (Nov 13, 1:30 am IST)

## What Buy Together is
Strangers pool demand to reach bulk price tiers. An agent (Munim) negotiates for the group. Every buyer approves the final price. PayPal holds each buyer's share separately (Orders v2 `AUTHORIZE`), then captures exactly that share (Payments v2 partial capture, `final_capture: true`) or voids. Rule for the code: models read, write and translate; plain code decides every price and payment.

## Done and live
- Pooled deals, tier pricing, deterministic negotiation (agent ceiling is the lowest walk-away price in the group), Undo window, receipt with total saved.
- PayPal: authorize per buyer, partial capture, void, pre-capture check of the authorization, webhook verification at `/api/paypal/webhook`, `PayPal-Request-Id` on every write, JS SDK pop-up for real buyers, simulated holds for demo buyers.
- Pause: price vs market (Channel3), seller + shared warning list, pressure wording (rules plus model pointers that code verifies), hold coverage, group limits. Evaluation on 140 held-out messages: rules alone 56% of risky caught, with model 70%, 4 false alarms of 70 ordinary (`server/eval`, `/api/pause/eval`).
- Languages and voice (Sarvam): ten UI languages, translated group chat, assistant, voice in and out, receipt read-aloud.
- New deal for any product, with real shop prices from Channel3.
- Family helper approval link, join requests from outside agents through MCP (`/mcp`, tools: list_deals, get_deal, check_message, check_seller, request_join).
- AG Grid order book and PayPal ledger (held, spent, returned, totals, search). Bryntum Scheduler delivery board (trial watermark shows).
- Invite link (WhatsApp / copy), how-it-works intro, Demo dock (Next step, Play whole demo, Reset demo), rate limits on paid calls.
- Docs: `README.md`, `PLAN.md`, `docs/VIDEO_SCRIPT.md`, `docs/DEVPOST.md`. Seven engine tests pass (`UNDO_SECONDS=1 npm test`).

## Not verified
- The real PayPal buyer pop-up (approve with a US personal sandbox account) has never been run. Order creation, hold, capture and void logic are tested. Run this first.
- `PAYPAL_WEBHOOK_ID` may not be set in Render.
- Haryanvi translation quality is unchecked (Sarvam has no Haryanvi code; sent as Hindi).
- The demo state resets whenever Render redeploys.

## Manual steps (a human has to do these)
1. Render dashboard: confirm environment variables are set: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `SARVAM_API_KEY`, `CHANNEL3_API_KEY`. Confirm the Render GitHub app has access to this repo.
2. PayPal developer dashboard: sandbox US Business app is in use; webhook points at `/api/paypal/webhook`. Sign in as a US personal sandbox buyer and complete one full join, review, pay cycle.
3. APIMatic: run `npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview` on a laptop, then fill the APIMatic claim form (only if it was actually used).
4. Record the video (under 3 minutes, no music, no third-party trademarks), script in `docs/VIDEO_SCRIPT.md`. Upload to YouTube.
5. Make the repo public. Submit on Devpost using `docs/DEVPOST.md` (the Pause numbers are filled in), the video link and screenshots.

## Next work for the teammate's Claude
Read `HANDOFF.md` and paste its prompt. Priorities:
1. UI polish to a very high standard (details in the prompt).
2. Full read-through of the product on the live site, in several languages and at phone width; fix anything broken or awkward.
3. Improve Pause recall (add examples to the model prompt in `server/src/pause.ts`, extend `server/eval`, keep a held-out set untouched, re-run `/api/pause/eval`).
4. Strengthen the AG Grid dashboard if time allows.
5. Keep README, PLAN and docs matching what the product really does.
