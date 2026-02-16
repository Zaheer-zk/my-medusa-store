import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import splitOrderBySellerWorkflow from "../workflows/marketplace/split-order"

type OrderPlacedEvent = {
  id?: string
}

export default async function handleOrderPlaced({
  event,
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const orderId = event.data?.id

  if (!orderId) {
    return
  }

  await splitOrderBySellerWorkflow(container).run({
    input: {
      orderId,
      persist: true,
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "marketplace-order-placed-split-by-seller",
  },
}
