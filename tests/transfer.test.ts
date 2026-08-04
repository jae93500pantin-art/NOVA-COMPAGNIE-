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
} from "@/lib/transfer";
import { drivers } from "@/lib/drivers";

const driver = (list: string[]) => ({ transferDestinations: list });

describe("transfer destinations", () => {
  it("offers exactly the four bookable destinations", () => {
    expect(transferDestinations.map((d) => d.id)).toEqual([
      "paris",
      "cdg",
      "ory",
      "lbg",
    ]);
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

  it("appends the IATA code only when there is one", () => {
    expect(transferDestinationLabel(getTransferDestination("ory")!)).toBe(
      "Paris · Orly (ORY)"
    );
    expect(transferDestinationLabel(getTransferDestination("paris")!)).toBe(
      "Paris · Île-de-France"
    );
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

  it("leaves Le Bourget unserved so the blocking message is reachable", () => {
    expect(driversForTransferDestination(drivers, "lbg")).toHaveLength(0);
  });

  it("covers CDG, Orly and Paris", () => {
    for (const id of ["paris", "cdg", "ory"]) {
      expect(driversForTransferDestination(drivers, id).length).toBeGreaterThan(0);
    }
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
