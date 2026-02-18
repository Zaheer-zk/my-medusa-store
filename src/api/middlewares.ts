import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  authenticate,
  defineMiddlewares,
} from "@medusajs/framework/http"
import {
  hasAdminAccess,
  retrieveUserById,
} from "./utils/admin-user-access"

const requireApprovedAdmin = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const actorId = (req as any).auth_context?.actor_id

  if (!actorId) {
    res.status(401).json({ message: "Unauthorized." })
    return
  }

  const actor = await retrieveUserById(req, actorId)

  if (!hasAdminAccess(actor)) {
    res.status(403).json({
      message: "Admin access is blocked until a super admin approves this account.",
    })
    return
  }

  next()
}

const authenticatedAdmin = [authenticate("user", ["session", "bearer"]), requireApprovedAdmin]

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/custom",
      middlewares: authenticatedAdmin,
    },
    {
      matcher: "/admin/sellers*",
      middlewares: authenticatedAdmin,
    },
    {
      matcher: "/admin/orders/*/split",
      middlewares: authenticatedAdmin,
    },
    {
      matcher: "/admin/orders/*/payout-plan",
      middlewares: authenticatedAdmin,
    },
    {
      matcher: "/admin/orders/*/payouts/execute",
      middlewares: authenticatedAdmin,
    },
    {
      matcher: "/admin/admin-users*",
      middlewares: authenticatedAdmin,
    },
  ],
})
