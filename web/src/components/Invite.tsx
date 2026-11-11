import { useState } from 'react';
import type { Deal } from '../../../shared/types';
import { useT } from '../i18n';
import { usd } from '../api';

/** Share the deal with other shop owners: a link that opens this deal, ready to send on WhatsApp. */
export function Invite({ deal }: { deal: Deal }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/?deal=${encodeURIComponent(deal.id)}`;
  const top = deal.tiers[deal.tiers.length - 1];
  const text = t('invite.text', { p: deal.product.name, price: usd(top.unitPrice), n: String(top.minQty) });
  const copy = async () => { try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  return (
    <div className="invite">
      <span>{t('invite.title')}</span>
      <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <button className="btn" onClick={copy}>{copied ? t('invite.copied') : t('invite.copy')}</button>
    </div>
  );
}
