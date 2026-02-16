import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  listOrdersForSeller,
  listSellerOrderRecords,
} from "../../../../modules/marketplace/utils/seller-data"
import { resolveSellerIdFromRequest } from "../../../../modules/marketplace/utils/resolve-seller-id"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = await resolveSellerIdFromRequest(req)

  if (!sellerId) {
    res.status(401).json({
      message: "Seller context is required. Provide x-seller-id or authenticate a linked user.",
    })
    return
  }

  const [sellerOrderRecords, orders] = await Promise.all([
    listSellerOrderRecords(req.scope, sellerId),
    listOrdersForSeller(req.scope, sellerId),
  ])

  const orderMap = new Map(orders.map((order) => [order.id, order]))
  const sellerOrders = sellerOrderRecords.map((record) => ({
    ...record,
    order: orderMap.get(record.order_id) ?? null,
  }))

  res.json({
    seller_id: sellerId,
    count: sellerOrders.length,
    seller_orders: sellerOrders,
  })
}
