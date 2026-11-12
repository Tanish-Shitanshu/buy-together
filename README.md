# Buy Together

Strangers pool their orders to reach a bulk price. Munim, the group's agent, negotiates for everyone. PayPal holds each buyer's share separately, and money moves only when every buyer has said yes.

Live demo: https://buy-together-scx9.onrender.com

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
