import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  hasAdminAccess,
  retrieveUserByEmail,
} from "../../utils/admin-user-access"

type CustomerDTO = {
  id: string
  email?: string | null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id

  if (!customerId) {
    res.status(401).json({ message: "Unauthorized." })
    return
  }

  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const customerResult = (await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: customerId },
  })) as { data: CustomerDTO[] }
  const customer = customerResult.data?.[0]

  if (!customer?.email) {
    res.json({ is_valid_admin: false })
    return
  }

  const user = await retrieveUserByEmail(req, customer.email, ["id", "email", "metadata"])

  res.json({
    is_valid_admin: hasAdminAccess(user),
  })
}
