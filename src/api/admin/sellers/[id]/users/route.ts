import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { ensureUserSellerLink } from "../../../../../modules/marketplace/utils/link-ops"

type UserSellerLinkDTO = {
  user_id: string
  seller_id: string
}

const normalizeIdList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : []

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)

  const links = (await query.graph({
    entity: "user_seller",
    fields: ["user_id", "seller_id"],
    filters: { seller_id: sellerId },
  })) as { data: UserSellerLinkDTO[] }

  const userIds = Array.from(new Set((links.data ?? []).map((link) => link.user_id)))

  const users = userIds.length
    ? ((await query.graph({
        entity: "user",
        fields: ["id", "email", "first_name", "last_name"],
        filters: { id: userIds },
      })) as { data: any[] })
    : { data: [] as any[] }

  res.json({
    seller_id: sellerId,
    count: users.data.length,
    users: users.data,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>
  const userIds = normalizeIdList(body.user_ids)

  if (!userIds.length) {
    res.status(400).json({ message: "user_ids must be a non-empty string array" })
    return
  }

  const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
  await marketplace.retrieveSeller(sellerId)

  for (const userId of userIds) {
    await ensureUserSellerLink(req.scope, userId, sellerId)
  }

  res.json({
    seller_id: sellerId,
    linked_user_ids: userIds,
  })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>
  const userIds = normalizeIdList(body.user_ids)

  if (!userIds.length) {
    res.status(400).json({ message: "user_ids must be a non-empty string array" })
    return
  }

  const link = req.scope.resolve<any>(ContainerRegistrationKeys.LINK)

  await link.dismiss(
    userIds.map((userId) => ({
      [Modules.USER]: {
        user_id: userId,
      },
      [MARKETPLACE_MODULE]: {
        seller_id: sellerId,
      },
    }))
  )

  res.json({
    seller_id: sellerId,
    unlinked_user_ids: userIds,
  })
}
