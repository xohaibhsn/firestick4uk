import { getPublicActiveProducts } from "@/lib/publicProductsServer";
import ProductsClient from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const initialProducts = await getPublicActiveProducts();
  return <ProductsClient initialProducts={initialProducts} />;
}
