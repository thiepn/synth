import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const MODES = [
  ["01", "CREATE", ".create-surface"],
  ["02", "SEQUENCE", ".sequence-surface"],
  ["03", "SOUND", ".sound-surface"],
  ["04", "ARRANGE", ".arrange-surface"],
  ["05", "LIVE", ".performance-surface"],
  ["06", "MIX", ".mix-surface"],
  ["07", "EXPORT", ".master-export-surface"],
] as const;

async function enterStudio(page: Page) {
  const create = page.getByRole("button", {
    name: "Mode 01: CREATE",
  });
  if (await create.isVisible()) return;

  const openStudio = page.getByRole("button", {
    name: "Open Studio",
  });
  await expect(openStudio).toBeVisible();
  await openStudio.click();
  await expect(create).toBeVisible();
}

async function waitForProjectReady(page: Page) {
  await enterStudio(page);
  const project = page.locator(
    ".project-readout--interactive",
  );
  await expect(project).toBeVisible();
  await expect(project).not.toContainText("STARTING");
  await expect(project).not.toContainText("LOADING");
  return project;
}

async function openProjectDialog(page: Page) {
  const project = await waitForProjectReady(page);
  await project.click();
  const dialog = page.getByRole("dialog", {
    name: "Project library and persistence controls",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker API unavailable.");
    }

    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;

    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        { once: true },
      );
    });
  });
}

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

function tinyWavBuffer(): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 400;
  const bytesPerSample = 2;
  const dataBytes = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const phase = (index / sampleRate) * Math.PI * 2 * 220;
    const sample = Math.round(Math.sin(phase) * 4_000);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  return buffer;
}

async function corruptActiveProjectSchema(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("synth-local-v1", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const activeId = await new Promise<string>((resolve, reject) => {
      const transaction = database.transaction("meta", "readonly");
      const get = transaction.objectStore("meta").get("activeProjectId");
      get.onsuccess = () => resolve(get.result?.value);
      get.onerror = () => reject(get.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("projects", "readwrite");
      const store = transaction.objectStore("projects");
      const get = store.get(activeId);

      get.onsuccess = () => {
        const project = get.result;
        project.schemaVersion = 999;
        store.put(project);
      };
      get.onerror = () => reject(get.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    database.close();
  });
}

async function indexedDbCount(
  page: Page,
  storeName: string,
): Promise<number> {
  return page.evaluate(async (storeName) => {
    const request = indexedDB.open("synth-local-v1", 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    database.close();
    return count;
  }, storeName);
}

test("production shell lazy-loads every mode without runtime errors", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);

  await page.goto("/");
  await expect(page).toHaveTitle("Synth");
  await expect(page.locator(".playground-surface")).toBeVisible();
  await enterStudio(page);

  for (const [number, label, surface] of MODES) {
    const button = page.getByRole("button", {
      name: "Mode " + number + ": " + label,
    });
    await button.click();
    await expect(button).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(surface)).toBeVisible();
    await expect(
      page.getByText("LOADING WORKSPACE…"),
    ).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test("keyboard navigation and core transport remain operable", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", {
    name: "Skip to workspace",
  });
  await expect(skip).toBeFocused();

  await skip.press("Enter");
  await expect(page.locator("#synth-main")).toBeFocused();
  await enterStudio(page);

  const create = page.getByRole("button", {
    name: "Mode 01: CREATE",
  });
  await create.focus();
  await create.press("ArrowRight");

  const sequence = page.getByRole("button", {
    name: "Mode 02: SEQUENCE",
  });
  await expect(sequence).toBeFocused();
  await expect(page.locator(".sequence-surface")).toBeVisible();

  await sequence.press("End");
  const exportMode = page.getByRole("button", {
    name: "Mode 07: EXPORT",
  });
  await expect(exportMode).toBeFocused();
  await expect(page.locator(".master-export-surface")).toBeVisible();

  await exportMode.press("Home");
  await expect(create).toBeFocused();
  await expect(page.locator(".create-surface")).toBeVisible();

  const play = page.getByRole("button", {
    name: "Start transport",
  });
  await play.click();
  await expect(
    page.getByRole("button", {
      name: "Pause transport",
    }),
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Stop and return to loop start",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Start transport",
    }),
  ).toBeVisible();
});

