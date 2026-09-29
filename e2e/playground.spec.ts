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

test("Playground records pad performance live into the selected bar and can erase it", async ({
  page,
}) => {
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Add bar",
  }).click();
  await page.getByRole("button", {
    name: "Bar 2",
  }).click();

  const follow = page
    .locator(".playground-flow-bar > button")
    .filter({ hasText: "Follow" })
    .first();
  if (
    (await follow.getAttribute("aria-pressed")) === "true"
  ) {
    await follow.click();
  }

  await page.getByRole("button", {
    name: "1/4",
    exact: true,
  }).click();

  await page.getByRole("button", {
    name: "Start grid recording",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Stop grid recording",
    }),
  ).toBeVisible();

  await page.keyboard.press("a");
  await expect(
    page.locator(".playground-record-status"),
  ).toContainText("1 hit");

  await page.getByRole("button", {
    name: "Stop grid recording",
  }).click();

  const barTwoKickHits = page.locator(
    '.playground-step[data-lane-id="lane-kick"][aria-pressed="true"]',
  );
  await expect(barTwoKickHits).toHaveCount(1);

  await page.getByRole("button", {
    name: "Undo",
  }).click();
  await expect(barTwoKickHits).toHaveCount(0);

  await page.getByRole("button", {
    name: "Redo",
  }).click();
  await expect(barTwoKickHits).toHaveCount(1);

  await page.getByRole("button", {
    name: "Pause transport",
  }).click();

  await page.getByRole("button", {
    name: "Erase",
    exact: true,
  }).click();
  await page.getByRole("button", {
    name: "Start grid recording",
  }).click();
  await page.keyboard.press("a");
  await page.getByRole("button", {
    name: "Stop grid recording",
  }).click();

  await expect(barTwoKickHits).toHaveCount(0);
});

test("Playground selection batch edits move duplicate delete and undo notes", async ({
  page,
}) => {
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Clear selected lane",
  }).click();

  const step1 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="0"]',
  );
  const step2 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="1"]',
  );
  const step3 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="2"]',
  );
  const step4 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="3"]',
  );
  const step5 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="4"]',
  );
  const step7 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="6"]',
  );

  await step1.click();
  await step3.click();

  await step1.click({ modifiers: ["Shift"] });
  await step3.click({ modifiers: ["Shift"] });
  await expect(step1).toHaveClass(/is-selected/);
  await expect(step3).toHaveClass(/is-selected/);

  await page.getByRole("button", {
    name: "Accent selected notes",
  }).click();
  await expect(step1).toHaveAttribute(
    "aria-label",
    /velocity 96 percent/i,
  );
  await expect(step3).toHaveAttribute(
    "aria-label",
    /velocity 96 percent/i,
  );

  await page.getByRole("button", {
    name: "Move selected notes right one step",
  }).click();
  await expect(step1).toHaveAttribute("aria-pressed", "false");
  await expect(step2).toHaveAttribute("aria-pressed", "true");
  await expect(step3).toHaveAttribute("aria-pressed", "false");
  await expect(step4).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+d");
  await expect(step5).toHaveAttribute("aria-pressed", "true");
  await expect(step7).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();
  await expect(step5).toHaveAttribute("aria-pressed", "false");
  await expect(step7).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", {
    name: "Select current track notes",
  }).click();
  await expect(
    page.locator(".playground-step.is-selected"),
  ).toHaveCount(2);

  await page.keyboard.press("Delete");
  await expect(step2).toHaveAttribute("aria-pressed", "false");
  await expect(step4).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();
  await expect(step2).toHaveAttribute("aria-pressed", "true");
  await expect(step4).toHaveAttribute("aria-pressed", "true");

  const step2Box = await step2.boundingBox();
  const step4Box = await step4.boundingBox();
  expect(step2Box).not.toBeNull();
  expect(step4Box).not.toBeNull();

  await page.keyboard.down("Control");
  await page.mouse.move(
    step2Box!.x + step2Box!.width / 2,
    step2Box!.y + step2Box!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    step4Box!.x + step4Box!.width / 2,
    step4Box!.y + step4Box!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(
    page.locator(".playground-step.is-selected"),
  ).toHaveCount(2);

  await page.getByRole("button", {
    name: "Copy selected notes",
  }).click();
  await page.getByRole("button", {
    name: "Add bar",
  }).click();
  await page.getByRole("button", {
    name: "Bar 2",
  }).click();
  await page.getByRole("button", {
    name: "Paste copied notes to current bar",
  }).click();

  const barTwoStep1 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="16"]',
  );
  const barTwoStep3 = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="18"]',
  );
  await expect(barTwoStep1).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(barTwoStep3).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();
  await expect(barTwoStep1).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(barTwoStep3).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("Playground P11 Jam performs live macros fill and hold effects safely", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const jamToggle = page.getByRole("button", {
    name: "Toggle live jam controls",
  });
  await expect(jamToggle).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await jamToggle.click();

  const jam = page.getByRole("region", {
    name: "Live jam controls",
  });
  await expect(jam).toBeVisible();
  await expect(jamToggle).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const energy = jam.getByLabel("Live energy");
  const filter = jam.getByLabel("Live filter");
  const space = jam.getByLabel("Live space");

  await expect(energy).toHaveValue("50");
  await expect(filter).toHaveValue("100");
  await expect(space).toHaveValue("0");

  await energy.fill("82");
  await filter.fill("46");
  await space.fill("28");
  await expect(energy).toHaveValue("82");
  await expect(filter).toHaveValue("46");
  await expect(space).toHaveValue("28");

  const fill = jam.getByRole("button", {
    name: "Queue live fill",
  });
  await expect(fill).toBeDisabled();

  await page.getByRole("button", {
    name: "Start transport",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Pause transport",
    }),
  ).toBeVisible();
  await expect(fill).toBeEnabled();

  await fill.click();
  await expect(
    page.locator(".playground-notice"),
  ).toContainText(
    "Fill queued · final beat before next bar",
  );

  const stutter = jam.getByRole("button", {
    name: /Stutter\. Hold for beat-quantized live effect\./i,
  });
  const box = await stutter.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + box!.height / 2,
  );
  await page.mouse.down();
  await expect(stutter).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.up();

  await jam.getByRole("button", {
    name: "Reset live jam controls",
  }).click();
  await expect(energy).toHaveValue("50");
  await expect(filter).toHaveValue("100");
  await expect(space).toHaveValue("0");

  await jamToggle.click();
  await expect(jam).toHaveCount(0);
  await expect(jamToggle).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await jamToggle.click();
  await expect(jam).toBeVisible();

  await page.getByRole("button", {
    name: "Start grid recording",
  }).click();
  await expect(jam).toHaveCount(0);
  await expect(jamToggle).toBeDisabled();

  const stopRecord = page.getByRole("button", {
    name: "Stop grid recording",
  });
  if (await stopRecord.isVisible()) {
    await stopRecord.click();
  }

  expect(errors).toEqual([]);
});

