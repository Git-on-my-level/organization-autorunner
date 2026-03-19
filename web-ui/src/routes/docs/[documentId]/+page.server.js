import { redirectToDefaultWorkspace } from "$lib/server/workspaceRedirect";

export function load({ params, url }) {
  redirectToDefaultWorkspace(`/docs/${params.documentId}${url.search}`);
}
