declare const __brand: unique symbol;

export type PrinterId = string & { readonly [__brand]: "PrinterId" };

export function printerId(value: string): PrinterId {
  if (!value.trim()) throw new Error("PrinterId cannot be empty");
  return value as PrinterId;
}
