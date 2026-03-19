import { redirectToDefaultProject } from "$lib/server/workspaceRedirect";

export function load({ params }) {
  redirectToDefaultProject(`/snapshots/${params.snapshotId}`);
}
