import { expect, test } from "@playwright/test";

test("commitments panel lists workspace data read-only", async ({ page }) => {
  const actorId = "actor-commitment-e2e";
  const commitmentId = "commitment-display-1";
  const snapshot = {
    id: "thread-onboarding",
    type: "process",
    title: "Customer Onboarding Workflow",
    status: "active",
    priority: "p1",
    cadence: "weekly",
    tags: ["ops", "customer"],
    key_artifacts: ["artifact-policy-draft"],
    current_summary: "Thread detail summary.",
    next_actions: ["Collect legal signoff"],
    open_commitments: [commitmentId],
    next_check_in_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-04T00:00:00.000Z",
    updated_by: actorId,
    provenance: { sources: ["actor_statement:event-1001"] },
  };
  const commitment = {
    id: commitmentId,
    thread_id: "thread-onboarding",
    title: "Ship policy fix",
    owner: actorId,
    due_at: "2026-03-12T00:00:00.000Z",
    status: "open",
    definition_of_done: ["Merged"],
    links: ["thread:thread-onboarding"],
    updated_at: "2026-03-04T01:00:00.000Z",
    updated_by: actorId,
    provenance: { sources: ["actor_statement:ui"] },
  };

  await page.addInitScript((selectedActorId) => {
    window.localStorage.setItem("oar_ui_actor_id", selectedActorId);
  }, actorId);

  await page.route(/\/actors$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        actors: [{ id: actorId, display_name: "Commitment Tester" }],
      }),
    });
  });

  await page.route(/\/threads\/thread-onboarding$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.resourceType() === "document") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thread: snapshot }),
    });
  });

  await page.route(
    /\/threads\/thread-onboarding\/workspace(\?.*)?$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: "thread-onboarding",
          thread: snapshot,
          context: {
            recent_events: [],
            key_artifacts: [],
            open_commitments: [commitment],
            documents: [],
          },
        }),
      });
    },
  );

  await page.route(/\/threads\/thread-onboarding\/timeline$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ events: [] }),
    });
  });

  await page.route(/\/events\/stream(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": keepalive\n\n",
    });
  });

  await page.goto("/threads/thread-onboarding");

  const commitmentsSection = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Commitments" }) });

  await expect(
    commitmentsSection.getByText("/commitments", { exact: false }),
  ).toBeVisible();
  await expect(
    commitmentsSection.getByText("Ship policy fix", { exact: true }),
  ).toBeVisible();
  await expect(
    commitmentsSection.getByRole("button", { name: "New" }),
  ).toHaveCount(0);
  await expect(
    page.locator(`#commitment-card-${commitmentId}`).getByRole("button", {
      name: "Edit",
    }),
  ).toHaveCount(0);
});
