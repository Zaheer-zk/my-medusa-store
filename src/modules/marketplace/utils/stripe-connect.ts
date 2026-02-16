import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { MARKETPLACE_MODULE } from "../index"

type SellerRecord = {
  id: string
  name?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
}

type SellerOrderRecord = {
  id: string
  seller_id: string
  order_id: string
  status: string
  currency_code: string
  net_total: number
  commission_total: number
  metadata?: Record<string, unknown> | null
}

type ExecutePayoutOptions = {
  dryRun?: boolean
}

export type PayoutTransferItem = {
  seller_order_id: string
  seller_id: string
  status: "paid" | "skipped" | "failed"
  reason?: string
  destination_account?: string
  amount?: number
  currency_code?: string
  transfer_id?: string
}

export type ExecuteOrderPayoutResult = {
  order_id: string
  dry_run: boolean
  transfer_count: number
  total_paid: number
  items: PayoutTransferItem[]
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])

const toNumber = (value: unknown): number => {
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : 0
}

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const getStripeApiKey = (): string => {
  const apiKey =
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET

  if (!apiKey) {
    throw new Error(
      "Stripe API key is missing. Set STRIPE_API_KEY or STRIPE_SECRET_KEY."
    )
  }

  return apiKey
}

const getStripeClient = (): Stripe => {
  const apiKey = getStripeApiKey()
  return new Stripe(apiKey)
}

const toSmallestUnit = (amount: number, currencyCode: string): number => {
  const lowerCurrency = currencyCode.toLowerCase()

  if (ZERO_DECIMAL_CURRENCIES.has(lowerCurrency)) {
    return Math.round(amount)
  }

  return Math.round(amount * 100)
}

const getDestinationAccount = (seller: SellerRecord): string | null => {
  const metadata = toRecord(seller.metadata)
  const accountId = metadata.stripe_account_id

  if (typeof accountId === "string" && accountId.trim()) {
    return accountId.trim()
  }

  return null
}

const updateSellerOrderStatus = async (
  container: MedusaContainer,
  sellerOrder: SellerOrderRecord,
  status: string,
  metadataPatch: Record<string, unknown>
) => {
  const marketplace = container.resolve<any>(MARKETPLACE_MODULE)
  const metadata = {
    ...toRecord(sellerOrder.metadata),
    ...metadataPatch,
  }

  await marketplace.updateSellerOrders({
    id: sellerOrder.id,
    status,
    metadata,
  })
}

const loadSellerOrdersForOrder = async (
  container: MedusaContainer,
  orderId: string
): Promise<SellerOrderRecord[]> => {
  const marketplace = container.resolve<any>(MARKETPLACE_MODULE)
  const records = (await marketplace.listSellerOrders({
    order_id: orderId,
  })) as SellerOrderRecord[]

  return records ?? []
}

const loadSellers = async (
  container: MedusaContainer,
  sellerIds: string[]
): Promise<Map<string, SellerRecord>> => {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const result = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "email", "metadata"],
    filters: { id: sellerIds },
  })) as { data: SellerRecord[] }

  return new Map((result.data ?? []).map((seller) => [seller.id, seller]))
}

