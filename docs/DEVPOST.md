# Devpost text

## Tagline
Strangers pool their orders to unlock bulk prices. An agent negotiates for the group. PayPal holds every share until everyone says yes.

## Inspiration
Small shop owners pay shop prices for goods that distributors sell far cheaper in bulk. Nobody can reach the bulk tiers alone, and nobody trusts a stranger with an advance payment. We wanted a place where strangers can buy together and still keep their money safe.

## What it does
- Buyers join a deal and set the highest price they accept. PayPal authorizes the money for each buyer separately. Nothing is spent.
- Munim, the group's agent, negotiates with sellers. It never goes above any buyer's limit, and it only says yes when every buyer has said yes.
- Pause checks every offer before money moves: price against the market, seller identity and a shared warning list, pressure and off-platform payment wording, hold coverage, group size and limits. It blocks bad offers with the exact words highlighted.
- Every buyer approves the final price. A family helper can be asked to check first, and hears the deal in their own language. An Undo window stays open before capture.
- PayPal captures each buyer's exact share and releases the rest of each hold. If any buyer says no, nothing is captured.
- The whole app, the group chat and the assistant work in ten Indian languages by text and voice. Messages are translated for each reader.
- Munim plans the delivery truck on a drag-and-drop board. Any buyer can start a new deal, with real shop prices from Channel3.
- Other agents can join through an MCP server. They can read deals and check seller messages, and can only ask to join. The buyer must approve before any money is held.

## How we built it
- PayPal: Orders v2 with intent AUTHORIZE, then Payments v2 partial capture or void, one authorization per buyer, webhook signature verification, PayPal-Request-Id on every write.
- Plain code decides every price and every payment. Language models only read, write and translate. The agent's offers are arithmetic, and a model-written line is used only when it contains the exact price.
- Sarvam: translation, speech to text, text to speech, and the language model for chat lines and the assistant.
- Channel3: real shop prices when a deal is created, and a cross-check when the agent starts.
- AG Grid: a themed live order book with custom cell renderers, updated over a live stream.
- Bryntum Scheduler: the delivery day board.
- Render: hosting. Node 22, TypeScript, Express, React, Vite.

## Challenges
Keeping money safe while strangers wait for each other. Holds are separate, capture happens only after every yes and the Undo window, and a final check on every hold runs just before capture.

## Accomplishments
Pause catches risky seller messages that rules alone miss. On 140 labelled seller messages written after the rules were fixed, wording rules alone found 56% of risky messages, and adding the model layer raised that to 70% with 2 false alarms on each set of ordinary messages (4 of 70).

## Built with
PayPal Orders and Payments APIs, Sarvam, Channel3, AG Grid, Bryntum Scheduler, Render, TypeScript, Node, Express, React, Vite, MCP.
