import { useEffect, useState } from 'react';
import type { AppState } from '../../shared/types';

export async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any).error ?? `Request failed (${r.status})`);
  return j as T;
}

/** Live state: one EventSource, full snapshots. */
export function useAppState(): { state: AppState | null; online: boolean } {
  const [state, setState] = useState<AppState | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    const open = () => {
      es = new EventSource('/api/events');
      es.onopen = () => setOnline(true);
      es.onmessage = e => { try { setState(JSON.parse(e.data)); } catch { /* ignore */ } };
      es.onerror = () => { setOnline(false); es?.close(); if (!closed) setTimeout(open, 1500); };
    };
    open();
    return () => { closed = true; es?.close(); };
  }, []);
  return { state, online };
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const usd0 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num = (n: number) => n.toLocaleString('en-US');
