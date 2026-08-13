import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = Promise<{ next?: string | string[] }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: SP;
}) {
  const sp = (await searchParams) ?? {};
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <LoginForm next={next} />
      </div>
    </div>
  );
}