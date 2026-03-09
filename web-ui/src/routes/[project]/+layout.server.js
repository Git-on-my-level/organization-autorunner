import { error } from "@sveltejs/kit";

import { normalizeProjectSlug } from "$lib/projectPaths";
import { loadProjectCatalog } from "$lib/server/projectCatalog";

export function load({ params }) {
  const catalog = loadProjectCatalog();
  const projectSlug = normalizeProjectSlug(params.project);
  const project = catalog.projectBySlug.get(projectSlug);

  if (!project) {
    throw error(404, `Project '${params.project}' is not configured.`);
  }

  return {
    project: {
      slug: project.slug,
      label: project.label,
      description: project.description,
    },
  };
}
