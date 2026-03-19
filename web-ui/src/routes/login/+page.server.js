import { redirectToDefaultWorkspace } from "$lib/server/workspaceRedirect";

export function load({ url }) {
  redirectToDefaultWorkspace(`/login${url.search}`);
}
