"use client";

import dynamic from "next/dynamic";
import { InteractiveMap } from "./InteractiveMap";
import { isMapboxConfigured } from "@/lib/config";
import type { Driver } from "@/lib/types";

// Load Mapbox only on the client, only when needed.
const MapboxMap = dynamic(
  () => import("./MapboxMap").then((m) => m.MapboxMap),
  { ssr: false }
);

/**
 * Renders the real Mapbox map when a token is configured, otherwise
 * falls back to the bundled stylised map so the prototype always works.
 */
export function LiveMap({ drivers }: { drivers: Driver[] }) {
  if (isMapboxConfigured) {
    return <MapboxMap drivers={drivers} />;
  }
  return <InteractiveMap drivers={drivers} />;
}
