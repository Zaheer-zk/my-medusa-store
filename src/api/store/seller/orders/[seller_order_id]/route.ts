import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { resolveSellerIdFromRequest } from "../../../../../modules/marketplace/utils/resolve-seller-id"

const allowedStatuses = new Set([
  "pending",
  "accepted",
  "ready_to_ship",
  "shipped",
  "completed",
  "canceled",
])

const toObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const getSellerOrderForRequest = async (
  req: MedusaRequest,
  sellerId: string
) => {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const records = await marketplace.listSellerOrders({
    id: req.params.seller_order_id,
    seller_id: sellerId,
  })

  return {
    marketplace,
    sellerOrder: records[0] ?? null,
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = await resolveSellerIdFromRequest(req)

  if (!sellerId) {
    res.status(401).json({
      message: "Seller context is required. Provide x-seller-id or authenticate a linked user.",
    })
    return
  }

  const { sellerOrder } = await getSellerOrderForRequest(req, sellerId)

  if (!sellerOrder) {
    res.status(404).json({ message: "Seller order not found" })
    return
  }

  res.json({
    seller_id: sellerId,
    seller_order: sellerOrder,
  })
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = await resolveSellerIdFromRequest(req)
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!sellerId) {
    res.status(401).json({
      message: "Seller context is required. Provide x-seller-id or authenticate a linked user.",
    })
    return
  }

  const status = body.status

  if (typeof status !== "string" || !allowedStatuses.has(status)) {
    res.status(400).json({
      message: "status must be one of pending, accepted, ready_to_ship, shipped, completed, canceled",
    })
    return
  }

  const { marketplace, sellerOrder } = await getSellerOrderForRequest(req, sellerId)

  if (!sellerOrder) {
    res.status(404).json({ message: "Seller order not found" })
    return
  }

  const existingMetadata = toObject(sellerOrder.metadata)
  const updatedMetadata = {
    ...existingMetadata,
    seller_status_note: typeof body.status_note === "string" ? body.status_note : null,
    seller_status_updated_at: new Date().toISOString(),
  }

  const updated = await marketplace.updateSellerOrders({
    id: sellerOrder.id,
    status,
    metadata: updatedMetadata,
  })

  res.json({
    seller_id: sellerId,
    seller_order: updated,
  })
}
