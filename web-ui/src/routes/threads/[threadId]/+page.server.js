import { redirectToDefaultProject } from "$lib/server/projectRedirect";

export function load({ params }) {
  redirectToDefaultProject(`/threads/${params.threadId}`);
}
