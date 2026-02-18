import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import {
  hasAdminAccess,
  retrieveUserById,
} from "../../../utils/admin-user-access"

const ACTOR_TYPE = "user"
const AUTH_PROVIDER = "emailpass"

const getRolesForUser = async (req: MedusaRequest, userId: string): Promise<string[]> => {
  try {
    const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
    const result = (await query.graph({
      entity: "user",
      fields: ["rbac_roles.id"],
      filters: { id: userId },
    })) as { data: Array<{ rbac_roles?: Array<{ id: string }> }> }

    return result.data?.[0]?.rbac_roles?.map((role) => role.id) ?? []
  } catch {
    return []
  }
}

async function authenticateAdminUser(req: MedusaRequest, res: MedusaResponse) {
  const config = req.scope.resolve<any>(ContainerRegistrationKeys.CONFIG_MODULE)
  const authModuleService = req.scope.resolve<any>(Modules.AUTH)
  const authData = {
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
    protocol: req.protocol,
  }

  const { success, error, authIdentity, location } = await authModuleService.authenticate(
    AUTH_PROVIDER,
    authData
  )

  if (location) {
    res.status(200).json({ location })
    return
  }

  if (!success || !authIdentity) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, error || "Authentication failed")
  }

  const userId = authIdentity?.app_metadata?.user_id

  if (typeof userId !== "string" || !userId.length) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "No admin user is linked to this account."
    )
  }

  const user = await retrieveUserById(req, userId)

  if (!user || !hasAdminAccess(user)) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Admin login is blocked until a super admin approves this account."
    )
  }

  const roles = await getRolesForUser(req, userId)
  const providerIdentity = authIdentity.provider_identities?.find(
    (identity: any) => identity.provider === AUTH_PROVIDER
  )
  const { http } = config.projectConfig
  const token = generateJwtToken(
    {
      actor_id: userId,
      actor_type: ACTOR_TYPE,
      auth_identity_id: authIdentity.id ?? "",
      app_metadata: {
        ...(authIdentity.app_metadata ?? {}),
        user_id: userId,
        roles,
      },
      user_metadata: providerIdentity?.user_metadata ?? {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  )

  res.status(200).json({ token })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await authenticateAdminUser(req, res)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  await authenticateAdminUser(req, res)
}
