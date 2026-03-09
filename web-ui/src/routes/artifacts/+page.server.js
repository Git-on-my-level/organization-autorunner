import { redirectToDefaultProject } from "$lib/server/projectRedirect";

export function load() {
  redirectToDefaultProject("/artifacts");
}
