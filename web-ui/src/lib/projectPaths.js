export const DEFAULT_PROJECT_SLUG = "local";
export const PROJECT_HEADER = "x-oar-project-slug";

export function normalizeProjectSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAppPath(pathname = "/") {
  const raw = String(pathname ?? "").trim() || "/";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

export function projectPath(projectSlug, pathname = "/") {
  const slug = normalizeProjectSlug(projectSlug);
  if (!slug) {
    throw new Error("project slug is required");
  }

  const appPath = normalizeAppPath(pathname);
  return appPath === "/" ? `/${slug}` : `/${slug}${appPath}`;
}

export function stripProjectPath(pathname, projectSlug) {
  const slug = normalizeProjectSlug(projectSlug);
  const normalizedPathname = normalizeAppPath(pathname);
  if (!slug) {
    return normalizedPathname;
  }

  const prefix = `/${slug}`;
  if (normalizedPathname === prefix) {
    return "/";
  }

  if (normalizedPathname.startsWith(`${prefix}/`)) {
    return normalizedPathname.slice(prefix.length);
  }

  return normalizedPathname;
}

export function buildProjectStorageKey(baseKey, projectSlug) {
  const slug = normalizeProjectSlug(projectSlug) || DEFAULT_PROJECT_SLUG;
  return `${baseKey}:${slug}`;
}
