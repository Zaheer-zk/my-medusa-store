import crypto from "crypto"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

type PhonePeProviderOptions = {
  clientId: string
  clientSecret: string
  clientVersion: string | number
  merchantId: string
  environment?: "sandbox" | "production"
  baseUrl?: string
  redirectUrl?: string
  expireAfter?: number
}

type PhonePeTokenState = {
  token: string
  expiresAt: number
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "")

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getStringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length ? value.trim() : undefined

const getRecordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const toMinorAmount = (amount: unknown): number =>
  Math.max(0, Math.round(toNumber(amount) * 100))

const toMajorAmount = (amountInMinor: unknown): number =>
  Math.round((toNumber(amountInMinor) / 100) * 100) / 100

const generateMerchantOrderId = (): string =>
  `PP_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`

const mapPhonePeState = (
  state: unknown,
  defaultStatus: PaymentSessionStatus = PaymentSessionStatus.PENDING
): PaymentSessionStatus => {
  const normalized = getStringValue(state)?.toUpperCase()

  switch (normalized) {
    case "COMPLETED":
    case "SUCCESS":
    case "CAPTURED":
      return PaymentSessionStatus.AUTHORIZED
    case "PENDING":
      return PaymentSessionStatus.PENDING
    case "FAILED":
    case "FAILURE":
    case "DECLINED":
      return PaymentSessionStatus.ERROR
    case "CANCELED":
    case "CANCELLED":
      return PaymentSessionStatus.CANCELED
    default:
      return defaultStatus
  }
}

const mapPhonePeStateToAction = (state: unknown): PaymentActions => {
  const mappedStatus = mapPhonePeState(state)

  switch (mappedStatus) {
    case PaymentSessionStatus.AUTHORIZED:
      return PaymentActions.AUTHORIZED
    case PaymentSessionStatus.CAPTURED:
      return PaymentActions.SUCCESSFUL
    case PaymentSessionStatus.PENDING:
      return PaymentActions.PENDING
    case PaymentSessionStatus.REQUIRES_MORE:
      return PaymentActions.REQUIRES_MORE
    case PaymentSessionStatus.CANCELED:
      return PaymentActions.CANCELED
    case PaymentSessionStatus.ERROR:
      return PaymentActions.FAILED
    default:
      return PaymentActions.NOT_SUPPORTED
  }
}

class PhonePePaymentProviderService extends AbstractPaymentProvider<PhonePeProviderOptions> {
  static identifier = "phonepe"

  protected readonly options_: PhonePeProviderOptions
  protected tokenState_: PhonePeTokenState | null = null

  static validateOptions(options: PhonePeProviderOptions): void {
    if (!getStringValue(options?.clientId)) {
      throw new Error("PhonePe provider: `clientId` is required")
    }

    if (!getStringValue(options?.clientSecret)) {
      throw new Error("PhonePe provider: `clientSecret` is required")
    }

    if (!getStringValue(options?.merchantId)) {
      throw new Error("PhonePe provider: `merchantId` is required")
    }

    if (!getStringValue(options?.clientVersion)) {
      throw new Error("PhonePe provider: `clientVersion` is required")
    }
  }

  constructor(
    container: Record<string, unknown>,
    options: PhonePeProviderOptions
  ) {
    super(container, options)

    this.options_ = {
      environment: "sandbox",
      expireAfter: 1200,
      ...options,
    }
  }

  private getBaseUrl(): string {
    if (getStringValue(this.options_.baseUrl)) {
      return trimTrailingSlash(this.options_.baseUrl!)
    }

    if (this.options_.environment === "production") {
      return "https://api.phonepe.com/apis/pg"
    }

    return "https://api-preprod.phonepe.com/apis/pg-sandbox"
  }

  private resolveMerchantOrderId(data?: Record<string, unknown>): string {
    const existing =
      getStringValue(data?.merchant_order_id) ||
      getStringValue(data?.order_id) ||
      getStringValue(data?.id)

    return existing || generateMerchantOrderId()
  }

  private resolveRedirectUrl(data?: Record<string, unknown>): string {
    const fromData = getStringValue(data?.redirect_url)

    if (fromData) {
      return fromData
    }

    const fromOptions = getStringValue(this.options_.redirectUrl)

    if (fromOptions) {
      return fromOptions
    }

    const fromEnv = getStringValue(process.env.PHONEPE_REDIRECT_URL)

    if (fromEnv) {
      return fromEnv
    }

    return "http://localhost:8000/payment/phonepe/redirect"
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.tokenState_ &&
      Date.now() < this.tokenState_.expiresAt - 60_000
    ) {
      return this.tokenState_.token
    }

