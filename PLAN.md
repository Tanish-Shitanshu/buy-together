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
| Web | `web/` | React + Vite + AG Grid + Bryntum Scheduler. |
| Agents | `mcp.ts` | MCP over HTTP. Outside agents can read, check messages and ask to join (buyer approves). |
| Helper | `engine.ts` | A family member confirms a buyer's yes through a link. |
| Delivery | `engine.ts`, `Delivery.tsx` | One truck plan, validated on the server. |

## API
`GET /api/state`, `GET /api/events` (SSE snapshots), `POST /api/reset`,
`POST /api/deals/:id/{join,negotiate,settle,cancel}`,
`POST /api/commitments/:id/{approve,withdraw}`, `.../paypal/{order,authorize}`,
`POST /api/{chat,assistant,i18n,stt,tts,deals}`, `GET /api/market/search`, `POST /api/deals/:id/schedule`, `POST /api/commitments/:id/helper[/answer]`, `POST /api/join-requests/:id/{approve,decline}`, `POST /mcp`, `GET /api/pause/eval`, `POST /api/demo/{step,run}`, `POST /api/paypal/webhook`.

## Sponsors
PayPal (core) · Sarvam (languages and voice) · AG Grid (live order book) · Channel3 (shop prices) · Bryntum (delivery board) · Render (hosting).

