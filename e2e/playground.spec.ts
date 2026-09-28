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
