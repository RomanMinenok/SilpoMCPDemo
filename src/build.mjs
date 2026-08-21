import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = join(projectRoot, "src");
const destination = join(projectRoot, "dist");

await rm(destination, { recursive: true, force: true });
await mkdir(join(destination, "lib"), { recursive: true });
await Promise.all([
  cp(join(source, "index.html"), join(destination, "index.html")),
  cp(join(source, "app.js"), join(destination, "app.js")),
  cp(join(source, "styles.css"), join(destination, "styles.css")),
  cp(join(source, "lib", "analytics.js"), join(destination, "lib", "analytics.js")),
  cp(join(source, "lib", "price-chart.js"), join(destination, "lib", "price-chart.js"))
]);
console.log("Vercel static output створено у dist/.");
