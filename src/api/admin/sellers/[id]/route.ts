import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const { id } = req.params

  const seller = await marketplace.retrieveSeller(id)

  res.json({ seller })
}

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const { id } = req.params
  const body = (req.body ?? {}) as Record<string, unknown>

  const { name, handle, email, phone, commission_rate, is_active, metadata } =
    body

  const seller = await marketplace.updateSellers({
    id,
    name,
    handle,
    email,
    phone,
    commission_rate,
    is_active,
    metadata,
  })

  res.json({ seller })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const { id } = req.params

  await marketplace.updateSellers({
    id,
    is_active: false,
  })

  res.status(204).send()
}