test("playground edits the real Pattern and exposes Studio without dashboard clutter", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await page.goto("/");

  const playground = page.locator(".playground-surface");
  await expect(playground).toBeVisible();
  await expect(page.locator(".utility-rail")).toHaveCount(0);
  await expect(page.locator(".mode-rail")).toHaveCount(0);

  const kickStep = page.getByRole("button", {
    name: "KICK step 2, off",
  });
  await expect(kickStep).toHaveAttribute("aria-pressed", "false");

  await kickStep.click();
  await expect(
    page.getByRole("button", {
      name: "KICK step 2, on",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", {
      name: "KICK step 2, off",
    }),
  ).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("button", {
      name: "KICK step 2, on",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", {
    name: "KICK step 2, on",
  }).press("Enter");
  await expect(
    page.getByRole("button", {
      name: "KICK step 2, off",
    }),
  ).toHaveAttribute("aria-pressed", "false");

  const kickSound = page.getByRole("button", {
    name: "Change KICK sound. Current sound Core",
  });
  await kickSound.click();
  await expect(
    page.getByRole("region", {
      name: "KICK sounds",
    }),
  ).toBeVisible();
  await page.getByRole("button", {
    name: "Deep KICK sound",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Change KICK sound. Current sound Deep",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "KICK sounds",
    }),
  ).toHaveCount(0);

  await page.getByRole("button", {
    name: "Change KICK sound. Current sound Deep",
  }).click();
  await page.getByRole("button", {
    name: "808 Classic KICK sound",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Change KICK sound. Current sound 808 Classic",
    }),
  ).toBeVisible();

  const play = page.getByRole("button", {
    name: "Start transport",
  });
  await play.click();
  await expect(
    page.getByRole("button", {
      name: "Pause transport",
    }),
  ).toBeVisible();
  await page.getByRole("button", {
    name: "Pause transport",
  }).click();

  await page.getByRole("button", {
    name: "Open Studio",
  }).click();
  await expect(page.locator(".utility-rail")).toBeVisible();
  await expect(page.locator(".mode-rail")).toBeVisible();

  await page.getByRole("button", {
    name: "Return to Playground",
  }).click();
  await expect(playground).toBeVisible();
  await expect(page.locator(".utility-rail")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("project persists, snapshots, exports and imports a verified backup", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openProjectDialog(page);

  const projectName = "QA Project";
  const nameInput = dialog.getByLabel("PROJECT NAME");
  await nameInput.fill(projectName);
  await nameInput.press("Enter");

  await dialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();
  await expect(
    page.locator(".project-readout--interactive"),
  ).toContainText("SAVED");

  await dialog.getByRole("button", {
    name: "SNAPSHOT",
  }).click();
  await expect(
    dialog.locator(".project-version-list"),
  ).toContainText("Snapshot");

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", {
    name: "EXPORT BACKUP",
  }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  await page.reload();
  await waitForProjectReady(page);
  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText(projectName);

  const reopened = await openProjectDialog(page);
  await reopened
    .locator("input.project-file-input")
    .setInputFiles(downloadPath!);

  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText(projectName + " Imported");
});

test("corrupt backup is rejected without replacing the active project", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openProjectDialog(page);
  const before = await page
    .locator(".project-readout--interactive strong")
    .innerText();

  await dialog
    .locator("input.project-file-input")
    .setInputFiles({
      name: "corrupt.synth.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not-a-valid-zip"),
    });

  await expect(dialog.locator(".project-error")).toBeVisible();
  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText(before);
});