test("Playground P10 micro variation edits selected hits and step context", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Clear selected lane",
  }).click();

  const step = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="0"]',
  );
  await step.click();
  await step.click({
    modifiers: ["Shift"],
  });
  await expect(step).toHaveClass(/is-selected/);

  await page.getByRole("button", {
    name: "Cycle selected note chance",
  }).click();
  await expect(step).toHaveAttribute(
    "aria-label",
    /chance 75 percent/i,
  );
  await expect(
    step.locator(".playground-step__variation"),
  ).toContainText("75%");

  await page.getByRole("button", {
    name: "Cycle selected note repeat",
  }).click();
  await expect(step).toHaveAttribute(
    "aria-label",
    /repeat 2 times/i,
  );
  await expect(
    step.locator(".playground-step__variation"),
  ).toContainText("×2");

  await page.getByRole("button", {
    name: "Cycle selected note flam",
  }).click();
  await expect(step).toHaveAttribute(
    "aria-label",
    /flam 15 milliseconds/i,
  );
  await expect(
    step.locator(".playground-step__variation"),
  ).toContainText("F");

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).first().click();
  await expect(step).not.toHaveAttribute(
    "aria-label",
    /flam/i,
  );
  await expect(step).toHaveAttribute(
    "aria-label",
    /chance 75 percent/i,
  );
  await expect(step).toHaveAttribute(
    "aria-label",
    /repeat 2 times/i,
  );

  await step.click({ button: "right" });
  const menu = page.getByRole("menu", {
    name: "Step 1 actions",
  });
  await expect(
    menu.getByRole("menuitem", {
      name: /Chance 75%/i,
    }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", {
      name: /Repeat ×2/i,
    }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", {
      name: /Flam Off/i,
    }),
  ).toBeVisible();

  await menu.getByRole("menuitem", {
    name: /Chance 75%/i,
  }).click();
  await expect(step).toHaveAttribute(
    "aria-label",
    /chance 50 percent/i,
  );

  expect(errors).toEqual([]);
});

