import { defineLink } from "@medusajs/framework/utils"
import UserModule from "@medusajs/user"
import MarketplaceModule from "../modules/marketplace"

export default defineLink(
  UserModule.linkable.user,
  MarketplaceModule.linkable.seller
)
