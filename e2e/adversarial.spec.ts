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

async function waitForSaved(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator(".playground-save-state")
          .innerText(),
      { timeout: 10_000 },
    )
    .toBe("Saved");
}

test("P20 project switching clears transient edit and export state and restores the correct mixer lane", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const name = page.locator(
    ".playground-project-name input",
  );
  await name.fill("P20 Source");
  await name.press("Enter");

  await page.getByRole("button", {
    name: "Select SNARE tools",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Select SNARE tools",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();
  await expect(
    page.getByRole("region", {
      name: "BASS piano roll",
    }),
  ).toBeVisible();

  const kickStep = page.locator(
    '.playground-step[data-lane-id="lane-kick"]',
  ).first();
  await kickStep.click({ modifiers: ["Shift"] });
  await expect(kickStep).toHaveClass(/is-selected/);
  await kickStep.click({ button: "right" });
  await expect(
    page.getByRole("menu", {
      name: /Step 1 actions/i,
    }),
  ).toBeVisible();

  await waitForSaved(page);

  await page.getByRole("button", {
    name: /^Finish$/i,
  }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Finish and export",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: /^New$/i,
  }).click();

  await expect(name).toHaveValue("New Beat");
  await expect(
    page.getByRole("dialog", {
      name: "Finish and export",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "BASS piano roll",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menu", {
      name: /Step 1 actions/i,
    }),
  ).toHaveCount(0);
  await expect(
    page.locator(".playground-step.is-selected"),
  ).toHaveCount(0);

  await page.getByRole("button", {
    name: "Select SNARE tools",
  }).click();
  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();
  await expect(
    page.getByRole("region", {
      name: "Mix controls for BASS",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();
  const projects = page.getByRole("dialog", {
    name: "Recent projects",
  });
  const sourceRow = projects
    .locator(".playground-project-menu__row")
    .filter({ hasText: "P20 Source" });
  await expect(sourceRow).toBeVisible();
  await sourceRow
    .locator(".playground-project-menu__open")
    .click();

  await expect(name).toHaveValue("P20 Source");
  await expect(
    page.getByRole("button", {
      name: "Select SNARE tools",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", {
      name: "Mix controls for SNARE",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "BASS piano roll",
    }),
  ).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("P20 recording boundaries prevent partial project actions and commit safely before Studio", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Add bar",
  }).click();
  await page.getByRole("button", {
    name: "Bar 2",
  }).click();
  await page.getByRole("button", {
    name: "Clear current bar",
  }).click();

  await page.getByRole("button", {
    name: "Start grid recording",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Stop grid recording",
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", {
      name: /^New$/i,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: /^Duplicate$/i,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Create recovery checkpoint",
    }),
  ).toBeDisabled();

  await page.keyboard.press("a");
  await expect(
    page.locator(".playground-record-status"),
  ).toContainText("1 hit");

  await page.getByRole("button", {
    name: "Open Studio",
    exact: true,
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Mode 01: CREATE",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Return to Playground",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Start grid recording",
    }),
  ).toBeVisible();

  const barTwoKickHits = page.locator(
    '.playground-step[data-lane-id="lane-kick"][aria-pressed="true"]',
  );
  await expect(barTwoKickHits).toHaveCount(1);

  await page.getByRole("button", {
    name: "Start grid recording",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Stop grid recording",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: /^Finish$/i,
  }).click();
  await expect(
    page.getByRole("dialog", {
      name: "Finish and export",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Start grid recording",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^New$/i,
    }),
  ).toBeEnabled();

  expect(errors).toEqual([]);
});

test("P20 complete beat-to-song workflow survives reload and exports from restored state", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const name = page.locator(
    ".playground-project-name input",
  );
  await name.fill("P20 Road Test");
  await name.press("Enter");

  await page.getByRole("button", {
    name: "Toggle musical starter kits",
  }).click();
  const starters = page.getByRole("region", {
    name: "Musical starter kits",
  });
  await starters.getByRole("button", {
    name: "Apply starter Warm Lo-Fi",
  }).click();

  await page.getByRole("button", {
    name: "Add bar",
  }).click();

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();
  const bass = page.getByRole("region", {
    name: "BASS piano roll",
  });
  await bass.getByRole("button", {
    name: "Add BASS C2 at step 1",
    exact: true,
  }).click();

  const song = page.getByRole("region", {
    name: "Song arrangement",
  });
  await song.getByRole("button", {
    name: "Build Standard song draft",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(6);
  const stopSong = song.getByRole("button", {
    name: "Stop song playback",
  });
  if (await stopSong.isEnabled()) {
    await stopSong.click();
  }

  await page.getByRole("button", {
    name: "Toggle motion automation controls",
  }).click();
  const motion = page.getByRole("region", {
    name: "Motion automation",
  });
  await motion.getByLabel("Motion amount").fill("61");
  await motion.getByRole("button", {
    name: "Apply motion automation",
  }).click();

  await waitForSaved(page);
  await page.reload();
  await expect(
    page.locator(".playground-surface"),
  ).toBeVisible();
  await expect(name).toHaveValue("P20 Road Test");

  const restoredSong = page.getByRole("region", {
    name: "Song arrangement",
  });
  await expect(
    restoredSong.locator(".playground-song-section"),
  ).toHaveCount(6);
  await expect(
    page.getByRole("button", {
      name: /BASS C2 at step 1\. Open piano roll/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Toggle motion automation controls",
    }),
  ).toContainText("1 active");

  await page.getByRole("button", {
    name: /^Finish$/i,
  }).click();
  const finish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  await expect(
    finish.getByRole("button", {
      name: "Export full Song",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  const downloadPromise =
    page.waitForEvent("download");
  await finish.getByRole("button", {
    name: /Download WAV Full song/i,
  }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /P20 Road Test - Song\.wav$/,
  );
  await expect(
    finish.locator(".playground-finish-result"),
  ).toContainText("No clipped samples");

  expect(errors).toEqual([]);
});
