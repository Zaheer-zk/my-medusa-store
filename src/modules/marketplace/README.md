# Marketplace Module

This module introduces multi-vendor primitives:

- `seller`: Seller profile and commission settings.
- `seller_order`: Seller-specific order split record with commission and net payout totals.
- Links:
  - `product_seller` to associate products to sellers.
  - `order_seller` to associate orders to sellers.
  - `user_seller` to associate admin users to a seller scope.

## Runtime Flow

1. Product ownership is managed through `product_seller` links.
2. On `order.placed`, the subscriber executes `marketplace-split-order-by-seller`.
3. The workflow:
   - derives seller ownership from ordered products,
   - computes commission and net totals per seller,
   - persists `seller_order` records,
   - ensures `order_seller` links exist.

## Payments

- Checkout providers are configured through `@medusajs/payment` as:
  - Paytm (`pp_paytm_paytm`)
  - PhonePe (`pp_phonepe_phonepe`)
- Seller payout transfers still use Stripe Connect (`transfers.create`) after order completion.
- Optional auto-payout on `order.completed` is controlled with:
  - `MARKETPLACE_AUTO_PAYOUT_ON_ORDER_COMPLETED=true`

### Connect onboarding

- Endpoint: `POST /admin/sellers/:id/stripe/connect`
- Creates or reuses the seller's Stripe account and returns an onboarding URL.
- Stores `stripe_account_id` in seller metadata.

## Seller Isolation

Seller routes use `x-seller-id` or fallback to a `user_seller` link for the authenticated user.
All seller endpoints only query records scoped to the resolved seller ID.
