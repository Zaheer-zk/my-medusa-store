import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type OrderLineItemDTO = {
  id: string
  title?: string | null
  product_id?: string | null
  quantity?: number | null
  unit_price?: number | null
  subtotal?: number | null
  tax_total?: number | null
  total?: number | null
  item_subtotal?: number | null
  item_tax_total?: number | null
  item_total?: number | null
}

type OrderDTO = {
  id: string
  currency_code: string
  items?: (OrderLineItemDTO | null)[] | null
}

type SellerDTO = {
  id: string
  name: string
  commission_rate?: number | null
  is_active?: boolean | null
}

type ProductSellerLinkDTO = {
  product_id: string
  seller_id: string
}

export type SellerSplitItem = {
  line_item_id: string
  title: string
  product_id: string | null
  quantity: number
  unit_price: number
  subtotal: number
  tax_total: number
  gross_total: number
}

export type SellerSplitGroup = {
  seller_id: string
  seller_name: string
  commission_rate: number
  item_count: number
  quantity_total: number
  subtotal: number
  tax_total: number
  gross_total: number
  commission_total: number
  net_total: number
  items: SellerSplitItem[]
}

export type SplitOrderResult = {
  order_id: string
  currency_code: string
  groups: SellerSplitGroup[]
  unassigned_items: SellerSplitItem[]
  totals: {
    gross_total: number
    commission_total: number
    net_total: number
  }
}

type ComputeSplitInput = {
  orderId: string
  defaultCommissionRate?: number
}

type MutableSellerSplitGroup = Omit<
  SellerSplitGroup,
  "commission_total" | "net_total"
>

const roundAmount = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const coerceAmount = (value: unknown, fallback = 0): number => {
  const asNumber = Number(value)

  if (Number.isFinite(asNumber)) {
    return asNumber
  }

  return fallback
}

const normalizeLineItem = (item: OrderLineItemDTO): SellerSplitItem => {
  const quantity = Math.max(1, Math.trunc(coerceAmount(item.quantity, 1)))
  const unitPrice = coerceAmount(item.unit_price, 0)
  const fallbackSubtotal = unitPrice * quantity
  const subtotal = coerceAmount(
    item.subtotal,
    coerceAmount(item.item_subtotal, fallbackSubtotal)
  )
  const taxTotal = coerceAmount(item.tax_total, coerceAmount(item.item_tax_total, 0))
  const grossTotal = coerceAmount(item.total, coerceAmount(item.item_total, subtotal + taxTotal))

  return {
    line_item_id: item.id,
    title: item.title ?? "Untitled item",
    product_id: item.product_id ?? null,
    quantity,
    unit_price: roundAmount(unitPrice),
    subtotal: roundAmount(subtotal),
    tax_total: roundAmount(taxTotal),
    gross_total: roundAmount(grossTotal),
  }
}

export async function computeOrderSellerSplit(
  container: MedusaContainer,
  input: ComputeSplitInput
): Promise<SplitOrderResult> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)

  const orderResult = (await query.graph({
    entity: "order",
    fields: [
      "id",
      "currency_code",
      "items.id",
      "items.title",
      "items.product_id",
      "items.quantity",
      "items.unit_price",
      "items.subtotal",
      "items.tax_total",
      "items.total",
      "items.item_subtotal",
      "items.item_tax_total",
      "items.item_total",
    ],
    filters: { id: input.orderId },
  })) as { data: OrderDTO[] }

  const order = orderResult.data?.[0]

  if (!order) {
    throw new Error(`Order ${input.orderId} was not found`)
  }

  const lineItems = (order.items ?? [])
    .filter((item): item is OrderLineItemDTO => Boolean(item))
    .map(normalizeLineItem)

  const productIds = Array.from(
    new Set(
      lineItems
        .map((item) => item.product_id)
        .filter((productId): productId is string => Boolean(productId))
    )
  )

  const productLinksResult = productIds.length
    ? ((await query.graph({
        entity: "product_seller",
        fields: ["product_id", "seller_id"],
        filters: { product_id: productIds },
      })) as { data: ProductSellerLinkDTO[] })
    : { data: [] as ProductSellerLinkDTO[] }

  const productToSeller = new Map<string, string>()

  for (const productLink of productLinksResult.data) {
    if (!productToSeller.has(productLink.product_id)) {
      productToSeller.set(productLink.product_id, productLink.seller_id)
    }
  }

  const sellerIds = Array.from(new Set(productLinksResult.data.map((link) => link.seller_id)))

  const sellersResult = sellerIds.length
    ? ((await query.graph({
        entity: "seller",
        fields: ["id", "name", "commission_rate", "is_active"],
        filters: { id: sellerIds },
      })) as { data: SellerDTO[] })
    : { data: [] as SellerDTO[] }

  const sellerMap = new Map<string, SellerDTO>()

  for (const seller of sellersResult.data) {
    sellerMap.set(seller.id, seller)
  }

  const groupsBySeller = new Map<string, MutableSellerSplitGroup>()
  const unassignedItems: SellerSplitItem[] = []

  for (const lineItem of lineItems) {
    const productId = lineItem.product_id
    const sellerId = productId ? productToSeller.get(productId) : null

    if (!sellerId) {
      unassignedItems.push(lineItem)
      continue
    }

    const seller = sellerMap.get(sellerId)

    if (!seller || seller.is_active === false) {
      unassignedItems.push(lineItem)
      continue
    }

    if (!groupsBySeller.has(sellerId)) {
      groupsBySeller.set(sellerId, {
        seller_id: sellerId,
        seller_name: seller.name,
        commission_rate: coerceAmount(
          seller.commission_rate,
          input.defaultCommissionRate ?? 0
        ),
        item_count: 0,
        quantity_total: 0,
        subtotal: 0,
        tax_total: 0,
        gross_total: 0,
        items: [],
      })
    }

    const group = groupsBySeller.get(sellerId)!

    group.items.push(lineItem)
    group.item_count += 1
    group.quantity_total += lineItem.quantity
    group.subtotal += lineItem.subtotal
    group.tax_total += lineItem.tax_total
    group.gross_total += lineItem.gross_total
  }

  const groups: SellerSplitGroup[] = Array.from(groupsBySeller.values()).map((group) => {
    const subtotal = roundAmount(group.subtotal)
    const taxTotal = roundAmount(group.tax_total)
    const grossTotal = roundAmount(group.gross_total)
    const commissionRate = roundAmount(group.commission_rate)
    const commissionTotal = roundAmount((grossTotal * commissionRate) / 100)
    const netTotal = roundAmount(grossTotal - commissionTotal)

    return {
      ...group,
      subtotal,
      tax_total: taxTotal,
      gross_total: grossTotal,
      commission_rate: commissionRate,
      commission_total: commissionTotal,
      net_total: netTotal,
    }
  })

  const totals = groups.reduce(
    (acc, group) => {
      acc.gross_total += group.gross_total
      acc.commission_total += group.commission_total
      acc.net_total += group.net_total
      return acc
    },
    {
      gross_total: 0,
      commission_total: 0,
      net_total: 0,
    }
  )

  return {
    order_id: order.id,
    currency_code: order.currency_code,
    groups,
    unassigned_items: unassignedItems,
    totals: {
      gross_total: roundAmount(totals.gross_total),
      commission_total: roundAmount(totals.commission_total),
      net_total: roundAmount(totals.net_total),
    },
  }
}
