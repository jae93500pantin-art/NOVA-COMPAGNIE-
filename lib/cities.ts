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
  {
    id: "london",
    name: "London",
    country: "United Kingdom",
    countryCode: "GB",
    image:
      "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80",
    driversCount: 187,
    mapX: 31,
    mapY: 26,
  },
  {
    id: "barcelona",
    name: "Barcelona",
    country: "Spain",
    countryCode: "ES",
    image:
      "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80",
    driversCount: 132,
    mapX: 44,
    mapY: 64,
  },
  {
    id: "newyork",
    name: "New York",
    country: "United States",
    countryCode: "US",
    image:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80",
    driversCount: 312,
    mapX: 74,
    mapY: 48,
  },
];

export const getCity = (id: string) => cities.find((c) => c.id === id);
