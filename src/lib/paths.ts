/** Windows and Unix paths can both reach the UI, so separators are handled explicitly. */
export function basename(path: string): string {
  const index = path.search(/[^\\/]+$/);
  return index === -1 ? path : path.slice(index);
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) return ".";
  if (index === 0) return trimmed.slice(0, 1);
  return trimmed.slice(0, index);
}

/** True when `path` is `parent` itself or lives inside it. */
export function isWithin(path: string, parent: string): boolean {
  if (path === parent) return true;
  if (!path.startsWith(parent)) return false;
  const separator = path.charAt(parent.length);
  return separator === "/" || separator === "\\";
}

/** Follows a renamed folder when the open note lives inside it. */
export function remapPath(path: string, from: string, to: string): string {
  return isWithin(path, from) ? to + path.slice(from.length) : path;
}
