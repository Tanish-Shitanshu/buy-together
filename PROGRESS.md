# Progress

Live: https://buy-together-v008.onrender.com (auto-deploys from main)

## Done
- Core: pooled deals, deterministic negotiation, PayPal authorize / partial capture / void, Undo window, webhook verification.
- Pause: price vs market, seller + shared scam list, pressure wording (rules + model pointers checked by code), hold coverage, limits.
- Languages + voice (Sarvam translate, STT, TTS), group chat translation, assistant.
- New deal from any product (Channel3 prices), join requests from agents (MCP at /mcp), family helper approval.
- AG Grid order book, Bryntum delivery board, Director mode.
- Pause eval on holdout (80 msgs): rules 50% recall, rules+model 67.5% recall, 2 false alarms of 40 each.
- README, PLAN, docs/VIDEO_SCRIPT.md, docs/DEVPOST.md.

## Next (Tiger only)
1. Render env: confirm PAYPAL_WEBHOOK_ID is set; re-add repo access in the Render GitHub app if needed.
2. Test the PayPal pop-up once with a US personal sandbox buyer.
3. APIMatic: run `npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview`, fill the claim form.
4. Record the video (under 3 min, no third-party music/trademarks), upload to YouTube.
5. Flip the repo public, submit on Devpost (text in docs/DEVPOST.md).

## Next (any teammate's Claude)
- Polish the AG Grid dashboard, run a full UI pass on the Render URL, improve Pause recall (add model prompt examples, extend server/eval sets).

## Teammate prompt
See HANDOFF.md.
