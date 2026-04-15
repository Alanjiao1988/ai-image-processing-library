export function normalizeBigInt(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value ?? null;
}
