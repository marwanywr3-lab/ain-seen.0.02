import metadata from "./categories.json" with { type: "json" };
export interface Category {
  id: string;
  name: string;
  description: string;
  iconId: string;
  icon: string;
  presentation: string;
}
export const categories: readonly Category[] = metadata;
export const POINTS = [200, 400, 600] as const;
export const defaultCategories = categories.slice(0, 6).map((c) => c.id);
export function selection(input: unknown): string[] {
  if (
    !Array.isArray(input) ||
    input.length !== 6 ||
    new Set(input).size !== 6 ||
    input.some(
      (id) => typeof id !== "string" || !categories.some((c) => c.id === id),
    )
  )
    throw Error("اختر ٦ فئات مختلفة من أصل ٣٤ فئة");
  return [...input] as string[];
}
export const categoryFor = (name: string) =>
  categories.find((c) => c.name === name);
