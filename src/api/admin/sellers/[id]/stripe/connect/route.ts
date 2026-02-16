import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createSellerStripeConnectOnboardingLink } from "../../../../../../modules/marketplace/utils/stripe-connect"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id

  const onboarding = await createSellerStripeConnectOnboardingLink(
    req.scope,
    sellerId
  )

  res.json({
    onboarding,
  })
}
