import { getPublicPublishedPosts } from "@/lib/publicBlogServer";
import BlogClient from "./BlogClient";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const initialPosts = await getPublicPublishedPosts();
  return <BlogClient initialPosts={initialPosts} />;
}
