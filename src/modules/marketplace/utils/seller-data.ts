import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../index"
import { listProductSellerLinks } from "./link-ops"

type ProductDTO = {
  id: string
  title: string
  handle?: string | null
  status?: string | null
  thumbnail?: string | null
}

type OrderDTO = {
  id: string
  display_id?: number | null
  status?: string | null
  currency_code?: string | null
  email?: string | null
  total?: number | null
  subtotal?: number | null
  tax_total?: number | null
  created_at?: string | null
  updated_at?: string | null
}

type OrderSellerLinkDTO = {
  order_id: string
  seller_id: string
}

export async function listProductsForSeller(
  container: MedusaContainer,
  sellerId: string
): Promise<ProductDTO[]> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const productLinks = await listProductSellerLinks(container, sellerId)
  const productIds = Array.from(new Set(productLinks.map((link) => link.product_id)))

  if (!productIds.length) {
    return []
  }

  const products = (await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "status", "thumbnail"],
    filters: { id: productIds },
  })) as { data: ProductDTO[] }

  return products.data ?? []
}

export async function listOrdersForSeller(
  container: MedusaContainer,
  sellerId: string
): Promise<OrderDTO[]> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const sellerOrderLinks = (await query.graph({
    entity: "order_seller",
    fields: ["order_id", "seller_id"],
    filters: { seller_id: sellerId },
  })) as { data: OrderSellerLinkDTO[] }

  const orderIds = Array.from(
    new Set((sellerOrderLinks.data ?? []).map((link) => link.order_id))
  )

  if (!orderIds.length) {
    return []
  }

  const orders = (await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "currency_code",
      "email",
      "total",
      "subtotal",
      "tax_total",
      "created_at",
      "updated_at",
    ],
    filters: { id: orderIds },
  })) as { data: OrderDTO[] }

  return orders.data ?? []
}

export async function listSellerOrderRecords(
  container: MedusaContainer,
  sellerId: string
): Promise<any[]> {
  const marketplace = container.resolve<any>(MARKETPLACE_MODULE)

  return (await marketplace.listSellerOrders({
    seller_id: sellerId,
  })) as any[]
}
