import type { Driver, Review } from "./types";
import { ALL_TRANSFER_DESTINATION_IDS } from "./transfer";

/**
 * Airport transfers are a single global opt-in for a driver (all Paris ⇄
 * airport routes, or none), so mock profiles only ever hold one of two values.
 */
const ALL_TRANSFERS = ALL_TRANSFER_DESTINATION_IDS;
const NO_TRANSFERS: string[] = [];

const car = (make: string, model: string, year: number, color: string, photos: string[]) => ({
  make,
  model,
  year,
  color,
  photos,
});

const MERCEDES_S = [
  "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=80",
];
const MERCEDES_E = [
  "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1200&q=80",
];
const BMW7 = [
  "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
];
const RANGE_ROVER = [
  "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80",
];
const TESLA = [
  "https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?auto=format&fit=crop&w=1200&q=80",
];
const VCLASS = [
  "https://images.unsplash.com/photo-1632245889029-e406faaa34cd?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80",
];
const AUDI_A8 = [
  "https://images.unsplash.com/photo-1606152421802-db97b9c7a11b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1200&q=80",
];

const rev = (
  id: string,
  author: string,
  avatar: string,
  rating: number,
  date: string,
  comment: string,
  trip?: string
): Review => ({ id, author, avatar, rating, date, comment, trip });

