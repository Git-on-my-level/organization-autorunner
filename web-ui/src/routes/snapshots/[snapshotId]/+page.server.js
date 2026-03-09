import { redirectToDefaultProject } from "$lib/server/projectRedirect";

export function load({ params }) {
  redirectToDefaultProject(`/snapshots/${params.snapshotId}`);
}
