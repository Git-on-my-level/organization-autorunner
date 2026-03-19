import { redirectToDefaultProject } from "$lib/server/workspaceRedirect";

export function load({ params, url }) {
  const pathname = `/threads/${params.threadId}${url.search}`;
  redirectToDefaultProject(pathname);
}