test("cross-tab revision conflict is detected and can reload the newer revision", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  const second = await context.newPage();
  await second.goto("/");
  await waitForProjectReady(second);

  const firstDialog = await openProjectDialog(page);
  await firstDialog
    .getByLabel("PROJECT NAME")
    .fill("Writer One");
  await firstDialog
    .getByLabel("PROJECT NAME")
    .press("Enter");
  await firstDialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();

  await expect(
    second.locator(".project-readout--interactive"),
  ).toContainText("CONFLICT");

  const secondDialog = await openProjectDialog(second);
  await expect(secondDialog).toContainText(
    "NEWER REVISION DETECTED",
  );
  await secondDialog.getByRole("button", {
    name: "RELOAD NEWER",
  }).click();

  await expect(
    second.locator(".project-readout--interactive strong"),
  ).toHaveText("Writer One");
  await expect(
    second.locator(".project-readout--interactive"),
  ).not.toContainText("CONFLICT");
});

test("named version restore rolls canonical sequencer state back safely", async ({
  page,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  await page.getByRole("button", {
    name: "Mode 02: SEQUENCE",
  }).click();
  await expect(page.locator(".sequence-surface")).toBeVisible();

  const step = page.locator(
    '.sequence-step[data-lane-id="lane-kick"][data-step-index="0"]',
  );
  const initial = await step.getAttribute("aria-pressed");
  expect(initial).not.toBeNull();

  let dialog = await openProjectDialog(page);
  await dialog
    .locator(".project-version-create input")
    .fill("Before Edit");
  await dialog.getByRole("button", {
    name: "SNAPSHOT",
  }).click();
  await expect(
    dialog.locator(".project-version-list"),
  ).toContainText("Before Edit");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await step.click();
  await expect(step).not.toHaveAttribute(
    "aria-pressed",
    initial!,
  );

  dialog = await openProjectDialog(page);
  const versionRow = dialog
    .locator(".project-version-list > div")
    .filter({ hasText: "Before Edit" });
  await versionRow.getByRole("button", {
    name: "RESTORE",
  }).click();

  await expect(step).toHaveAttribute(
    "aria-pressed",
    initial!,
  );
  await expect(
    page.locator(".project-readout--interactive"),
  ).not.toContainText("SAVE ERROR");
});

test("sample cache is evicted when content-addressed audio is removed and reimported", async ({
  page,
}) => {
  await page.goto("/");
  await enterStudio(page);
  await page.getByRole("button", {
    name: "Mode 03: SOUND",
  }).click();
  await expect(page.locator(".sound-surface")).toBeVisible();

  const samplePanel = page.locator(".sample-source-panel");
  const input = samplePanel.locator("input.sample-file-input");
  const file = {
    name: "qa-tone.wav",
    mimeType: "audio/wav",
    buffer: tinyWavBuffer(),
  };

  await input.setInputFiles(file);
  let row = samplePanel.locator(".sample-library__row").filter({
    hasText: "qa-tone.wav",
  });
  await expect(row).toBeVisible();

  await row.locator(".sample-library__select").click();
  await expect(row).toContainText("USE");

  await row.getByRole("button", {
    name: "Remove sample qa-tone.wav",
  }).click();
  await expect(row).toHaveCount(0);

  await input.setInputFiles(file);
  row = samplePanel.locator(".sample-library__row").filter({
    hasText: "qa-tone.wav",
  });
  await expect(row).toContainText("PREP");

  await row.locator(".sample-library__select").click();
  await expect(row).toContainText("USE");
});

test("corrupt active IndexedDB project fails closed and can recover via Save As", async ({
  page,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  await corruptActiveProjectSchema(page);
  await page.reload();
  await enterStudio(page);

  await expect(page.locator(".create-surface")).toBeVisible();
  await expect(
    page.locator(".project-readout--interactive"),
  ).toContainText("SAVE ERROR");

  const dialog = await openProjectDialog(page);
  await expect(dialog.locator(".project-error")).toContainText(
    "Unsupported project schema version",
  );

  await dialog
    .locator(".project-copy input")
    .fill("Recovered QA Project");
  await dialog.getByRole("button", {
    name: "SAVE AS",
  }).click();

  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText("Recovered QA Project");

  await page.reload();
  await waitForProjectReady(page);
  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText("Recovered QA Project");
});

test("rapid mode churn and transport cleanup do not produce runtime errors", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await page.goto("/");
  await enterStudio(page);

  await page.getByRole("button", {
    name: "Start transport",
  }).click();

  const sequence = [
    "ARRANGE",
    "CREATE",
    "LIVE",
    "MIX",
    "SEQUENCE",
    "EXPORT",
    "SOUND",
    "CREATE",
  ] as const;

  for (let round = 0; round < 3; round += 1) {
    for (const label of sequence) {
      const mode = MODES.find((entry) => entry[1] === label)!;
      await page.getByRole("button", {
        name: "Mode " + mode[0] + ": " + mode[1],
      }).click();
    }
  }

  await expect(page.locator(".create-surface")).toBeVisible();
  await page.getByRole("button", {
    name: "Stop and return to loop start",
  }).click();

  expect(errors).toEqual([]);
});

test("conflicted tab can preserve local Pattern work with Save As", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  const second = await context.newPage();
  await second.goto("/");
  await waitForProjectReady(second);

  let secondDialog = await openProjectDialog(second);
  await secondDialog
    .locator(".project-version-create input")
    .fill("Conflict Guard");
  await secondDialog.getByRole("button", {
    name: "SNAPSHOT",
  }).click();
  await expect(
    secondDialog.locator(".project-version-list"),
  ).toContainText("Conflict Guard");
  await second.keyboard.press("Escape");

  const firstDialog = await openProjectDialog(page);
  await firstDialog
    .getByLabel("PROJECT NAME")
    .fill("Remote Writer");
  await firstDialog
    .getByLabel("PROJECT NAME")
    .press("Enter");
  await firstDialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();

  await expect(
    second.locator(".project-readout--interactive"),
  ).toContainText("CONFLICT");

  secondDialog = await openProjectDialog(second);
  const restoreButton = secondDialog
    .locator(".project-version-list > div")
    .filter({ hasText: "Conflict Guard" })
    .getByRole("button", { name: "RESTORE" });
  await expect(restoreButton).toBeDisabled();
  await second.keyboard.press("Escape");

  await second.getByRole("button", {
    name: "Mode 02: SEQUENCE",
  }).click();
  const step = second.locator(
    '.sequence-step[data-lane-id="lane-kick"][data-step-index="0"]',
  );
  const before = await step.getAttribute("aria-pressed");
  await step.click();
  await expect(step).not.toHaveAttribute(
    "aria-pressed",
    before!,
  );
  const localValue = await step.getAttribute("aria-pressed");

  secondDialog = await openProjectDialog(second);
  await secondDialog
    .locator(".project-copy input")
    .fill("Local Preserved");
  await secondDialog.getByRole("button", {
    name: "SAVE AS",
  }).click();

  await expect(
    second.locator(".project-readout--interactive strong"),
  ).toHaveText("Local Preserved");
  await expect(
    second.locator(".project-readout--interactive"),
  ).not.toContainText("CONFLICT");

  await second.reload();
  await waitForProjectReady(second);
  await second.getByRole("button", {
    name: "Mode 02: SEQUENCE",
  }).click();
  await expect(
    second.locator(
      '.sequence-step[data-lane-id="lane-kick"][data-step-index="0"]',
    ),
  ).toHaveAttribute("aria-pressed", localValue!);

  await expect(
    page.locator(".project-readout--interactive strong"),
  ).toHaveText("Remote Writer");
});

