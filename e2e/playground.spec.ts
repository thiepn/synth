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

test("Playground A B banks preserve independent beat edits", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const step = page.getByRole("button", {
    name: /KICK step 2,/i,
  });
  const initial = await step.getAttribute("aria-pressed");

  await step.click();
  const edited = initial === "true" ? "false" : "true";
  await expect(step).toHaveAttribute(
    "aria-pressed",
    edited,
  );

  await page.getByRole("button", {
    name: "Duplicate →B",
  }).click();

  await expect(
    page.getByRole("button", {
      name: "B",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await step.click();
  await expect(step).toHaveAttribute(
    "aria-pressed",
    initial ?? "false",
  );

  await page.getByRole("button", {
    name: "A",
    exact: true,
  }).click();
  await expect(step).toHaveAttribute(
    "aria-pressed",
    edited,
  );

  await page.getByRole("button", {
    name: "B",
    exact: true,
  }).click();
  await expect(step).toHaveAttribute(
    "aria-pressed",
    initial ?? "false",
  );

  expect(errors).toEqual([]);
});

test("Playground bar editing grows duplicates clears and deletes musical bars", async ({
  page,
}) => {
  await waitForPlayground(page);

  const addBar = page.getByRole("button", {
    name: "Add bar",
  });
  await addBar.click();

  await expect(
    page.getByRole("button", { name: "Bar 2" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Bar 2" }).click();
  const kick17 = page.getByRole("button", {
    name: /KICK step 17,/i,
  });
  await kick17.click();
  await expect(kick17).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {
    name: "Clear current bar",
  }).click();
  await expect(kick17).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Bar 1" }).click();
  await page.getByRole("button", {
    name: "Duplicate current bar",
  }).click();

  await expect(
    page.getByRole("button", { name: "Bar 3" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bar 2" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {
    name: "Delete current bar",
  }).click();

  await expect(
    page.getByRole("button", { name: "Bar 3" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Bar 2" }),
  ).toBeVisible();
});

test("Playground lane transforms are deterministic and undoable", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Clear selected lane",
  }).click();

  const step1 = page.getByRole("button", {
    name: /KICK step 1,/i,
  });
  const step3 = page.getByRole("button", {
    name: /KICK step 3,/i,
  });
  const step14 = page.getByRole("button", {
    name: /KICK step 14,/i,
  });
  const step16 = page.getByRole("button", {
    name: /KICK step 16,/i,
  });

  await step1.click();
  await step3.click();
  await expect(step1).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(step3).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: "Reverse selected lane",
  }).click();

  await expect(step1).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(step3).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(step14).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(step16).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();

  await expect(step1).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(step3).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(errors).toEqual([]);
});

test("Playground velocity editing changes an existing hit without stopping flow", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const step = page.getByRole("button", {
    name: /KICK step 2,/i,
  });

  if (
    (await step.getAttribute("aria-pressed")) ===
    "true"
  ) {
    await step.click();
  }
  await step.click();

  await expect(step).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(step).toHaveAttribute(
    "aria-label",
    /velocity 76 percent/i,
  );

  const beforeLabel =
    (await step.getAttribute("aria-label")) ?? "";
  const box = await step.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + box!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + Math.max(2, box!.height * 0.08),
    { steps: 5 },
  );
  await page.mouse.up();

  await expect
    .poll(() => step.getAttribute("aria-label"))
    .not.toBe(beforeLabel);
  await expect(step).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(errors).toEqual([]);
});

test("Playground count in restart repeat and momentary monitoring stay responsive", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const countIn = page.getByRole("button", {
    name: "Toggle one bar count-in",
  });
  await countIn.click();
  await expect(countIn).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: "Start transport with count-in",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Cancel count-in",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Cancel count-in",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Start transport with count-in",
    }),
  ).toBeVisible();

  await countIn.click();
  await page.getByRole("button", {
    name: "Start transport",
  }).click();

  await page.keyboard.press("r");
  await expect(
    page.locator(".playground-notice"),
  ).toHaveText("Back to step 1");

  await page.getByRole("button", {
    name: "Pause transport",
  }).click();

  const repeat = page.getByRole("button", {
    name: "Pad hold repeat Off",
  });
  await repeat.click();
  await expect(
    page.getByRole("button", {
      name: "Pad hold repeat 1/4",
    }),
  ).toBeVisible();

  const mute = page.getByRole("button", {
    name: "Hold to momentarily mute selected lane",
  });
  await mute.scrollIntoViewIfNeeded();
  await mute.hover();
  const muteBox = await mute.boundingBox();
  expect(muteBox).not.toBeNull();

  await page.mouse.move(
    muteBox!.x + muteBox!.width / 2,
    muteBox!.y + muteBox!.height / 2,
  );
  await page.mouse.down();
  await expect(mute).toHaveClass(/is-active/);
  await page.mouse.up();
  await expect(mute).not.toHaveClass(/is-active/);

  const solo = page.getByRole("button", {
    name: "Hold to momentarily solo selected lane",
  });
  await solo.scrollIntoViewIfNeeded();
  await solo.hover();
  const soloBox = await solo.boundingBox();
  expect(soloBox).not.toBeNull();

  await page.mouse.move(
    soloBox!.x + soloBox!.width / 2,
    soloBox!.y + soloBox!.height / 2,
  );
  await page.mouse.down();
  await expect(solo).toHaveClass(/is-active/);
  await page.mouse.up();
  await expect(solo).not.toHaveClass(/is-active/);

  expect(errors).toEqual([]);
});

test("Playground sound favorites and recents remain fast", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: /Change KICK sound\. Current/i,
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
    name: /Change KICK sound\. Current/i,
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
