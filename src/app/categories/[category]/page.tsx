import { notFound } from "next/navigation";
import { SUBCATEGORIES } from "@/app/constants/categories";
import ProductsClient from "./ProductsClient";

// ✅ genera rutas estáticas para cada subcategoría (papeles, grapadoras, etc.)
export async function generateStaticParams() {
  return SUBCATEGORIES.map((sub) => ({
    category: sub.value,
  }));
}

export default async function ProductsByCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  // Buscar info en la lista de subcategorías por su "value" (slug)
  const categoryInfo = SUBCATEGORIES.find((c) => c.value === category);

  // si no existe la categoría -> 404
  if (!categoryInfo) {
    return notFound();
  }

  return <ProductsClient categoryInfo={categoryInfo} />;
}
