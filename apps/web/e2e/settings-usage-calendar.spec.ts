import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "demo-parola";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă").fill(PASSWORD);
  await page.getByRole("button", { name: "Intră" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.beforeEach(async ({ page }) => login(page));

test("integrare: token-ul se salvează criptat și nu se mai afișează (doar ultimele 4 caractere)", async ({ page }) => {
  await page.goto("/settings");
  const speko = page.getByTestId("integration-SPEKO");
  await speko.locator('input[name="token"]').fill("sk_test_secret_value_9876");
  await speko.locator('input[name="voiceEn"]').fill("voce-en-test");
  await speko.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByTestId("flash")).toContainText("criptat");
  const html = await page.content();
  expect(html).not.toContain("sk_test_secret_value_9876");
  await expect(page.getByTestId("integration-SPEKO")).toContainText("••••9876");
  await expect(page.getByTestId("integration-SPEKO").locator('input[name="voiceEn"]')).toHaveValue("voce-en-test");
  await expect(page.getByTestId("integration-SPEKO").getByRole("button", { name: "Testează conexiunea" })).toBeVisible();
});

test("template video: numele canalului și culoarea se salvează; culoarea invalidă e ignorată", async ({ page }) => {
  await page.goto("/settings");
  const f = page.getByTestId("template-form");
  await f.locator('input[name="brandName"]').fill("Istorioare cu tâlc");
  await f.locator('input[name="accent"]').fill("javascript:alert(1)");
  await f.getByRole("button", { name: "Salvează template-ul" }).click();
  await expect(page.getByTestId("flash")).toContainText("Template salvat");
  await expect(page.getByTestId("template-form").locator('input[name="brandName"]')).toHaveValue("Istorioare cu tâlc");
  await expect(page.getByTestId("template-form").locator('input[name="accent"]')).toHaveValue("");
});

test("ritm și praguri: pragul săptămânal apare în Usage", async ({ page }) => {
  await page.goto("/settings");
  const f = page.getByTestId("rhythm-form");
  await f.locator('input[name="storiesPerWeek"]').fill("2");
  await f.locator('input[name="weeklyCostUsd"]').fill("25");
  await f.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByTestId("flash")).toContainText("Ritmul");
  await page.goto("/usage");
  await expect(page.getByTestId("usage-totals")).toContainText("prag $25");
  await expect(page.getByTestId("weekly-chart").locator("svg")).toBeVisible();
  await expect(page.getByTestId("weekly-chart")).toContainText("prag $25");
});

test("calendar: postările pe zile și mutarea uneia", async ({ page }) => {
  await page.goto("/calendar");
  const rows = page.getByTestId("schedule-row");
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  const when = first.locator('input[name="when"]');
  const d = new Date(Date.now() + 10 * 86400_000);
  const v = `${d.toISOString().slice(0, 10)}T20:15`;
  await when.fill(v);
  await first.getByRole("button", { name: "Mută" }).click();
  await expect(page.getByTestId("flash")).toContainText("Mutat");
  await expect(page.locator(`input[name="when"][value="${v}"]`)).toHaveCount(1);
});

test("fișierele din storage cer autentificare", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const r = await p.request.get("/api/files/ep-001/x.mp4", { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(r.status());
  await ctx.close();
});
