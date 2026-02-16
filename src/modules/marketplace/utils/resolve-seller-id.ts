import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type UserSellerLinkDTO = {
  seller_id: string
}

type UserDTO = {
  id: string
  metadata?: Record<string, unknown> | null
}

const readSellerIdHeader = (req: MedusaRequest): string | null => {
  const raw = req.headers["x-seller-id"]

  if (Array.isArray(raw)) {
    return raw[0] ?? null
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim()
  }

  return null
}

const readSellerIdQueryParam = (req: MedusaRequest): string | null => {
  const raw = req.query?.seller_id

  if (Array.isArray(raw)) {
    const first = raw[0]

    if (typeof first === "string" && first.trim()) {
      return first.trim()
    }

    return null
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim()
  }

  return null
}

export async function resolveSellerIdFromRequest(
  req: MedusaRequest
): Promise<string | null> {
  const fromHeader = readSellerIdHeader(req)

  if (fromHeader) {
    return fromHeader
  }

  const actorId = (req as any).auth_context?.actor_id

  if (!actorId) {
    return null
  }

  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const result = (await query.graph({
    entity: "user_seller",
    fields: ["seller_id"],
    filters: { user_id: actorId },
  })) as { data: UserSellerLinkDTO[] }

  const linkedSellerId = result.data?.[0]?.seller_id ?? null

  if (linkedSellerId) {
    return linkedSellerId
  }

  const userResult = (await query.graph({
    entity: "user",
    fields: ["id", "metadata"],
    filters: { id: actorId },
  })) as { data: UserDTO[] }
  const currentUser = userResult.data?.[0]
  const isSuperAdmin = currentUser?.metadata?.is_super_admin === true

  if (!isSuperAdmin) {
    return null
  }

  return readSellerIdQueryParam(req)
}
