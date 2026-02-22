import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type AdminUserDTO = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown> | null
}

export type AdminApprovalStatus =
  | "super_admin"
  | "approved"
  | "pending"
  | "rejected"

const DEFAULT_USER_FIELDS = ["id", "email", "first_name", "last_name", "metadata"]

export const normalizeEmail = (value: string): string => value.trim().toLowerCase()

export const toMetadataRecord = (
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> => {
  if (!metadata || typeof metadata !== "object") {
    return {}
  }

  return metadata
}

export const isSuperAdmin = (user: Pick<AdminUserDTO, "metadata"> | null | undefined): boolean =>
  toMetadataRecord(user?.metadata).is_super_admin === true

export const isApprovedAdmin = (
  user: Pick<AdminUserDTO, "metadata"> | null | undefined
): boolean => toMetadataRecord(user?.metadata).is_admin_approved === true

export const hasAdminAccess = (user: Pick<AdminUserDTO, "metadata"> | null | undefined): boolean =>
  isSuperAdmin(user) || isApprovedAdmin(user)

export const getAdminApprovalStatus = (
  user: Pick<AdminUserDTO, "metadata"> | null | undefined
): AdminApprovalStatus => {
  const metadata = toMetadataRecord(user?.metadata)

  if (metadata.is_super_admin === true) {
    return "super_admin"
  }

  if (metadata.is_admin_approved === true) {
    return "approved"
  }

  if (metadata.admin_approval_status === "rejected") {
    return "rejected"
  }

  return "pending"
}

export async function retrieveUserById(
  req: MedusaRequest,
  id: string,
  fields: string[] = DEFAULT_USER_FIELDS
): Promise<AdminUserDTO | null> {
  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const response = (await query.graph({
    entity: "user",
    fields,
    filters: { id },
  })) as { data: AdminUserDTO[] }

  return response.data?.[0] ?? null
}

export async function retrieveUserByEmail(
  req: MedusaRequest,
  email: string,
  fields: string[] = DEFAULT_USER_FIELDS
): Promise<AdminUserDTO | null> {
  const query = req.scope.resolve<any>(ContainerRegistrationKeys.QUERY)
  const response = (await query.graph({
    entity: "user",
    fields,
    filters: { email: normalizeEmail(email) },
  })) as { data: AdminUserDTO[] }

  return response.data?.[0] ?? null
}
