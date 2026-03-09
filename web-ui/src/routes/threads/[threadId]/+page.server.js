import { redirectToDefaultProject } from "$lib/server/projectRedirect";

export function load({ params, url }) {
  const pathname = `/threads/${params.threadId}${url.search}`;
  redirectToDefaultProject(pathname);
}
