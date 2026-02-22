import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  getAdminApprovalStatus,
  retrieveUserById,
  isSuperAdmin,
  type AdminApprovalStatus,
} from "../../utils/admin-user-access"

const VALID_STATUS_FILTERS: AdminApprovalStatus[] = [
  "super_admin",
  "approved",
  "pending",
  "rejected",
]

const readStatusFilter = (req: MedusaRequest): AdminApprovalStatus | undefined => {
  const raw = req.query?.status
  const asString = Array.isArray(raw) ? raw[0] : raw

  if (typeof asString !== "string") {
    return undefined
  }

  const normalized = asString.trim().toLowerCase()
  return VALID_STATUS_FILTERS.includes(normalized as AdminApprovalStatus)
    ? (normalized as AdminApprovalStatus)
    : undefined
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as any).auth_context?.actor_id

  if (!actorId) {
    res.status(401).json({ message: "Unauthorized." })
    return
  }

  const actor = await retrieveUserById(req, actorId)

  if (!actor || !isSuperAdmin(actor)) {
    res.status(403).json({
      message: "Only super admin can list admin approvals.",
    })
    return
  }

  const statusFilter = readStatusFilter(req)
  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const users = await userModuleService.listUsers({}, { take: 500 })
  const formatted = users.map((user: any) => {
    const status = getAdminApprovalStatus(user)

    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      metadata: user.metadata,
      created_at: user.created_at,
      status,
    }
  })
  const filtered = statusFilter
    ? formatted.filter((user: any) => user.status === statusFilter)
    : formatted

  res.json({
    count: filtered.length,
    users: filtered,
  })
}
