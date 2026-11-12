<p align="center"><img src="docs/img/thumbnail.jpg" alt="Buy Together: group buying where nobody has to trust anyone" width="100%"></p>

# Buy Together: Safe Group Buying with PayPal
**Group buying where nobody has to trust anyone.** Shops pool one order to reach a wholesale price. PayPal holds each buyer's money separately, an AI agent negotiates inside every buyer's limit, and a scam check reads every offer before money moves.

Built by Tanish Shitanshu, Mohit and Aarnav for the **PayPal AI Hackathon**.

| | |
|---|---|
| Live demo | https://buy-together-scx9.onrender.com/ |
| Demo video (2:51) | YOUTUBE_LINK_HERE |
| Code | https://github.com/Tanish-Shitanshu/buy-together (MIT) |
| Devpost | https://devpost.com/submit-to/31302-paypal-ai-hackathon/ |

## Try it in 30 seconds
1. Open the live demo. No login is needed.
2. Click **Next step** in the bottom bar to walk through Pool, Protect and Pay, or **Play whole demo** for the full run.
3. Click **Ask Ronnie** to ask about the deal by typing or voice, and use the **Language** menu to switch language.

## The problem
A shopkeeper pays $0.95 for a can that costs $0.70 in bulk. Pooling would fix it, but pooling means sending money to strangers, and India lost about ₹19,813 crore to cyber fraud in 2025 (I4C). About 13 million kirana shops keep overpaying. Buy Together removes the need to trust anyone.

## Where we score: the judging criteria
| Criterion | What we did and where to see it |
|---|---|
| **Technological implementation** | PayPal Orders v2 `AUTHORIZE` per buyer, partial capture for each exact share, void for the rest, signed webhooks and a pre-flight check (`server/src/paypal.ts`, `server/src/engine.ts`). AI reads, writes and translates while plain code decides every price and limit. Scam check measured on unseen messages (see Pause evaluation). Live on Render with an MCP server. |
| **Design** | One screen for the whole deal: live price ladder, group chat in each reader's language, scam check, order book and delivery board. Ten languages, voice assistant Ronnie, family helper approval and an undo window. See the screenshots below. |
| **Potential impact** | About 13 million kirana shops in India overpay because pooling is unsafe. In our demo, 1,530 cans came to $0.64 against a $1.05 market price, saving $627.30. The same flow works for any group buy. |
| **Quality of the idea** | Pooled buying where no pooled wallet ever exists: every buyer's money stays in their own PayPal account until they approve. Agents negotiate, but only a human approves money. |
| **Presentation** | A 2:51 video with the real product and a spoken Hindi answer from Ronnie, this README, and a one-click demo. |

## Screenshots
| | |
|---|---|
| ![Home](docs/img/shot-01.jpg) | ![Price falls](docs/img/shot-02.jpg) |
| ![Join with a hold](docs/img/shot-03.jpg) | ![PayPal approval](docs/img/shot-04.jpg) |
| ![Pause blocks a scam offer](docs/img/shot-05.jpg) | ![Pause evaluation](docs/img/shot-06.jpg) |
| ![Exact shares](docs/img/shot-07.jpg) | ![Undo window](docs/img/shot-08.jpg) |
| ![Saved together](docs/img/shot-09.jpg) | ![PayPal ledger](docs/img/shot-10.jpg) |
| ![Delivery board](docs/img/shot-11.jpg) | ![Ronnie](docs/img/shot-12.jpg) |
| ![Tamil](docs/img/shot-13.jpg) | ![Stack](docs/img/shot-14.jpg) |
| ![Principle](docs/img/shot-15.jpg) | |

## Where each tool is used
| Tool | What it does in Buy Together |
|---|---|
| **PayPal** (required) | Separate authorized hold per buyer, partial capture, void, webhooks (sandbox) |
| **Sarvam AI** (AI) | sarvam-105b for Munim and Ronnie, Mayura translation, Saaras speech to text, Bulbul voice, 10 Indian languages |
| **Channel3** | Real shop prices when starting a new deal |
| **Bryntum Scheduler** | Delivery day board: one truck, one stop per shop |
| **AG Grid** | Live order book and PayPal ledger (Held, Spent, Returned) |
| **Render** | Hosts the live demo (`render.yaml`) |

