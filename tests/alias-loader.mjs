import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2);
    const withExtension = path.extname(relativePath) ? relativePath : `${relativePath}.js`;
    const targetUrl = pathToFileURL(path.join(projectRoot, withExtension)).href;
    return nextResolve(targetUrl, context);
  }

  return nextResolve(specifier, context);
}
