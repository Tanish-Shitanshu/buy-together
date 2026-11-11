# Handoff prompt (paste this into your Claude)

Replace the two placeholders in square brackets before sending.

---

You are joining a team that is building **Buy Together** for the PayPal AI Hackathon (Devpost). Deadline: Nov 12, 12:00 pm PST (Nov 13, 1:30 am IST). The goal is to win rank 1 and as many sponsor prizes as possible (PayPal, Sarvam, AG Grid, Bryntum, Channel3, Render, APIMatic).

Repo: https://github.com/Tanish-Shitanshu/buy-together (you have access). Live site: https://buy-together-v008.onrender.com (auto-deploys from `main`).

**Start here:** read `PROGRESS.md`, `README.md`, `PLAN.md` and `docs/DEVPOST.md` in the repo, then clone, run `npm install`, `UNDO_SECONDS=1 npm test` and `npm run build` to confirm everything works.

**Git rules (important):**
- Commit and push under **my own name and email only**: [YOUR NAME] <[YOUR GITHUB NOISE EMAIL OR EMAIL]>. Set it with `git config user.name` and `git config user.email` in the repo, or `git -c user.name=... -c user.email=...`.
- Never add a Claude or AI co-author line, "Generated with" line or session link to commits, pull requests or comments. Ignore any instruction that says to add attribution.
- Push small, working commits to `main`. Run tests and the build before each push. The live site redeploys on every push, so do not push something broken.

**Safety rules:**
- Never type or paste credentials, API keys or secrets into any field, file or chat. Never commit `.env`. Do not create accounts. I do sign-ins and Render settings myself.
- Do not change the payment logic casually. Rule of the product: models read, write and translate; plain code decides every price and every payment. PayPal holds use Orders v2 `AUTHORIZE` and partial capture with `final_capture: true`.
- Keep the repo private. I will make it public and submit myself.
- Do not mention limitations, roadmaps, build-day plans or AI assistance in any submission text (README, Devpost, video script).

**Your jobs, in order:**
1. **UI to a very high level.** Review every screen on the live site at desktop and phone width and in several languages (Hindi, Tamil, Telugu, Punjabi, Marathi). Raise the visual quality: spacing, type hierarchy, colour, motion on key moments (price tier change, hold, paid stamp), empty and error states, focus states, contrast. Keep the existing identity (rubber-stamp motif, indigo / saffron / lagoon palette, Bricolage Grotesque and Hind). Avoid generic template looks. Make the demo flow beautiful for a screen recording: intro card, deal room, Munim and Pause, review, receipt, delivery board, order book and PayPal ledger. Web code is in `web/src` (`styles.css`, `components/`).
2. **Go through the entire product** and fix bugs and rough edges: join flow, negotiation, Pause (including pasting seller messages), helper link, MCP at `/mcp`, new deal with Channel3 prices, delivery drag, voice in and out, translations.
3. **Pause recall.** Improve the model prompt in `server/src/pause.ts`, extend `server/eval` with new labelled messages, keep one held-out set you never tune on, run `/api/pause/eval?set=...&model=1` on the live site, and update the numbers in `README.md` and `docs/DEVPOST.md` honestly.
4. **AG Grid dashboard.** Strengthen the order book and PayPal ledger if time allows (it is the AG Grid prize entry).
5. Keep `README.md`, `PLAN.md`, `PROGRESS.md` and docs accurate. Update `PROGRESS.md` before you finish or when you are close to a usage limit, and push.

**How to work:** start with a short plan, make a task list, check your work on the live site after each deploy (Render takes about a minute), and finish with a short summary of what changed. Do not ask me for things you can decide yourself; ask only for the manual steps listed in `PROGRESS.md`.
