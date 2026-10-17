import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "../../lib/e2e-admin.ts";
import {
  LEARNER_PASSWORD,
  openMultiUserDatabase,
  type Session,
} from "./multi-fixture.ts";

// The Users page on the Multi-user server (the "e2e-multi" project, after "setup-multi" made the admin).
// Learners are made through multi-fixture.ts, because sign-up and invites have no screens yet.

const LIN = { name: "Lin Learner", email: "lin.users@example.com" };
const SAM = { name: "Sam Sneaky", email: "sam.users@example.com" };
// A name is whatever the person typed when they signed up, and the admin reads it.
const MARKUP = {
  name: '<b id="users-xss">Mal</b><img src=x onerror="window.usersXss=1">',
  email: "mal.users@example.com",
};

let fixture: Awaited<ReturnType<typeof openMultiUserDatabase>>;
let admin: Session;
let lin: Session;
let sam: Session;

test.beforeAll(async () => {
  fixture = await openMultiUserDatabase();
  await fixture.ensureLearner(LIN);
  await fixture.ensureLearner(SAM);
  await fixture.ensureLearner(MARKUP);
  // Sam's stored role only contains admin: the plugin would call that an admin, the app does not.
  await fixture.db.user.update({
    where: { email: SAM.email },
    data: { role: "admin,learner" },
  });
  admin = await fixture.signIn(E2E_ADMIN.email, E2E_ADMIN.password);
  lin = await fixture.signIn(LIN.email, LEARNER_PASSWORD);
  sam = await fixture.signIn(SAM.email, LEARNER_PASSWORD);
});

test.afterAll(async () => {
  await fixture.close();
});

test("the admin finds Users in the nav and sees every Account on it", async ({
  context,
  page,
}) => {
  await context.addCookies(admin.cookies);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText([
    "Map",
    "Users",
    E2E_ADMIN.name,
  ]);
  await expect(nav.getByRole("link", { name: "Users" })).not.toHaveAttribute(
    "aria-current",
    /.*/,
  );

  await nav.getByRole("link", { name: "Users" }).click();

  await expect(page).toHaveURL("/users");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users");
  await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Map" })).not.toHaveAttribute(
    "aria-current",
    /.*/,
  );
  const table = page.getByRole("table", { name: "All users" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "name",
    "email",
    "role",
    "joined",
    "actions",
  ]);

  // The database is the truth, and other files may add Accounts at any moment: compare what is stored
  // now with what the page shows, until the two agree.
  await expect(async () => {
    const stored = await fixture.db.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    await page.reload();
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(stored.length, { timeout: 2_000 });
    for (const [i, user] of stored.entries()) {
      const cells = rows.nth(i).getByRole("cell");
      const you = user.email === E2E_ADMIN.email;
      await expect(cells.nth(0)).toHaveText(
        you ? `${user.name} you` : user.name,
      );
      await expect(cells.nth(1)).toHaveText(user.email);
      await expect(cells.nth(2)).toHaveText(
        user.role === "admin" ? "admin" : "learner",
      );
      await expect(cells.nth(3)).toHaveText(
        user.createdAt.toISOString().slice(0, 10),
      );
      await expect(cells.nth(4)).toHaveText(
        you ? "you cannot remove yourself" : "",
      );
    }
  }).toPass();

  // The admin and the learners made above are among them; no row has an action yet (reset password and
  // remove are later cards).
  await expect(
    table.getByRole("row", { name: new RegExp(`${E2E_ADMIN.email}.*admin`) }),
  ).toBeVisible();
  await expect(
    table.getByRole("row", { name: new RegExp(`${LIN.email}.*learner`) }),
  ).toBeVisible();
  await expect(table.getByRole("button")).toHaveCount(0);
});

test("a name with markup in it is shown as text, never run", async ({
  context,
  page,
}) => {
  await context.addCookies(admin.cookies);

  await page.goto("/users");

  await expect(page.getByRole("cell", { name: MARKUP.name })).toBeVisible();
  await expect(page.locator("#users-xss")).toHaveCount(0);
  expect(await page.evaluate(() => "usersXss" in window)).toBe(false);
});

test("a learner gets 403 on Users, sees nothing of it, and has no Users link", async ({
  context,
  page,
}) => {
  await context.addCookies(lin.cookies);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(["Map", LIN.name]);

  const response = await page.goto("/users");

  expect(response?.status()).toBe(403);
  await expect(page.locator("body")).not.toContainText(E2E_ADMIN.email);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("a user whose stored role merely contains admin is a learner here too", async ({
  context,
  page,
}) => {
  await context.addCookies(sam.cookies);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(["Map", SAM.name]);

  const response = await page.goto("/users");

  expect(response?.status()).toBe(403);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("a visitor who is signed out is sent to Sign in, not shown the page", async ({
  page,
}) => {
  await page.goto("/users");

  await expect(page).toHaveURL(/\/signin\?next=%2Fusers$/);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a plain form post creates an Invite, shows the link once and is never cached", async ({
    context,
    page,
  }) => {
    await context.addCookies(admin.cookies);
    await page.goto("/users");
    const posted = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().includes("/users?/invite"),
    );

    await page.getByRole("button", { name: "Invite a user" }).click();

    // SvelteKit ran the action and then the load in one request: the answer is the page, not a 500.
    const response = await posted;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    await expect(page.getByLabel("Invite link")).toHaveValue(
      /\/invite\/[\w-]{43}$/,
    );

    // Clean up, so a later file sees no stray pending Invite.
    await page.getByRole("button", { name: "Cancel invite" }).first().click();
    await expect(page.getByLabel("Invite link")).toHaveCount(0);
  });
});
