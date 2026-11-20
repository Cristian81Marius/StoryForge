import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "demo-parola";

test("import din fișier: previzualizare, excludere, confirmare cu problemele raportate, apoi în coadă", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "sf-e2e-"));
  const file = join(dir, "carte.txt");
  writeFileSync(
    file,
    [
      "Cuvânt înainte",
      "Prefața editorului, care nu se importă.",
      "",
      "597. Istorioara de import A",
      "Textul istorioarei A, destul de lung ca să nu fie marcat drept scurt. ".repeat(3),
      "598. Istorioara de import B",
      "Textul istorioarei B, destul de lung ca să nu fie marcat drept scurt. ".repeat(3),
      "599. Istorioara de import C",
      "Text C ".repeat(40),
    ].join("\n"),
  );

  await page.goto("/login");
  await page.getByLabel("Utilizator").fill("admin");
  await page.getByLabel("Parolă").fill(PASSWORD);
  await page.getByRole("button", { name: "Intră" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/import");

  await page.getByLabel("Fișierul cărții").setInputFiles(file);
  await page.getByRole("button", { name: "Încarcă și previzualizează" }).click();
  await expect(page).toHaveURL(/\/import\/c/);

  const report = page.getByTestId("import-report");
  await expect(report).toContainText("3");
  await expect(report).toContainText("597"); // numere lipsă (1–596, 600)
  await expect(page.getByText("Text ignorat dinaintea primei istorioare")).toBeVisible();
  await expect(page.getByTestId("import-items").locator("tr[data-number]")).toHaveCount(3);

  // excluderea uneia
  await page.locator("tr[data-number='599']").getByRole("button", { name: "Exclude" }).click();
  await expect(page.locator("tr[data-number='599']").getByRole("button", { name: "Include" })).toBeVisible();

  // confirmarea fără bifă e refuzată (import incomplet)
  await page.getByRole("button", { name: "Confirmă împărțirea și adaugă în coadă" }).click();
  await expect(page.getByTestId("confirm-form")).toContainText("numere lipsă");

  await page.getByLabel(/confirm oricum/).check();
  await page.getByRole("button", { name: "Confirmă împărțirea și adaugă în coadă" }).click();
  await expect(page.getByTestId("flash")).toContainText("2 create");
  await expect(page.getByTestId("flash")).toContainText("1 excluse");

  await page.goto("/");
  const queue = page.getByTestId("queue");
  await expect(queue.getByRole("link", { name: "Istorioara de import A", exact: true })).toBeVisible();
  await expect(queue.getByRole("link", { name: "Istorioara de import C", exact: true })).toHaveCount(0);

  await queue.getByRole("link", { name: "Istorioara de import A", exact: true }).click();
  await expect(page.getByTestId("source-reference")).toContainText("nr. 597 — Istorioara de import A");
  await expect(page.locator(".source")).not.toContainText("Prefața");
});
