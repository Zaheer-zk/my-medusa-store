import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../index"

type ProductSellerLinkDTO = {
  product_id: string
  seller_id: string
}

type OrderSellerLinkDTO = {
  order_id: string
  seller_id: string
}

export async function listProductSellerLinks(
  container: MedusaContainer,
  sellerId: string
): Promise<ProductSellerLinkDTO[]> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const result = (await query.graph({
    entity: "product_seller",
    fields: ["product_id", "seller_id"],
    filters: { seller_id: sellerId },
  })) as { data: ProductSellerLinkDTO[] }

  return result.data ?? []
}

export async function createProductSellerLinks(
  container: MedusaContainer,
  sellerId: string,
  productIds: string[]
): Promise<void> {
  const link = container.resolve<any>(ContainerRegistrationKeys.LINK)
  const payload = productIds.map((productId) => ({
    [Modules.PRODUCT]: {
      product_id: productId,
    },
    [MARKETPLACE_MODULE]: {
      seller_id: sellerId,
    },
  }))

  if (!payload.length) {
    return
  }

  await link.create(payload)
}

export async function dismissProductSellerLinks(
  container: MedusaContainer,
  sellerId: string,
  productIds: string[]
): Promise<void> {
  const link = container.resolve<any>(ContainerRegistrationKeys.LINK)
  const payload = productIds.map((productId) => ({
    [Modules.PRODUCT]: {
      product_id: productId,
    },
    [MARKETPLACE_MODULE]: {
      seller_id: sellerId,
    },
  }))

  if (!payload.length) {
    return
  }

  await link.dismiss(payload)
}

export async function ensureOrderSellerLink(
  container: MedusaContainer,
  orderId: string,
  sellerId: string
): Promise<void> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const existing = (await query.graph({
    entity: "order_seller",
    fields: ["order_id", "seller_id"],
    filters: {
      order_id: orderId,
      seller_id: sellerId,
    },
  })) as { data: OrderSellerLinkDTO[] }

  if (existing.data?.length) {
    return
  }

  const link = container.resolve<any>(ContainerRegistrationKeys.LINK)

  await link.create({
    [Modules.ORDER]: {
      order_id: orderId,
    },
    [MARKETPLACE_MODULE]: {
      seller_id: sellerId,
    },
  })
}

export async function ensureUserSellerLink(
  container: MedusaContainer,
  userId: string,
  sellerId: string
): Promise<void> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const existing = (await query.graph({
    entity: "user_seller",
    fields: ["user_id", "seller_id"],
    filters: {
      user_id: userId,
      seller_id: sellerId,
    },
  })) as { data: { user_id: string; seller_id: string }[] }

  if (existing.data?.length) {
    return
  }

  const link = container.resolve<any>(ContainerRegistrationKeys.LINK)

  await link.create({
    [Modules.USER]: {
      user_id: userId,
    },
    [MARKETPLACE_MODULE]: {
      seller_id: sellerId,
    },
  })
}
