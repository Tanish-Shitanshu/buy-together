# Buy Together: plan

Strangers pool orders to reach a bulk price. An AI agent (Munim) negotiates for the group. PayPal holds each buyer's share separately. Money moves only when everyone says yes, and Pause checks every offer first.

## Rule for the code
AI reads, writes and translates. Plain code decides every price and every payment.

## Pieces
| Part | Where | Notes |
|---|---|---|
| Holds | `server/src/paypal.ts`, `engine.ts` | Orders v2 AUTHORIZE, then partial capture or void. One hold per buyer. |
| Agent | `negotiation.ts` | Arithmetic only. Model phrases the line; line is used only if it contains the exact price. |
| Pause | `pause.ts` | Price, seller, pressure words, money, group. Shared warning list. Undo window. |
| Languages | `chat.ts`, `assistant.ts` | Group chat auto-translates. Assistant answers in the user's language. UI strings translated and cached. |
| Demo | `story.ts` | Director mode: 5 scripted steps using the same engine calls as the buttons. |
| Web | `web/` | React + Vite + AG Grid. |

## API
`GET /api/state`, `GET /api/events` (SSE snapshots), `POST /api/reset`,
`POST /api/deals/:id/{join,negotiate,settle,cancel}`,
`POST /api/commitments/:id/{approve,withdraw}`, `.../paypal/{order,authorize}`,
`POST /api/{chat,assistant,i18n}`, `POST /api/demo/{step,run}`, `POST /api/paypal/webhook`.

## Sponsors
PayPal (core) · AG Grid (live order book) · Channel3 (market price check) · Render (hosting) · APIMatic (PayPal Context Plugin while building) · Bryntum (timeline, stretch).

## Cut order if time runs short
Bryntum timeline, then Channel3 live call (benchmark stays), then voice. Never cut: holds, Pause, translated chat, the demo video.
