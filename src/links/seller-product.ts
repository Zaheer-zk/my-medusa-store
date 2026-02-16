import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/product"
import MarketplaceModule from "../modules/marketplace"

export default defineLink(
  ProductModule.linkable.product,
  MarketplaceModule.linkable.seller
)