## How a deal works
1. A buyer joins with a quantity and the highest price they accept. PayPal authorizes that amount for the buyer alone. Nothing is spent.
2. When the group is large enough, Munim asks sellers for quotes and negotiates. It never goes above the lowest limit in the group.
3. Pause checks every offer: price against the market, seller and shared warning list, pressure wording, hold coverage, group and limits. Bad offers are blocked and the risky words are highlighted.
4. Each buyer approves the final price. A family helper can be asked to check first and hears the deal in their own language.
5. After the Undo window closes, PayPal captures each buyer's exact share (partial capture) and releases the rest. If anyone says no, nothing is captured.
6. Munim plans one delivery truck with a stop at every shop. Stops can be dragged to new times.

Rule for the code: models read, write and translate. Plain code decides every price and every payment.

## Features
- Ten languages in the app and group chat (messages translated for each reader).
- Ronnie, a voice assistant that follows the cursor. Call its name in any app language (for example "Ronnie, इस डील में मेरा हिस्सा कितना है?") and it answers in the same language, as text and, if you switch speech on, as voice. A speaker switch and a Stop button control the audio. Ronnie explains and suggests; every payment is still a button you press.
- Start a deal for any product. Channel3 shows real shop prices to set the usual price.
- Live order book and PayPal ledger (AG Grid): every hold, what was spent and what was returned, with totals and search.
- Delivery day board (Bryntum Scheduler).
- Invite link for other shops (WhatsApp or copy).
- Family helper approval through a link.
- Shared warning list across buying groups.
- MCP server at `/mcp` for other agents.
- Director mode: a scripted five-step run of the full flow, using the same calls as the buttons.

## PayPal
Orders v2 `intent=AUTHORIZE` per buyer, then Payments v2 capture (partial amount, `final_capture: true`) or void. A pre-flight check on every authorization runs just before capture. `PayPal-Request-Id` on every write. Webhooks are verified with `/v1/notifications/verify-webhook-signature` at `/api/paypal/webhook`. Buyers approve in the PayPal pop-up (JS SDK, `intent=authorize`).

## Sponsors
| Sponsor | Where |
|---|---|
| PayPal | `server/src/paypal.ts`, `server/src/engine.ts` |
| Sarvam | `server/src/sarvam.ts`, `server/src/chat.ts`, `server/src/llm.ts`, voice in `web/src/components/voice.ts`, Ronnie in `web/src/components/Ronnie.tsx` |
| Channel3 | `server/src/market.ts`, New deal panel |
| AG Grid | `web/src/components/OrderBook.tsx` |
| Bryntum | `web/src/components/Delivery.tsx` |
| Render | `render.yaml` |

## Pause evaluation
Labelled seller messages are in `server/eval` (`dev`, `test`, `fresh`, `holdout`, `holdout2`, `holdout3`). `holdout2` and `holdout3` were written after the wording rules they test and never used to tune them. Wording rules alone flag 70% of the 30 risky messages in `holdout2` with 0 false alarms on 30 ordinary ones, and 80% of the 30 risky messages in `holdout3` with 1 false alarm on 30 ordinary ones. The older sets were used while building the rules, so their higher scores are not a fair test. Run `npx tsx server/eval/run.ts holdout3.json` from the repo root. The live app exposes `/api/pause/eval?set=holdout3&model=1` to include the model layer.

Two sets written after the rules were fixed: `holdout.json` (80 messages, 40 risky) and `fresh.json` (60 messages, 30 risky).

| Set | Check | Risky messages caught | False alarms on ordinary |
|---|---|---|---|
| holdout | Wording rules | 50% | 2 of 40 |
| holdout | Wording rules + model pointers | 65% | 2 of 40 |
| fresh | Wording rules | 63.3% | 2 of 30 |
| fresh | Wording rules + model pointers | 76.7% | 2 of 30 |

The model only points at words. Code checks that every phrase really appears in the message, and code alone decides the result.

## MCP
`POST /mcp` (JSON-RPC). Tools: `list_deals`, `get_deal`, `check_message`, `check_seller`, `request_join`. `request_join` creates a request that the buyer must approve in the app before any money is held.

## Run it
```
npm install
cp .env.example .env     # add keys; with no PayPal keys it runs with simulated holds
npm run dev              # web on :5173, API on :8787
npm test
npm run build && npm start
```
Environment: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `SARVAM_API_KEY`, `CHANNEL3_API_KEY`, `UNDO_SECONDS`.

## Layout
`server/` Express API, engine, Pause, negotiation, translation. `web/` React app. `shared/` types. `docs/` video script and Devpost text.

License: MIT.