test("shared audio survives duplicate-project deletion and garbage collection", async ({
  page,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  await page.getByRole("button", {
    name: "Mode 03: SOUND",
  }).click();

  const samplePanel = page.locator(".sample-source-panel");
  await samplePanel
    .locator("input.sample-file-input")
    .setInputFiles({
      name: "shared.wav",
      mimeType: "audio/wav",
      buffer: tinyWavBuffer(),
    });

  const sampleRow = samplePanel
    .locator(".sample-library__row")
    .filter({ hasText: "shared.wav" });
  await sampleRow.locator(".sample-library__select").click();
  await expect(sampleRow).toContainText("USE");

  let dialog = await openProjectDialog(page);
  await dialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();

  const activeRow = dialog.locator(
    ".project-library-row.is-active",
  );
  const activeName = (
    await activeRow
      .locator(".project-library-row__open span")
      .innerText()
  ).trim();

  await activeRow
    .locator(".project-library-row__actions")
    .getByRole("button", { name: "COPY" })
    .click();

  const copyRow = dialog
    .locator(".project-library-row")
    .filter({ hasText: activeName + " Copy" });
  await expect(copyRow).toBeVisible();
  expect(await indexedDbCount(page, "assets")).toBe(1);

  const deleteButton = copyRow
    .locator(".project-library-row__actions")
    .getByRole("button", { name: "DELETE" });
  await deleteButton.click();
  await copyRow.getByRole("button", {
    name: "CONFIRM DELETE",
  }).click();

  await expect(copyRow).toHaveCount(0);
  expect(await indexedDbCount(page, "assets")).toBe(1);
  await expect(dialog.locator(".project-error")).toHaveCount(0);
});

test("storage-unavailable environment remains usable in session-only mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");
  await waitForProjectReady(page);

  await expect(page.locator(".create-surface")).toBeVisible();
  await expect(
    page.locator(".project-readout--interactive"),
  ).toContainText("SESSION ONLY");

  const dialog = await openProjectDialog(page);
  await expect(dialog).toContainText(
    "LOCAL STORAGE UNAVAILABLE",
  );
});

