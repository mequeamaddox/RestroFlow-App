// Order quantities use two decimal places. Never treat a single barcode scan as a quantity.
export function quantityMatchesOrder(actual: string, expected: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(actual.trim()) &&
    Number(actual) > 0 && Number(actual) === Number(expected);
}
