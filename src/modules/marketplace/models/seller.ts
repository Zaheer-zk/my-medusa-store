import { model } from "@medusajs/framework/utils"
import SellerOrder from "./seller-order"

const Seller = model.define("seller", {
  id: model.id({ prefix: "sel" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  email: model.text().searchable().nullable(),
  phone: model.text().nullable(),
  commission_rate: model.number().default(0),
  is_active: model.boolean().default(true),
  metadata: model.json().nullable(),
  seller_orders: model.hasMany(() => SellerOrder, {
    mappedBy: "seller",
  }),
})

export default Seller
