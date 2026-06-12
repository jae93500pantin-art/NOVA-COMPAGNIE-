import { Suspense } from "react";
import { RealMessages } from "@/components/RealMessages";

export const metadata = { title: "Messagerie — LumeCar" };

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-7xl px-0 pb-4 pt-24 sm:px-5 sm:pb-10 sm:pt-28 lg:px-8 lg:pt-32">
      <Suspense fallback={null}>
        <RealMessages />
      </Suspense>
    </div>
  );
}
