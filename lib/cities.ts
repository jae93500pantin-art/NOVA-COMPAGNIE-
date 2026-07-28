import type { City } from "./types";

export const cities: City[] = [
  {
    id: "paris",
    name: "Paris",
    country: "France",
    countryCode: "FR",
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",
    driversCount: 248,
    mapX: 50,
    mapY: 38,
    primary: true,
  },
];

export const getCity = (id: string) => cities.find((c) => c.id === id);
