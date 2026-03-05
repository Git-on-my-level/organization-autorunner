import { expect, test } from "@playwright/test";

test("inbox page loads and acknowledging an item removes it", async ({
  page,
}) => {
  const actorId = "actor-e2e";
  let inboxItems = [
    {
      id: "inbox-001",
      category: "decision_needed",
      title: "Approve onboarding exception handling",
      recommended_action: "Record a decision on escalation path.",
      thread_id: "thread-onboarding",
      refs: ["thread:thread-onboarding"],
    },
    {
      id: "inbox-002",
      category: "exception",
      title: "Missing legal signer",
      recommended_action: "Acknowledge and assign owner.",
      thread_id: "thread-onboarding",
      refs: ["event:evt-1001"],
    },
    {
      id: "inbox-003",
      category: "commitment_risk",
      title: "Commitment at risk",
      recommended_action: "Adjust due date.",
      thread_id: "thread-incident-42",
      refs: ["thread:thread-incident-42"],
    },
  ];

  await page.addInitScript((selectedActorId) => {
    window.localStorage.setItem("oar_ui_actor_id", selectedActorId);
  }, actorId);

  await page.route(/\/actors(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        actors: [{ id: actorId, display_name: "E2E User", tags: ["human"] }],
      }),
    });
  });

  await page.route(/\/inbox\/ack(\?.*)?$/, async (route) => {
    const requestBody = JSON.parse(route.request().postData() ?? "{}");
    inboxItems = inboxItems.filter(
      (item) => item.id !== requestBody.inbox_item_id,
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        event: {
          id: "event-ack",
          type: "inbox_item_acknowledged",
        },
      }),
    });
  });

  await page.route(/\/inbox\?.+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: inboxItems,
        generated_at: "2026-03-04T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/inbox");

  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs Decision" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exception" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "At Risk" })).toBeVisible();

  const targetCard = page
    .locator("div.border-b", {
      hasText: "Approve onboarding exception handling",
    })
    .first();
  await expect(targetCard).toBeVisible();

  await targetCard.getByRole("button", { name: "Ack" }).click();
  await expect(targetCard).toHaveCount(0);
});

test("recording a decision marks only the selected inbox item", async ({
  page,
}) => {
  const actorId = "actor-e2e";
  const sharedThreadId = "thread-onboarding";
  const decidedItemId = "inbox-001";
  const otherItemId = "inbox-002";
  let inboxItems = [
    {
      id: decidedItemId,
      category: "decision_needed",
      title: "Approve onboarding exception handling",
      recommended_action: "Record a decision on escalation path.",
      thread_id: sharedThreadId,
      refs: [`thread:${sharedThreadId}`],
    },
    {
      id: otherItemId,
      category: "exception",
      title: "Missing legal signer",
      recommended_action: "Acknowledge and assign owner.",
      thread_id: sharedThreadId,
      refs: ["event:evt-1001"],
    },
  ];

  await page.addInitScript((selectedActorId) => {
    window.localStorage.setItem("oar_ui_actor_id", selectedActorId);
  }, actorId);

  await page.route(/\/actors(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        actors: [{ id: actorId, display_name: "E2E User", tags: ["human"] }],
      }),
    });
  });

  await page.route(/\/inbox\?.+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: inboxItems,
        generated_at: "2026-03-04T00:00:00.000Z",
      }),
    });
  });

  await page.route(/\/events(\?.*)?$/, async (route) => {
    const requestBody = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        event: {
          id: "event-decision-001",
          type: "decision_made",
          thread_id: requestBody?.event?.thread_id ?? sharedThreadId,
        },
      }),
    });
  });

  await page.goto("/inbox");

  const decidedCard = page
    .locator("div.border-b", {
      hasText: "Approve onboarding exception handling",
    })
    .first();
  const otherCard = page
    .locator("div.border-b", { hasText: "Missing legal signer" })
    .first();

  await expect(decidedCard).toBeVisible();
  await expect(otherCard).toBeVisible();

  await decidedCard.getByRole("button", { name: "Decide" }).click();
  await page.fill(`#decision-summary-${decidedItemId}`, "Approve path A");
  await decidedCard.getByRole("button", { name: "Submit decision" }).click();

  await expect(decidedCard.getByText("Decision recorded.")).toBeVisible();
  await expect(otherCard.getByText("Decision recorded.")).toHaveCount(0);
  await expect(page.getByText("Decision recorded.")).toHaveCount(1);
});
