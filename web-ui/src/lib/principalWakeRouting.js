import {
  bridgeCheckinEventId,
  describeWakeRouting,
  registrationDocumentId,
} from "$lib/wakeRouting";

/**
 * @param {object[]} principalList
 * @param {{ workspaceBindingTarget?: string, client: { getDocument: Function, getEvent: Function } }} options
 */
export async function enrichPrincipalsWithWakeRouting(
  principalList,
  { workspaceBindingTarget = "", client },
) {
  const activeAgentHandles = [
    ...new Set(
      (principalList ?? [])
        .filter(
          (principal) =>
            principal?.principal_kind === "agent" &&
            !principal?.revoked &&
            String(principal?.username ?? "").trim() !== "",
        )
        .map((principal) => String(principal.username).trim()),
    ),
  ];

  const registrationDocs = new Map();
  const bridgeCheckins = new Map();

  await Promise.all(
    activeAgentHandles.map(async (handle) => {
      try {
        const registrationDoc = {
          state: "ok",
          document: await client.getDocument(registrationDocumentId(handle)),
        };
        registrationDocs.set(handle, registrationDoc);
        const checkinEventId = bridgeCheckinEventId(registrationDoc);
        if (!checkinEventId) {
          bridgeCheckins.set(handle, { state: "missing" });
          return;
        }
        try {
          bridgeCheckins.set(handle, {
            state: "ok",
            document: await client.getEvent(checkinEventId),
          });
        } catch (error) {
          bridgeCheckins.set(
            handle,
            error?.status === 404 ? { state: "missing" } : { state: "error" },
          );
        }
      } catch (error) {
        registrationDocs.set(
          handle,
          error?.status === 404 ? { state: "missing" } : { state: "error" },
        );
        bridgeCheckins.set(handle, { state: "missing" });
      }
    }),
  );

  return Promise.all(
    (principalList ?? []).map(async (principal) => ({
      ...principal,
      wakeRouting: await describeWakeRouting(
        principal,
        registrationDocs.get(String(principal?.username ?? "").trim()) ?? null,
        workspaceBindingTarget,
        bridgeCheckins.get(String(principal?.username ?? "").trim()) ?? null,
      ),
    })),
  );
}