    const response = await fetch(`${this.getBaseUrl()}/v1/oauth/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.options_.clientId,
        client_secret: this.options_.clientSecret,
        client_version: String(this.options_.clientVersion),
        grant_type: "client_credentials",
      }).toString(),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    const responseData = getRecordValue(payload.data)
    const token =
      getStringValue(payload.access_token) ||
      getStringValue(responseData.access_token)

    if (!response.ok || !token) {
      throw new Error(
        `PhonePe auth failed (${response.status}): ${
          getStringValue(payload.message) || "Unable to retrieve access token"
        }`
      )
    }

    const expiresAtRaw =
      toNumber(payload.expires_at) || toNumber(responseData.expires_at)
    const expiresAt =
      expiresAtRaw > 1_000_000_000_000
        ? expiresAtRaw
        : expiresAtRaw > 1_000_000_000
        ? expiresAtRaw * 1000
        : expiresAtRaw > 0
        ? Date.now() + expiresAtRaw * 1000
        : Date.now() + 50 * 60 * 1000

    this.tokenState_ = {
      token,
      expiresAt,
    }

    return token
  }

  private async sendAuthorizedRequest(
    path: string,
    method: string,
    body?: Record<string, unknown>,
    retryOnAuth = true
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken()
    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `O-Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401 && retryOnAuth) {
      this.tokenState_ = null
      return this.sendAuthorizedRequest(path, method, body, false)
    }

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    const success =
      payload.success === true ||
      getStringValue(payload.code) === "PAYMENT_INITIATED" ||
      getStringValue(payload.code) === "PAYMENT_SUCCESS"

    if (!response.ok || payload.success === false) {
      throw new Error(
        `PhonePe request failed (${response.status}): ${
          getStringValue(payload.message) || "Unknown error"
        }`
      )
    }

    if (!success && getStringValue(payload.code)?.endsWith("FAILED")) {
      throw new Error(
        `PhonePe request error: ${getStringValue(payload.message) || "Unknown"}`
      )
    }

