import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())
const nodeEnv = process.env.NODE_ENV || "development"

const paytmMissingVars = [
  "PAYTM_MERCHANT_ID",
  "PAYTM_MERCHANT_KEY",
].filter((key) => !process.env[key])
const phonepeMissingVars = [
  "PHONEPE_CLIENT_ID",
  "PHONEPE_CLIENT_SECRET",
  "PHONEPE_MERCHANT_ID",
].filter((key) => !process.env[key])

const paytmProviderConfigured = paytmMissingVars.length === 0
const phonepeProviderConfigured = phonepeMissingVars.length === 0

const adminDisabled = process.env.MEDUSA_DISABLE_ADMIN === "true"
const requirePaymentProviders = nodeEnv === "production"

if (
  requirePaymentProviders &&
  (!paytmProviderConfigured || !phonepeProviderConfigured)
) {
  throw new Error(
    "Paytm and PhonePe are required in production. Set PAYTM_* and PHONEPE_* environment variables."
  )
}

if (nodeEnv !== "test") {
  if (!paytmProviderConfigured) {
    console.warn(
      `[config] Paytm disabled. Missing vars: ${paytmMissingVars.join(", ")}`
    )
  }

  if (!phonepeProviderConfigured) {
    console.warn(
      `[config] PhonePe disabled. Missing vars: ${phonepeMissingVars.join(", ")}`
    )
  }

  if (!paytmProviderConfigured && !phonepeProviderConfigured) {
    console.warn(
      "[config] No payment gateways are enabled. Configure PAYTM_* and/or PHONEPE_* vars."
    )
  }
}

const paymentProviders = [
  ...(paytmProviderConfigured
    ? [
        {
          resolve: "./src/modules/payment-paytm",
          id: "paytm",
          options: {
            merchantId: process.env.PAYTM_MERCHANT_ID,
            merchantKey: process.env.PAYTM_MERCHANT_KEY,
            websiteName: process.env.PAYTM_WEBSITE_NAME,
            callbackUrl: process.env.PAYTM_CALLBACK_URL,
            environment:
              process.env.PAYTM_ENVIRONMENT === "production"
                ? "production"
                : "staging",
          },
        },
      ]
    : []),
  ...(phonepeProviderConfigured
    ? [
        {
          resolve: "./src/modules/payment-phonepe",
          id: "phonepe",
          options: {
            clientId: process.env.PHONEPE_CLIENT_ID,
            clientSecret: process.env.PHONEPE_CLIENT_SECRET,
            clientVersion: process.env.PHONEPE_CLIENT_VERSION || "1",
            merchantId: process.env.PHONEPE_MERCHANT_ID,
            redirectUrl: process.env.PHONEPE_REDIRECT_URL,
            environment:
              process.env.PHONEPE_ENVIRONMENT === "production"
                ? "production"
                : "sandbox",
            baseUrl: process.env.PHONEPE_BASE_URL,
          },
        },
      ]
    : []),
]

module.exports = defineConfig({
  admin: {
    disable: adminDisabled,
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "@medusajs/payment",
      options: {
        providers: paymentProviders,
      },
    },
    {
      resolve: "./src/modules/marketplace",
    },
  ],
})
