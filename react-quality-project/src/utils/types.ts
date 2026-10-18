/**
 * Represents a product stored in the application.
 * This type can be reused by API handlers, forms, and components.
 */
export type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  inStock: boolean;
};

/**
 * `keyof Product` creates a union of the object's property names.
 * Result: "id" | "name" | "price" | "description" | "inStock".
 */
export type ProductKey = keyof Product;

/**
 * Indexed access retrieves the type of a specific property.
 * Result: string | number | boolean.
 */
export type ProductValue = Product[keyof Product];

/**
 * Generic property accessor.
 * K must be a valid key of T, and the return type matches that key.
 */
export function getProperty<T, K extends keyof T>(object: T, key: K): T[K] {
  return object[key];
}
