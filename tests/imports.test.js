import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Windows and macOS ignore letter case in file names; Vercel's Linux build
// does not. This resolves every "@/" and relative import and fails if the
// target is missing or its case differs from the file on disk.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app", "components", "lib", "models", "tests", "scripts"];
const ROOT_FILES = ["proxy.js", "auth.js"];
const EXTS = [".js", ".jsx", ".ts", ".tsx", ".mjs"];
const SPEC_RE = /(?:from\s+|import\s*\(\s*|vi\.mock\(\s*)["']([^"']+)["']/g;

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (EXTS.includes(path.extname(entry.name))) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir));
  return [...out, ...ROOT_FILES.map((f) => path.join(ROOT, f))];
}

// True only if every segment of `relPath` exists with exactly this case.
function existsExactCase(relPath) {
  let current = ROOT;
  for (const segment of relPath.split("/")) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return false;
    if (!fs.readdirSync(current).includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.relative(ROOT, path.resolve(path.dirname(fromFile), spec)).split(path.sep).join("/");
  } else return { skip: true };

  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
  const found = candidates.find((c) => fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile());
  if (!found) return { error: "not found" };
  if (!existsExactCase(found)) return { error: "letter case differs from the file on disk" };
  return { ok: true };
}

describe("imports", () => {
  it("every local import resolves with the exact file-name case", () => {
    const problems = [];
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, "utf8");
      for (const match of src.matchAll(SPEC_RE)) {
        const result = resolveImport(file, match[1]);
        if (result.error) problems.push(`${path.relative(ROOT, file)}: "${match[1]}" ${result.error}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("detects a wrong-case import (self-check)", () => {
    expect(resolveImport(path.join(ROOT, "app/layout.tsx"), "@/lib/Shopify/client").error).toBeDefined();
    expect(resolveImport(path.join(ROOT, "app/layout.tsx"), "@/lib/shopify/client").ok).toBe(true);
  });
});
