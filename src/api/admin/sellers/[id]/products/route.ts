import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import {
  createProductSellerLinks,
  dismissProductSellerLinks,
  listProductSellerLinks,
} from "../../../../../modules/marketplace/utils/link-ops"
import { listProductsForSeller } from "../../../../../modules/marketplace/utils/seller-data"

const normalizeIdList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : []

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const products = await listProductsForSeller(req.scope, sellerId)

  res.json({
    seller_id: sellerId,
    count: products.length,
    products,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>
  const productIds = normalizeIdList(body.product_ids)

  if (!productIds.length) {
    res.status(400).json({ message: "product_ids must be a non-empty string array" })
    return
  }

  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  await marketplace.retrieveSeller(sellerId)

  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const link = req.scope.resolve<any>(ContainerRegistrationKeys.LINK)

  const existingLinks = (await query.graph({
    entity: "product_seller",
    fields: ["product_id", "seller_id"],
    filters: { product_id: productIds },
  })) as {
    data: { product_id: string; seller_id: string }[]
  }

  if (existingLinks.data?.length) {
    await link.dismiss(
      existingLinks.data.map((record) => ({
        [Modules.PRODUCT]: {
          product_id: record.product_id,
        },
        [MARKETPLACE_MODULE]: {
          seller_id: record.seller_id,
        },
      }))
    )
  }

  await createProductSellerLinks(req.scope, sellerId, productIds)

  const links = await listProductSellerLinks(req.scope, sellerId)
  const products = await listProductsForSeller(req.scope, sellerId)

  res.json({
    seller_id: sellerId,
    count: links.length,
    products,
  })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>
  const productIds = normalizeIdList(body.product_ids)
  const existing = await listProductSellerLinks(req.scope, sellerId)
  const targetProductIds = productIds.length
    ? productIds
    : existing.map((link) => link.product_id)

  if (!targetProductIds.length) {
    res.json({
      seller_id: sellerId,
      removed: 0,
    })
    return
  }

  await dismissProductSellerLinks(req.scope, sellerId, targetProductIds)

  res.json({
    seller_id: sellerId,
    removed: targetProductIds.length,
  })
}
