import {
  expect,
  test,
  type Page,
} from "@playwright/test";

function watchRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push("pageerror: " + error.message);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push("console: " + message.text());
  });

  return errors;
}

async function waitForPlayground(page: Page) {
  await page.goto("/");
  await expect(
    page.locator(".playground-surface"),
  ).toBeVisible();
  await expect(
    page.locator(".playground-project-name input"),
  ).toBeEnabled();
}

test("Playground desktop discovery and step context are release-safe", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const helpButton = page.getByRole("button", {
    name: "Open Playground help",
  });
  await helpButton.focus();
  await page.keyboard.press("Shift+/");

  const help = page.getByRole("dialog", {
    name: "Playground help and shortcuts",
  });
  await expect(help).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.style.overflow,
      ),
    )
    .toBe("hidden");
  await expect(
    help.getByRole("button", { name: "Close help" }),
  ).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          document.activeElement?.closest(
            ".playground-help",
          ),
        ),
      ),
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.style.overflow,
      ),
    )
    .toBe("");
  await expect(helpButton).toBeFocused();

  const step = page.locator(
    '.playground-step[data-lane-id="lane-kick"]' +
      '[data-step-index="1"]',
  );
  await step.click({ button: "right" });

  const menu = page.getByRole("menu", {
    name: "Step 2 actions",
  });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", {
      name: "Normal hit",
    }),
  ).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", {
      name: "Accent",
    }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(step).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(step).toHaveAttribute(
    "aria-label",
    /velocity 96 percent/i,
  );

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(
    overflow.width + 1,
  );

  expect(errors).toEqual([]);
});

test("Playground sound favorites and recents remain fast", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: /Change KICK sound/i,
  }).click();

  const drawer = page.getByRole("region", {
    name: "KICK sounds",
  });
  await expect(drawer).toBeVisible();

  await drawer.getByRole("button", {
    name: "Favorite Deep sound",
  }).click();

  await drawer.getByRole("button", {
    name: "Deep KICK sound",
  }).click();

  await expect(
    drawer.getByRole("button", {
      name: "Remove Deep from favorite sounds",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await page.getByRole("button", {
    name: /Change KICK sound/i,
  }).click();

  await expect(
    page.locator(".playground-sound-shortcuts"),
  ).toContainText("Favorites");
  await expect(
    page.locator(".playground-sound-shortcuts"),
  ).toContainText("Deep");

  expect(errors).toEqual([]);
});

test("Playground mobile layout keeps core controls reachable without horizontal overflow", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await waitForPlayground(page);

  const dock = page.locator(
    ".playground-mobile-dock",
  );
  await expect(dock).toBeVisible();
  await expect(
    dock.locator(":scope > button"),
  ).toHaveCount(7);
  await expect(
    page.locator(".playground-actions"),
  ).toBeHidden();

  const step = page.locator(
    '.playground-step[data-lane-id="lane-kick"]',
  ).first();
  const box = await step.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", {
    name: "Open Playground help",
  }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Playground help and shortcuts",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Close help",
  }).click();

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(
    overflow.width + 1,
  );

  expect(errors).toEqual([]);
});

test("Playground project session can create a fresh beat while preserving the previous project", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const name = page.locator(
    ".playground-project-name input",
  );
  await name.fill("Playground Release QA");
  await name.press("Enter");

  await expect
    .poll(() =>
      page
        .locator(".playground-save-state")
        .innerText(),
    )
    .toBe("Saved");

  await page.getByRole("button", {
    name: /^New$/i,
  }).click();

  await expect(name).toHaveValue("New Beat");

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();

  const projects = page.getByRole("dialog", {
    name: "Recent projects",
  });
  await expect(projects).toContainText(
    "Playground Release QA",
  );
  await expect(projects).toContainText("New Beat");

  expect(errors).toEqual([]);
});
