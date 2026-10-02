export const PALETTE = [
  "#003390",
  "#007bff",
  "#2c8c3a",
  "#f6a500",
  "#ef3340",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#64748b",
];

export function colorAt(index: number): string {
  return PALETTE[index % PALETTE.length];
}
