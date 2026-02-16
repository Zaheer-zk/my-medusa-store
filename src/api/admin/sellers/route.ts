import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)

  const sellers = await marketplace.listSellers()

  res.json({
    sellers,
    count: sellers.length,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  const body = (req.body ?? {}) as Record<string, unknown>

  const { name, handle, email, phone, commission_rate, is_active, metadata } =
    body

  if (!name || !handle) {
    res.status(400).json({ message: "name and handle are required" })
    return
  }

  const seller = await marketplace.createSellers({
    name,
    handle,
    email,
    phone,
    commission_rate,
    is_active,
    metadata,
  })

  res.status(201).json({ seller })
}
