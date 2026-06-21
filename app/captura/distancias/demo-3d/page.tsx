/**
 * /captura/distancias/demo-3d — Preview experimental 2.5D/3D (no afecta Yardas en campo).
 */
import DistanciasDemo3DClient from "./DistanciasDemo3DClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DistanciasDemo3DPage() {
  return <DistanciasDemo3DClient />;
}
