import { access, copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(root, "node_modules", "pdfjs-dist");
const target = path.join(root, "public", "pdfjs");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const workerSource = path.join(
    source,
    "build",
    "pdf.worker.min.mjs",
  );

  if (!(await exists(workerSource))) {
    throw new Error("pdfjs-dist worker build is missing");
  }

  await mkdir(target, { recursive: true });
  await copyFile(workerSource, path.join(target, "pdf.worker.min.mjs"));

  const cmapsSource = path.join(source, "cmaps");
  if (await exists(cmapsSource)) {
    const cmapsTarget = path.join(target, "cmaps");
    await rm(cmapsTarget, { recursive: true, force: true });
    await cp(cmapsSource, cmapsTarget, { recursive: true });
  }

  console.log("Copied pdf.js worker assets to public/pdfjs/");
}

main().catch((error) => {
  console.error(
    `Failed to copy pdf.js worker assets: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exitCode = 1;
});
