import { Suspense } from "react";
import { LiveChat } from "@/components/LiveChat";
import { isValidRoom } from "@/lib/validation";

export const metadata = { title: "Salon live — LumeCar" };

export default function LivePage({
  searchParams,
}: {
  searchParams: { room?: string };
}) {
  const requested = searchParams.room ?? "";
  const room = isValidRoom(requested) ? requested : "salon-demo";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-24 sm:px-5 sm:pt-28 lg:px-8 lg:pt-32">
      <div className="mb-6">
        <span className="section-eyebrow mb-3">Démo temps réel</span>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Conversation live entre vos appareils
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Échangez en direct entre votre PC et votre iPhone sur le même réseau.
          La messagerie s’appuie sur un flux temps réel sécurisé (SSE).
        </p>
      </div>
      <Suspense fallback={null}>
        <LiveChat room={room} />
      </Suspense>
    </div>
  );
}
