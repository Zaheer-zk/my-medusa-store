import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  listOrdersForSeller,
  listSellerOrderRecords,
} from "../../../../../modules/marketplace/utils/seller-data"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id

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