export const drivers: Driver[] = [
  {
    id: "alexandre-moreau",
    firstName: "Alexandre",
    lastName: "Moreau",
    age: 38,
    avatar: "https://i.pravatar.cc/400?img=12",
    cityId: "paris",
    rating: 4.97,
    reviewsCount: 412,
    trips: 1980,
    languages: ["Français", "English", "Italiano"],
    experienceYears: 12,
    car: car("Mercedes-Benz", "Classe S 580", 2024, "Noir Obsidienne", MERCEDES_S),
    categories: ["Luxury"],
    transferDestinations: ALL_TRANSFERS,
    available: true,
    responseTime: "≈ 2 min",
    pricePerHour: 170,
    // Gamme Luxury : plancher journalier de la bande premium (1 500 €).
    pricePerDay: 1500,
    pricePerKm: 3.2,
    bio: "Chauffeur privé depuis 12 ans, je mets l'excellence et la discrétion au cœur de chaque trajet. Spécialiste des transferts aéroport, événements VIP et déplacements d'affaires. Eau, presse et chargeurs à bord.",
    badges: ["Top Pro", "Vérifié", "Super Host"],
    mapX: 52,
    mapY: 41,
    reviews: [
      rev("r1", "Sophie L.", "https://i.pravatar.cc/100?img=45", 5, "Il y a 3 jours", "Service irréprochable. Voiture impeccable, conduite ultra fluide. Alexandre est ponctuel et d'une grande discrétion.", "CDG → Le Marais"),
      rev("r2", "James T.", "https://i.pravatar.cc/100?img=33", 5, "Il y a 1 semaine", "Best chauffeur experience in Paris. Smooth, professional and the car was spotless.", "Hotel → Opéra"),
      rev("r3", "Marco B.", "https://i.pravatar.cc/100?img=51", 4.5, "Il y a 2 semaines", "Très professionnel, parle parfaitement italien. Je recommande vivement."),
    ],
  },
  {
    id: "yasmine-haddad",
    firstName: "Yasmine",
    lastName: "Haddad",
    age: 32,
    avatar: "https://i.pravatar.cc/400?img=47",
    cityId: "paris",
    rating: 4.92,
    reviewsCount: 268,
    trips: 1240,
    languages: ["Français", "English", "العربية"],
    experienceYears: 7,
    car: car("BMW", "Série 7 740e", 2023, "Gris Sophisto", BMW7),
    categories: ["Business"],
    transferDestinations: ALL_TRANSFERS,
    available: true,
    responseTime: "≈ 5 min",
    pricePerHour: 120,
    pricePerDay: 1000,
    pricePerKm: 2.9,
    bio: "Conductrice professionnelle attentionnée, je privilégie le confort et la sérénité. Idéale pour les déplacements professionnels et les clientes recherchant une chauffeure de confiance.",
    badges: ["Vérifié", "Éco-responsable"],
    mapX: 48,
    mapY: 36,
    reviews: [
      rev("r1", "Claire D.", "https://i.pravatar.cc/100?img=20", 5, "Il y a 4 jours", "Yasmine est adorable et très pro. Conduite douce, ponctuelle, voiture hybride très silencieuse.", "Défense → Gare de Lyon"),
      rev("r2", "Nadia K.", "https://i.pravatar.cc/100?img=29", 5, "Il y a 10 jours", "Enfin une chauffeure ! Je me suis sentie en totale sécurité. Parfait."),
    ],
  },
  {
    id: "thomas-leclerc",
    firstName: "Thomas",
    lastName: "Leclerc",
    age: 41,
    avatar: "https://i.pravatar.cc/400?img=15",
    cityId: "paris",
    rating: 4.88,
    reviewsCount: 521,
    trips: 2630,
    languages: ["Français", "English", "Deutsch"],
    experienceYears: 15,
    car: car("Range Rover", "Autobiography", 2024, "Blanc Fuji", RANGE_ROVER),
    categories: ["Luxury"],
    // Opted out — keeps the "driver not proposed for transfers" path testable.
    transferDestinations: NO_TRANSFERS,
    available: false,
    responseTime: "≈ 8 min",
    pricePerHour: 250,
    pricePerDay: 1500,
    pricePerKm: 3.6,
    bio: "Quinze ans d'expérience au service d'une clientèle exigeante. Spécialiste des trajets familiaux haut de gamme et des longues distances. SUV spacieux, sièges enfants disponibles sur demande.",
    badges: ["Top Pro", "Vérifié"],
    mapX: 55,
    mapY: 45,
    reviews: [
      rev("r1", "Antoine R.", "https://i.pravatar.cc/100?img=60", 5, "Il y a 1 jour", "Voyage en famille parfait. Range Rover splendide, Thomas gère tout avec calme.", "Paris → Deauville"),
      rev("r2", "Lena F.", "https://i.pravatar.cc/100?img=24", 4.5, "Il y a 6 jours", "Sehr professionell und freundlich. Empfehlenswert!"),
    ],
  },
  {
    id: "lucas-martin",
    firstName: "Lucas",
    lastName: "Martin",
    age: 34,
    avatar: "https://i.pravatar.cc/400?img=8",
    cityId: "paris",
    rating: 4.85,
    reviewsCount: 198,
    trips: 940,
    languages: ["Français", "English", "Español"],
    experienceYears: 8,
    car: car("Mercedes-Benz", "Classe V", 2023, "Noir", VCLASS),
    categories: ["Van"],
    transferDestinations: ALL_TRANSFERS,
    available: true,
    responseTime: "≈ 6 min",
    pricePerHour: 120,
    pricePerDay: 1000,
    pricePerKm: 3.0,
    bio: "Spécialiste des groupes et familles. Van Mercedes 7 places ultra confortable, idéal pour les transferts aéroport en groupe, mariages et tournées professionnelles.",
    badges: ["Vérifié", "Groupes"],
    mapX: 46,
    mapY: 44,
    reviews: [
      rev("r1", "Group Voyage", "https://i.pravatar.cc/100?img=12", 5, "Il y a 5 jours", "Parfait pour notre groupe de 6. Beaucoup d'espace, très confortable.", "CDG → Versailles"),
      rev("r2", "Paula S.", "https://i.pravatar.cc/100?img=32", 4.5, "Il y a 2 semaines", "Muy cómodo para toda la familia. Lucas es muy amable."),
    ],
  },
  {
    id: "jeremy-driver",
    firstName: "Jérémy",
    lastName: "Dubois",
    age: 33,
    avatar: "https://i.pravatar.cc/400?img=68",
    cityId: "paris",
    rating: 4.96,
    reviewsCount: 187,
    trips: 1120,
    languages: ["Français", "English"],
    experienceYears: 9,
    car: car("Mercedes-AMG", "E63 S", 2024, "Gris Sélénite", MERCEDES_E),
    categories: ["Business"],
    transferDestinations: ALL_TRANSFERS,
    available: true,
    responseTime: "≈ 3 min",
    pricePerHour: 120,
    pricePerDay: 1000,
    pricePerKm: 3.3,
    bio: "Passionné d'automobile et de conduite sportive maîtrisée, je propose une expérience haut de gamme au volant de ma Mercedes-AMG E63 S. Confort, puissance et discrétion pour vos trajets d'affaires et événements.",
    badges: ["Top Pro", "Vérifié"],
    mapX: 50,
    mapY: 39,
    reviews: [
      rev("r1", "Camille R.", "https://i.pravatar.cc/100?img=31", 5, "Il y a 2 jours", "Jérémy est exceptionnel. La E63 est sublime et la conduite d'une fluidité parfaite.", "CDG → Champs-Élysées"),
      rev("r2", "Thomas P.", "https://i.pravatar.cc/100?img=53", 5, "Il y a 1 semaine", "Ponctuel, élégant, voiture impeccable. Je ne réserve plus que lui."),
    ],
  },
];

export const getDriver = (id: string) => drivers.find((d) => d.id === id);

export const driversByCity = (cityId: string) =>
  drivers.filter((d) => d.cityId === cityId);
