import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace"
import { resolveSellerIdFromRequest } from "../../../../../../modules/marketplace/utils/resolve-seller-id"

type OrderLineItemDTO = {
  id: string
  title?: string | null
  product_id?: string | null
  quantity?: number | null
  unit_price?: number | null
  subtotal?: number | null
  tax_total?: number | null
  total?: number | null
}

type OrderDTO = {
  id: string
  display_id?: number | null
  currency_code?: string | null
  created_at?: string | null
  email?: string | null
  billing_address?: Record<string, unknown> | null
  shipping_address?: Record<string, unknown> | null
  items?: (OrderLineItemDTO | null)[] | null
}

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

  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const sellerOrders = await marketplace.listSellerOrders({
    id: req.params.seller_order_id,
    seller_id: sellerId,
  })
  const sellerOrder = sellerOrders[0]

  if (!sellerOrder) {
    res.status(404).json({ message: "Seller order not found" })
    return
  }

  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)

  const [sellerResult, orderResult, sellerProductLinks] = await Promise.all([
    query.graph({
      entity: "seller",
      fields: ["id", "name", "handle", "email", "phone", "metadata"],
      filters: { id: sellerId },
    }) as Promise<{ data: any[] }>,
    query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "currency_code",
        "created_at",
        "email",
        "billing_address.*",
        "shipping_address.*",
        "items.id",
        "items.title",
        "items.product_id",
        "items.quantity",
        "items.unit_price",
        "items.subtotal",
        "items.tax_total",
        "items.total",
      ],
      filters: { id: sellerOrder.order_id },
    }) as Promise<{ data: OrderDTO[] }>,
    query.graph({
      entity: "product_seller",
      fields: ["product_id", "seller_id"],
      filters: { seller_id: sellerId },
    }) as Promise<{ data: { product_id: string; seller_id: string }[] }>,
  ])

  const seller = sellerResult.data?.[0]
  const order = orderResult.data?.[0]

  if (!seller || !order) {
    res.status(404).json({ message: "Invoice source data is incomplete" })
    return
  }

  const sellerProductIds = new Set(
    (sellerProductLinks.data ?? []).map((link) => link.product_id)
  )

  const sellerItems = (order.items ?? [])
    .filter((item): item is OrderLineItemDTO => Boolean(item))
    .filter((item) => item.product_id && sellerProductIds.has(item.product_id))
    .map((item) => ({
      line_item_id: item.id,
      title: item.title ?? "Untitled item",
      product_id: item.product_id ?? null,
      quantity: Number(item.quantity ?? 0),
      unit_price: coerceAmount(item.unit_price),
      subtotal: coerceAmount(item.subtotal),
      tax_total: coerceAmount(item.tax_total),
      gross_total: coerceAmount(item.total),
    }))

  const invoice = {
    invoice_number: `${order.display_id ?? order.id}-${sellerId}`,
    issued_at: new Date().toISOString(),
    seller: {
      id: seller.id,
      name: seller.name,
      handle: seller.handle,
      email: seller.email,
      phone: seller.phone,
      metadata: seller.metadata ?? {},
    },
    customer: {
      email: order.email ?? null,
      billing_address: order.billing_address ?? null,
      shipping_address: order.shipping_address ?? null,
    },
    order: {
      id: order.id,
      display_id: order.display_id,
      currency_code: order.currency_code,
      created_at: order.created_at,
    },
    items: sellerItems,
    totals: {
      subtotal: coerceAmount(sellerOrder.subtotal),
      tax_total: coerceAmount(sellerOrder.tax_total),
      gross_total: coerceAmount(sellerOrder.gross_total),
      commission_rate: coerceAmount(sellerOrder.commission_rate),
      commission_total: coerceAmount(sellerOrder.commission_total),
      net_total: coerceAmount(sellerOrder.net_total),
    },
  }

  res.json({
    seller_id: sellerId,
    seller_order_id: sellerOrder.id,
    invoice,
  })
}
