import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listProductsForSeller } from "../../../../modules/marketplace/utils/seller-data"
import { resolveSellerIdFromRequest } from "../../../../modules/marketplace/utils/resolve-seller-id"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = await resolveSellerIdFromRequest(req)

  if (!sellerId) {
    res.status(401).json({
      message: "Seller context is required. Provide x-seller-id or authenticate a linked user.",
    })
    return
  }

  const products = await listProductsForSeller(req.scope, sellerId)

  res.json({
    seller_id: sellerId,
    count: products.length,
    products,
  })
}
