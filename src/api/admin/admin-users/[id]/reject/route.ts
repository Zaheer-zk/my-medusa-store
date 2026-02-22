import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  isSuperAdmin,
  retrieveUserById,
  toMetadataRecord,
} from "../../../../utils/admin-user-access"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as any).auth_context?.actor_id

  if (!actorId) {
    res.status(401).json({ message: "Unauthorized." })
    return
  }

  const actor = await retrieveUserById(req, actorId)

  if (!actor || !isSuperAdmin(actor)) {
    res.status(403).json({
      message: "Only super admin can reject admin users.",
    })
    return
  }

  const targetUserId = req.params.id
  const user = await retrieveUserById(req, targetUserId)

  if (!user) {
    res.status(404).json({ message: "Admin user not found." })
    return
  }

  const metadata = toMetadataRecord(user.metadata)

  if (metadata.is_super_admin === true) {
    res.status(400).json({
      message: "Super admin account cannot be rejected.",
    })
    return
  }

  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const updatedUser = await userModuleService.updateUsers({
    id: user.id,
    metadata: {
      ...metadata,
      is_admin_approved: false,
      admin_approval_status: "rejected",
      admin_rejected_by: actor.id,
      admin_rejected_at: new Date().toISOString(),
    },
  })

  res.json({
    message: "Admin user rejected.",
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      metadata: updatedUser.metadata,
    },
  })
}
