import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerOrder from "./models/seller-order"

class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerOrder,
}) {}

export default MarketplaceModuleService
