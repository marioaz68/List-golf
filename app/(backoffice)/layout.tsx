import Sidebar from "@/components/layout/Sidebar";
import BrowserBehaviorFix from "@/components/ui/BrowserBehaviorFix";

export default function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <BrowserBehaviorFix />

      <div className="flex min-h-screen overflow-hidden bg-[#0F1720] text-white">
        <Sidebar />

        <main className="flex-1 overflow-auto overscroll-x-none p-6">
          {children}
        </main>
      </div>
    </>
  );
}