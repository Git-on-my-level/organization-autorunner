import { redirect } from "@sveltejs/kit";

import { workspacePath } from "$lib/workspacePaths";
import { loadWorkspaceCatalog } from "$lib/server/workspaceCatalog";

export function load() {
  const catalog = loadWorkspaceCatalog();
  throw redirect(307, workspacePath(catalog.defaultWorkspace.slug));
}
