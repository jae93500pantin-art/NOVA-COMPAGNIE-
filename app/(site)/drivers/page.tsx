import { Suspense } from "react";
import { DriversExplorer } from "@/components/DriversExplorer";

export const metadata = {
  title: "Chauffeurs privés — LumeCar",
};

export default function DriversPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-32 lg:px-8 lg:pt-36">
      <div className="mb-10">
        <span className="section-eyebrow mb-4">Explorer</span>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Trouvez votre chauffeur d'exception
        </h1>
        <p className="mt-3 max-w-xl text-white/55">
          Filtrez par ville, catégorie de véhicule et disponibilité pour
          dénicher le professionnel idéal.
        </p>
      </div>
      <Suspense fallback={<div className="text-white/40">Chargement…</div>}>
        <DriversExplorer />
      </Suspense>
    </div>
  );
}
