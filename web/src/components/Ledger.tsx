import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import type { AppState } from '../../../shared/types';
import { useT } from '../i18n';
import { usd } from '../api';
import { stampOf } from './OrderBook';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "Hind, 'Noto Sans Tamil', 'Noto Sans Telugu', system-ui, sans-serif",
  accentColor: '#4C4BC4', backgroundColor: '#FFFFFF', headerBackgroundColor: '#EEF1F6',
  headerFontWeight: 700, borderRadius: 8, wrapperBorderRadius: 10, rowHeight: 46, fontSize: 14,
});

interface Row { id: string; name: string; color: string; order: string; auth: string; mode: string; held: number; spent: number; back: number; stamp: string; total?: boolean }

const short = (s?: string) => (s ? (s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-4)}` : s) : '—');

/** Every buyer's PayPal hold, one row each: what was set aside, what was spent, what came back. */
export function Ledger({ state, dealId }: { state: AppState; dealId: string }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const rows = useMemo<Row[]>(() => state.commitments.filter(c => c.dealId === dealId && c.hold).map(c => {
    const b = state.buyers.find(x => x.id === c.buyerId)!;
    const held = c.hold!.authorized;
    const st = stampOf(c).key;
    const spent = st === 'paid' ? (c.captured ?? 0) : 0;
    const back = st === 'paid' ? Math.max(0, +(held - spent).toFixed(2)) : st === 'returned' ? held : 0;
    return { id: c.id, name: b.name, color: b.color, order: c.hold!.orderId ?? '', auth: c.hold!.authorizationId ?? '', mode: c.hold!.mode, held, spent, back, stamp: st };
  }), [state.commitments, state.buyers, dealId]);

  const totals = useMemo<Row[]>(() => [{
    id: 'total', name: t('ledger.total'), color: '', order: '', auth: '', mode: '', total: true, stamp: '',
    held: rows.reduce((a, r) => a + (r.stamp === 'held' ? r.held : 0), 0),
    spent: rows.reduce((a, r) => a + r.spent, 0),
    back: rows.reduce((a, r) => a + r.back, 0),
  }], [rows, t]);

  const cols = useMemo<ColDef<Row>[]>(() => [
    {
      headerName: t('book.buyer'), field: 'name', flex: 1.1, minWidth: 130,
      cellRenderer: (p: ICellRendererParams<Row>) => p.data ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {p.data.color && <i style={{ width: 12, height: 12, borderRadius: 3, background: p.data.color, display: 'inline-block' }} />}
          <b>{p.data.name}</b>
        </span>
      ) : null,
    },
    { headerName: t('ledger.order'), field: 'order', flex: 1, minWidth: 120, valueFormatter: p => short(p.value), tooltipField: 'order', cellClass: 'mono' },
    { headerName: t('ledger.auth'), field: 'auth', flex: 1, minWidth: 120, valueFormatter: p => short(p.value), tooltipField: 'auth', cellClass: 'mono' },
    { headerName: t('ledger.mode'), field: 'mode', width: 120, valueFormatter: p => (p.value === 'paypal' ? t('ledger.live') : p.value ? t('ledger.sim') : '') },
    { headerName: t('book.held'), field: 'held', type: 'rightAligned', width: 115, valueFormatter: p => usd(p.value), enableCellChangeFlash: true },
    { headerName: t('ledger.spent'), field: 'spent', type: 'rightAligned', width: 115, valueFormatter: p => usd(p.value), enableCellChangeFlash: true },
    { headerName: t('ledger.back'), field: 'back', type: 'rightAligned', width: 125, valueFormatter: p => usd(p.value), enableCellChangeFlash: true },
    {
      headerName: t('book.status'), field: 'stamp', width: 130,
      cellRenderer: (p: ICellRendererParams<Row>) => p.data && p.data.stamp ? <span key={p.data.stamp} className={`stamp ${p.data.stamp}`}>{t(`stamp.${p.data.stamp}` as any)}</span> : null,
    },
  ], [t]);

  if (!rows.length) return null;
  return (
    <section className="card ledger" aria-label={t('ledger.title')}>
      <div className="ledgerhead">
        <h2>{t('ledger.title')}</h2>
        <input className="gridfilter" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('ledger.search')} aria-label={t('ledger.search')} />
      </div>
      <p className="muted small">{t('ledger.note')}</p>
      <div className="gridwrap ledgergrid">
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} getRowId={p => p.data.id} quickFilterText={q}
          pinnedBottomRowData={totals} defaultColDef={{ sortable: true, resizable: true }} animateRows suppressCellFocus domLayout="autoHeight" tooltipShowDelay={200}
          getRowClass={p => (p.node.rowPinned ? 'totalrow' : '')} />
      </div>
    </section>
  );
}
