import { describe, expect, it } from "vitest";
import { parseLocation, US_STATES } from "@/lib/location";

describe("parseLocation", () => {
  it("parses a city and two-letter state", () => {
    expect(parseLocation("Springfield, IL")).toMatchObject({
      city: "Springfield",
      state: "IL",
      neighborhood: null,
      intersection: null,
    });
  });

  it("accepts full state names and extracts an intersection", () => {
    expect(parseLocation("Elm St & 3rd Ave, Riverside, Springfield, Illinois")).toMatchObject({
      city: "Springfield",
      state: "IL",
      neighborhood: "Riverside",
      intersection: "Elm St & 3rd Ave",
    });
  });

  it("accepts DC and rejects unknown states or missing cities", () => {
    expect(parseLocation("Washington, DC")?.state).toBe("DC");
    expect(parseLocation("Springfield, ZZ")).toBeNull();
    expect(parseLocation("IL")).toBeNull();
  });

  it("recognizes each state and the District of Columbia", () => {
    expect(US_STATES).toHaveLength(51);
    for (const [code, name] of US_STATES) {
      expect(parseLocation(`Example City, ${code}`)?.state).toBe(code);
      expect(parseLocation(`Example City, ${name}`)?.state).toBe(code);
    }
  });
});