export async function executeOrderPayoutTransfers(
  container: MedusaContainer,
  orderId: string,
  options: ExecutePayoutOptions = {}
): Promise<ExecuteOrderPayoutResult> {
  const dryRun = options.dryRun === true
  const sellerOrders = await loadSellerOrdersForOrder(container, orderId)
  const sellerIds = Array.from(new Set(sellerOrders.map((record) => record.seller_id)))
  const sellerMap = await loadSellers(container, sellerIds)
  const stripe = dryRun ? null : getStripeClient()
  const items: PayoutTransferItem[] = []
  let totalPaid = 0

  for (const sellerOrder of sellerOrders) {
    const seller = sellerMap.get(sellerOrder.seller_id)

    if (!seller) {
      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "failed",
        reason: "Seller record not found",
      })
      continue
    }

    if (sellerOrder.status === "paid") {
      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "skipped",
        reason: "Already paid",
      })
      continue
    }

    const amount = toNumber(sellerOrder.net_total)

    if (amount <= 0) {
      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "skipped",
        reason: "Net payout is zero",
      })
      continue
    }

    const destinationAccount = getDestinationAccount(seller)

    if (!destinationAccount) {
      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "failed",
        reason: "Seller metadata.stripe_account_id is missing",
      })

      if (!dryRun) {
        await updateSellerOrderStatus(container, sellerOrder, "payout_failed", {
          payout_error: "missing_destination_account",
          payout_error_at: new Date().toISOString(),
        })
      }

      continue
    }

    if (dryRun) {
      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "paid",
        destination_account: destinationAccount,
        amount,
        currency_code: sellerOrder.currency_code,
      })
      totalPaid += amount
      continue
    }

    const currencyCode = sellerOrder.currency_code.toLowerCase()
    const smallestUnitAmount = toSmallestUnit(amount, currencyCode)

    try {
      const transfer = await stripe!.transfers.create(
        {
          amount: smallestUnitAmount,
          currency: currencyCode,
          destination: destinationAccount,
          transfer_group: `marketplace_order_${orderId}`,
          metadata: {
            order_id: orderId,
            seller_id: seller.id,
            seller_order_id: sellerOrder.id,
          },
        },
        {
          idempotencyKey: `marketplace-transfer-${sellerOrder.id}`,
        }
      )

      await updateSellerOrderStatus(container, sellerOrder, "paid", {
        stripe_transfer_id: transfer.id,
        stripe_destination_account_id: destinationAccount,
        payout_amount: amount,
        payout_currency_code: currencyCode,
        payout_at: new Date().toISOString(),
      })

      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "paid",
        destination_account: destinationAccount,
        amount,
        currency_code: currencyCode,
        transfer_id: transfer.id,
      })
      totalPaid += amount
    } catch (error: any) {
      await updateSellerOrderStatus(container, sellerOrder, "payout_failed", {
        payout_error: error?.message || "Stripe transfer failed",
        payout_error_at: new Date().toISOString(),
      })

      items.push({
        seller_order_id: sellerOrder.id,
        seller_id: sellerOrder.seller_id,
        status: "failed",
        reason: error?.message || "Stripe transfer failed",
      })
    }
  }

  return {
    order_id: orderId,
    dry_run: dryRun,
    transfer_count: items.filter((item) => item.status === "paid").length,
    total_paid: totalPaid,
    items,
  }
}

export async function createSellerStripeConnectOnboardingLink(
  container: MedusaContainer,
  sellerId: string
): Promise<{
  seller_id: string
  stripe_account_id: string
  onboarding_url: string
}> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const sellerResult = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "email", "metadata"],
    filters: { id: sellerId },
  })) as { data: SellerRecord[] }
  const seller = sellerResult.data?.[0]

  if (!seller) {
    throw new Error(`Seller ${sellerId} was not found`)
  }

  const stripe = getStripeClient()
  const marketplace = container.resolve<any>(MARKETPLACE_MODULE)
  const existingAccountId = getDestinationAccount(seller)
  const accountId =
    existingAccountId ??
    (
      await stripe.accounts.create({
        type: "express",
        email: seller.email ?? undefined,
        metadata: {
          seller_id: seller.id,
        },
      })
    ).id

  if (!existingAccountId) {
    await marketplace.updateSellers({
      id: seller.id,
      metadata: {
        ...toRecord(seller.metadata),
        stripe_account_id: accountId,
      },
    })
  }

  const refreshUrl =
    process.env.MARKETPLACE_STRIPE_CONNECT_REFRESH_URL ||
    "http://localhost:9000/app/sellers/onboarding/refresh"
  const returnUrl =
    process.env.MARKETPLACE_STRIPE_CONNECT_RETURN_URL ||
    "http://localhost:9000/app/sellers/onboarding/complete"

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
  })

  return {
    seller_id: seller.id,
    stripe_account_id: accountId,
    onboarding_url: accountLink.url,
  }
}
