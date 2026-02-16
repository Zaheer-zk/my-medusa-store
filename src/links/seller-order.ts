import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/order"
import MarketplaceModule from "../modules/marketplace"

export default defineLink(
  OrderModule.linkable.order,
  MarketplaceModule.linkable.seller
)
