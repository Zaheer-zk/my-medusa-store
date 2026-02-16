import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { executeOrderPayoutTransfers } from "../modules/marketplace/utils/stripe-connect"

type OrderCompletedEvent = {
  id?: string
}

const isAutoPayoutEnabled = (): boolean =>
  process.env.MARKETPLACE_AUTO_PAYOUT_ON_ORDER_COMPLETED === "true"

export default async function handleOrderCompleted({
  event,
  container,
}: SubscriberArgs<OrderCompletedEvent>) {
  if (!isAutoPayoutEnabled()) {
    return
  }

  const orderId = event.data?.id

  if (!orderId) {
    return
  }

  await executeOrderPayoutTransfers(container, orderId, {
    dryRun: false,
  })
}

export const config: SubscriberConfig = {
  event: "order.completed",
  context: {
    subscriberId: "marketplace-order-completed-trigger-payout",
  },
}
