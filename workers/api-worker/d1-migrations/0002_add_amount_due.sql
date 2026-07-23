-- Server-authoritative order quote: register price + drift headroom +
-- fulfilment gas fee (in payment-token units), fixed at order time. The
-- self-pay settle route requires the minted voucher to carry at least this
-- amount. Nullable: legacy rows fall back to a live-price check.
ALTER TABLE crossmint_orders ADD COLUMN amount_due TEXT;
