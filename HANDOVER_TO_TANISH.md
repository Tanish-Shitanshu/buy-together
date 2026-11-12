# Handover to Tanish: what was done, what is left

Internal note, not submission text. Written after Mohit's work session. Live site: https://buy-together-v008.onrender.com (auto-deploys from `main`). Deadline: Nov 12, 12:00 pm PST (Nov 13, 1:30 am IST).

All work below is committed and pushed to `main` (commits `2cf4bf7`, `7b06f45`, `93698e9`, `92b769c`) under Mohit's own git identity, with no AI attribution lines. The repo is still private. Nothing in the payment logic was changed.

---

## 1. What was done

### 1.1 Setup and baseline checks
- Cloned the repo, ran `npm install`, `UNDO_SECONDS=1 npm test` (7 of 7 pass), `npm run typecheck` (clean) and `npm run build` (OK). These still pass after every change below.

### 1.2 UI and UX redesign (PayPal-style)
All of it is in `web/src/styles.css` (layers appended at the bottom, later rules override earlier ones), plus small edits in `web/index.html`, `web/src/App.tsx`, `web/src/components/Hero.tsx` and a new `web/src/components/Logo.tsx`.

- **Palette and type:** PayPal navy (`#001C64`, `#003087`), PayPal blue (`#0070E0`), yellow (`#FFC439`) for the highlight button, light grey ground (`#F5F7FA`), Inter for Latin text. Hind and the Noto Sans Indic fonts remain as fallbacks, so Indian-language text still renders.
- **Surfaces:** white cards, soft navy shadows, 18px radius, wider spacing, centred content up to 1400px.
- **Header:** white nav bar with navy brand, pill selects, one row on desktop.
- **Buttons:** fully rounded pills. Blue is the main action, navy is confirm, red outline is destructive, yellow is the demo's "Next step". Clear focus rings.
- **Status badges:** the old rotated rubber stamps are now small coloured pills (Held, Paid, Returned, Blocked, Agreed and so on). Same class names, so no component changes.
- **Key moments:** the price animates (scales in) every time the tier price changes (`key={price}` on the price element in `Hero.tsx`), the active tier card lifts, the green tier ticks pop, badges pop in.
- **Data grids (AG Grid):** themed through AG Grid CSS variables: light header, soft row rules, blue hover, rounded wrapper. The delivery board (Bryntum) got a rounded border. The trial watermark still shows.
- **Intro card:** navy-to-blue gradient, four steps in a row on desktop.
- **Demo dock:** a navy pill, one row on desktop and on phone.
- **Phone layout (under 640px):** header becomes a two-column grid, price block stacks, tier grid is two columns, tick labels hidden on the track (they overlapped), compact dock.
- **Accessibility:** muted text contrast raised, `prefers-contrast: more` support, `prefers-reduced-motion` already respected.
- **New logo:** two overlapping circles (white and yellow, blue overlap) on a blue-to-navy rounded tile. Used in the header (`Logo.tsx`), as the favicon (`web/public/favicon.svg`) and with a `theme-color` meta tag.

### 1.3 Pause (seller message checks)
- `server/src/pause.ts`:
  - Two more worked examples in the model prompt (Hinglish pressure plus off-platform payment, and a no-returns case).
  - Wording rules extended: cash payments, IMPS/NEFT/RTGS, direct deposit, prepaid and prepayment, handling/release/clearance/verification/insurance fees, "pay on my number/link/website", "platform chodo", "seedha mere account", "send me the payment", no-returns and "cannot be returned", "sold as is", secrecy ("nobody else knows", "keep quiet"), "whoever pays first", banking username and online banking.
  - The negation guard ("we do not need any advance") is unchanged.
- `server/eval/run.ts`: fixed the path bug on Windows. Run from the repo root: `npx tsx server/eval/run.ts holdout2.json`.
- `server/src/index.ts`: `/api/pause/eval` now accepts set names with digits (`holdout2`).
- **New unseen evaluation set** `server/eval/holdout2.json`: 60 messages (30 risky, 30 ordinary) written after the rule changes and never used to tune them. **Do not tune on it.**

Rules-only results (recall = share of risky messages flagged):

| Set | Risky flagged | False alarms on ordinary | Fair test? |
|---|---|---|---|
| `dev`, `test` | 100% | 0 | No, rules were built on these |
| `fresh` | 77% | 2 of 30 | Partly (seen earlier) |
| `holdout` | 97.5% | 2 of 40 | No, Mohit's session saw its misses |
| **`holdout2`** | **70%** | **0 of 30** | **Yes** |

