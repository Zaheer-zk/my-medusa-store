import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const paytmProviderConfigured =
  Boolean(process.env.PAYTM_MERCHANT_ID) &&
  Boolean(process.env.PAYTM_MERCHANT_KEY)

const phonepeProviderConfigured =
  Boolean(process.env.PHONEPE_CLIENT_ID) &&
  Boolean(process.env.PHONEPE_CLIENT_SECRET) &&
  Boolean(process.env.PHONEPE_MERCHANT_ID)

const adminDisabled = process.env.MEDUSA_DISABLE_ADMIN === "true"

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
