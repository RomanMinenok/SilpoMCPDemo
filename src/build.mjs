import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = join(projectRoot, "src");
const destination = join(projectRoot, "dist");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, filter: (path) => !path.endsWith("build.mjs") });
console.log("Локальний runtime створено у dist/. Запуск: node dist/server.mjs");
