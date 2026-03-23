import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <LoginForm />
      </div>
    </div>
  );
}