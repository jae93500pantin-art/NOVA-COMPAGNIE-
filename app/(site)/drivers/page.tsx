import { Suspense } from "react";
import { DriversExplorer } from "@/components/DriversExplorer";
import { DriversIntro } from "@/components/DriversIntro";

export const metadata = {
  title: "Chauffeurs privés — Nova Compagnie",
};

export default function DriversPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-32 lg:px-8 lg:pt-36">
      <DriversIntro />
      <Suspense fallback={<div className="text-white/40">…</div>}>
        <DriversExplorer />
      </Suspense>
    </div>
  );
}
