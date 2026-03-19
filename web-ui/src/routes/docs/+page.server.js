import { redirectToDefaultProject } from "$lib/server/workspaceRedirect";

export function load() {
  redirectToDefaultProject("/docs");
}
