import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PhonePePaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PhonePePaymentProviderService],
})
