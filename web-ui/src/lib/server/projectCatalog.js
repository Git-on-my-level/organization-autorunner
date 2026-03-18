import { env as privateEnv } from "$env/dynamic/private";

import { DEFAULT_PROJECT_SLUG, normalizeProjectSlug } from "$lib/projectPaths";
import { normalizeBaseUrl } from "$lib/config";

function normalizeProjectEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`OAR_PROJECTS entry ${index + 1} must be an object.`);
  }

  const slug = normalizeProjectSlug(entry.slug);
  if (!slug) {
    throw new Error(`OAR_PROJECTS entry ${index + 1} is missing a valid slug.`);
  }

  return {
    slug,
    label: String(entry.label ?? slug).trim() || slug,
    description: String(entry.description ?? "").trim(),
    coreBaseUrl: normalizeBaseUrl(entry.coreBaseUrl ?? entry.core_base_url),
  };
}

function parseProjectEntries(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`OAR_PROJECTS must be valid JSON. ${reason}`);
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed ?? {}).map(([slug, value]) => ({
        slug,
        ...(value ?? {}),
      }));

  return entries.map(normalizeProjectEntry);
}

function fallbackSingleProject(env) {
  return [
    {
      slug: DEFAULT_PROJECT_SLUG,
      label: "Local",
      description: "",
      coreBaseUrl: normalizeBaseUrl(env.OAR_CORE_BASE_URL),
    },
  ];
}

export function loadProjectCatalog(env = privateEnv) {
  const configuredProjects = parseProjectEntries(env.OAR_PROJECTS);
  const projects =
    configuredProjects.length > 0
      ? configuredProjects
      : fallbackSingleProject(env);
  const defaultCandidate = normalizeProjectSlug(
    env.OAR_DEFAULT_PROJECT || projects[0]?.slug || DEFAULT_PROJECT_SLUG,
  );
  const defaultProject =
    projects.find((project) => project.slug === defaultCandidate) ??
    projects[0];

  if (!defaultProject) {
    throw new Error("At least one OAR project must be configured.");
  }

  const devActorMode =
    env.OAR_DEV_ACTOR_MODE === "true" || env.OAR_DEV_ACTOR_MODE === "1";

  return {
    defaultProject,
    projects,
    projectBySlug: new Map(projects.map((project) => [project.slug, project])),
    devActorMode,
  };
}

export function getProjectBySlug(projectSlug, env = privateEnv) {
  const catalog = loadProjectCatalog(env);
  return catalog.projectBySlug.get(normalizeProjectSlug(projectSlug)) ?? null;
}

export function toPublicProjectCatalog(catalog) {
  return {
    defaultProject: catalog.defaultProject.slug,
    projects: catalog.projects.map((project) => ({
      slug: project.slug,
      label: project.label,
      description: project.description,
    })),
    devActorMode: catalog.devActorMode ?? false,
  };
}
