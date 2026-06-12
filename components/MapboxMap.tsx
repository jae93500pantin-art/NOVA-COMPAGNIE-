"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Map, { Marker, Popup, NavigationControl } from "react-map-gl";
import { Car, Navigation } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Driver } from "@/lib/types";
import { driverCoords } from "@/lib/geo";
import { env } from "@/lib/config";
import { StarRating } from "./StarRating";

export function MapboxMap({ drivers }: { drivers: Driver[] }) {
  const [active, setActive] = useState<Driver | null>(null);

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 shadow-card">
      <div className="h-[420px] w-full sm:h-[520px]">
        <Map
          mapboxAccessToken={env.mapboxToken}
          initialViewState={{ longitude: -30, latitude: 47, zoom: 2.1 }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={false}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />

          {drivers.map((d) => {
            const [lng, lat] = driverCoords(d);
            const isActive = active?.id === d.id;
            return (
              <Marker
                key={d.id}
                longitude={lng}
                latitude={lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setActive(d);
                }}
              >
                <button
                  className="group relative grid place-items-center"
                  aria-label={`${d.firstName} ${d.lastName}`}
                >
                  {d.available && (
                    <span className="absolute h-10 w-10 animate-pulse-ring rounded-full bg-royal-500/40" />
                  )}
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full border-2 transition-all duration-300 ${
                      isActive
                        ? "scale-125 border-white bg-royal-500 shadow-glow"
                        : "border-white/50 bg-ink-800/90 backdrop-blur group-hover:border-white"
                    }`}
                  >
                    <Car className="h-4 w-4 text-white" />
                  </span>
                </button>
              </Marker>
            );
          })}

          {active && (
            <Popup
              longitude={driverCoords(active)[0]}
              latitude={driverCoords(active)[1]}
              anchor="bottom"
              offset={24}
              closeButton={false}
              onClose={() => setActive(null)}
              className="lumecar-popup"
            >
              <Link
                href={`/drivers/${active.id}`}
                className="flex items-center gap-3 p-1"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={active.avatar}
                    alt={active.firstName}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {active.firstName} {active.lastName}
                  </p>
                  <p className="truncate text-xs text-white/60">
                    {active.car.make} {active.car.model}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StarRating value={active.rating} size={10} showValue />
                    <span className="text-[11px] text-white/50">
                      · €{active.pricePerHour}/h
                    </span>
                  </div>
                </div>
              </Link>
            </Popup>
          )}
        </Map>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs text-white/70">
        <Navigation className="h-3.5 w-3.5 text-royal-400" />
        Temps réel · {drivers.filter((d) => d.available).length} chauffeurs en ligne
      </div>
    </div>
  );
}
