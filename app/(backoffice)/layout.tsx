import BackofficeLayoutClient from "@/components/layout/BackofficeLayoutClient";
import { getLocale } from "@/lib/i18n/server";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return <BackofficeLayoutClient locale={locale}>{children}</BackofficeLayoutClient>;
}
