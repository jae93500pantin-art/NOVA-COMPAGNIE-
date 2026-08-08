"use client";

import { useEffect, useState } from "react";
import type { Driver } from "@/lib/types";
import {
  getDriverOverrides,
  mergeCar,
  DRIVER_OVERRIDES_EVENT,
} from "@/lib/driverOverrides";

/**
 * Make / model / year / colour on the (statically generated) public profile.
 * Client-side so the description a driver just typed shows without a rebuild.
 */
export function DriverVehicle({ driver }: { driver: Driver }) {
  const [car, setCar] = useState(driver.car);

  useEffect(() => {
    const sync = () => setCar(mergeCar(driver, getDriverOverrides(driver.id)));
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [driver]);

  return (
    <div>
      <p className="text-base font-medium text-white">
        {car.make} {car.model}
      </p>
      <p className="text-sm text-white/50">
        {car.year} · {car.color}
      </p>
    </div>
  );
}
