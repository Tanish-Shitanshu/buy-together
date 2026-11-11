import { join, negotiateDeal, approve, settle, UNDO_MS } from './engine';
import { postMessage } from './chat';
import { store, commit, resetStore, DEAL_ID, STORY_TOTAL, sleep, addEvent } from './store';
import { config } from './config';

/** Director mode: a scripted run through the whole deal, used for the demo video. Every step
 *  calls the same engine functions as the buttons do. */

let busy = false;
export const storyBusy = () => busy;

const say = (buyerId: string, lang: any, text: string, translations: any) =>
  postMessage({ dealId: DEAL_ID, from: 'buyer', buyerId, text, lang, translations }, commit);
const agent = (text: string) => postMessage({ dealId: DEAL_ID, from: 'agent', text, lang: 'en' }, commit);

const steps: (() => Promise<void>)[] = [
  async () => {
    await say('b_ravi', 'bgc', 'म्हारै धोरै 400 कैन का काम सै। भाव कम हो ज्यै तो मैं भी जुड़ूं।', { en: 'I need 400 cans. If the price comes down, I will join.', hi: 'मुझे 400 कैन चाहिए। भाव कम हो तो मैं भी जुड़ूंगा।' });
    await join(DEAL_ID, 'b_ravi', 400, 0.74);
  },
  async () => {
    await say('b_meena', 'ta', 'நான் 600 கேன் எடுக்கிறேன். விலை நல்லா இருந்தா சேர்ந்துக்கறேன்.', { en: 'I will take 600 cans. I will join if the price is good.', hi: 'मैं 600 कैन लूंगी। भाव अच्छा हो तो जुड़ूंगी।' });
    await join(DEAL_ID, 'b_meena', 600, 0.72);
    await agent(`The group has reached 1,000 cans and more. I will ask two sellers for their best price now. Your walk-away limits stay safe with me.`);
  },
  async () => { await negotiateDeal(DEAL_ID); },
  async () => {
    await say('b_ravi', 'bgc', 'ठीक सै, भाव मंजूर सै।', { en: 'Fine, I approve the price.', hi: 'ठीक है, भाव मंजूर है।' });
    const c = store.commitments.find(x => x.dealId === DEAL_ID && x.buyerId === 'b_ravi' && x.status === 'held');
    if (c) await approve(c.id, 'yes');
  },
  async () => {
    const deal = store.deals[0];
    const wait = Math.max(0, (deal.undoUntil ?? 0) - Date.now()) + 400;
    await sleep(Math.min(wait, UNDO_MS + 1000));
    await settle(DEAL_ID);
    await agent('Done. Every share was paid separately and the unused part of each hold went back.');
  },
];

export async function storyStep(): Promise<number> {
  if (busy) return store.storyStep;
  busy = true;
  try {
    if (store.storyStep === 0) { resetStore(); addEvent(DEAL_ID, 'story', `Demo started. ${config.agentName} is watching the group.`); }
    const i = store.storyStep;
    if (i >= STORY_TOTAL) return i;
    await steps[i]();
    store.storyStep = i + 1;
    commit();
    return store.storyStep;
  } finally { busy = false; }
}

export async function storyRun() {
  while (store.storyStep < STORY_TOTAL) {
    await storyStep();
    await sleep(1500);
  }
}
