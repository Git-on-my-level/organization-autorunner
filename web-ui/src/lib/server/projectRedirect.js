import { redirect } from "@sveltejs/kit";

import { projectPath } from "$lib/projectPaths";
import { loadProjectCatalog } from "$lib/server/projectCatalog";

export function redirectToDefaultProject(pathname) {
  const catalog = loadProjectCatalog();
  throw redirect(307, projectPath(catalog.defaultProject.slug, pathname));
}
