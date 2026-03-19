import { redirectToDefaultWorkspace } from "$lib/server/projectRedirect";

export function load() {
  redirectToDefaultWorkspace("/artifacts");
}
