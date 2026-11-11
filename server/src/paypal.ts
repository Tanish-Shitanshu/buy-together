import crypto from 'node:crypto';
import { config } from './config';

/** Thin PayPal REST client. Real sandbox calls only. Holds use Orders v2 intent=AUTHORIZE,
 *  then Payments v2 capture (partial, final) or void. Every POST carries PayPal-Request-Id. */

let tokenCache: { value: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.value;
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.secret}`).toString('base64');
  const r = await fetch(`${config.paypal.base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`PayPal auth failed ${r.status}: ${await r.text()}`);
  const j: any = await r.json();
  tokenCache = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: any, msg: string) { super(msg); }
}

async function call<T = any>(path: string, method: 'GET' | 'POST', body?: unknown, requestId?: string, extra: Record<string, string> = {}): Promise<T> {
  const t = await token();
  const headers: Record<string, string> = {
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
    ...extra,
  };
  if (method === 'POST') headers['paypal-request-id'] = requestId ?? crypto.randomUUID();
  const r = await fetch(`${config.paypal.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) {
    const issue = json?.details?.[0]?.issue || json?.name || 'ERROR';
    throw new PayPalError(r.status, json, `PayPal ${method} ${path} -> ${r.status} ${issue}: ${json?.message ?? ''}`.trim());
  }
  return json as T;
}

const money = (v: number) => v.toFixed(2);

export interface AuthResult { orderId: string; authorizationId?: string; status: string }

/** Create an AUTHORIZE order. With `card` the order is authorized immediately (server-side test card). */
export async function createAuthorizeOrder(p: {
  amount: number; currency: string; customId: string; description: string; requestId: string;
  card?: { number: string; expiry: string; cvv: string; name: string };
}): Promise<AuthResult> {
  const body: any = {
    intent: 'AUTHORIZE',
    purchase_units: [{
      custom_id: p.customId,
      description: p.description.slice(0, 120),
      amount: { currency_code: p.currency, value: money(p.amount) },
    }],
  };
  if (p.card) {
    body.payment_source = { card: { number: p.card.number, expiry: p.card.expiry, security_code: p.card.cvv, name: p.card.name } };
  }
  const j = await call('/v2/checkout/orders', 'POST', body, p.requestId);
  const auth = j.purchase_units?.[0]?.payments?.authorizations?.[0];
  return { orderId: j.id, authorizationId: auth?.id, status: j.status };
}

/** After the buyer approves in the PayPal popup, authorize the order. */
export async function authorizeOrder(orderId: string, requestId: string): Promise<AuthResult> {
  const j = await call(`/v2/checkout/orders/${orderId}/authorize`, 'POST', {}, requestId);
  const auth = j.purchase_units?.[0]?.payments?.authorizations?.[0];
  return { orderId: j.id, authorizationId: auth?.id, status: j.status };
}

/** Capture less than (or equal to) the authorized amount. final_capture releases the remainder. */
export async function capture(authId: string, amount: number, currency: string, requestId: string, invoiceId?: string) {
  const j = await call(`/v2/payments/authorizations/${authId}/capture`, 'POST', {
    amount: { currency_code: currency, value: money(amount) },
    final_capture: true,
    ...(invoiceId ? { invoice_id: invoiceId } : {}),
  }, requestId);
  return { captureId: j.id as string, status: j.status as string };
}

export async function voidAuthorization(authId: string, requestId: string) {
  await call(`/v2/payments/authorizations/${authId}/void`, 'POST', undefined, requestId);
}

export async function getAuthorization(authId: string) {
  return call(`/v2/payments/authorizations/${authId}`, 'GET');
}

/** Verify a webhook with PayPal's own verification endpoint. */
export async function verifyWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
  if (!config.paypal.webhookId) return false;
  const h = (k: string) => String(headers[k] ?? '');
  try {
    const j = await call('/v1/notifications/verify-webhook-signature', 'POST', {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    });
    return j.verification_status === 'SUCCESS';
  } catch { return false; }
}
