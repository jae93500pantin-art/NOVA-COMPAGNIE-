import { describe, it, expect } from "vitest";
import {
  zones,
  transferDestinations,
  getTransferDestination,
  isKnownTransferDestination,
  transferDestinationLabel,
  zoneDestinationId,
  driverServesTransferDestination,
  driversForTransferDestination,
  sanitizeTransferDestinationIds,
  estimateTransfer,
  transferVehicleForCategories,
  transferFareForDriver,
  vehicles,
  ALL_TRANSFER_DESTINATION_IDS,
  acceptsAirportTransfers,
  transferDestinationsForOptIn,
  driverHasTransferVehicle,
  driversForTransferVehicle,
} from "@/lib/transfer";
import { drivers } from "@/lib/drivers";

const driver = (list: string[]) => ({ transferDestinations: list });

describe("transfer destinations", () => {
  it("offers both directions plus the catch-all inbound route", () => {
    expect(transferDestinations.map((d) => d.id)).toEqual([
      "paris",
      "cdg",
      "ory",
      "lbg",
      "cdg-paris",
      "ory-paris",
      "lbg-paris",
    ]);
  });

  it("keeps every route id unique", () => {
    const ids = transferDestinations.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every zone of the form to a destination", () => {
    for (const z of zones) {
      expect(isKnownTransferDestination(z.destinationId), z.id).toBe(true);
      expect(zoneDestinationId(z.id)).toBe(z.destinationId);
    }
  });

  it("returns no destination for an unknown zone", () => {
    expect(zoneDestinationId("nowhere")).toBe("");
  });

  it("spells out the direction of travel", () => {
    expect(transferDestinationLabel(getTransferDestination("ory")!)).toBe(
      "Paris · Île-de-France → Orly (ORY)"
    );
    expect(transferDestinationLabel(getTransferDestination("ory-paris")!)).toBe(
      "Orly (ORY) → Paris · Île-de-France"
    );
    expect(transferDestinationLabel(getTransferDestination("paris")!)).toBe(
      "Aéroport → Paris · Île-de-France"
    );
  });

  it("never labels a route with the same place on both sides", () => {
    for (const d of transferDestinations) {
      expect(d.from, d.id).not.toBe(d.to);
    }
  });

  it("rejects unknown, empty and nullish ids", () => {
    expect(isKnownTransferDestination("cdg")).toBe(true);
    expect(isKnownTransferDestination("bva")).toBe(false);
    expect(isKnownTransferDestination("")).toBe(false);
    expect(isKnownTransferDestination(null)).toBe(false);
  });
});

describe("driverServesTransferDestination", () => {
  it("is true when the driver ticked the destination", () => {
    expect(driverServesTransferDestination(driver(["cdg", "ory"]), "cdg")).toBe(true);
  });

  it("is false when the driver did not tick it", () => {
    expect(driverServesTransferDestination(driver(["cdg"]), "lbg")).toBe(false);
  });

  it("is false for a driver who ticked nothing", () => {
    expect(driverServesTransferDestination(driver([]), "cdg")).toBe(false);
  });

  it("does not filter when no destination is selected", () => {
    expect(driverServesTransferDestination(driver([]), "")).toBe(true);
    expect(driverServesTransferDestination(driver([]), null)).toBe(true);
  });

  it("ignores an unknown destination rather than excluding everyone", () => {
    expect(driverServesTransferDestination(driver(["cdg"]), "bva")).toBe(true);
  });
});

describe("driversForTransferDestination", () => {
  const list = [driver(["cdg"]), driver(["ory"]), driver(["cdg", "lbg"])];

  it("keeps only the drivers who ticked it", () => {
    expect(driversForTransferDestination(list, "cdg")).toHaveLength(2);
    expect(driversForTransferDestination(list, "ory")).toHaveLength(1);
  });

  it("returns an empty list when nobody serves it — the flow must block", () => {
    expect(driversForTransferDestination(list, "paris")).toHaveLength(0);
  });

  it("returns everyone when unfiltered", () => {
    expect(driversForTransferDestination(list, "")).toHaveLength(3);
  });
});

describe("sanitizeTransferDestinationIds", () => {
  it("drops unknown ids and non-strings", () => {
    expect(sanitizeTransferDestinationIds(["cdg", "bva", 7, null, "paris"])).toEqual([
      "cdg",
      "paris",
    ]);
  });

  it("returns an empty array for a non-array input", () => {
    expect(sanitizeTransferDestinationIds("cdg")).toEqual([]);
    expect(sanitizeTransferDestinationIds(undefined)).toEqual([]);
  });
});

describe("mock drivers", () => {
  it("only reference declared destinations", () => {
    for (const d of drivers) {
      for (const id of d.transferDestinations) {
        expect(isKnownTransferDestination(id), `${d.id} → ${id}`).toBe(true);
      }
    }
  });

  it("holds an all-or-nothing opt-in, never a partial list", () => {
    for (const d of drivers) {
      const ids = [...d.transferDestinations].sort();
      const all = [...ALL_TRANSFER_DESTINATION_IDS].sort();
      expect(ids.length === 0 || ids.join() === all.join(), d.id).toBe(true);
    }
  });

  it("covers every route, in both directions", () => {
    for (const id of ALL_TRANSFER_DESTINATION_IDS) {
      expect(driversForTransferDestination(drivers, id).length, id).toBeGreaterThan(0);
    }
  });

  it("keeps at least one driver opted out", () => {
    expect(drivers.some((d) => !acceptsAirportTransfers(d))).toBe(true);
  });
});

