"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  getDriverOverrides,
  DRIVER_OVERRIDES_EVENT,
} from "@/lib/driverOverrides";

/**
 * Driver profile picture on the (statically generated) public profile.
 * Client-side so a picture the driver just uploaded shows without a rebuild —
 * same pattern as `Gallery` for the vehicle photos.
 */
export function DriverAvatar({
  driverId,
  avatar,
  alt,
}: {
  driverId: string;
  avatar: string;
  alt: string;
}) {
  const [src, setSrc] = useState(avatar);

  useEffect(() => {
    const sync = () => setSrc(getDriverOverrides(driverId).avatar || avatar);
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [driverId, avatar]);

  // An uploaded picture is a data URL, which next/image cannot optimise.
  if (src.startsWith("data:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="h-full w-full object-cover" />;
  }
  return (
    <Image src={src} alt={alt} fill sizes="96px" className="object-cover" />
  );
}
