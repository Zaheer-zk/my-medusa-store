import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { executeOrderPayoutTransfers } from "../../../../../../modules/marketplace/utils/stripe-connect"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const dryRun = body.dry_run === true
  const orderId = req.params.id

  const result = await executeOrderPayoutTransfers(req.scope, orderId, {
    dryRun,
  })

  res.json({
    payout: result,
  })
}
