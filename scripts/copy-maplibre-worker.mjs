import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(root, "public");
await mkdir(publicDirectory, { recursive: true });
await copyFile(
  path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
  path.join(publicDirectory, "maplibre-gl-worker.mjs"),
);
