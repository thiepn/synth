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

async function waitForProjectReady(page: Page) {
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

test("production shell lazy-loads every mode without runtime errors", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);

  await page.goto("/");
  await expect(page).toHaveTitle("Synth");

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

test("offline shell reloads and an unvisited lazy mode remains available", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".create-surface")).toBeVisible();
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

  const exportMode = page.getByRole("button", {
    name: "Mode 07: EXPORT",
  });
  await exportMode.click();
  await expect(page.locator(".master-export-surface")).toBeVisible();

  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);

  await page.reload();
  await expect(page.locator(".create-surface")).toBeVisible();

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
