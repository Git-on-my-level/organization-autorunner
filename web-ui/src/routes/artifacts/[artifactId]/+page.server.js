import { redirectToDefaultProject } from "$lib/server/projectRedirect";

export function load({ params }) {
  redirectToDefaultProject(`/artifacts/${params.artifactId}`);
}
