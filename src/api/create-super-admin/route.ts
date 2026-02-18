import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  Modules,
} from "@medusajs/framework/utils"
import {
  normalizeEmail,
  retrieveUserByEmail,
  retrieveUserById,
  toMetadataRecord,
} from "../utils/admin-user-access"

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

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const toSuperAdminMetadata = (metadata: Record<string, unknown> | null | undefined) => ({
  ...toMetadataRecord(metadata),
  is_super_admin: true,
  is_admin_approved: true,
  admin_approval_status: "approved",
  admin_approved_at: new Date().toISOString(),
})

const ensureEmailPassIdentity = async (
  req: MedusaRequest,
  user: { id: string; email: string },
  password?: string
) => {
  const authModuleService = req.scope.resolve<any>(Modules.AUTH)
  const existingIdentities = await authModuleService.listAuthIdentities({
    provider_identities: {
      entity_id: user.email,
      provider: "emailpass",
    },
  })

  const existingIdentity = existingIdentities?.[0]

  if (existingIdentity) {
    const currentUserId = existingIdentity?.app_metadata?.user_id

    if (currentUserId !== user.id) {
      await authModuleService.updateAuthIdentities({
        id: existingIdentity.id,
        app_metadata: {
          ...(existingIdentity.app_metadata ?? {}),
          user_id: user.id,
        },
      })
    }

    return
  }

  if (!password) {
    throw new Error("A password is required to create email/password login for this user.")
  }

  const { success, error, authIdentity } = await authModuleService.register("emailpass", {
    body: {
      email: user.email,
      password,
    },
  })

  if (!success || !authIdentity) {
    throw new Error(error || "Failed to create email/password auth identity.")
  }

  await authModuleService.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: {
      ...(authIdentity.app_metadata ?? {}),
      user_id: user.id,
    },
  })
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
  const userId = readString(body.user_id)
  const emailInput = readString(body.email)
  const password = readString(body.password)
  const firstName = readString(body.first_name)
  const lastName = readString(body.last_name)

  if (!userId && !emailInput) {
    res.status(400).json({ message: "Provide either user_id or email." })
    return
  }

  const normalizedEmail = emailInput ? normalizeEmail(emailInput) : undefined
  const userModuleService = req.scope.resolve<any>(Modules.USER)
  let user: any = null

  if (userId) {
    user = await retrieveUserById(req, userId)
  } else if (normalizedEmail) {
    user = await retrieveUserByEmail(req, normalizedEmail)
  }

  if (!user && normalizedEmail) {
    user = await userModuleService.createUsers({
      email: normalizedEmail,
      first_name: firstName,
      last_name: lastName,
      metadata: toSuperAdminMetadata(null),
    })
  }

  if (!user) {
    res.status(404).json({ message: "User not found." })
    return
  }

  const finalEmail = normalizeEmail(user.email ?? normalizedEmail ?? "")

  if (!finalEmail) {
    res.status(400).json({ message: "Unable to resolve user email for super admin setup." })
    return
  }

  try {
    await ensureEmailPassIdentity(
      req,
      {
        id: user.id,
        email: finalEmail,
      },
      password
    )
  } catch (error: any) {
    res.status(400).json({
      message: error?.message || "Failed to configure email/password login.",
    })
    return
  }

  const updatedUser = await userModuleService.updateUsers({
    id: user.id,
    metadata: toSuperAdminMetadata(user.metadata),
  })

  res.json({
    message: "Super admin is ready.",
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      metadata: updatedUser.metadata,
    },
  })
}
