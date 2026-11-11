import type { AppState } from '../../../shared/types';
import { useT } from '../i18n';
import { post, usd0, usd, num } from '../api';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

/** Join requests from outside agents (through MCP). Nothing is held until the buyer says yes. */
export function AgentRequests({ state, viewAs, dealId, act }: { state: AppState; viewAs: string; dealId: string; act: Act }) {
  const { t } = useT();
  const sandbox = state.config.paypalMode === 'sandbox';
  const list = state.joinRequests.filter(r => r.buyerId === viewAs && r.dealId === dealId && r.status === 'pending');
  if (!list.length) return null;
  const deal = state.deals.find(d => d.id === dealId)!;
  return (
    <section className="card agentreq" aria-live="polite">
      {list.map(r => (
        <div key={r.id}>
          <h2>{t('req.title', { a: r.agent })}</h2>
          <p>{t('req.body', { n: num(r.qty), u: deal.product.unit + 's', p: usd(r.maxUnitPrice), h: usd0(r.qty * r.maxUnitPrice) })}</p>
          <div className="row">
            <button className="btn good" onClick={() => act(() => post(`/api/join-requests/${r.id}/approve`, { interactive: sandbox }))}>{t('req.yes')}</button>
            <button className="btn ghost" onClick={() => act(() => post(`/api/join-requests/${r.id}/decline`))}>{t('req.no')}</button>
          </div>
        </div>
      ))}
    </section>
  );
}
