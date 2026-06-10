/**
 * Pantalla "Perfil del restaurante" del backoffice.
 *
 * Edita los datos públicos que se muestran en /restaurante (nombre, contacto,
 * domicilio, política de reembolso). Requisito de Stripe: sitio público del
 * negocio con datos visibles. Editable cuando se quiera.
 */
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "@/lib/fb/businessProfile";
import { loadBusinessProfile } from "@/lib/fb/businessProfileActions";
import RestaurantePerfilClient from "./RestaurantePerfilClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RestaurantePerfilPage() {
  const profile: BusinessProfile =
    (await loadBusinessProfile()) ?? DEFAULT_BUSINESS_PROFILE;
  return <RestaurantePerfilClient initialProfile={profile} />;
}
