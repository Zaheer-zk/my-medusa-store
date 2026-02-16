import crypto from "crypto"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

// `paytmchecksum` doesn't ship TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PaytmChecksum = require("paytmchecksum")

type PaytmProviderOptions = {
  merchantId: string
  merchantKey: string
  websiteName?: string
  callbackUrl?: string
  environment?: "staging" | "production"
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "")

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toCurrencyAmount = (value: unknown): string =>
  (Math.round(toNumber(value) * 100) / 100).toFixed(2)

const getStringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length ? value.trim() : undefined

const getRecordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const generateOrderId = (): string =>
  `PTM_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`

const mapPaytmStatus = (
  status: unknown,
  defaultStatus: PaymentSessionStatus = PaymentSessionStatus.PENDING
): PaymentSessionStatus => {
  const normalized = getStringValue(status)?.toUpperCase()

  switch (normalized) {
    case "TXN_SUCCESS":
    case "SUCCESS":
      return PaymentSessionStatus.AUTHORIZED
    case "S":
      return PaymentSessionStatus.REQUIRES_MORE
    case "PENDING":
    case "U":
      return PaymentSessionStatus.PENDING
    case "TXN_FAILURE":
    case "FAILURE":
    case "F":
      return PaymentSessionStatus.ERROR
    case "CANCELLED":
    case "CANCELED":
      return PaymentSessionStatus.CANCELED
    default:
      return defaultStatus
  }
}

