import fs from "fs";
import path from "path";

const files = [
  "app/products/page.tsx",
  "app/products/[slug]/ProductDetail.tsx",
  "app/cart/page.tsx",
  "app/cart/success/page.tsx",
  "app/order-tracking/page.tsx",
  "app/contact/page.tsx",
  "app/blog/page.tsx",
  "app/blog/[slug]/BlogPostClient.tsx",
  "app/privacy-policy/page.tsx",
  "app/terms/page.tsx",
  "app/refund-policy/page.tsx",
];

const footerRe = /\s*<footer>[\s\S]*?<\/footer>/;
const root = process.cwd();

for (const f of files) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, "utf8");
  if (!footerRe.test(s)) {
    console.log("skip footer", f);
    continue;
  }
  s = s.replace(footerRe, "\n        <Footer />");
  if (!s.includes("import Footer")) {
    s = s.replace(
      /import Navbar from "@\/components\/Navbar";/,
      (m) => `${m}\nimport Footer from "@/components/Footer";`
    );
  }
  fs.writeFileSync(p, s);
  console.log("footer ok", f);
}
