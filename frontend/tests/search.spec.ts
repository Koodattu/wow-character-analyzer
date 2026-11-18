import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000" });

test("pagination uses the submitted search and a new search starts on page one", async ({ page }) => {
  const requests: string[] = [];
  await page.route(/\/api\/characters\/?\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const name = `${params.get("search")} page ${params.get("page")}`;
    requests.push(name);
    await route.fulfill({
      json: {
        characters: [{ id: name, name, realm: "Realm", realmSlug: "realm", bestParse: null, currentMplusScore: null }],
        pagination: { total: 21 },
      },
    });
  });

  await page.goto("/search?q=first");
  await expect(page.getByText("first page 1", { exact: true })).toBeVisible();
  const search = page.getByPlaceholder("Search by character name, realm, or guild...");
  await search.fill("second");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("first page 2", { exact: true })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByText("second page 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(requests).toEqual(["first page 1", "first page 2", "second page 1"]);
});
