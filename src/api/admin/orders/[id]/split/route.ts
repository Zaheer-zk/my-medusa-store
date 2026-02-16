import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import splitOrderBySellerWorkflow from "../../../../../workflows/marketplace/split-order"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>
  const shouldPersist = body.persist !== false
  const defaultCommissionRate =
    typeof body.default_commission_rate === "number"
      ? body.default_commission_rate
      : undefined

  const { result } = await splitOrderBySellerWorkflow(req.scope).run({
    input: {
      orderId,
      persist: shouldPersist,
      defaultCommissionRate,
    },
  })

  res.json({
    split: result,
  })
}
