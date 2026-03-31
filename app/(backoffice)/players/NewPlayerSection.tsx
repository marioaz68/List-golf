"use client";

import { useRouter } from "next/navigation";
import NewPlayerForm from "./NewPlayerForm";

export default function NewPlayerSection() {
  const router = useRouter();

  return (
    <div className="mb-2">
      <NewPlayerForm onCreated={() => router.refresh()} />
    </div>
  );
}