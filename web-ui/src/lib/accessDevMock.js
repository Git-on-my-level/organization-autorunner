/**
 * Synthetic access data for local Vite dev (`make serve`) when the operator is
 * not signed in, so principals / invites / audit layouts can be QA'd without passkeys.
 *
 * Principal actor_ids and usernames align with mock seed actors (`mockCoreData.js`)
 * shown in the dev actor picker.
 */

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** True only under `vite dev` (not production builds). */
export const isAccessDevPreview =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;

/**
 * @returns {{
 *   principals: object[],
 *   invites: object[],
 *   auditEvents: object[],
 *   activeHumanPrincipalCount: number
 * }}
 */
export function getAccessDevMockData() {
  const humanAgentId = "principal-actor-dev-human-operator";
  const humanActorId = "actor-dev-human-operator";

  const principals = [
    {
      agent_id: humanAgentId,
      actor_id: humanActorId,
      username: "Jordan (Human operator)",
      principal_kind: "human",
      auth_method: "passkey",
      created_at: isoDaysAgo(18),
      last_seen_at: isoHoursAgo(2),
      updated_at: isoHoursAgo(2),
      revoked: false,
      wakeRouting: { applicable: false },
    },
    {
      agent_id: "principal-actor-ops-ai",
      actor_id: "actor-ops-ai",
      username: "Zara (OpsAI)",
      principal_kind: "agent",
      auth_method: "public_key",
      created_at: isoDaysAgo(40),
      last_seen_at: isoHoursAgo(6),
      updated_at: isoHoursAgo(6),
      revoked: false,
      wakeRouting: {
        applicable: true,
        taggable: true,
        online: true,
        offline: false,
        state: "online",
        badgeLabel: "Online",
        badgeClass: "bg-emerald-500/10 text-emerald-400",
        summary: "Dev preview: coordinator actor with a fresh bridge check-in.",
      },
    },
    {
      agent_id: "principal-actor-squeeze-bot",
      actor_id: "actor-squeeze-bot",
      username: "SqueezeBot 3000",
      principal_kind: "agent",
      auth_method: "public_key",
      created_at: isoDaysAgo(35),
      last_seen_at: isoHoursAgo(30),
      updated_at: isoHoursAgo(30),
      revoked: false,
      wakeRouting: {
        applicable: true,
        taggable: true,
        online: false,
        offline: true,
        state: "offline",
        badgeLabel: "Offline",
        badgeClass: "bg-amber-500/10 text-amber-400",
        summary:
          "Dev preview: production hardware actor without a fresh bridge check-in.",
      },
    },
    {
      agent_id: "principal-actor-flavor-ai",
      actor_id: "actor-flavor-ai",
      username: "FlavorMind",
      principal_kind: "agent",
      auth_method: "public_key",
      created_at: isoDaysAgo(28),
      last_seen_at: isoHoursAgo(8),
      updated_at: isoHoursAgo(8),
      revoked: false,
      wakeRouting: {
        applicable: true,
        taggable: true,
        online: true,
        offline: false,
        state: "online",
        badgeLabel: "Online",
        badgeClass: "bg-emerald-500/10 text-emerald-400",
        summary: "Dev preview: R&D agent online for mention/wake demos.",
      },
    },
    {
      agent_id: "principal-actor-supply-rover",
      actor_id: "actor-supply-rover",
      username: "SupplyRover",
      principal_kind: "agent",
      auth_method: "public_key",
      created_at: isoDaysAgo(12),
      last_seen_at: isoDaysAgo(3),
      updated_at: isoDaysAgo(3),
      revoked: false,
      wakeRouting: {
        applicable: true,
        taggable: true,
        online: false,
        offline: true,
        state: "offline",
        badgeLabel: "Offline",
        badgeClass: "bg-amber-500/10 text-amber-400",
        summary: "Dev preview: inventory rover idle in the field.",
      },
    },
    {
      agent_id: "principal-actor-cashier-bot",
      actor_id: "actor-cashier-bot",
      username: "Till-E",
      principal_kind: "agent",
      auth_method: "public_key",
      created_at: isoDaysAgo(90),
      last_seen_at: isoDaysAgo(20),
      updated_at: isoDaysAgo(19),
      revoked: true,
      revoked_at: isoDaysAgo(19),
      wakeRouting: { applicable: false },
    },
  ];

  const invites = [
    {
      id: "invite_dev_preview_pending_01",
      kind: "agent",
      created_by_agent_id: humanAgentId,
      created_by_actor_id: humanActorId,
      created_at: isoHoursAgo(20),
    },
    {
      id: "invite_dev_preview_consumed_01",
      kind: "human",
      created_by_agent_id: humanAgentId,
      created_by_actor_id: humanActorId,
      created_at: isoDaysAgo(5),
      consumed_at: isoDaysAgo(4),
      consumed_by_agent_id: humanAgentId,
      consumed_by_actor_id: humanActorId,
    },
  ];

  const auditEvents = [
    {
      event_id: "audit_dev_preview_01",
      event_type: "principal_registered",
      occurred_at: isoHoursAgo(6),
      metadata: {},
      subject_username: "FlavorMind",
      subject_agent_id: "principal-actor-flavor-ai",
      subject_actor_id: "actor-flavor-ai",
    },
    {
      event_id: "audit_dev_preview_02",
      event_type: "invite_created",
      occurred_at: isoDaysAgo(1),
      metadata: {},
      invite_id: "invite_dev_preview_pending_01",
      actor_username: "Jordan (Human operator)",
      actor_agent_id: humanAgentId,
      actor_actor_id: humanActorId,
    },
  ];

  return {
    principals,
    invites,
    auditEvents,
    activeHumanPrincipalCount: 1,
  };
}