test("Playground melodic tracks edit pitch duration chords scale and survive drum regeneration", async ({
  page,
}) => {
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();

  const bassRoll = page.getByRole("region", {
    name: "BASS piano roll",
  });
  await expect(bassRoll).toBeVisible();

  await bassRoll.getByRole("button", {
    name: "Add BASS C2 at step 1",
    exact: true,
  }).click();

  let bassNote = bassRoll.getByRole("button", {
    name: /BASS note C2 step 1, length 1\/4/i,
  });
  await expect(bassNote).toBeVisible();

  await bassRoll.getByRole("button", {
    name: "Next melodic instrument",
  }).click();
  await expect(
    bassRoll.locator(".playground-piano__preset b"),
  ).toHaveText("Pluck");

  await bassRoll.getByLabel("Melodic key").selectOption("2");
  await bassRoll
    .getByLabel("Melodic scale")
    .selectOption("minor");
  await expect(
    bassRoll.getByRole("button", {
      name: "Lock melodic notes to scale",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  bassNote = bassRoll.getByRole("button", {
    name: /BASS note C2 step 1, length 1\/4/i,
  });
  await expect(bassNote).toBeVisible();

  const resize = bassNote.locator(
    ".playground-piano-note__resize",
  );
  const resizeBox = await resize.boundingBox();
  expect(resizeBox).not.toBeNull();
  await page.mouse.move(
    resizeBox!.x + resizeBox!.width / 2,
    resizeBox!.y + resizeBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeBox!.x + 150,
    resizeBox!.y + resizeBox!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(
    bassRoll.getByRole("button", {
      name: /BASS note C2 step 1, length (?!1\/4).+/i,
    }),
  ).toBeVisible();

  await bassRoll.getByRole("button", {
    name: "1/2",
    exact: true,
  }).click();
  await expect(
    bassRoll.getByRole("button", {
      name: /BASS note C2 step 1, length 1\/2/i,
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Open CHORDS piano roll",
  }).click();
  const chordRoll = page.getByRole("region", {
    name: "CHORDS piano roll",
  });
  await expect(chordRoll).toBeVisible();

  await chordRoll.getByRole("button", {
    name: "Add CHORDS C4 at step 1",
    exact: true,
  }).click();
  await expect(
    chordRoll.locator(".playground-piano-note"),
  ).toHaveCount(3);

  await chordRoll.getByRole("button", {
    name: "Maj",
    exact: true,
  }).click();
  await expect(
    chordRoll.locator(".playground-piano-note"),
  ).toHaveCount(3);

  await chordRoll.getByRole("button", {
    name: "Mute selected melodic track",
  }).click();
  await expect(
    chordRoll.getByRole("button", {
      name: "Mute selected melodic track",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();
  await expect(
    chordRoll.getByRole("button", {
      name: "Mute selected melodic track",
    }),
  ).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("Beat style").selectOption("house");

  await expect(
    page.getByRole("button", {
      name: /BASS C2 at step 1\. Open piano roll/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /CHORDS .* at step 1\. Open piano roll/i,
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();
  await expect(
    page.getByRole("region", {
      name: "BASS piano roll",
    }).getByLabel("Melodic key"),
  ).toHaveValue("2");
});

test("Playground records held melodic MIDI notes as one undoable take", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const input = {
      id: "qa-midi-input",
      name: "QA MIDI Keys",
      manufacturer: "Synth QA",
      state: "connected",
      connection: "open",
      onmidimessage: null as
        | ((event: { data: Uint8Array }) => void)
        | null,
      open: async () => undefined,
      close: async () => undefined,
    };
    const access = {
      inputs: new Map([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null,
    };

    Object.defineProperty(
      navigator,
      "requestMIDIAccess",
      {
        configurable: true,
        value: async () => access,
      },
    );

    (
      window as unknown as {
        __qaMidiInput: typeof input;
      }
    ).__qaMidiInput = input;
  });

  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();
  const bassRoll = page.getByRole("region", {
    name: "BASS piano roll",
  });

  await bassRoll.getByRole("button", {
    name: "Start melodic MIDI recording",
  }).click();
  await expect(
    bassRoll.getByRole("button", {
      name: "Stop melodic MIDI recording",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.waitForTimeout(60);
  await page.evaluate(() => {
    const input = (
      window as unknown as {
        __qaMidiInput: {
          onmidimessage:
            | ((event: {
                data: Uint8Array;
              }) => void)
            | null;
        };
      }
    ).__qaMidiInput;
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 48, 112]),
    });
  });

  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const input = (
      window as unknown as {
        __qaMidiInput: {
          onmidimessage:
            | ((event: {
                data: Uint8Array;
              }) => void)
            | null;
        };
      }
    ).__qaMidiInput;
    input.onmidimessage?.({
      data: new Uint8Array([0x80, 48, 0]),
    });
  });

  await page.waitForTimeout(80);
  await page.evaluate(() => {
    const input = (
      window as unknown as {
        __qaMidiInput: {
          onmidimessage:
            | ((event: {
                data: Uint8Array;
              }) => void)
            | null;
        };
      }
    ).__qaMidiInput;
    input.onmidimessage?.({
      data: new Uint8Array([0x90, 50, 96]),
    });
  });
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    const input = (
      window as unknown as {
        __qaMidiInput: {
          onmidimessage:
            | ((event: {
                data: Uint8Array;
              }) => void)
            | null;
        };
      }
    ).__qaMidiInput;
    input.onmidimessage?.({
      data: new Uint8Array([0x80, 50, 0]),
    });
  });

  await bassRoll.getByRole("button", {
    name: "Stop melodic MIDI recording",
  }).click();

  const recordedNote = bassRoll.getByRole(
    "button",
    {
      name: /BASS note C3 step \d+, length (?!1\/16).+/i,
    },
  );
  const secondRecordedNote = bassRoll.getByRole(
    "button",
    {
      name: /BASS note D3 step \d+, length .+/i,
    },
  );
  await expect(recordedNote).toBeVisible();
  await expect(secondRecordedNote).toBeVisible();

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).click();
  await expect(recordedNote).toHaveCount(0);
  await expect(secondRecordedNote).toHaveCount(0);

  await page.getByRole("button", {
    name: "Redo",
    exact: true,
  }).click();
  await expect(
    bassRoll.getByRole("button", {
      name: /BASS note C3 step \d+, length .+/i,
    }),
  ).toBeVisible();
  await expect(
    bassRoll.getByRole("button", {
      name: /BASS note D3 step \d+, length .+/i,
    }),
  ).toBeVisible();
});

test("Playground P14 drafts a structured editable song from A B in one tap", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const song = page.getByRole("region", {
    name: "Song arrangement",
  });

  const standard = song.getByRole("button", {
    name: "Build Standard song draft",
  });
  await expect(standard).toBeVisible();
  const standardBox = await standard.boundingBox();
  expect(standardBox).not.toBeNull();
  expect(standardBox!.height).toBeGreaterThanOrEqual(44);

  await standard.click();

  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(6);

  await expect(
    song.getByRole("button", {
      name: /INTRO, section 1 of 6, Pattern A, Intro, 2 repeats/i,
    }),
  ).toBeVisible();
  await expect(
    song.getByRole("button", {
      name: /VERSE, section 2 of 6, Pattern A, Verse, 4 repeats/i,
    }),
  ).toBeVisible();
  await expect(
    song.getByRole("button", {
      name: /CHORUS, section 3 of 6, Pattern B, Chorus, 4 repeats/i,
    }),
  ).toBeVisible();
  await expect(
    song.getByRole("button", {
      name: /OUTRO, section 6 of 6, Pattern A, Outro, 2 repeats/i,
    }),
  ).toBeVisible();

  await expect(
    song.getByRole("button", {
      name: "Stop song playback",
    }),
  ).toBeEnabled();
  await expect(
    song.locator(
      ".playground-song-section.is-playing",
    ),
  ).toHaveCount(1);

  await song.getByRole("button", {
    name: "Stop song playback",
  }).click();

  const second = song
    .locator(".playground-song-section")
    .nth(1);
  await second.click();
  await song.getByRole("button", {
    name: "Increase section repeats",
  }).click();
  await expect(second).toHaveAttribute(
    "aria-label",
    /5 repeats/i,
  );

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();
  const projects = page.getByRole("dialog", {
    name: "Recent projects",
  });
  await expect(projects).toContainText(
    "Before song draft · Standard",
  );

  expect(errors).toEqual([]);
});

test("Playground P15 Motion creates persistent looping automation without exposing Studio complexity", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const toggle = page.getByRole("button", {
    name: "Toggle motion automation controls",
  });
  await toggle.click();

  let motion = page.getByRole("region", {
    name: "Motion automation",
  });
  await expect(motion).toBeVisible();

  await expect(
    motion.getByRole("button", {
      name: "Motion target Filter",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    motion.getByRole("button", {
      name: "Motion shape Sweep",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  const amount = motion.getByLabel(
    "Motion amount",
  );
  await amount.fill("64");
  await motion.getByRole("button", {
    name: "Apply motion automation",
  }).click();

  await expect(
    motion.locator(
      ".playground-motion-strip__identity strong",
    ),
  ).toHaveText("Active");
  await expect(toggle).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(toggle).toContainText(
    "1 active",
  );

  await motion.getByRole("button", {
    name: "Motion target Space",
  }).click();
  await motion.getByRole("button", {
    name: "Motion shape Breathe",
  }).click();
  await amount.fill("42");
  await motion.getByRole("button", {
    name: "Apply motion automation",
  }).click();
  await expect(toggle).toContainText(
    "2 active",
  );

  await toggle.click();
  await expect(motion).toHaveCount(0);
  await expect(toggle).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await toggle.click();
  motion = page.getByRole("region", {
    name: "Motion automation",
  });
  await motion.getByRole("button", {
    name: "Motion target Filter",
  }).click();
  await expect(
    motion.getByRole("button", {
      name: "Motion shape Sweep",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    motion.getByLabel("Motion amount"),
  ).toHaveValue("64");

  await expect
    .poll(() =>
      page
        .locator(".playground-save-state")
        .innerText(),
    )
    .toBe("Saved");

  await page.reload();
  await waitForPlayground(page);

  const restoredToggle =
    page.getByRole("button", {
      name: "Toggle motion automation controls",
    });
  await expect(restoredToggle).toContainText(
    "2 active",
  );
  await restoredToggle.click();

  const restored = page.getByRole("region", {
    name: "Motion automation",
  });
  await expect(
    restored.locator(
      ".playground-motion-strip__identity strong",
    ),
  ).toHaveText("Active");

  await restored.getByRole("button", {
    name: "Clear selected motion automation",
  }).click();
  await restored.getByRole("button", {
    name: "Motion target Space",
  }).click();
  await restored.getByRole("button", {
    name: "Clear selected motion automation",
  }).click();

  await expect(restoredToggle).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(restoredToggle).toContainText(
    "Off",
  );

  expect(errors).toEqual([]);
});

test("Playground builds and edits an A B song on the canonical arrangement timeline", async ({
  page,
}) => {
  await waitForPlayground(page);

  const song = page.getByRole("region", {
    name: "Song arrangement",
  });
  await expect(song).toBeVisible();

  await song.getByRole("button", {
    name: "Build song from Pattern A and B",
  }).click();

  const sectionOne = song.getByRole("button", {
    name: /SECTION 1, section 1 of 2, Pattern A, Verse, 4 repeats/i,
  });
  const sectionTwo = song.getByRole("button", {
    name: /SECTION 2, section 2 of 2, Pattern B, Chorus, 4 repeats/i,
  });
  await expect(sectionOne).toBeVisible();
  await expect(sectionTwo).toBeVisible();

  await sectionTwo.click();
  await song.getByLabel(
    "Song section role",
  ).selectOption("intro");
  await expect(
    song.getByRole("button", {
      name: /SECTION 2, section 2 of 2, Pattern B, Intro, 4 repeats/i,
    }),
  ).toBeVisible();

  await song.getByRole("button", {
    name: "Use Pattern A in selected section",
  }).click();
  await expect(
    song.getByRole("button", {
      name: /SECTION 2, section 2 of 2, Pattern A, Intro, 4 repeats/i,
    }),
  ).toBeVisible();

  await song.getByRole("button", {
    name: "Increase section repeats",
  }).click();
  await expect(
    song.getByRole("button", {
      name: /SECTION 2, section 2 of 2, Pattern A, Intro, 5 repeats/i,
    }),
  ).toBeVisible();

  await song.getByRole("button", {
    name: "Duplicate selected song section",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(3);

  await song.getByRole("button", {
    name: "Move song section left",
  }).click();

  await song.getByRole("button", {
    name: "Undo song arrangement edit",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(3);

  await song.getByRole("button", {
    name: "Add Pattern B song section",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(4);

  await song.getByRole("button", {
    name: "Undo song arrangement edit",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(3);

  await song.getByRole("button", {
    name: "Redo song arrangement edit",
  }).click();
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(4);

  await song.getByRole("button", {
    name: "Play selected song section",
  }).click();
  await expect(
    song.getByRole("button", {
      name: "Stop song playback",
    }),
  ).toBeEnabled();

  await expect(
    song.locator(
      ".playground-song-section.is-playing",
    ),
  ).toHaveCount(1);

  await song.getByRole("button", {
    name: "Stop song playback",
  }).click();
  await expect(
    song.locator(
      ".playground-song-section.is-playing",
    ),
  ).toHaveCount(0);

  await song.getByRole("button", {
    name: "Play full song",
  }).click();
  await expect(
    song.locator(
      ".playground-song-section.is-playing",
    ),
  ).toHaveCount(1);

  const queuedTarget = song
    .locator(".playground-song-section")
    .nth(1);
  await queuedTarget.click();
  await expect(queuedTarget).toHaveClass(
    /is-queued/,
  );
  await expect(queuedTarget).toHaveAttribute(
    "aria-label",
    /queued for next bar/i,
  );

  await song.getByRole("button", {
    name: "Stop song playback",
  }).click();
  await expect(
    song.locator(
      ".playground-song-section.is-playing",
    ),
  ).toHaveCount(0);
  await expect(
    song.locator(
      ".playground-song-section.is-queued",
    ),
  ).toHaveCount(0);

  const buildBox = await song.getByRole("button", {
    name: "Play full song",
  }).boundingBox();
  expect(buildBox).not.toBeNull();
  expect(buildBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", {
    name: "Finish",
  }).click();
  const finish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  await expect(
    finish.getByRole("button", {
      name: "Export full Song",
    }),
  ).toBeVisible();
  await expect(
    finish.getByRole("button", {
      name: "Export full Song",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await finish.getByRole("button", {
    name: "Close finish panel",
  }).click();
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

test("Playground P6 presets expose hybrid drums and direct melodic sound choice", async ({
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
  const hybridKick = drawer.getByRole("button", {
    name: "808 Punch+ KICK sound",
  });
  await expect(hybridKick).toContainText("HYBRID");
  await hybridKick.click();
  await expect(hybridKick).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", {
      name: /Change KICK sound\. Current sound 808 Punch\+/i,
    }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();

  const bassRoll = page.getByRole("region", {
    name: "BASS piano roll",
  });
  const soundSelect = bassRoll.getByLabel(
    "Choose melodic instrument",
  );
  await expect(soundSelect).toHaveValue("sub");
  await soundSelect.selectOption("acid");
  await expect(
    bassRoll.locator(".playground-piano__preset b"),
  ).toHaveText("Acid");

  await bassRoll.getByRole("button", {
    name: "Next melodic instrument",
  }).click();
  await expect(
    bassRoll.locator(".playground-piano__preset b"),
  ).toHaveText("Reese");

  expect(errors).toEqual([]);
});

test("Playground P7 mix strip controls drum melodic and master balance", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const kickMix = page.getByRole("region", {
    name: "Mix controls for KICK",
  });
  await expect(kickMix).toBeVisible();

  const kickLevel = kickMix.getByLabel("KICK level");
  await expect(kickLevel).toHaveValue("0");
  await kickLevel.press("ArrowLeft");
  await expect(kickLevel).toHaveValue("-0.5");

  const kickSpace = kickMix.getByLabel("KICK space");
  await expect(kickSpace).toHaveValue("0.1");
  await kickSpace.press("ArrowRight");
  await expect(kickSpace).toHaveValue("0.15");

  const muteKick = kickMix.getByRole("button", {
    name: "Mute KICK",
  });
  await muteKick.click();
  await expect(muteKick).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await muteKick.click();
  await expect(muteKick).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  const master = kickMix.getByLabel(
    "Playground master level",
  );
  await expect(master).toHaveValue("0");
  await master.press("ArrowLeft");
  await expect(master).toHaveValue("-0.5");

  await page.getByRole("button", {
    name: "Open BASS piano roll",
  }).click();

  const bassMix = page.getByRole("region", {
    name: "Mix controls for BASS",
  });
  await expect(bassMix).toBeVisible();

  const bassLevel = bassMix.getByLabel("BASS level");
  const bassPan = bassMix.getByLabel("BASS pan");
  const bassSpace = bassMix.getByLabel("BASS space");

  await bassLevel.press("ArrowLeft");
  await bassPan.press("ArrowRight");
  await bassSpace.press("ArrowRight");

  await expect(bassLevel).toHaveValue("-0.5");
  await expect(bassPan).toHaveValue("0.05");
  await expect(bassSpace).toHaveValue("0.05");

  await page.getByLabel("Beat style").selectOption(
    "house",
  );

  await expect(
    page.getByRole("region", {
      name: "Mix controls for BASS",
    }).getByLabel("BASS level"),
  ).toHaveValue("-0.5");
  await expect(
    page.getByRole("region", {
      name: "Mix controls for BASS",
    }).getByLabel("BASS pan"),
  ).toHaveValue("0.05");
  await expect(
    page.getByRole("region", {
      name: "Mix controls for BASS",
    }).getByLabel("BASS space"),
  ).toHaveValue("0.05");

  await bassMix.getByRole("button", {
    name: "Reset BASS mix",
  }).click();
  await expect(bassLevel).toHaveValue("0");
  await expect(bassPan).toHaveValue("0");
  await expect(bassSpace).toHaveValue("0");

  expect(errors).toEqual([]);
});

test("Playground P8 Finish exports a high quality exact WAV loop", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Finish",
  }).click();

  const finish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  await expect(finish).toBeVisible();
  await expect(finish).toContainText(
    "48 kHz · 24-bit WAV · current mix",
  );

  const pattern = finish.getByRole("button", {
    name: "Export current Pattern",
  });
  await expect(pattern).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const exactLoop = finish.getByRole(
    "checkbox",
  );
  await exactLoop.check();

  const downloadPromise =
    page.waitForEvent("download");
  await finish.getByRole("button", {
    name: /Download WAV Exact pattern loop/i,
  }).click();
  const download = await downloadPromise;

  expect(
    download.suggestedFilename(),
  ).toMatch(/ - Loop\.wav$/);

  await expect(
    finish.locator(".playground-finish-result"),
  ).toContainText("Peak");
  await expect(
    finish.getByRole("button", {
      name: /Share ready WAV/i,
    }),
  ).toBeVisible();

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(
    overflow.width + 1,
  );

  expect(errors).toEqual([]);
});

test("Playground P9 Feel applies deterministic humanization swing and reset", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const feel = page.getByRole("region", {
    name: "Feel and groove",
  });
  await expect(feel).toBeVisible();
  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Straight");

  await feel.getByRole("button", {
    name: "Human feel",
  }).click();

  const swing = feel.getByLabel("Feel swing");
  await swing.fill("18");
  await expect(swing).toHaveValue("18");

  await feel.getByRole("button", {
    name: "Apply selected feel",
  }).click();

  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Human");
  await expect(
    feel.locator(
      ".playground-feel-strip__identity small",
    ),
  ).toContainText("58% human");
  await expect(
    feel.locator(
      ".playground-feel-strip__identity small",
    ),
  ).toContainText("18% swing");

  await page.getByRole("button", {
    name: "Undo",
    exact: true,
  }).first().click();

  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Straight");

  await feel.getByRole("button", {
    name: "Laid-back feel",
  }).click();
  await swing.fill("12");
  await feel.getByRole("button", {
    name: "Apply selected feel",
  }).click();

  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Laid-back");

  await feel.getByRole("button", {
    name: "Reset feel to straight",
  }).click();

  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Straight");
  await expect(swing).toHaveValue("0");
  await expect(
    feel.getByRole("button", {
      name: "Reset feel to straight",
    }),
  ).toBeDisabled();

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
    name: "Open BASS piano roll",
  }).click();
  const mobilePiano = page.getByRole("region", {
    name: "BASS piano roll",
  });
  await expect(mobilePiano).toBeVisible();
  const pianoCell = mobilePiano
    .locator(".playground-piano-cell")
    .first();
  const pianoCellBox = await pianoCell.boundingBox();
  expect(pianoCellBox).not.toBeNull();
  expect(pianoCellBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", {
    name: "Toggle musical starter kits",
  }).click();
  const mobileStarters = page.getByRole("region", {
    name: "Musical starter kits",
  });
  await expect(mobileStarters).toBeVisible();
  const mobileStarterCard =
    mobileStarters.getByRole("button", {
      name: "Apply starter Warm Lo-Fi",
    });
  await mobileStarterCard.scrollIntoViewIfNeeded();
  const mobileStarterBox =
    await mobileStarterCard.boundingBox();
  expect(mobileStarterBox).not.toBeNull();
  expect(
    mobileStarterBox!.height,
  ).toBeGreaterThanOrEqual(44);
  await mobileStarters.getByRole("button", {
    name: "Close starter kits",
  }).click();

  const mobileFeel = page.getByRole("region", {
    name: "Feel and groove",
  });
  await expect(mobileFeel).toBeVisible();
  const humanFeel = mobileFeel.getByRole("button", {
    name: "Human feel",
  });
  await humanFeel.scrollIntoViewIfNeeded();
  const humanFeelBox = await humanFeel.boundingBox();
  expect(humanFeelBox).not.toBeNull();
  expect(humanFeelBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", {
    name: "Toggle live jam controls",
  }).click();
  const mobileJam = page.getByRole("region", {
    name: "Live jam controls",
  });
  await expect(mobileJam).toBeVisible();
  const mobileStutter = mobileJam.getByRole(
    "button",
    {
      name: /Stutter\. Hold for beat-quantized live effect\./i,
    },
  );
  await mobileStutter.scrollIntoViewIfNeeded();
  const mobileStutterBox =
    await mobileStutter.boundingBox();
  expect(mobileStutterBox).not.toBeNull();
  expect(
    mobileStutterBox!.height,
  ).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", {
    name: "Toggle live jam controls",
  }).click();

  await page.getByRole("button", {
    name: "Toggle motion automation controls",
  }).click();
  const mobileMotion = page.getByRole("region", {
    name: "Motion automation",
  });
  await expect(mobileMotion).toBeVisible();
  const mobileWobble = mobileMotion.getByRole(
    "button",
    {
      name: "Motion shape Wobble",
    },
  );
  await mobileWobble.scrollIntoViewIfNeeded();
  const mobileWobbleBox =
    await mobileWobble.boundingBox();
  expect(mobileWobbleBox).not.toBeNull();
  expect(
    mobileWobbleBox!.height,
  ).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", {
    name: "Toggle motion automation controls",
  }).click();

  const touchMode = page.getByRole("button", {
    name: "Touch edit mode: draw",
  });
  await touchMode.click();
  await expect(
    page.getByRole("button", {
      name: "Touch edit mode: select",
    }),
  ).toBeVisible();

  const activeStep = page
    .locator(".playground-step.is-on")
    .first();
  await activeStep.click();
  await expect(activeStep).toHaveClass(/is-selected/);

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

  await page.getByRole("button", {
    name: "Finish",
  }).click();
  const mobileFinish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  await expect(mobileFinish).toBeVisible();
  const mobileDownload =
    mobileFinish.getByRole("button", {
      name: /Download WAV/i,
    });
  const mobileDownloadBox =
    await mobileDownload.boundingBox();
  expect(mobileDownloadBox).not.toBeNull();
  expect(
    mobileDownloadBox!.height,
  ).toBeGreaterThanOrEqual(58);
  await mobileFinish.getByRole("button", {
    name: "Close finish panel",
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

test("Playground P12 recovery checkpoints restore safely without losing the current state", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Clear selected lane",
  }).click();

  const kick = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="0"]',
  );
  await kick.click();
  await expect(kick).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: "Create recovery checkpoint",
  }).click();
  await expect(
    page.locator(".playground-notice"),
  ).toContainText("Recovery snapshot saved");

  await kick.click();
  await expect(kick).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();

  const projects = page.getByRole("dialog", {
    name: "Recent projects",
  });
  const recovery = projects.getByRole("region", {
    name: "Recovery checkpoints",
  });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText(
    /Autosave on|Autosaving|Saving/i,
  );
  await expect(recovery).toContainText(
    /Storage protected|Best-effort storage/i,
  );

  const checkpoint = recovery
    .locator(".playground-project-checkpoint")
    .filter({ hasText: "Recovery" })
    .first();
  await expect(checkpoint).toBeVisible();

  await checkpoint.getByRole("button", {
    name: /Restore checkpoint Recovery/i,
  }).click();

  await expect(projects).toHaveCount(0);
  await expect(kick).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();
  const reopened = page.getByRole("dialog", {
    name: "Recent projects",
  });
  await expect(
    reopened.getByRole("region", {
      name: "Recovery checkpoints",
    }),
  ).toContainText("Before restore");

  expect(errors).toEqual([]);
});

test("Playground P13 starter kits create an editable polished A B baseline", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Toggle musical starter kits",
  }).click();

  const starters = page.getByRole("region", {
    name: "Musical starter kits",
  });
  await expect(starters).toBeVisible();

  await starters.getByRole("button", {
    name: "Apply starter Warm Lo-Fi",
  }).click();

  await expect(
    page.getByLabel("Beat style"),
  ).toHaveValue("lofi");
  await expect(
    page.getByRole("button", {
      name: "Tap tempo. Current tempo 76 BPM",
    }),
  ).toBeVisible();

  const feel = page.getByRole("region", {
    name: "Feel and groove",
  });
  await expect(
    feel.locator(
      ".playground-feel-strip__identity strong",
    ),
  ).toHaveText("Human");
  await expect(
    feel.locator(
      ".playground-feel-strip__identity small",
    ),
  ).toContainText("58% human");
  await expect(
    feel.locator(
      ".playground-feel-strip__identity small",
    ),
  ).toContainText("16% swing");

  await expect(
    page.getByRole("button", {
      name: "Change KICK sound. Current sound Soft",
    }),
  ).toBeVisible();

  const patternA = page.getByRole("button", {
    name: "A",
    exact: true,
  });
  const patternB = page.getByRole("button", {
    name: "B",
    exact: true,
  });
  await expect(patternA).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(patternB).toHaveAttribute(
    "title",
    /Switch to Pattern B/i,
  );

  await page.getByRole("button", {
    name: /^Projects$/i,
  }).click();
  const projects = page.getByRole("dialog", {
    name: "Recent projects",
  });
  await expect(
    projects.getByRole("region", {
      name: "Recovery checkpoints",
    }),
  ).toContainText(
    "Before starter · Warm Lo-Fi",
  );
  await projects.getByRole("button", {
    name: "Close project menu",
  }).click();

  const editableStep = page.locator(
    '.playground-step[data-lane-id="lane-kick"][data-step-index="1"]',
  );
  const before =
    await editableStep.getAttribute(
      "aria-pressed",
    );
  await editableStep.click();
  await expect(editableStep).toHaveAttribute(
    "aria-pressed",
    before === "true" ? "false" : "true",
  );

  await patternB.click();
  await expect(patternB).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await patternA.click();
  await expect(patternA).toHaveAttribute(
    "aria-pressed",
    "true",
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


test("Playground P16 consolidates creative controls and targets advanced Studio workspaces", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  const controls = page.getByRole("region", {
    name: "Creative controls",
  });
  await expect(controls).toBeVisible();
  await expect(
    controls.getByRole("region", {
      name: "Pattern experimentation controls",
    }),
  ).toBeVisible();
  await expect(
    controls.getByRole("region", {
      name: "Feel and groove",
    }),
  ).toBeVisible();
  await expect(
    controls.getByRole("region", {
      name: "Playback and creative flow",
    }),
  ).toBeVisible();
  await expect(
    controls.getByRole("region", {
      name: "Grid recording",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Open advanced Arrange Studio",
  }).click();
  await expect(
    page.getByRole("heading", {
      name: "Shape the full arc.",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Return to Playground",
  }).click();
  await expect(controls).toBeVisible();

  await page.getByRole("button", {
    name: /^Finish$/i,
  }).click();
  const finish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  await finish.getByRole("button", {
    name: "Use Studio",
  }).click();

  await expect(
    page.getByRole("heading", {
      name: "Finish the signal.",
    }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});


test("P17 preserves Playground songs and polishes canonical Arrange editing", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

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

  await song.getByRole("button", {
    name: "Open advanced Arrange Studio",
  }).click();

  const arrange = page.locator(".arrange-surface");
  await expect(arrange).toBeVisible();
  await expect(
    arrange.locator(".arrange-section-block"),
  ).toHaveCount(6);

  const arrangementName = arrange.getByLabel(
    "Arrangement name",
  );
  await expect(arrangementName).toHaveValue(
    "Standard Song",
  );
  await arrangementName.fill("Road Test Song");
  await arrangementName.press("Enter");

  const sectionName = arrange.getByLabel(
    "Section name",
  );
  await sectionName.fill("Opening");
  await sectionName.press("Enter");

  await arrange.getByLabel("Section role").selectOption(
    "build",
  );
  await arrange
    .getByLabel("Section pattern", { exact: true })
    .selectOption({
      label: "Pattern B / Song",
    });
  await arrange.getByRole("button", {
    name: "Set section to 8 cycles",
  }).click();

  const firstSection =
    arrange.locator(".arrange-section-block").first();
  await expect(firstSection).toContainText("Opening");
  await expect(firstSection).toContainText("BLD · 8 CYC");

  await arrange
    .getByLabel("New section pattern")
    .selectOption({
      label: "Pattern A / Song",
    });
  await arrange.getByRole("button", {
    name: "+ ADD",
    exact: true,
  }).click();

  await expect(
    arrange.locator(".arrange-section-block"),
  ).toHaveCount(7);
  await expect(
    arrange.getByRole("button", {
      name: "PLAY FROM HERE",
      exact: true,
    }),
  ).toBeEnabled();

  await page.getByRole("button", {
    name: "Return to Playground",
  }).click();

  await expect(song).toBeVisible();
  await expect(song).toContainText("Road Test Song");
  await expect(
    song.locator(".playground-song-section"),
  ).toHaveCount(7);
  await expect(
    song.getByRole("button", {
      name: /Opening, section 1 of 7, Pattern B, Build, 8 repeats/i,
    }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});


test("P18 generation develops phrases and starters keep a deterministic mix baseline", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await waitForPlayground(page);

  await page.getByRole("button", {
    name: "Add bar",
  }).click();
  await page.getByLabel("Beat style").selectOption(
    "funk",
  );

  const rhythmForVisibleBar = async () =>
    page
      .locator(
        '.playground-step[aria-pressed="true"]',
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const lane =
              (element as HTMLElement).dataset.laneId;
            const raw =
              (element as HTMLElement).dataset.stepIndex;
            const step = Number(raw);
            return lane && Number.isFinite(step)
              ? lane + ":" + (step % 16)
              : "";
          })
          .filter(Boolean)
          .sort(),
      );

  const assertHatExclusivity = async () => {
    const closed = new Set(
      await page
        .locator(
          '.playground-step[data-lane-id="lane-closed-hat"][aria-pressed="true"]',
        )
        .evaluateAll((elements) =>
          elements.map(
            (element) =>
              Number(
                (element as HTMLElement).dataset
                  .stepIndex,
              ) % 16,
          ),
        ),
    );
    const open = await page
      .locator(
        '.playground-step[data-lane-id="lane-open-hat"][aria-pressed="true"]',
      )
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            Number(
              (element as HTMLElement).dataset
                .stepIndex,
            ) % 16,
        ),
      );
    expect(
      open.filter((step) => closed.has(step)),
    ).toEqual([]);
  };

  await page.getByRole("button", {
    name: "Bar 1",
  }).click();
  const barOne = await rhythmForVisibleBar();
  await assertHatExclusivity();

  await page.getByRole("button", {
    name: "Bar 2",
  }).click();
  const barTwo = await rhythmForVisibleBar();
  await assertHatExclusivity();
  expect(barTwo).not.toEqual(barOne);

  await page.getByRole("button", {
    name: "Select TOM tools",
  }).click();
  await page.getByRole("button", {
    name: /Change TOM sound\. Current sound/i,
  }).click();
  const tomSounds = page.getByRole("region", {
    name: "TOM sounds",
  });
  await expect(tomSounds).toBeVisible();
  await tomSounds.getByRole("button", {
    name: "Big TOM sound",
  }).click();
  const tomMix = page.getByRole("region", {
    name: "Mix controls for TOM",
  });
  const tomLevel = tomMix.getByLabel("TOM level");
  const tomPan = tomMix.getByLabel("TOM pan");
  const tomSpace = tomMix.getByLabel("TOM space");

  await tomLevel.press("ArrowRight");
  await tomPan.press("ArrowRight");
  await tomSpace.press("ArrowRight");
  await expect(tomLevel).toHaveValue("0.5");
  await expect(tomPan).toHaveValue("0.05");
  await expect(tomSpace).toHaveValue("0.35");

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
    name: "Change TOM sound",
    exact: true,
  }).click();
  const resetTomSounds = page.getByRole("region", {
    name: "TOM sounds",
  });
  await expect(
    resetTomSounds.getByRole("button", {
      name: "Core TOM sound",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  await page.getByRole("button", {
    name: "Select TOM tools",
  }).click();
  const resetTomMix = page.getByRole("region", {
    name: "Mix controls for TOM",
  });
  await expect(
    resetTomMix.getByLabel("TOM level"),
  ).toHaveValue("0");
  await expect(
    resetTomMix.getByLabel("TOM pan"),
  ).toHaveValue("0");
  await expect(
    resetTomMix.getByLabel("TOM space"),
  ).toHaveValue("0.3");

  expect(errors).toEqual([]);
});


test("P19 mobile and tablet layouts keep touch controls compact and reachable", async ({ page }) => {
  const errors = watchRuntimeErrors(page);

  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await waitForPlayground(page);

  const style = page.getByLabel("Beat style");
  const tempo = page.getByRole("button", {
    name: /Tap tempo\. Current tempo/i,
  });
  const styleBox = await style.boundingBox();
  const tempoBox = await tempo.boundingBox();
  expect(styleBox).not.toBeNull();
  expect(tempoBox).not.toBeNull();
  expect(
    Math.abs(styleBox!.y - tempoBox!.y),
  ).toBeLessThan(12);

  const kickSound = page.getByRole("button", {
    name: "Change KICK sound",
    exact: true,
  });
  const kickSoundBox = await kickSound.boundingBox();
  expect(kickSoundBox).not.toBeNull();
  expect(kickSoundBox!.width).toBeGreaterThanOrEqual(44);
  expect(kickSoundBox!.height).toBeGreaterThanOrEqual(44);

  const addBar = page.getByRole("button", {
    name: "Add bar",
  });
  const addBarBox = await addBar.boundingBox();
  expect(addBarBox).not.toBeNull();
  expect(addBarBox!.width).toBeGreaterThanOrEqual(44);
  expect(addBarBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", {
    name: "Finish",
  }).click();
  const mobileFinish = page.getByRole("dialog", {
    name: "Finish and export",
  });
  const mobileDownload = mobileFinish.getByRole(
    "button",
    { name: /Download WAV/i },
  );
  const downloadBox = await mobileDownload.boundingBox();
  expect(downloadBox).not.toBeNull();
  expect(downloadBox!.height).toBeGreaterThanOrEqual(60);
  await mobileFinish.getByRole("button", {
    name: "Close finish panel",
  }).click();

  let overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(
    overflow.width + 1,
  );

  await page.setViewportSize({
    width: 768,
    height: 1024,
  });

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

  const tabletPlay = dock.getByRole("button", {
    name: "Play beat",
  });
  const tabletPlayBox = await tabletPlay.boundingBox();
  expect(tabletPlayBox).not.toBeNull();
  expect(tabletPlayBox!.height).toBeGreaterThanOrEqual(60);

  overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(
    overflow.width + 1,
  );

  await page.setViewportSize({
    width: 1024,
    height: 768,
  });
  await expect(dock).toBeHidden();

  expect(errors).toEqual([]);
});
