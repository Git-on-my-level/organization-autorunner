import { loadWorkspaceCatalog } from "$lib/server/workspaceCatalog";
import { normalizeWorkspaceSlug } from "$lib/workspacePaths";

export async function load(event) {
  const catalog = loadWorkspaceCatalog();
  const workspaceSlug = normalizeWorkspaceSlug(event.params.workspace);
  const workspace = catalog.workspaceBySlug.get(workspaceSlug);
  return { coreBaseUrl: workspace?.coreBaseUrl ?? "" };
}
