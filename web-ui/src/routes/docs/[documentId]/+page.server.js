import { redirectToDefaultWorkspace } from "$lib/server/projectRedirect";

export function load({ params }) {
  redirectToDefaultWorkspace(`/docs/${params.documentId}`);
}
