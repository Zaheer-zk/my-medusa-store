import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PaytmPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PaytmPaymentProviderService],
})
