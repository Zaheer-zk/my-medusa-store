import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  isApprovedAdmin,
  isSuperAdmin,
  retrieveUserById,
} from "../../../utils/admin-user-access"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as any).auth_context?.actor_id

  if (!actorId) {
    res.status(401).json({ message: "Unauthorized." })
    return
  }

  const actor = await retrieveUserById(req, actorId)

  if (!actor || !isSuperAdmin(actor)) {
    res.status(403).json({
      message: "Only super admin can list pending admin users.",
    })
    return
  }

  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const users = await userModuleService.listUsers({}, { take: 500 })
  const pendingUsers = users.filter((user: any) => !isSuperAdmin(user) && !isApprovedAdmin(user))

  res.json({
    count: pendingUsers.length,
    users: pendingUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      metadata: user.metadata,
      created_at: user.created_at,
    })),
  })
}
