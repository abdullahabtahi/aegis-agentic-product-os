# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kill-criteria.smoke.spec.ts >> kill criteria can be declared and is rendered on the direction card
- Location: testsprite_tests/kill-criteria.smoke.spec.ts:3:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByPlaceholder('e.g. Ship v2 onboarding by Q2')
    - locator resolved to <input value="" type="text" required="" placeholder="e.g. Ship v2 onboarding by Q2" class="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"/>
    - fill("E2E Kill Criteria 1777488457941")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
      - waiting 100ms
    80 × waiting for element to be visible, enabled and editable
       - element is not visible
     - retrying fill action
       - waiting 500ms
  - element was detached from the DOM, retrying
    - waiting for" http://127.0.0.1:3000/workspace/directions" navigation to finish...
    - navigated to "http://127.0.0.1:3000/workspace/directions"
    - locator resolved to <input value="" type="text" required="" placeholder="e.g. Ship v2 onboarding by Q2" class="w-full rounded-lg border border-white/30 bg-white/60 px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/60 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"/>
    - fill("E2E Kill Criteria 1777488457941")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
      - waiting 100ms
    38 × waiting for element to be visible, enabled and editable
       - element is not visible
     - retrying fill action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - complementary [ref=e3]:
    - generic [ref=e5]: A
    - navigation [ref=e6]:
      - link "Home" [ref=e7] [cursor=pointer]:
        - /url: /workspace
        - img [ref=e8]
      - link "Chat" [ref=e11] [cursor=pointer]:
        - /url: /workspace/chat
        - img [ref=e12]
      - link "Mission Control" [ref=e14] [cursor=pointer]:
        - /url: /workspace/mission-control
        - img [ref=e15]
      - link "Directions" [ref=e22] [cursor=pointer]:
        - /url: /workspace/directions
        - img [ref=e23]
      - link "Inbox" [ref=e27] [cursor=pointer]:
        - /url: /workspace/inbox
        - img [ref=e28]
      - link "Activity" [ref=e31] [cursor=pointer]:
        - /url: /workspace/activity
        - img [ref=e32]
    - button "Session History" [ref=e34]:
      - img [ref=e35]
  - generic:
    - generic:
      - generic:
        - heading "Session History" [level=2]
        - button:
          - img
      - generic:
        - generic:
          - img
          - paragraph: No sessions yet
          - paragraph: Start a conversation on the Home page to create your first session
      - generic:
        - button "New Session":
          - img
          - text: New Session
  - generic [ref=e39]:
    - banner [ref=e40]:
      - heading "Aegis" [level=1] [ref=e42]
      - generic [ref=e44]: Pipeline Idle
    - main [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]:
          - generic [ref=e49]:
            - heading "Strategic Directions" [level=1] [ref=e50]
            - paragraph [ref=e51]: 0 directions being monitored
          - generic [ref=e53]:
            - button "Refresh directions" [ref=e54]:
              - img [ref=e55]
            - button "Scan Linear for new directions" [ref=e60]:
              - img [ref=e61]
              - text: Scan Linear
            - button "New direction" [ref=e64]:
              - img [ref=e65]
              - text: New direction
        - generic [ref=e66]:
          - img [ref=e68]
          - heading "No strategic directions yet" [level=2] [ref=e70]
          - paragraph [ref=e71]: Declare your first direction and Aegis will run a continuous pre-mortem — scanning for strategy drift, misalignment, and execution blockers.
          - button "Declare a direction" [ref=e72]:
            - img [ref=e73]
            - text: Declare a direction
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("kill criteria can be declared and is rendered on the direction card", async ({ page }) => {
  4  |   const betName = `E2E Kill Criteria ${Date.now()}`;
  5  |   const condition = "Ship to 3 paying users by May 15, 2026";
  6  |   const deadline = "2026-05-15";
  7  | 
  8  |   await page.goto("/workspace/directions");
  9  | 
  10 |   await page.getByRole("button", { name: "New direction", exact: true }).click();
  11 | 
> 12 |   await page.getByPlaceholder("e.g. Ship v2 onboarding by Q2").fill(betName);
     |                                                                ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  13 |   await page.getByPlaceholder("e.g. First-time SaaS founders, SMB teams").fill("SMB founders");
  14 |   await page.getByPlaceholder("What problem are you solving and why does it matter?").fill(
  15 |     "Founders do not know if strategic bets are improving conviction week over week.",
  16 |   );
  17 | 
  18 |   await page.getByRole("button", { name: "Continue" }).click();
  19 |   await expect(page.getByText("Step 2 of 2")).toBeVisible();
  20 | 
  21 |   await page.getByPlaceholder("e.g. Ship to 3 paying users by May 1, 2026").fill(condition);
  22 |   await page.locator('input[type="date"]').fill(deadline);
  23 | 
  24 |   const createBetResponsePromise = page.waitForResponse(
  25 |     (response) => response.url().includes("/bets") && response.request().method() === "POST",
  26 |   );
  27 | 
  28 |   await page.getByRole("button", { name: "Set Kill Criteria" }).click();
  29 | 
  30 |   const createBetResponse = await createBetResponsePromise;
  31 |   expect(createBetResponse.ok()).toBeTruthy();
  32 | 
  33 |   const payloadText = createBetResponse.request().postData() || "{}";
  34 |   const payload = JSON.parse(payloadText) as {
  35 |     kill_criteria?: {
  36 |       condition?: string;
  37 |       deadline?: string;
  38 |       committed_action?: string;
  39 |       status?: string;
  40 |     };
  41 |   };
  42 | 
  43 |   expect(payload.kill_criteria).toBeDefined();
  44 |   expect(payload.kill_criteria?.condition).toBe(condition);
  45 |   expect(payload.kill_criteria?.deadline).toBe(deadline);
  46 |   expect(payload.kill_criteria?.committed_action).toBe("kill");
  47 |   expect(payload.kill_criteria?.status).toBe("pending");
  48 | 
  49 |   const card = page.locator("a", { hasText: betName }).first();
  50 |   await expect(card).toBeVisible();
  51 |   await expect(card.getByText("Monitoring")).toBeVisible();
  52 |   await expect(card.getByText("May 15", { exact: false })).toBeVisible();
  53 | });
  54 | 
```