- `README.md` and `docs/DEVPOST.md` now quote the `holdout2` figure and no longer claim a model-assisted 70% (see 2.1 for why).

### 1.4 What was tested
- Engine: 7 tests pass, typecheck clean, production build OK.
- Full 5-step demo run locally (simulated PayPal holds) at 1440px and 375px: join, negotiation with Munim, Pause blocking the scam seller (FastBulk Deals) with highlighted words, undo window, pay, delivery board, order book, PayPal ledger, receipt.
- All ten UI languages (en, hi, bgc/Haryanvi, ta, te, bn, mr, gu, pa, kn) switched at 1280px and 375px: no horizontal overflow, no clipped cards or buttons. This was a layout check only.
- API locally: `/api/pause/check-message` (scam message fails with highlights, normal message passes), `/mcp` `tools/list` returns the tools, `/api/state` returns the deal and five buyers.
- Live site: new build served, favicon served, `/api/pause/eval?set=holdout2&model=0` returns 60 messages, 70% recall, 0 false alarms.

---

## 2. Pending (needs a login, a key, or a human). Tanish, these are yours

### 2.1 Pause model layer is not answering on the live site (check first)
`/api/pause/eval?set=holdout2&model=1` returns exactly the same numbers as `model=0`. The same happened for the older `holdout` set. So either the model key is missing or invalid on Render, or the call fails silently.
- Check in Render: `SARVAM_API_KEY` is set and valid. Look at Render logs while calling `?model=1`.
- Once it works, run `?set=holdout2&model=1` and compare with `model=0`. Only quote a model-assisted number if it is clearly higher. Update `README.md` ("Pause evaluation") and `docs/DEVPOST.md` ("Accomplishments") with the real numbers.
- If the model cannot be made to help, leave the docs as they are now (rules-only, honest).

### 2.2 Real PayPal buyer pop-up (never run)
Run one full join, review, pay cycle on the live site with a **US personal sandbox buyer** (developer.paypal.com, Sandbox accounts, View/Edit account shows email and password). The app should use a US Business sandbox app. Confirm authorize, partial capture (`final_capture: true`), and void behave as expected.

### 2.3 Render environment variables
Confirm all are set: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `SARVAM_API_KEY`, `CHANNEL3_API_KEY`. Confirm the Render GitHub app can access the repo. The live site shows a "PayPal sandbox" pill when PayPal keys work (locally it says "Simulated holds").

### 2.4 PayPal webhook
In the PayPal app: Webhooks, add `https://buy-together-v008.onrender.com/api/paypal/webhook`, copy the Webhook ID into `PAYPAL_WEBHOOK_ID`.

### 2.5 Channel3 real prices (untested)
`/api/market/search?q=rice` returns an empty list locally because no key is set. Test "Start a new deal" on the live site with a real product once `CHANNEL3_API_KEY` is in Render.

### 2.6 Languages and voice (untested for quality)
Needs `SARVAM_API_KEY`. Check translated group chat, assistant, voice in, voice out and receipt read-aloud. Haryanvi is sent to Sarvam as Hindi and its quality is unchecked. With no key, UI labels fall back to English.

### 2.7 Live-site click-through
Only the build, favicon and eval endpoint were checked live. After the key checks above, click through the live deal room once at desktop and phone width (including the helper approval link, an outside-agent join request, a delivery drag, pasting a seller message into Pause).

### 2.8 Submission steps (human only)
1. APIMatic: `npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview` on a laptop, then fill the claim form (only if it was really used).
2. Record the video (under 3 minutes, no music, no third-party trademarks). Script: `docs/VIDEO_SCRIPT.md`. Upload to YouTube.
3. Make the repo public.
4. Submit on Devpost using `docs/DEVPOST.md`, the video link and screenshots.

---

## 3. Known notes
- **Bryntum trial watermark** still shows on the delivery board (trial licence).
- **Demo state resets** whenever Render redeploys, and the free instance sleeps (first load about 50 s). Open the site a minute before recording.
- **AG Grid dashboard** features were not extended, only restyled. If time allows, extra columns or filters can be added in `OrderBook.tsx` and `Ledger.tsx`.
- **Submission text rule:** do not mention limitations, roadmaps, build-day plans or AI assistance in README, Devpost or the video script. This handover file is internal; delete it or leave it out when making the repo public if you prefer.
- **Run locally:** `npm install`, `npm run dev` (works without keys, with simulated holds). Tests: `UNDO_SECONDS=1 npm test`. Build: `npm run build`.
