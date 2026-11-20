import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "demo-parola";
const root = resolve(__dirname, "../../..");
const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/storyforge_test";

async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă").fill(PASSWORD);
  await page.getByRole("button", { name: "Intră" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

async function openStory(page: Page, n: number) {
  await page.goto("/");
  await page.getByRole("link", { name: `[MOCK] Istorioara de test ${n}`, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${n}. [MOCK] Istorioara de test ${n}`);
}

function runWorkerOnce() {
  execFileSync(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts", "--once"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DB, STORYFORGE_MOCK_AGENTS: "1", WORKER_POLL_MS: "50" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

test("login: parolă greșită refuzată", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă").fill("gresit");
  await page.getByRole("button", { name: "Intră" }).click();
  await expect(page.getByText("Utilizator sau parolă greșită")).toBeVisible();
});

test("paginile cer autentificare", async ({ page }) => {
  await page.goto("/usage");
  await expect(page).toHaveURL(/\/login\?next=%2Fusage/);
});

test.describe("flux de aprobare", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("dashboard: ce așteaptă aprobarea și coada", async ({ page }) => {
    const awaiting = page.getByTestId("awaiting");
    await expect(awaiting.getByRole("link", { name: "[MOCK] Istorioara de test 1", exact: true })).toBeVisible();
    await expect(awaiting.locator("[data-status=SOCIAL_REVIEW]")).toHaveCount(1);
    await expect(page.getByTestId("failed-jobs")).toContainText("Output JSON invalid");
    await expect(page.getByTestId("queue").locator("tr[data-story]")).toHaveCount(6);
  });

  test("Cere modificări: comentariul e obligatoriu; apoi re-rulare cu feedback → v2", async ({ page }) => {
    await openStory(page, 1);
    await expect(page.getByTestId("source-reference")).toContainText("nr. 1 —");
    await expect(page.getByTestId("storyboard-view")).toContainText("Morala:");

    await page.getByRole("button", { name: "Cere modificări" }).click();
    await page.getByRole("button", { name: "Trimite la refacere" }).click();
    await expect(page.getByTestId("review-msg")).toContainText("Comentariul e obligatoriu");

    await page.getByTestId("review-comment").fill("Scena 3 mai scurtă; morala mai clară");
    await page.getByRole("button", { name: "Trimite la refacere" }).click();
    await expect(page.getByTestId("flash")).toContainText("SCRIPT_DRAFT");

    await page.reload();
    await expect(page.locator("h1 [data-status=SCRIPT_DRAFT]")).toBeVisible();
    await expect(page.getByTestId("review-form")).toHaveCount(0);
    await expect(page.locator("[data-testid=job-row][data-kind='script.draft'][data-status=QUEUED]")).toHaveCount(1);

    runWorkerOnce();
    await page.reload();
    await expect(page.locator("h1 [data-status=SCRIPT_REVIEW]")).toBeVisible();
    await expect(page.getByText("Feedback aplicat în această versiune: „Scena 3 mai scurtă; morala mai clară”")).toBeVisible();
    await expect(page.getByRole("link", { name: /^v1 ↺$/ })).toBeVisible();

    await page.getByRole("link", { name: "compară cu v1" }).click();
    await expect(page.getByTestId("diff")).toContainText("blocuri modificate");
  });

  test("diff între versiuni existente", async ({ page }) => {
    await openStory(page, 2);
    await page.getByRole("link", { name: "compară cu v1" }).click();
    await expect(page.getByTestId("diff").locator("span.add").first()).toBeVisible();
  });

  test("Aprobă voce → randare finală pusă în coadă", async ({ page }) => {
    await openStory(page, 4);
    await expect(page.locator("h1 [data-status=VOICE_REVIEW]")).toBeVisible();
    await page.getByRole("button", { name: "Aprobă" }).click();
    await expect(page.getByTestId("flash")).toContainText("FINAL_RENDER");
    await page.reload();
    await expect(page.locator("[data-testid=job-row][data-kind='final.render'][data-status=QUEUED]")).toHaveCount(1);
  });

  test("Respinge → REJECTED, fără job nou", async ({ page }) => {
    await openStory(page, 5);
    await page.getByRole("button", { name: "Respinge" }).click();
    await page.getByTestId("review-comment").fill("nu se potrivește canalului");
    await page.getByRole("button", { name: "Confirmă respingerea" }).click();
    await expect(page.getByTestId("flash")).toContainText("REJECTED");
    await page.reload();
    await expect(page.locator("h1 [data-status=REJECTED]")).toBeVisible();
    await expect(page.getByTestId("job-row")).toHaveCount(0);
  });

  test("coada: reordonare și excludere", async ({ page }) => {
    const rows = page.getByTestId("queue").locator("tr[data-story]");
    const firstTwo = async () => [await rows.nth(0).getAttribute("data-story"), await rows.nth(1).getAttribute("data-story")];
    const [a, b] = await firstTwo();
    await rows.nth(1).getByRole("button", { name: "Mută sus" }).click();
    await expect.poll(firstTwo).toEqual([b, a]);

    await rows.nth(0).getByRole("button", { name: "Exclude" }).click();
    await expect(rows.nth(0).getByText("exclusă")).toBeVisible();
    await expect(rows.nth(0).getByRole("button", { name: "Pornește acum" })).toHaveCount(0);
  });
});