describe("estimateTransfer stays a flat fare per vehicle", () => {
  it("is unaffected by the new destination", () => {
    expect(estimateTransfer("cdg", "lbg", "business")).toBe(100);
    expect(estimateTransfer("cdg", "lbg", "van")).toBe(150);
  });

  it("returns 0 for unknown inputs", () => {
    expect(estimateTransfer("nope", "lbg", "business")).toBe(0);
  });
});

describe("flat transfer fare charged for a driver", () => {
  it("maps a vehicle category to a transfer class", () => {
    expect(transferVehicleForCategories(["Business"])).toBe("business");
    expect(transferVehicleForCategories(["Moto"])).toBe("business");
    expect(transferVehicleForCategories(["Van"])).toBe("van");
    expect(transferVehicleForCategories(["Luxury"])).toBe("premium");
    expect(transferVehicleForCategories(["Van Luxury"])).toBe("premium");
  });

  it("keeps the best class a driver offers", () => {
    expect(transferVehicleForCategories(["Business", "Van"])).toBe("van");
    expect(transferVehicleForCategories(["Van", "Luxury"])).toBe("premium");
  });

  it("falls back to business on missing categories", () => {
    expect(transferVehicleForCategories(undefined)).toBe("business");
    expect(transferVehicleForCategories([])).toBe("business");
  });

  it("prices the fare from the vehicle table, never from the client", () => {
    const price = (id: string) => vehicles.find((v) => v.id === id)!.price;
    expect(transferFareForDriver({ categories: ["Business"] })).toBe(price("business"));
    expect(transferFareForDriver({ categories: ["Van"] })).toBe(price("van"));
    expect(transferFareForDriver({ categories: ["Luxury"] })).toBe(price("premium"));
  });

  it("gives every mock driver a bookable transfer fare", () => {
    for (const d of drivers) {
      expect(transferFareForDriver(d), d.id).toBeGreaterThan(0);
    }
  });
});

describe("global airport opt-in (single switch)", () => {
  it("expands the switch to every route, or to nothing", () => {
    expect(transferDestinationsForOptIn(true)).toEqual(ALL_TRANSFER_DESTINATION_IDS);
    expect(transferDestinationsForOptIn(false)).toEqual([]);
  });

  it("hands back a copy, never the shared constant", () => {
    const list = transferDestinationsForOptIn(true);
    list.push("tampered");
    expect(ALL_TRANSFER_DESTINATION_IDS).not.toContain("tampered");
  });

  it("reads a full opt-in as accepted and an empty one as refused", () => {
    expect(acceptsAirportTransfers({ transferDestinations: ALL_TRANSFER_DESTINATION_IDS })).toBe(true);
    expect(acceptsAirportTransfers({ transferDestinations: [] })).toBe(false);
    expect(acceptsAirportTransfers({})).toBe(false);
  });

  it("treats a legacy partial list as accepted, so nobody silently drops out", () => {
    expect(acceptsAirportTransfers({ transferDestinations: ["cdg"] })).toBe(true);
  });

  it("normalises a legacy partial list on the next save", () => {
    const legacy = { transferDestinations: ["paris", "cdg"] };
    const saved = transferDestinationsForOptIn(acceptsAirportTransfers(legacy));
    expect(saved).toEqual(ALL_TRANSFER_DESTINATION_IDS);
  });

  it("survives a round-trip through the id sanitiser", () => {
    expect(
      sanitizeTransferDestinationIds(transferDestinationsForOptIn(true))
    ).toEqual(ALL_TRANSFER_DESTINATION_IDS);
  });
});

describe("strict filtering by vehicle class", () => {
  const withCats = (categories: string[]) => ({ categories });

  it("matches a driver on the class they are billed at", () => {
    expect(driverHasTransferVehicle(withCats(["Business"]), "business")).toBe(true);
    expect(driverHasTransferVehicle(withCats(["Van"]), "van")).toBe(true);
    expect(driverHasTransferVehicle(withCats(["Luxury"]), "premium")).toBe(true);
  });

  it("excludes every other class — the filter is strict", () => {
    expect(driverHasTransferVehicle(withCats(["Business"]), "van")).toBe(false);
    expect(driverHasTransferVehicle(withCats(["Van"]), "premium")).toBe(false);
    expect(driverHasTransferVehicle(withCats(["Luxury"]), "business")).toBe(false);
  });

  it("ranks a multi-category driver by their best class, like the fare does", () => {
    const d = withCats(["Business", "Luxury"]);
    expect(driverHasTransferVehicle(d, "premium")).toBe(true);
    expect(driverHasTransferVehicle(d, "business")).toBe(false);
    expect(transferFareForDriver(d)).toBe(200);
  });

  it("does not filter on an empty or unknown class", () => {
    expect(driverHasTransferVehicle(withCats(["Van"]), "")).toBe(true);
    expect(driverHasTransferVehicle(withCats(["Van"]), "helicopter")).toBe(true);
    expect(driversForTransferVehicle(drivers, "")).toHaveLength(drivers.length);
  });

  it("splits the mock drivers across classes without losing any", () => {
    const total = vehicles.reduce(
      (n, v) => n + driversForTransferVehicle(drivers, v.id).length,
      0
    );
    expect(total).toBe(drivers.length);
  });

  it("charges every listed driver exactly the advertised class price", () => {
    for (const v of vehicles) {
      for (const d of driversForTransferVehicle(drivers, v.id)) {
        expect(transferFareForDriver(d), `${d.id} / ${v.id}`).toBe(v.price);
      }
    }
  });
});
