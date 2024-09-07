/**
 * Creates a new type based on T where all properties are optional except for those specified in K.
 *
 * @template T - The original type.
 * @template K - A union of keys from T that should remain required.
 *
 * @example
 * interface User {
 *   id: number;
 *   name: string;
 *   email: string;
 * }
 *
 * type PartialUserExceptId = PartialExcept<User, 'id'>;
 * // Equivalent to: { id: number; name?: string; email?: string; }
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> &
  Pick<T, K>;
