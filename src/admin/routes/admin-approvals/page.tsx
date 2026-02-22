"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react"

type AdminApprovalStatus = "super_admin" | "approved" | "pending" | "rejected"

type AdminApprovalUser = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  created_at?: string
  status: AdminApprovalStatus
}

type AdminUsersResponse = {
  count: number
  users: AdminApprovalUser[]
}

type StatusFilter = "all" | AdminApprovalStatus

const STATUS_LABELS: Record<AdminApprovalStatus, string> = {
  super_admin: "Super Admin",
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
}

const STATUS_COLORS: Record<AdminApprovalStatus, { bg: string; text: string; border: string }> =
  {
    super_admin: {
      bg: "#FFF7ED",
      text: "#9A3412",
      border: "#FDBA74",
    },
    approved: {
      bg: "#F0FDF4",
      text: "#166534",
      border: "#86EFAC",
    },
    pending: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#93C5FD",
    },
    rejected: {
      bg: "#FEF2F2",
      text: "#B91C1C",
      border: "#FCA5A5",
    },
  }

const formatName = (user: AdminApprovalUser): string => {
  const firstName = user.first_name?.trim() ?? ""
  const lastName = user.last_name?.trim() ?? ""
  const fullName = `${firstName} ${lastName}`.trim()

  return fullName || "No name"
}

const formatDate = (value?: string) => {
  if (!value) {
    return "-"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

const StatusPill = ({ status }: { status: AdminApprovalStatus }) => {
  const colors = STATUS_COLORS[status]

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "999px",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        padding: "2px 10px",
        fontSize: "12px",
        fontWeight: 600,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6B7280",
  borderBottom: "1px solid #E5E7EB",
  padding: "10px 8px",
}

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #F3F4F6",
  padding: "12px 8px",
  verticalAlign: "middle",
  fontSize: "14px",
  color: "#111827",
}

const actionButtonStyle: CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  background: "#FFFFFF",
  color: "#111827",
  fontSize: "13px",
  padding: "6px 10px",
  cursor: "pointer",
}

const disabledActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  opacity: 0.55,
  cursor: "not-allowed",
}

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "super_admin", label: "Super Admin" },
]

const AdminApprovalsPage = () => {
  const [users, setUsers] = useState<AdminApprovalUser[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [actionError, setActionError] = useState<string>("")
  const [actionSuccess, setActionSuccess] = useState<string>("")
  const [filter, setFilter] = useState<StatusFilter>("pending")
  const [activeActionKey, setActiveActionKey] = useState<string>("")

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const query = filter === "all" ? "" : `?status=${filter}`
      const response = await fetch(`/admin/admin-users${query}`, {
        credentials: "include",
      })
      const payload = (await response.json().catch(() => ({}))) as
        | AdminUsersResponse
        | { message?: string }

      if (!response.ok) {
        throw new Error(
          (payload as { message?: string })?.message ||
            "Failed to fetch admin approvals."
        )
      }

      setUsers((payload as AdminUsersResponse).users ?? [])
    } catch (err: any) {
      setError(err?.message || "Failed to fetch admin approvals.")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const runAction = useCallback(
    async (userId: string, action: "approve" | "reject") => {
      setActionError("")
      setActionSuccess("")

      const actionKey = `${action}:${userId}`
      setActiveActionKey(actionKey)

      try {
        const response = await fetch(`/admin/admin-users/${userId}/${action}`, {
          method: "POST",
          credentials: "include",
        })
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string
        }

        if (!response.ok) {
          throw new Error(
            payload?.message || `Failed to ${action} this admin user.`
          )
        }

        setActionSuccess(
          payload?.message ||
            (action === "approve" ? "Admin approved." : "Admin rejected.")
        )
        await fetchUsers()
      } catch (err: any) {
        setActionError(err?.message || `Failed to ${action} this admin user.`)
      } finally {
        setActiveActionKey("")
      }
    },
    [fetchUsers]
  )

  const summary = useMemo(() => {
    const counts: Record<AdminApprovalStatus, number> = {
      super_admin: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    }

    users.forEach((user) => {
      counts[user.status] += 1
    })

    return counts
  }, [users])

  return (
    <div style={{ padding: "24px", maxWidth: "1200px" }}>
      <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>
        Admin Approval Queue
      </h1>
      <p style={{ color: "#4B5563", marginBottom: "18px" }}>
        Super admin can review, approve, or reject admin access requests.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        {(Object.keys(summary) as AdminApprovalStatus[]).map((status) => (
          <div
            key={status}
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: "10px",
              padding: "10px 12px",
              background: "#FFFFFF",
            }}
          >
            <div style={{ fontSize: "12px", color: "#6B7280" }}>
              {STATUS_LABELS[status]}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              {summary[status]}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="status-filter" style={{ fontSize: "13px" }}>
            Status
          </label>
          <select
            id="status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as StatusFilter)}
            style={{
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              padding: "6px 8px",
              background: "#FFFFFF",
              fontSize: "13px",
            }}
          >
            {filters.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void fetchUsers()}
          style={actionButtonStyle}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: "14px",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            background: "#FEF2F2",
            color: "#991B1B",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div
          style={{
            marginBottom: "14px",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            background: "#FEF2F2",
            color: "#991B1B",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {actionError}
        </div>
      ) : null}

      {actionSuccess ? (
        <div
          style={{
            marginBottom: "14px",
            border: "1px solid #BBF7D0",
            borderRadius: "8px",
            background: "#F0FDF4",
            color: "#166534",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {actionSuccess}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          background: "#FFFFFF",
          overflowX: "auto",
        }}
      >
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={tdStyle} colSpan={5}>
                  Loading approvals...
                </td>
              </tr>
            ) : users.length ? (
              users.map((user) => {
                const isApproving = activeActionKey === `approve:${user.id}`
                const isRejecting = activeActionKey === `reject:${user.id}`
                const isBusy = Boolean(activeActionKey)
                const canApprove = user.status !== "approved" && user.status !== "super_admin"
                const canReject = user.status !== "rejected" && user.status !== "super_admin"

                return (
                  <tr key={user.id}>
                    <td style={tdStyle}>{formatName(user)}</td>
                    <td style={tdStyle}>{user.email}</td>
                    <td style={tdStyle}>
                      <StatusPill status={user.status} />
                    </td>
                    <td style={tdStyle}>{formatDate(user.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={!canApprove || isBusy}
                          onClick={() => void runAction(user.id, "approve")}
                          style={
                            !canApprove || isBusy
                              ? disabledActionButtonStyle
                              : {
                                  ...actionButtonStyle,
                                  border: "1px solid #86EFAC",
                                  color: "#166534",
                                  background: "#F0FDF4",
                                }
                          }
                        >
                          {isApproving ? "Approving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={!canReject || isBusy}
                          onClick={() => void runAction(user.id, "reject")}
                          style={
                            !canReject || isBusy
                              ? disabledActionButtonStyle
                              : {
                                  ...actionButtonStyle,
                                  border: "1px solid #FCA5A5",
                                  color: "#991B1B",
                                  background: "#FEF2F2",
                                }
                          }
                        >
                          {isRejecting ? "Rejecting..." : "Reject"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td style={tdStyle} colSpan={5}>
                  No users found for the selected status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Admin Approvals",
})

export default AdminApprovalsPage
