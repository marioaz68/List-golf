/**
 * /captura/distancias/demo — alias del modo prueba en la misma pantalla Yardas.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

export default async function DistanciasDemoPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") p.set(key, value);
    else if (Array.isArray(value) && value[0]) p.set(key, value[0]);
  }
  p.set("prueba", "1");
  redirect(`/captura/distancias?${p.toString()}`);
}
