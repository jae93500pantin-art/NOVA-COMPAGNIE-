import type { Driver } from "./types";

/**
 * Annuaire des chauffeurs.
 *
 * ⚠️ **Il est vide, et c'est délibéré.** Il contenait cinq profils inventés —
 * nom, photo, véhicule, note et avis clients fabriqués — sur un site marchand
 * publiquement accessible. Présenter de faux professionnels et de faux avis à
 * des visiteurs qui peuvent réserver relève de la pratique commerciale
 * trompeuse (directive Omnibus), et cela ne se règle pas par un bandeau
 * « démonstration ».
 *
 * Un chauffeur n'apparaît désormais que s'il **s'est inscrit et a été validé**
 * par un administrateur : la source est `public.drivers`, lue par
 * `lib/driverDirectory.ts`. Ce module conserve le type et les accesseurs
 * synchrones pour les chemins qui ne peuvent pas attendre une requête, et sert
 * de repli vide quand la base n'est pas configurée.
 *
 * Conséquence assumée : sans clés Supabase, la marketplace est vide. Chaque
 * écran concerné affiche un état vide explicite plutôt qu'une grille inventée.
 *
 * Les tests utilisent `tests/fixtures/drivers.ts` : ils vérifient des fonctions
 * pures (tarifs, transferts, surcharges), pas le contenu de l'annuaire.
 */
export const drivers: Driver[] = [];

export const getDriver = (id: string) => drivers.find((d) => d.id === id);

export const driversByCity = (cityId: string) =>
  drivers.filter((d) => d.cityId === cityId);