test("offline shell reloads and an unvisited lazy mode remains available", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".playground-surface")).toBeVisible();
  await waitForServiceWorkerControl(page);

  const cacheDiagnostic = await page.evaluate(async () => {
    const manifestUrl = new URL(
      "./asset-manifest.json",
      document.baseURI,
    );
    const response = await fetch(manifestUrl);
    const manifest = await response.json() as {
      buildId?: string;
      assets?: string[];
    };
    const assets = manifest.assets ?? [];
    const cacheNames = await caches.keys();
    const missing: string[] = [];

    for (const asset of assets) {
      const url = new URL(asset, document.baseURI).href;
      const cached = await caches.match(url);
      if (!cached) missing.push(asset);
    }

    return {
      buildId: manifest.buildId,
      assetCount: assets.length,
      cacheNames,
      missing,
      controlled: Boolean(
        navigator.serviceWorker.controller,
      ),
    };
  });

  console.log(
    "OFFLINE_CACHE_DIAGNOSTIC " +
      JSON.stringify(cacheDiagnostic),
  );
  expect(cacheDiagnostic.controlled).toBe(true);
  expect(cacheDiagnostic.assetCount).toBeGreaterThan(5);
  expect(cacheDiagnostic.missing).toEqual([]);

  const runtimeErrors = watchRuntimeErrors(page);
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    failedRequests.push(
      request.url() +
        " :: " +
        (request.failure()?.errorText ?? "unknown"),
    );
  });

  await context.setOffline(true);
  await enterStudio(page);

  const exportMode = page.getByRole("button", {
    name: "Mode 07: EXPORT",
  });
  await exportMode.click();
  await expect(page.locator(".master-export-surface")).toBeVisible();

  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);

  await page.reload();
  await expect(page.locator(".playground-surface")).toBeVisible();
  await enterStudio(page);

  const sound = page.getByRole("button", {
    name: "Mode 03: SOUND",
  });
  await sound.click();
  await expect(page.locator(".sound-surface")).toBeVisible();

  await context.setOffline(false);
});

test.describe("mobile interaction shell", () => {
  test.use({
    viewport: {
      width: 390,
      height: 844,
    },
    isMobile: true,
    hasTouch: true,
  });

  test("all seven modes, project and transport remain reachable without body overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForProjectReady(page);

    for (const [number, label] of MODES) {
      await expect(
        page.getByRole("button", {
          name: "Mode " + number + ": " + label,
        }),
      ).toBeVisible();
    }

    await expect(
      page.locator(".project-readout--interactive"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Start transport",
      }),
    ).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(
      overflow.innerWidth + 1,
    );
  });
});
