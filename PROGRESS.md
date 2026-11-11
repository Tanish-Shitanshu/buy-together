# Progress

Updated by whoever works last. Newest first.

## Done
- Monorepo scaffold, shared types, config.
- Server: store + seed, engine (join / hold / negotiate / approve / undo / pay / cancel), Pause, negotiation, chat translation, assistant, i18n, director mode, API, PayPal client.
- 6 server tests pass (`npm test`). Runs with simulated holds when no PayPal keys are set.

## Next
1. Web app (`web/`): deal room, stack and rate board, AG Grid order book, chat, assistant with voice, Pause panel, director controls.
2. Real PayPal sandbox: set keys in `.env`, test the buyer popup, a card-funded hold for demo buyers, webhook.
3. Channel3 live price check in `server/src/market.ts` (`channel3Median`).
4. Render deploy (`render.yaml`), README, video script, Devpost text.

## Needs from Tiger
PayPal sandbox Client ID and Secret (US Business and US Personal sandbox accounts), an AI key, Channel3 key, Render connection, empty private GitHub repo.
