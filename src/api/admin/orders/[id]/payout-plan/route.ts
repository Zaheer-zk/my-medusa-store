import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"

const toNumber = (value: unknown): number => {
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : 0
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)

  const sellerOrders = await marketplace.listSellerOrders({
    order_id: orderId,
  })

  if (!sellerOrders.length) {
    res.status(404).json({
      message: "No seller split records found for this order",
    })
    return
  }

  const sellerIds = Array.from(
    new Set(sellerOrders.map((record: any) => record.seller_id))
  )

  const sellerResult = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "metadata"],
    filters: { id: sellerIds },
  })) as { data: any[] }

  const sellerMap = new Map(sellerResult.data.map((seller) => [seller.id, seller]))
  const warnings: string[] = []

  const transfers = sellerOrders
    .map((sellerOrder: any) => {
      const seller = sellerMap.get(sellerOrder.seller_id)
      const stripeAccountId = seller?.metadata?.stripe_account_id

      if (!stripeAccountId) {
        warnings.push(`Seller ${sellerOrder.seller_id} is missing metadata.stripe_account_id`)
        return null
      }

      return {
        seller_id: sellerOrder.seller_id,
        seller_name: seller?.name ?? "Unknown Seller",
        destination_account: stripeAccountId,
        currency_code: sellerOrder.currency_code,
        amount: toNumber(sellerOrder.net_total),
        source_order_amount: toNumber(sellerOrder.gross_total),
        platform_commission: toNumber(sellerOrder.commission_total),
      }
    })
    .filter((transfer): transfer is NonNullable<typeof transfer> => Boolean(transfer))

  const totals = sellerOrders.reduce(
    (acc: { gross: number; commission: number; net: number }, sellerOrder: any) => {
      acc.gross += toNumber(sellerOrder.gross_total)
      acc.commission += toNumber(sellerOrder.commission_total)
      acc.net += toNumber(sellerOrder.net_total)
      return acc
    },
    {
      gross: 0,
      commission: 0,
      net: 0,
    }
  )

  res.json({
    order_id: orderId,
    strategy: "stripe_separate_charges_and_transfers",
    totals,
    transfer_count: transfers.length,
    transfers,
    warnings,
  })
}
