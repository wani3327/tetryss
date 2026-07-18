export function requiredNode<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`missing ${name}`);
  return value;
}
