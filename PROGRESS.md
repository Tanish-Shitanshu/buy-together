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

## Update (teammate session 1)
- UI polish layer appended to `web/src/styles.css`: higher-contrast muted text, focus rings, hover lift, price pop on tier change, paid/agreed stamp glow, empty/error states, phone-width layout (under 640px), high-contrast mode.
- Pause model prompt: two more worked examples (Hinglish pressure plus off-platform payment, and a no-returns case). Rules are unchanged, so the published eval numbers still apply; the model run was not repeated because no API keys are set up locally.
- Not done: live-site walkthrough, real PayPal buyer pop-up, re-run of `/api/pause/eval` on the live site, Sarvam language checks. All need keys or a browser session.
- Known: `server/eval/run.ts` builds the file path wrongly on Windows (run it from WSL or Linux).

## Update (teammate session 2): PayPal-style UI
- New theme layer in `web/src/styles.css` (bottom of the file): PayPal navy/blue palette, Inter, white cards with soft shadows, pill buttons, status badges instead of rotated stamps, clean AG Grid theme variables, single-row header and demo dock, phone layout.
- Checked locally with the full 5-step demo (simulated PayPal) at 1440px and 375px: join, negotiation, Pause block, undo window, pay, delivery board, order book, ledger, receipt all render. No horizontal overflow at phone width.
- Still needs a human: real PayPal buyer pop-up, Render env vars, video, Devpost submit. Pause model eval was not re-run (no keys locally).

## Update (teammate session 3)
- New logo (two overlapping circles, blue to navy tile), favicon and theme colour.
- Pause rules extended (cash, IMPS/NEFT, prepaid, handling or release charges, banking username, "platform chodo", no-returns wording, secrecy, "whoever pays first"). The old `holdout` set was seen while doing this, so it is no longer a fair test. New unseen set `server/eval/holdout2.json` (60 messages): rules flag 70% of risky, 0 false alarms of 30. Do not tune on it. `/api/pause/eval?set=holdout2` works.
- Live eval with `model=1` returned the same numbers as rules only, so the model layer is probably not answering on Render (check `SARVAM_API_KEY` there). Do not quote a model-assisted figure until `model=1` beats `model=0`.
- `server/eval/run.ts` now works on Windows.
- Checked at 1280px and 375px in all ten UI languages: no horizontal overflow. Phone header is a two-column grid; demo dock is one compact row.
- Local API checks: Pause check-message, `/mcp` tools/list, state. Market search returns empty without `CHANNEL3_API_KEY` (expected).
