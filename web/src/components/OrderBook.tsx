import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community';
import type { AppState, Commitment } from '../../../shared/types';
import { useT } from '../i18n';
import { usd, num } from '../api';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "Hind, 'Noto Sans Tamil', 'Noto Sans Telugu', system-ui, sans-serif",
  accentColor: '#4C4BC4',
  backgroundColor: '#FFFFFF',
  headerBackgroundColor: '#EEF1F6',
  headerFontWeight: 700,
  borderRadius: 8,
  wrapperBorderRadius: 10,
  rowHeight: 58,
  fontSize: 14,
});

interface Row { id: string; name: string; business: string; color: string; city: string; lang: string; qty: number; limit: number; held: number; stamp: string; mode: string; }

export function stampOf(c: Commitment): { key: 'held' | 'paid' | 'returned' | 'waiting'; } {
  if (c.status === 'captured') return { key: 'paid' };
  if (c.status === 'voided' || c.status === 'failed') return { key: 'returned' };
  if (c.status === 'awaiting_paypal') return { key: 'waiting' };
  return { key: 'held' };
}

export function OrderBook({ state, dealId }: { state: AppState; dealId: string }) {
  const { t } = useT();
  const rows = useMemo<Row[]>(() => state.commitments.filter(c => c.dealId === dealId).map(c => {
    const b = state.buyers.find(x => x.id === c.buyerId)!;
    const lang = state.config.languages.find(l => l.code === b.lang)!;
    return {
      id: c.id, name: b.name, business: b.business, color: b.color, city: b.city, lang: lang.native, qty: c.qty, limit: c.maxUnitPrice,
      held: c.status === 'captured' ? (c.captured ?? 0) : (c.hold?.authorized ?? 0), stamp: stampOf(c).key, mode: c.hold?.mode ?? '',
    };
  }), [state.commitments, state.buyers, state.config.languages, dealId]);

  const cols = useMemo<ColDef<Row>[]>(() => [
    {
      headerName: t('book.buyer'), field: 'name', flex: 1.4, minWidth: 170,
      cellRenderer: (p: ICellRendererParams<Row>) => p.data ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <i style={{ width: 12, height: 12, borderRadius: 3, background: p.data.color, display: 'inline-block' }} />
          <b>{p.data.name}</b><span className="muted"> {p.data.business}</span>
        </span>
      ) : null,
    },
    { headerName: t('book.city'), field: 'city', flex: 0.9, minWidth: 100 },
    { headerName: t('book.lang'), field: 'lang', flex: 0.9, minWidth: 100 },
    { headerName: t('book.qty'), field: 'qty', type: 'rightAligned', width: 100, valueFormatter: p => num(p.value), enableCellChangeFlash: true },
    { headerName: t('book.limit'), field: 'limit', type: 'rightAligned', width: 130, valueFormatter: p => usd(p.value) },
    { headerName: t('book.held'), field: 'held', type: 'rightAligned', width: 120, valueFormatter: p => usd(p.value), enableCellChangeFlash: true },
    {
      headerName: t('book.status'), field: 'stamp', width: 140,
      cellRenderer: (p: ICellRendererParams<Row>) => p.data ? <span key={p.data.stamp} className={`stamp ${p.data.stamp}`}>{t(`stamp.${p.data.stamp}` as any)}</span> : null,
    },
  ], [t]);

  return (
    <section className="card" aria-label={t('book.title')}>
      <h2>{t('book.title')}</h2>
      <div className="gridwrap">
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} getRowId={p => p.data.id} animateRows suppressCellFocus domLayout="autoHeight" />
      </div>
    </section>
  );
}
