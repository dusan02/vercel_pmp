export function safeNum(val: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
    throw new Error("REJECT_INVALID_NUMERIC_VALUE");
  }
  if (Object.is(val, -0)) return 0;
  if (Math.abs(val) > Number.MAX_SAFE_INTEGER) {
    throw new Error("REJECT_NUMERIC_OVERFLOW");
  }
  return val;
}

export const safeAdd = (a: number, b: number) => safeNum(safeNum(a) + safeNum(b));
export const safeSub = (a: number, b: number) => safeNum(safeNum(a) - safeNum(b));
export const safeMul = (a: number, b: number) => safeNum(safeNum(a) * safeNum(b));
export const safeDiv = (a: number, b: number) => {
  const sb = safeNum(b);
  if (sb === 0) throw new Error("REJECT_DIVISION_BY_ZERO");
  return safeNum(safeNum(a) / sb);
};
export const safeAbs = (a: number) => safeNum(Math.abs(safeNum(a)));
