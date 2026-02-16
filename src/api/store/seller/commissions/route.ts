import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listSellerOrderRecords } from "../../../../modules/marketplace/utils/seller-data"
import { resolveSellerIdFromRequest } from "../../../../modules/marketplace/utils/resolve-seller-id"

const coerceAmount = (value: unknown): number => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = await resolveSellerIdFromRequest(req)

  if (!sellerId) {
    res.status(401).json({
      message: "Seller context is required. Provide x-seller-id or authenticate a linked user.",
    })
    return
  }

  const sellerOrders = await listSellerOrderRecords(req.scope, sellerId)
  const summary = sellerOrders.reduce(
    (acc, record) => {
      acc.gross_total += coerceAmount(record.gross_total)
      acc.commission_total += coerceAmount(record.commission_total)
      acc.net_total += coerceAmount(record.net_total)
      return acc
    },
    {
      gross_total: 0,
      commission_total: 0,
      net_total: 0,
    }
  )

  res.json({
    seller_id: sellerId,
    count: sellerOrders.length,
    summary,
  })
}
