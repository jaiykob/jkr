/**
 * A fake Stripe for the tests and the score server. It is installed in the
 * require cache, so the real API handlers (api/*.js) run against it without
 * network. Every call is recorded as [kind, params, options] in `calls`.
 *
 *   const { calls, state } = installFakeStripe({ decline: 'card_declined' });
 *
 * opts.decline: 'card_declined' | 'authentication_required' makes an
 *   off_session paymentIntents.create throw a StripeCardError with that code.
 * opts.offSessionStatus: an off_session paymentIntents.create returns this
 *   status instead of 'succeeded' ('processing', 'requires_action', ...).
 * opts.cancelFails: paymentIntents.cancel throws (a payment Stripe cannot cancel).
 * opts.refundFails: refunds.create throws a StripeAPIError.
 * state.claimed is how many founding customers with a saved card "exist"
 *   (customers.search); state.abandoned, founding customers without one.
 * state.paymentIntents: id -> PaymentIntent, read by paymentIntents.retrieve
 *   (a booking PaymentIntent is stored here when created; a test may add one).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');

let ctx = null;
let installed = false;
let seq = 0;

class FakeStripe {
  constructor() {
    const { calls, state, opts } = ctx;
    const next = (p) => `${p}_${++seq}`;
    // Real Stripe: the same idempotency key with other params is an error; with the same params, the original object.
    const seen = ctx.seen;
    const idem = async (o, p, make) => {
      const key = o && o.idempotencyKey;
      if (!key) return make();
      const sig = JSON.stringify(p);
      if (seen.has(key)) {
        const prev = seen.get(key);
        if (prev.sig !== sig) {
          const e = new Error('Keys for idempotent requests can only be used with the same parameters they were first used with.');
          e.type = 'StripeIdempotencyError';
          throw e;
        }
        return prev.result;
      }
      const result = await make();
      seen.set(key, { sig, result });
      return result;
    };
    this.customers = {
      create: async (p, o) => { calls.push(['customer', p, o]); return idem(o, p, async () => ({ id: next('cus'), ...p })); },
      update: async (id, p) => { calls.push(['customer-update', { id, ...p }]); return { id, ...p }; },
      retrieve: async (id) => ({ id, metadata: {}, invoice_settings: {} }),
      search: async () => ({ data: [
        ...Array.from({ length: state.claimed }, () => ({ metadata: { founding: 'true' }, invoice_settings: { default_payment_method: 'pm_1' } })),
        ...Array.from({ length: state.abandoned || 0 }, () => ({ metadata: { founding: 'true' }, invoice_settings: { default_payment_method: null } })),
      ], has_more: false }),
    };
    // Kept so a test can prove nothing calls it (no SetupIntent at booking since pay at booking).
    this.setupIntents = {
      create: async (p, o) => {
        calls.push(['si', p, o]);
        return idem(o, p, async () => ({ id: next('seti'), client_secret: 'seti_secret', status: 'requires_payment_method', customer: p.customer, metadata: p.metadata || {}, payment_method: null }));
      },
      retrieve: async (id) => ({ id, status: 'succeeded', metadata: {}, payment_method: 'pm_1' }),
    };
    this.paymentIntents = {
      create: async (p, o) => {
        calls.push(['pi', p, o]);
        if (opts.decline && p.off_session) {
          const e = new Error(opts.decline === 'authentication_required' ? 'Authentication required' : 'Your card was declined.');
          e.type = 'StripeCardError';
          e.code = opts.decline;
          throw e;
        }
        return idem(o, p, async () => {
          // Off session (after the job): confirmed on the spot. A booking: the page confirms it.
          const status = p.off_session ? (opts.offSessionStatus || 'succeeded') : 'requires_payment_method';
          const pi = { id: next('pi'), client_secret: `pi_secret_${seq}`, amount: p.amount, currency: p.currency, customer: p.customer,
            status, setup_future_usage: p.setup_future_usage || null, metadata: p.metadata || {} };
          state.paymentIntents[pi.id] = pi;
          return pi;
        });
      },
      retrieve: async (id) => state.paymentIntents[id] || { id, status: 'succeeded', amount: null, amount_received: null, metadata: {} },
      update: async (id, p) => { calls.push(['pi-update', { id, ...p }]); return { id, ...p }; },
      cancel: async (id) => {
        calls.push(['pi-cancel', { id }]);
        if (opts.cancelFails) { const e = new Error('This PaymentIntent could not be canceled.'); e.type = 'StripeInvalidRequestError'; throw e; }
        if (state.paymentIntents[id]) state.paymentIntents[id].status = 'canceled';
        return { id, status: 'canceled' };
      },
      search: async () => ({ data: [], has_more: false }),
    };
    this.refunds = {
      create: async (p, o) => {
        calls.push(['refund', p, o]);
        if (opts.refundFails) { const e = new Error('An error occurred with our connection to Stripe.'); e.type = 'StripeAPIError'; throw e; }
        return idem(o, p, async () => ({ id: next('re'), amount: p.amount, payment_intent: p.payment_intent, status: 'succeeded', metadata: p.metadata || {} }));
      },
    };
    this.invoiceItems = { create: async (p) => { calls.push(['invoice-item', p]); return { id: next('ii'), ...p }; } };
    this.invoices = {
      create: async (p) => { calls.push(['invoice', p]); return { id: next('in'), ...p }; },
      finalizeInvoice: async (id) => { calls.push(['finalize', { id }]); return { id, payment_intent: `pi_for_${id}`, hosted_invoice_url: `https://invoice.example/${id}` }; },
      sendInvoice: async (id) => { calls.push(['send-invoice', { id }]); return { id, hosted_invoice_url: `https://invoice.example/${id}` }; },
    };
    this.subscriptions = {
      create: async (p) => {
        calls.push(['sub', p]);
        return { id: 'sub_1', latest_invoice: { amount_due: p.items[0].price_data.unit_amount, payment_intent: { client_secret: 'inv_secret' } } };
      },
      search: async () => ({ data: Array.from({ length: state.claimed }, () => ({ status: 'active' })), has_more: false }),
    };
    this.coupons = {
      retrieve: async () => { const e = new Error('none'); e.code = 'resource_missing'; throw e; },
      create: async (p) => { calls.push(['coupon', p]); return { id: p.id }; },
    };
  }
}

/** Install (or re-install with new options) the fake. Returns { calls, state }. */
export function installFakeStripe(opts = {}) {
  ctx = { seen: new Map(), calls: [], state: { claimed: 0, abandoned: 0, paymentIntents: {} }, opts };
  if (!installed) {
    const load = Module._load;
    Module._load = function (req, ...rest) { return req === 'stripe' ? FakeStripe : load.call(this, req, ...rest); };
    installed = true;
  }
  return { calls: ctx.calls, state: ctx.state };
}
