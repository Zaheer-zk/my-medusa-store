import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const SellerOrder = model.define("seller_order", {
  id: model.id({ prefix: "selord" }).primaryKey(),
  order_id: model.text().index(),
  currency_code: model.text(),
  item_count: model.number().default(0),
  quantity_total: model.number().default(0),
  subtotal: model.number().default(0),
  tax_total: model.number().default(0),
  shipping_total: model.number().default(0),
  gross_total: model.number().default(0),
  commission_rate: model.number().default(0),
  commission_total: model.number().default(0),
  net_total: model.number().default(0),
  status: model.text().default("pending"),
  metadata: model.json().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "seller_orders",
  }),
})

export default SellerOrder
