import Link from "next/link";
import Image from "next/image";
import { PublicTopBarCorner } from "@/components/public/PublicTopBarCorner";
import { getLocale } from "@/lib/i18n/server";

export default async function AppHeader() {
  const locale = await getLocale();

  return (
    <header className="border-b border-white/10 bg-[#08111f]/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-2 px-3 py-3 sm:px-4 sm:py-4">
        <Link href="/" className="flex min-w-0 shrink-0 items-center">
          <Image
            src="/logo-main.png"
            alt="List.golf"
            width={150}
            height={50}
            priority
            className="h-auto w-auto max-w-[min(140px,42vw)] sm:max-w-[150px]"
          />
        </Link>

        <PublicTopBarCorner locale={locale} />
      </div>
    </header>
  );
}
