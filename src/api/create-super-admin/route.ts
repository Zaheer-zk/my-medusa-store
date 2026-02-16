import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

const readSetupToken = (req: MedusaRequest): string | null => {
  const raw = req.headers["x-marketplace-setup-token"]

  if (Array.isArray(raw)) {
    return raw[0] ?? null
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim()
  }

  return null
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const expectedSetupToken = process.env.MARKETPLACE_SETUP_TOKEN

  if (!expectedSetupToken) {
    res.status(500).json({
      message: "MARKETPLACE_SETUP_TOKEN is not configured",
    })
    return
  }

  const providedSetupToken = readSetupToken(req)

  if (providedSetupToken !== expectedSetupToken) {
    res.status(401).json({ message: "Invalid setup token" })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const userId = typeof body.user_id === "string" ? body.user_id : undefined
  const email = typeof body.email === "string" ? body.email : undefined

  if (!userId && !email) {
    res.status(400).json({ message: "Provide either user_id or email" })
    return
  }

  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const userResult = (await query.graph({
    entity: "user",
    fields: ["id", "email", "metadata"],
    filters: userId ? { id: userId } : { email },
  })) as { data: any[] }

  const user = userResult.data?.[0]

  if (!user) {
    res.status(404).json({ message: "User not found" })
    return
  }

  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const nextMetadata = {
    ...(user.metadata ?? {}),
    is_super_admin: true,
  }

  const updatedUser = await userModuleService.updateUsers({
    id: user.id,
    metadata: nextMetadata,
  })

  res.json({
    message: "User promoted to super admin",
    user: updatedUser,
  })
}
