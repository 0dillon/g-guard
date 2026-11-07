import Stripe from 'stripe';
import { db } from './db.js';

const key = process.env.STRIPE_SECRET_KEY || '';
export const stripe = key ? new Stripe(key) : null;

if (key.startsWith('sk_live')) {
  console.warn('WARNING: live Stripe key detected. Real cards will be charged.');
}

/** Returns a Stripe Checkout URL where the user saves a card for future penalties. */
export async function createCardSetupLink(user) {
  if (!stripe) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
  let customer = user.stripe_customer;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, name: user.name })).id;
    db.prepare('UPDATE users SET stripe_customer = ? WHERE id = ?').run(customer, user.id);
  }
  const base = process.env.PUBLIC_URL || 'http://localhost:8787';
  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer,
    currency: 'usd',
    payment_method_types: ['card'],
    success_url: `${base}/card-saved`,
    cancel_url: `${base}/card-cancelled`,
  });
  return session.url;
}

/**
 * Charges the pledged penalty to the user's saved card.
 * Funds land in the platform Stripe account and are recorded as owed to the friend;
 * paying the friend out (e.g. via Stripe Connect) is a separate step.
 */
export async function chargePenalty(user) {
  if (!user.penalty_cents) return 'none';
  if (!stripe) return 'stripe_not_configured';
  if (!user.stripe_customer) return 'no_card';
  const pms = await stripe.paymentMethods.list({ customer: user.stripe_customer, type: 'card', limit: 1 });
  if (!pms.data.length) return 'no_card';
  try {
    const pi = await stripe.paymentIntents.create({
      amount: user.penalty_cents,
      currency: 'usd',
      customer: user.stripe_customer,
      payment_method: pms.data[0].id,
      off_session: true,
      confirm: true,
      description: `Accountability penalty, owed to ${user.friend_name}`,
      metadata: { user_id: String(user.id), friend_email: user.friend_email },
    });
    return pi.status;
  } catch (err) {
    console.error('Stripe charge failed:', err.message);
    return 'failed';
  }
}
