import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import { computeOrderSellerSplit } from "../../modules/marketplace/utils/split-order"
import { ensureOrderSellerLink } from "../../modules/marketplace/utils/link-ops"

type SplitOrderBySellerInput = {
  orderId: string
  persist?: boolean
  defaultCommissionRate?: number
}

const computeSplitStep = createStep(
  "marketplace-compute-order-seller-split",
  async (input: SplitOrderBySellerInput, { container }) => {
    const split = await computeOrderSellerSplit(container, {
      orderId: input.orderId,
      defaultCommissionRate: input.defaultCommissionRate,
    })

    return new StepResponse(split)
  }
)

const persistSellerOrdersStep = createStep(
  "marketplace-persist-seller-orders",
  async (
    input: {
      shouldPersist: boolean
      split: Awaited<ReturnType<typeof computeOrderSellerSplit>>
    },
    { container }
  ) => {
    if (!input.shouldPersist || !input.split.groups.length) {
      return new StepResponse({
        ...input.split,
        seller_orders: [],
      })
    }

    const marketplaceModuleService = container.resolve<any>(MARKETPLACE_MODULE)
    const persistedSellerOrders: any[] = []

    for (const group of input.split.groups) {
      const currentRecords = await marketplaceModuleService.listSellerOrders({
        order_id: input.split.order_id,
        seller_id: group.seller_id,
      })

      const payload = {
        order_id: input.split.order_id,
        currency_code: input.split.currency_code,
        item_count: group.item_count,
        quantity_total: group.quantity_total,
        subtotal: group.subtotal,
        tax_total: group.tax_total,
        shipping_total: 0,
        gross_total: group.gross_total,
        commission_rate: group.commission_rate,
        commission_total: group.commission_total,
        net_total: group.net_total,
        status: "pending",
        metadata: {
          line_item_ids: group.items.map((item) => item.line_item_id),
        },
      }

      const sellerOrder = currentRecords.length
        ? await marketplaceModuleService.updateSellerOrders({
            id: currentRecords[0].id,
            ...payload,
          })
        : await marketplaceModuleService.createSellerOrders({
            ...payload,
            seller_id: group.seller_id,
          })

      await ensureOrderSellerLink(
        container,
        input.split.order_id,
        group.seller_id
      )

      persistedSellerOrders.push(sellerOrder)
    }

    return new StepResponse({
      ...input.split,
      seller_orders: persistedSellerOrders,
    })
  }
)

const splitOrderBySellerWorkflow = createWorkflow(
  "marketplace-split-order-by-seller",
  (input: SplitOrderBySellerInput) => {
    const split = computeSplitStep(input)
    const splitWithPersistence = persistSellerOrdersStep({
      shouldPersist: input.persist ?? true,
      split,
    })

    return new WorkflowResponse(splitWithPersistence)
  }
)

export default splitOrderBySellerWorkflow
