import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  normalizeEmail,
  retrieveUserByEmail,
} from "../../../../utils/admin-user-access"

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const buildPendingAdminMetadata = (): Record<string, unknown> => ({
  is_super_admin: false,
  is_admin_approved: false,
  admin_approval_status: "pending",
  admin_requested_at: new Date().toISOString(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const rawEmail = readString(body.email)
  const password = readString(body.password)
  const firstName = readString(body.first_name)
  const lastName = readString(body.last_name)

  if (!rawEmail || !password) {
    res.status(400).json({
      message: "email and password are required.",
    })
    return
  }

  const email = normalizeEmail(rawEmail)
  const existingUser = await retrieveUserByEmail(req, email)

  if (existingUser) {
    res.status(409).json({
      message: "An admin account with this email already exists.",
    })
    return
  }

  const authModuleService = req.scope.resolve<any>(Modules.AUTH)
  const userModuleService = req.scope.resolve<any>(Modules.USER)
  const existingIdentities = await authModuleService.listAuthIdentities({
    provider_identities: {
      entity_id: email,
      provider: "emailpass",
    },
  })

  if (existingIdentities?.length) {
    res.status(409).json({
      message: "Email is already registered. Please contact super admin for approval.",
    })
    return
  }

  const createdUser = await userModuleService.createUsers({
    email,
    first_name: firstName,
    last_name: lastName,
    metadata: buildPendingAdminMetadata(),
  })

  const { success, error, authIdentity } = await authModuleService.register("emailpass", {
    body: {
      email,
      password,
    },
  })

  if (!success || !authIdentity) {
    await userModuleService.deleteUsers([createdUser.id]).catch(() => undefined)
    res.status(400).json({
      message: error || "Failed to register admin credentials.",
    })
    return
  }

  await authModuleService.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: {
      ...(authIdentity.app_metadata ?? {}),
      user_id: createdUser.id,
    },
  })

  res.status(201).json({
    message: "Admin registration submitted. Awaiting super admin approval.",
    user: {
      id: createdUser.id,
      email: createdUser.email,
      metadata: createdUser.metadata,
    },
  })
}
