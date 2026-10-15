import { z } from "zod";

export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

const stateLookup = new Map<string, string>(
  US_STATES.flatMap(([code, name]) => [[code.toLowerCase(), code], [name.toLowerCase(), code]]),
);

export const parsedLocationSchema = z.object({
  locationText: z.string().trim().min(3).max(300),
  city: z.string().trim().min(1).max(100),
  state: z.string().length(2),
  neighborhood: z.string().trim().max(100).nullable(),
  intersection: z.string().trim().max(150).nullable(),
});

export type ParsedLocation = z.infer<typeof parsedLocationSchema>;

export function parseLocation(locationText: string): ParsedLocation | null {
  const normalized = locationText.trim().replace(/\s+/g, " ");
  const segments = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return null;

  const last = segments.at(-1) ?? "";
  const state = stateLookup.get(last.toLowerCase());
  const city = segments.at(-2) ?? "";
  if (!state || !city) return null;

  const local = segments.slice(0, -2);
  const intersection = local.length ? local[0] : null;
  const neighborhood = local.length > 1 ? local.slice(1).join(", ") : null;
  return parsedLocationSchema.parse({
    locationText: normalized,
    city,
    state,
    neighborhood,
    intersection,
  });
}
