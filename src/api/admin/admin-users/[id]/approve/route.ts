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
      message: "Only super admin can approve admin users.",
    })
    return
  }

  const targetUserId = req.params.id
  const user = await retrieveUserById(req, targetUserId)

  if (!user) {
    res.status(404).json({ message: "Admin user not found." })
    return
  }

  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const metadata = toMetadataRecord(user.metadata)
  const updatedUser = await userModuleService.updateUsers({
    id: user.id,
    metadata: {
      ...metadata,
      is_admin_approved: true,
      is_super_admin: metadata.is_super_admin === true,
      admin_approval_status: "approved",
      admin_approved_by: actor.id,
      admin_approved_at: new Date().toISOString(),
    },
  })

  res.json({
    message: "Admin user approved.",
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      metadata: updatedUser.metadata,
    },
  })
}
