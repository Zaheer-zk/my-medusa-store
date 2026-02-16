import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const callbackAck = {
  received: true,
}

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.status(200).json(callbackAck)
}

export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  res.status(200).json(callbackAck)
}
