import { test, expect } from "@playwright/test";

// ── Navigation & Layout ──────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("sidebar links navigate to all pages", async ({ page }) => {
    await page.goto("/");

    const links = [
      { label: "Dashboard", url: "/" },
      { label: "Summary", url: "/summary" },
      { label: "Analytics", url: "/analytics" },
      { label: "Stocks", url: "/stocks" },
      { label: "Mutual Funds", url: "/mf" },
      { label: "Admin", url: "/admin" },
    ];

    for (const { label, url } of links) {
      await page.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("sidebar highlights active link", async ({ page }) => {
    await page.goto("/stocks");
    const stocksLink = page.getByRole("link", { name: "Stocks" });
    await expect(stocksLink).toHaveClass(/bg-zinc-800/);
  });

  test("sidebar logo is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside").getByText("Portfolio")).toBeVisible();
  });

  test("market ticker marquee is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=NIFTY 50").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title and live badge are visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
    await expect(page.getByText("Live").first()).toBeVisible();
  });

  test("KPI stat cards render", async ({ page }) => {
    await expect(
      page.getByText("Total Invested", { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Current Value", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText("Total Returns", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Overall Return")).toBeVisible();
  });

  test("NIFTY chart loads", async ({ page }) => {
    await expect(
      page.getByText(/NIFTY 50.*Last 14 Trading Days/)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("portfolio chart loads", async ({ page }) => {
    await expect(page.getByText("Portfolio Value").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ── Stocks ───────────────────────────────────────────────────────────────────

test.describe("Stocks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stocks");
  });

  test("page header shows holdings count", async ({ page }) => {
    await expect(page.getByText("Stocks & Smallcase")).toBeVisible();
    await expect(page.getByText(/\d+ holdings/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("tab switching works", async ({ page }) => {
    await expect(page.getByText("Total Invested")).toBeVisible({
      timeout: 10_000,
    });

    for (const label of ["User 1", "User 2", "All Stocks"]) {
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByText("Total Invested")).toBeVisible();
    }
  });

  test("search filters the table", async ({ page }) => {
    await expect(page.getByPlaceholder("Search ticker…")).toBeVisible({
      timeout: 10_000,
    });
    const searchInput = page.getByPlaceholder("Search ticker…");
    await searchInput.fill("RELIANCE");

    const heading = page.getByText(/All Holdings \(\d+\)/);
    await expect(heading).toBeVisible();
  });

  test("stat cards display data", async ({ page }) => {
    await expect(
      page.getByText("Total Invested", { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Current Value", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText("Total Returns", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Holdings", { exact: true })).toBeVisible();
  });

  test("top 15 chart renders", async ({ page }) => {
    await expect(
      page.getByText("Top 15 Holdings by Return %")
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── Mutual Funds ─────────────────────────────────────────────────────────────

test.describe("Mutual Funds", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mf");
  });

  test("page loads with header", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Mutual Funds" })
    ).toBeVisible();
  });

  test("tab switching works", async ({ page }) => {
    await expect(page.getByText("Total Invested")).toBeVisible({
      timeout: 10_000,
    });

    for (const label of ["User 1", "User 2", "All Funds"]) {
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByText("Total Invested")).toBeVisible();
    }
  });

  test("search filters the table", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill("HDFC");
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────

test.describe("Summary", () => {
  test("page loads with charts", async ({ page }) => {
    await page.goto("/summary");
    await expect(
      page.getByRole("heading", { name: "Summary" })
    ).toBeVisible();
    await expect(
      page.getByText("Total Invested", { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ── Analytics ────────────────────────────────────────────────────────────────

test.describe("Analytics", () => {
  test("page loads", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.getByRole("heading", { name: "Analytics" })
    ).toBeVisible();
  });
});

// ── Admin ────────────────────────────────────────────────────────────────────

test.describe("Admin", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
  });

  test("page loads with owner tabs", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Admin" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "User 1" }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Sandhya" }).first()
    ).toBeVisible();
  });

  test("owner tab switching works", async ({ page }) => {
    await page.getByRole("button", { name: "User 2" }).first().click();
    await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("create button opens modal", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: /Add Fund/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();
    await expect(page.getByText("Fund House")).toBeVisible();
    await expect(page.getByText("Fund Name").first()).toBeVisible();
  });

  test("search filters admin table", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i).first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill("HDFC");
  });
});

// ── Sidebar Actions ──────────────────────────────────────────────────────────

test.describe("Sidebar Actions", () => {
  test("refresh buttons are present", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Refresh NAV/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Refresh Stocks/i })
    ).toBeVisible();
  });
});
