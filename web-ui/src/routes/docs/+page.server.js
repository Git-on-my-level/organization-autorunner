import { redirectToDefaultWorkspace } from "$lib/server/workspaceRedirect";

export function load({ url }) {
  redirectToDefaultWorkspace(`/docs${url.search}`);
}
