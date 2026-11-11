import { useEffect, useRef } from 'react';
import { Scheduler } from '@bryntum/scheduler';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import '@bryntum/scheduler/fontawesome/css/fontawesome.css';
import '@bryntum/scheduler/fontawesome/css/solid.css';
import type { AppState, Deal } from '../../../shared/types';
import { useT } from '../i18n';
import { post, num } from '../api';

type Act = (fn: () => Promise<unknown>) => Promise<void>;

const dayStart = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
const at = (min: number) => new Date(dayStart().getTime() + min * 60000);
const minOf = (d: Date) => Math.round((d.getTime() - dayStart().getTime()) / 60000);

/** Delivery board (Bryntum Scheduler): one truck, one stop per paying shop. Munim plans it; buyers drag stops to change it. */
export function Delivery({ state, deal, act }: { state: AppState; deal: Deal; act: Act }) {
  const { t } = useT();
  const host = useRef<HTMLDivElement>(null);
  const sched = useRef<Scheduler | null>(null);
  const slots = deal.delivery ?? [];
  const editable = deal.status === 'review';
  const actRef = useRef(act); actRef.current = act;
  const slotsRef = useRef(slots); slotsRef.current = slots;

  useEffect(() => {
    if (!host.current) return;
    const s = new Scheduler({
      appendTo: host.current,
      height: 60 + Math.max(2, slots.length) * 54 + 44,
      startDate: at(-30), endDate: at(Math.max(...slots.map(x => x.endMin), 240) + 60),
      viewPreset: { base: 'hourAndDay', tickWidth: 112 } as any,
      rowHeight: 50, barMargin: 7, eventStyle: 'filled',
      columns: [{ text: t('del.shop'), field: 'name', width: 190 }],
      features: { eventDrag: { constrainDragToResource: true }, eventResize: true, eventEdit: false, eventMenu: false, scheduleMenu: false, cellEdit: false, columnLines: true, timeRanges: false } as any,
      readOnly: !editable,
      resources: [], events: [],
      listeners: {
        eventDrop: () => save(), eventResizeEnd: () => save(),
      } as any,
    });
    const save = () => {
      const next = (s.eventStore.records as any[]).map(e => ({ buyerId: e.resourceId, startMin: minOf(e.startDate), endMin: minOf(e.endDate) }));
      actRef.current(async () => {
        try { await post(`/api/deals/${deal.id}/schedule`, { slots: next }); }
        catch (e) { paint(); throw e; }
      });
    };
    const paint = () => {
      s.resourceStore.data = slotsRef.current.map(x => { const b = state.buyers.find(y => y.id === x.buyerId)!; return { id: x.buyerId, name: `${b.name}, ${b.city}` }; });
      s.eventStore.data = slotsRef.current.map(x => {
        const b = state.buyers.find(y => y.id === x.buyerId)!;
        const c = state.commitments.find(y => y.dealId === deal.id && y.buyerId === x.buyerId && (y.status === 'held' || y.status === 'captured'));
        return { id: `s_${x.buyerId}`, resourceId: x.buyerId, startDate: at(x.startMin), endDate: at(x.endMin), name: `${num(c?.qty ?? 0)} ${deal.product.unit}s`, style: `background:${b.color};border-color:${b.color};color:#fff`, draggable: editable, resizable: editable };
      });
    };
    sched.current = s;
    (s as any).__paint = paint;
    paint();
    return () => { s.destroy(); sched.current = null; };
  }, [deal.id, editable]);

  useEffect(() => { (sched.current as any)?.__paint?.(); }, [JSON.stringify(slots), state.commitments.length]);

  if (!slots.length) return null;
  const last = Math.max(...slots.map(x => x.endMin));
  const done = at(last);
  return (
    <section className="card delivery">
      <h2>{t('del.title')}</h2>
      <p className="muted" style={{ marginTop: -4 }}>{editable ? t('del.sub') : t('del.sub.done')} {t('del.end', { h: done.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })}</p>
      <div ref={host} className="schedhost" />
    </section>
  );
}
