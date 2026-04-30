import { expect, test } from "@playwright/test";

test("kill criteria can be declared and is rendered on the direction card", async ({ page }) => {
  const betName = `E2E Kill Criteria ${Date.now()}`;
  const condition = "Ship to 3 paying users by May 15, 2026";
  const deadline = "2026-05-15";

  await page.goto("/workspace/directions");

  await page.getByRole("button", { name: "New direction", exact: true }).click();

  const modal = page.locator("dialog[open]");
  await expect(modal).toBeVisible();

  await modal.getByPlaceholder("e.g. Ship v2 onboarding by Q2").fill(betName);
  await modal.getByPlaceholder("e.g. First-time SaaS founders, SMB teams").fill("SMB founders");
  await modal.getByPlaceholder("What problem are you solving and why does it matter?").fill(
    "Founders do not know if strategic bets are improving conviction week over week.",
  );

  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal.getByText("Step 2 of 2")).toBeVisible();

  await modal.getByPlaceholder("e.g. Ship to 3 paying users by May 1, 2026").fill(condition);
  await modal.locator('input[type="date"]').fill(deadline);

  const createBetResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/bets") && response.request().method() === "POST",
  );

  await modal.getByRole("button", { name: "Set Kill Criteria", exact: true }).click();

  const createBetResponse = await createBetResponsePromise;
  expect(createBetResponse.ok()).toBeTruthy();

  const payloadText = createBetResponse.request().postData() || "{}";
  const payload = JSON.parse(payloadText) as {
    kill_criteria?: {
      condition?: string;
      deadline?: string;
      committed_action?: string;
      status?: string;
    };
  };

  expect(payload.kill_criteria).toBeDefined();
  expect(payload.kill_criteria?.condition).toBe(condition);
  expect(payload.kill_criteria?.deadline).toBe(deadline);
  expect(payload.kill_criteria?.committed_action).toBe("kill");
  expect(payload.kill_criteria?.status).toBe("pending");

  const card = page.locator("a", { hasText: betName }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText("Monitoring")).toBeVisible();
  await expect(card.getByText("May 15", { exact: false })).toBeVisible();
});
