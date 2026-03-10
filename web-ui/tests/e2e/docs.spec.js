import { expect, test } from "@playwright/test";

test("documents list redirects through the default project and loads revision history", async ({
  page,
}) => {
  const actorId = "actor-docs-e2e";
  const documents = [
    {
      id: "product-constitution",
      title: "Product Constitution",
      status: "active",
      labels: ["governance", "product"],
      head_revision_id: "rev-pc-3",
      head_revision_number: 3,
      updated_at: "2026-03-08T14:30:00Z",
      updated_by: actorId,
    },
    {
      id: "incident-response-playbook",
      title: "Incident Response Playbook",
      status: "active",
      labels: ["ops", "runbook"],
      head_revision_id: "rev-irp-2",
      head_revision_number: 2,
      updated_at: "2026-03-05T11:00:00Z",
      updated_by: actorId,
    },
  ];

  await page.addInitScript((selectedActorId) => {
    window.localStorage.setItem("oar_ui_actor_id", selectedActorId);
  }, actorId);

  await page.route(/\/docs(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.resourceType() === "document") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documents }),
    });
  });

  await page.route(/\/docs\/product-constitution$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.resourceType() === "document") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document: documents[0],
        revision: {
          revision_id: "rev-pc-3",
          revision_number: 3,
          created_at: "2026-03-08T14:30:00Z",
          created_by: actorId,
          content_type: "text",
          content_hash: "content-hash-3",
          revision_hash: "revision-hash-3",
          content: "# Product Constitution v3\n\nCurrent ratified version.",
        },
      }),
    });
  });

  await page.route(/\/docs\/product-constitution\/history$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document_id: "product-constitution",
        revisions: [
          {
            revision_id: "rev-pc-1",
            revision_number: 1,
            created_at: "2026-02-15T10:00:00Z",
            created_by: actorId,
          },
          {
            revision_id: "rev-pc-2",
            revision_number: 2,
            created_at: "2026-02-28T16:00:00Z",
            created_by: actorId,
          },
          {
            revision_id: "rev-pc-3",
            revision_number: 3,
            created_at: "2026-03-08T14:30:00Z",
            created_by: actorId,
          },
        ],
      }),
    });
  });

  await page.route(
    /\/docs\/product-constitution\/revisions\/rev-pc-2$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          revision: {
            revision_id: "rev-pc-2",
            revision_number: 2,
            created_at: "2026-02-28T16:00:00Z",
            created_by: actorId,
            content_type: "text",
            content_hash: "content-hash-2",
            revision_hash: "revision-hash-2",
            content: "# Product Constitution v2\n\nPrior version.",
          },
        }),
      });
    },
  );

  await page.route(/\/docs\/incident-response-playbook$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.resourceType() === "document") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document: documents[1],
        revision: {
          revision_id: "rev-irp-2",
          revision_number: 2,
          created_at: "2026-03-05T11:00:00Z",
          created_by: actorId,
          content_type: "text",
          content_hash: "content-hash-irp-2",
          revision_hash: "revision-hash-irp-2",
          content: "# Incident Response Playbook v2\n\nCurrent response steps.",
        },
      }),
    });
  });

  await page.route(
    /\/docs\/incident-response-playbook\/history$/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          document_id: "incident-response-playbook",
          revisions: [
            {
              revision_id: "rev-irp-1",
              revision_number: 1,
              created_at: "2026-02-20T09:00:00Z",
              created_by: actorId,
            },
            {
              revision_id: "rev-irp-2",
              revision_number: 2,
              created_at: "2026-03-05T11:00:00Z",
              created_by: actorId,
            },
          ],
        }),
      });
    },
  );

  await page.goto("/docs");
  await expect(page).toHaveURL(/\/local\/docs$/);
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Product Constitution/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Incident Response Playbook/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Product Constitution/ }).click();
  await expect(
    page.getByRole("heading", { name: "Product Constitution", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Version history" }).click();
  await expect(
    page.getByText("Current version", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Version 2/ }).click();
  await expect(
    page.getByText("Viewing revision 2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Prior version.", { exact: false }),
  ).toBeVisible();

  await page
    .locator('nav[aria-label="Breadcrumb"]')
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(page).toHaveURL(/\/local\/docs$/);
  await page.getByRole("link", { name: /Incident Response Playbook/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Incident Response Playbook",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByText("Version 3", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
});