const mapPaytmStatusToAction = (status: unknown): PaymentActions => {
  const mappedStatus = mapPaytmStatus(status)

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

class PaytmPaymentProviderService extends AbstractPaymentProvider<PaytmProviderOptions> {
  static identifier = "paytm"

  protected readonly options_: PaytmProviderOptions

  static validateOptions(options: PaytmProviderOptions): void {
    if (!getStringValue(options?.merchantId)) {
      throw new Error("Paytm provider: `merchantId` is required")
    }

    if (!getStringValue(options?.merchantKey)) {
      throw new Error("Paytm provider: `merchantKey` is required")
    }
  }

  constructor(container: Record<string, unknown>, options: PaytmProviderOptions) {
    super(container, options)

    this.options_ = {
      environment: "staging",
      ...options,
    }
  }

  private getBaseUrl(): string {
    if (this.options_.environment === "production") {
      return "https://securegw.paytm.in"
    }

    return "https://securegw-stage.paytm.in"
  }

  private getWebsiteName(): string {
    return (
      getStringValue(this.options_.websiteName) ||
      (this.options_.environment === "production" ? "DEFAULT" : "WEBSTAGING")
    )
  }

  private getCallbackUrl(data?: Record<string, unknown>): string {
    const fromData = getStringValue(data?.callback_url)

    if (fromData) {
      return fromData
    }

    const fromOptions = getStringValue(this.options_.callbackUrl)

    if (fromOptions) {
      return fromOptions
    }

    const fromEnv = getStringValue(process.env.PAYTM_CALLBACK_URL)

    if (fromEnv) {
      return fromEnv
    }

    return "http://localhost:9000/store/payment/paytm/callback"
  }

  private resolveOrderId(data?: Record<string, unknown>): string {
    const existingOrderId =
      getStringValue(data?.order_id) ||
      getStringValue(data?.merchant_order_id) ||
      getStringValue(data?.id)

    return existingOrderId || generateOrderId()
  }

  private async signBody(body: Record<string, unknown>): Promise<string> {
    return PaytmChecksum.generateSignature(
      JSON.stringify(body),
      this.options_.merchantKey
    )
  }

  private async sendSignedRequest(
    path: string,
    body: Record<string, unknown>,
    query: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${trimTrailingSlash(this.getBaseUrl())}${path}`)
    const signature = await this.signBody(body)

    for (const [key, value] of Object.entries(query)) {
      if (value) {
        url.searchParams.set(key, value)
      }
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        head: {
          signature,
        },
        body,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    if (!response.ok) {
      throw new Error(
        `Paytm request failed (${response.status}): ${
          getStringValue(getRecordValue(payload).message) || "Unknown error"
        }`
      )
    }

    return payload
  }

  private extractResultStatus(response: Record<string, unknown>): string | undefined {
    const body = getRecordValue(response.body)
    const resultInfo = getRecordValue(body.resultInfo)
    const txnInfo = getRecordValue(body.txnInfo)

    return (
      getStringValue(resultInfo.resultStatus) ||
      getStringValue(txnInfo.STATUS) ||
      getStringValue(response.STATUS)
    )
  }

  private buildSessionData(
    sourceData: Record<string, unknown> | undefined,
    orderId: string,
    amount: number,
    currencyCode: string,
    gatewayResponse: Record<string, unknown>
  ): Record<string, unknown> {
    const responseBody = getRecordValue(gatewayResponse.body)
    const txnToken = getStringValue(responseBody.txnToken)

    return {
      ...(sourceData || {}),
      id: orderId,
      order_id: orderId,
      merchant_order_id: orderId,
      provider: "paytm",
      amount,
      amount_display: toCurrencyAmount(amount),
      currency_code: currencyCode.toUpperCase(),
      callback_url: this.getCallbackUrl(sourceData),
      txn_token: txnToken,
      checkout_url: `${trimTrailingSlash(
        this.getBaseUrl()
      )}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(
        this.options_.merchantId
      )}&orderId=${encodeURIComponent(orderId)}`,
      gateway_response: gatewayResponse,
    }
  }

  private async fetchOrderStatus(
    orderId: string
  ): Promise<Record<string, unknown>> {
    return this.sendSignedRequest("/v3/order/status", {
      mid: this.options_.merchantId,
      orderId,
    })
  }

  async initiatePayment(input: {
    amount: unknown
    currency_code: string
    data?: Record<string, unknown>
    context?: Record<string, unknown>
  }) {
    const orderId = this.resolveOrderId(input.data)
    const amount = toNumber(input.amount)
    const currencyCode = (input.currency_code || "INR").toUpperCase()

    if (currencyCode !== "INR") {
      throw new Error("Paytm provider only supports INR currency")
    }

    const customerId =
      getStringValue(input.data?.customer_id) ||
      getStringValue(getRecordValue(input.context?.customer).id) ||
      "GUEST"
    const callbackUrl = this.getCallbackUrl(input.data)
    const requestBody = {
      requestType: "Payment",
      mid: this.options_.merchantId,
      websiteName: this.getWebsiteName(),
      orderId,
      callbackUrl,
      txnAmount: {
        value: toCurrencyAmount(amount),
        currency: currencyCode,
      },
      userInfo: {
        custId: customerId,
      },
    }

    const response = await this.sendSignedRequest(
      "/theia/api/v1/initiateTransaction",
      requestBody,
      {
        mid: this.options_.merchantId,
        orderId,
      }
    )

    const resultStatus = this.extractResultStatus(response)
    const sessionData = this.buildSessionData(
      input.data,
      orderId,
      amount,
      currencyCode,
      response
    )

    return {
      id: orderId,
      data: {
        ...sessionData,
        result_status: resultStatus,
      },
      status: mapPaytmStatus(resultStatus, PaymentSessionStatus.REQUIRES_MORE),
    }
  }

  async updatePayment(input: {
    amount: unknown
    currency_code: string
    data?: Record<string, unknown>
    context?: Record<string, unknown>
  }) {
    const currentAmount = toNumber(input.data?.amount)
    const nextAmount = toNumber(input.amount)

    if (currentAmount === nextAmount) {
      const currentStatus = mapPaytmStatus(
        getStringValue(input.data?.result_status),
        PaymentSessionStatus.PENDING
      )

      return {
        data: input.data || {},
        status: currentStatus,
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
      context: input.context,
    })

    return {
      data: {
        ...(next.data || {}),
        id: next.id,
      },
      status: next.status,
    }
  }

  async authorizePayment(input: { data?: Record<string, unknown> }) {
    const orderId = this.resolveOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(orderId)
    const resultStatus = this.extractResultStatus(statusResponse)
    const status = mapPaytmStatus(resultStatus)

    return {
      data: {
        ...(input.data || {}),
        id: orderId,
        order_id: orderId,
        merchant_order_id: orderId,
        result_status: resultStatus,
        gateway_status_response: statusResponse,
      },
      status,
    }
  }

  async capturePayment(input: { data?: Record<string, unknown> }) {
    const authorization = await this.authorizePayment(input)

    if (
      authorization.status !== PaymentSessionStatus.AUTHORIZED &&
      authorization.status !== PaymentSessionStatus.CAPTURED
    ) {
      throw new Error(
        `Paytm payment cannot be captured in status "${authorization.status}"`
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
    const orderId = this.resolveOrderId(input.data)
    const storedResponseBody = getRecordValue(
      getRecordValue(input.data?.gateway_status_response).body
    )
    const storedTxnInfo = getRecordValue(storedResponseBody.txnInfo)
    const txnId =
      getStringValue(input.data?.txn_id) ||
      getStringValue(storedResponseBody.txnId) ||
      getStringValue(storedTxnInfo.TXNID)

    if (!txnId) {
      throw new Error(
        "Paytm refund requires transaction ID. Authorize payment first."
      )
    }

    const refundReference =
      getStringValue(input.data?.last_refund_reference) ||
      `RFND_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`
    const response = await this.sendSignedRequest(
      "/refund/apply",
      {
        mid: this.options_.merchantId,
        txnType: "REFUND",
        orderId,
        txnId,
        refId: refundReference,
        refundAmount: toCurrencyAmount(input.amount),
      },
      {
        mid: this.options_.merchantId,
        orderId,
      }
    )

    return {
      data: {
        ...(input.data || {}),
        last_refund_reference: refundReference,
        gateway_refund_response: response,
      },
    }
  }

  async retrievePayment(input: { data?: Record<string, unknown> }) {
    const orderId = this.resolveOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(orderId)
    const resultStatus = this.extractResultStatus(statusResponse)

    return {
      data: {
        ...(input.data || {}),
        id: orderId,
        order_id: orderId,
        merchant_order_id: orderId,
        result_status: resultStatus,
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
    const orderId = this.resolveOrderId(input.data)
    const statusResponse = await this.fetchOrderStatus(orderId)
    const resultStatus = this.extractResultStatus(statusResponse)

    return {
      status: mapPaytmStatus(resultStatus),
      data: {
        ...(input.data || {}),
        id: orderId,
        order_id: orderId,
        merchant_order_id: orderId,
        result_status: resultStatus,
        gateway_status_response: statusResponse,
      },
    }
  }

  async getWebhookActionAndData(payload: {
    data?: Record<string, unknown>
    rawData?: string | Buffer
    headers?: Record<string, unknown>
  }) {
    const webhookData = getRecordValue(payload?.data)
    const sessionId =
      getStringValue(webhookData.order_id) ||
      getStringValue(webhookData.ORDERID) ||
      getStringValue(webhookData.orderId)
    const status =
      getStringValue(webhookData.STATUS) ||
      getStringValue(webhookData.resultStatus) ||
      getStringValue(getRecordValue(webhookData.resultInfo).resultStatus)
    const amount =
      toNumber(webhookData.txn_amount) ||
      toNumber(webhookData.TXNAMOUNT) ||
      toNumber(webhookData.txnAmount)
    const action = mapPaytmStatusToAction(status)

    if (!sessionId) {
      return {
        action: PaymentActions.NOT_SUPPORTED,
      }
    }

    return {
      action,
      data: {
        session_id: sessionId,
        amount,
      },
    }
  }
}

export default PaytmPaymentProviderService
