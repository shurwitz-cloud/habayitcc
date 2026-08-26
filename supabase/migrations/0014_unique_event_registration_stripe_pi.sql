-- Prevent form+webhook race from creating two rows for the same Stripe charge.
create unique index if not exists idx_event_registrations_stripe_pi_unique
  on event_registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
