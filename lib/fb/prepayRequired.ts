import type { DeliveryType } from "./types";

/** Para llevar y domicilio en fraccionamiento se cobran por adelantado. */
export function requiresPrepay(deliveryType: DeliveryType): boolean {
  return deliveryType === "pickup" || deliveryType === "home";
}