    return payload
  }

  private extractState(response: Record<string, unknown>): string | undefined {
    const data = getRecordValue(response.data)

    return (
      getStringValue(data.state) ||
      getStringValue(response.state) ||
      getStringValue(response.code)
    )
  }

  private buildSessionData(
    sourceData: Record<string, unknown> | undefined,
    merchantOrderId: string,
    amount: number,
    currencyCode: string,
    response: Record<string, unknown>
  ): Record<string, unknown> {
    const data = getRecordValue(response.data)

    return {
      ...(sourceData || {}),
      id: merchantOrderId,
      order_id: merchantOrderId,
      merchant_order_id: merchantOrderId,
      provider: "phonepe",
      merchant_id: this.options_.merchantId,
      amount,
      amount_minor: toMinorAmount(amount),
      currency_code: currencyCode.toUpperCase(),
      redirect_url:
        getStringValue(data.redirectUrl) || this.resolveRedirectUrl(sourceData),
      gateway_response: response,
    }
  }

  private async fetchOrderStatus(
    merchantOrderId: string
  ): Promise<Record<string, unknown>> {
    return this.sendAuthorizedRequest(
      `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`,
      "GET"
    )
  }

  async initiatePayment(input: {
    amount: unknown
    currency_code: string
    data?: Record<string, unknown>
  }) {
    const merchantOrderId = this.resolveMerchantOrderId(input.data)
    const currencyCode = (input.currency_code || "INR").toUpperCase()
    const amount = toNumber(input.amount)

    if (currencyCode !== "INR") {
      throw new Error("PhonePe provider only supports INR currency")
    }

    const createPaymentResponse = await this.sendAuthorizedRequest(
      "/checkout/v2/pay",
      "POST",
      {
        merchantOrderId,
        amount: toMinorAmount(amount),
        expireAfter: toNumber(input.data?.expire_after) || this.options_.expireAfter,
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: "Complete payment",
          merchantUrls: {
            redirectUrl: this.resolveRedirectUrl(input.data),
          },
        },
      }
    )

    const state = this.extractState(createPaymentResponse)
    const sessionData = this.buildSessionData(
      input.data,
      merchantOrderId,
      amount,
      currencyCode,
      createPaymentResponse
    )

    return {
      id: merchantOrderId,
      status: mapPhonePeState(state, PaymentSessionStatus.REQUIRES_MORE),
      data: {
        ...sessionData,
        state,
      },
    }
  }

  async updatePayment(input: {
    amount: unknown
    currency_code: string
    data?: Record<string, unknown>
  }) {
    const currentAmount = toNumber(input.data?.amount)
    const nextAmount = toNumber(input.amount)

    if (currentAmount === nextAmount) {
      const currentStatus = mapPhonePeState(
        input.data?.state,
        PaymentSessionStatus.PENDING
      )

      return {
        status: currentStatus,
        data: input.data || {},
      }
    }

    const next = await this.initiatePayment({
      amount: input.amount,
      currency_code: input.currency_code,
      data: {
        ...(input.data || {}),
        id: undefined,
        order_id: undefined,
        merchant_order_id: undefined,
      },
    })

    return {
      status: next.status,
      data: {
        ...(next.data || {}),
        id: next.id,
      },
    }
  }

  async authorizePayment(input: { data?: Record<string, unknown> }) {
    const merchantOrderId = this.resolveMerchantOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(merchantOrderId)
    const state = this.extractState(statusResponse)
    const status = mapPhonePeState(state)

    return {
      status,
      data: {
        ...(input.data || {}),
        id: merchantOrderId,
        order_id: merchantOrderId,
        merchant_order_id: merchantOrderId,
        state,
        gateway_status_response: statusResponse,
      },
    }
  }

  async capturePayment(input: { data?: Record<string, unknown> }) {
    const authorization = await this.authorizePayment(input)

    if (
      authorization.status !== PaymentSessionStatus.AUTHORIZED &&
      authorization.status !== PaymentSessionStatus.CAPTURED
    ) {
      throw new Error(
        `PhonePe payment cannot be captured in status "${authorization.status}"`
      )
    }

    return {
      data: {
        ...(authorization.data || {}),
        captured_at: new Date().toISOString(),
      },
    }
  }

  async refundPayment(input: { amount: unknown; data?: Record<string, unknown> }) {
    const merchantOrderId = this.resolveMerchantOrderId(input.data)
    const merchantRefundId =
      getStringValue(input.data?.merchant_refund_id) ||
      `RFD_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
    const response = await this.sendAuthorizedRequest("/checkout/v2/refund", "POST", {
      merchantRefundId,
      originalMerchantOrderId: merchantOrderId,
      amount: toMinorAmount(input.amount),
    })

    return {
      data: {
        ...(input.data || {}),
        merchant_refund_id: merchantRefundId,
        gateway_refund_response: response,
      },
    }
  }

  async retrievePayment(input: { data?: Record<string, unknown> }) {
    const merchantOrderId = this.resolveMerchantOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(merchantOrderId)
    const state = this.extractState(statusResponse)

    return {
      data: {
        ...(input.data || {}),
        id: merchantOrderId,
        order_id: merchantOrderId,
        merchant_order_id: merchantOrderId,
        state,
        gateway_status_response: statusResponse,
      },
    }
  }

  async cancelPayment(input: { data?: Record<string, unknown> }) {
    return {
      data: {
        ...(input.data || {}),
        canceled_at: new Date().toISOString(),
      },
    }
  }

  async deletePayment(input: { data?: Record<string, unknown> }) {
    return this.cancelPayment(input)
  }

  async getPaymentStatus(input: { data?: Record<string, unknown> }) {
    const merchantOrderId = this.resolveMerchantOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(merchantOrderId)
    const state = this.extractState(statusResponse)

    return {
      status: mapPhonePeState(state),
      data: {
        ...(input.data || {}),
        id: merchantOrderId,
        order_id: merchantOrderId,
        merchant_order_id: merchantOrderId,
        state,
        gateway_status_response: statusResponse,
      },
    }
  }

  async getWebhookActionAndData(payload: {
    data?: Record<string, unknown>
    rawData?: string | Buffer
    headers?: Record<string, unknown>
  }) {
    const webhook = getRecordValue(payload?.data)
    const webhookData = getRecordValue(webhook.data)
    const sessionId =
      getStringValue(webhookData.merchantOrderId) ||
      getStringValue(webhookData.orderId) ||
      getStringValue(webhookData.merchant_order_id)
    const state =
      getStringValue(webhookData.state) ||
      getStringValue(webhookData.paymentState) ||
      getStringValue(webhook.state)
    const amountInMinor =
      toNumber(webhookData.amount) || toNumber(webhookData.paymentAmount)
    const action = mapPhonePeStateToAction(state)

    if (!sessionId) {
      return {
        action: PaymentActions.NOT_SUPPORTED,
      }
    }

    return {
      action,
      data: {
        session_id: sessionId,
        amount: toMajorAmount(amountInMinor),
      },
    }
  }
}

export default PhonePePaymentProviderService
