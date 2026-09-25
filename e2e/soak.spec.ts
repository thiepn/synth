import {
  expect,
  test,
  type Page,
} from "@playwright/test";

async function enterStudio(page: Page) {
  const openStudio = page.getByRole("button", {
    name: "Open Studio",
  });
  if (await openStudio.isVisible()) {
    await openStudio.click();
  }
  await expect(
    page.getByRole("button", {
      name: "Mode 01: CREATE",
    }),
  ).toBeVisible();
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

function watchRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push("pageerror: " + error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push("console: " + message.text());
    }
  });
  return errors;
}

function tinyWavBuffer(
  frequency: number,
): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 320;
  const dataBytes = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const phase =
      (index / sampleRate) *
      Math.PI *
      2 *
      frequency;
    buffer.writeInt16LE(
      Math.round(Math.sin(phase) * 3_500),
      44 + index * 2,
    );
  }

  return buffer;
}

async function indexedDbCount(
  page: Page,
  storeName: string,
): Promise<number> {
  return page.evaluate(async (storeName) => {
    const request = indexedDB.open(
      "synth-local-v1",
      2,
    );
    const database =
      await new Promise<IDBDatabase>(
        (resolve, reject) => {
          request.onsuccess = () =>
            resolve(request.result);
          request.onerror = () =>
            reject(request.error);
        },
      );

    const count = await new Promise<number>(
      (resolve, reject) => {
        const transaction =
          database.transaction(
            storeName,
            "readonly",
          );
        const request =
          transaction
            .objectStore(storeName)
            .count();
        request.onsuccess = () =>
          resolve(request.result);
        request.onerror = () =>
          reject(request.error);
      },
    );

    database.close();
    return count;
  }, storeName);
}

test("@soak repeated project save, snapshot, mode and reload cycles remain stable", async ({
  page,
}) => {
  const errors = watchRuntimeErrors(page);
  await page.goto("/");

  for (let cycle = 1; cycle <= 6; cycle += 1) {
    const name = "RC Soak " + cycle;
    const dialog = await openProjectDialog(page);

    const input = dialog.getByLabel(
      "PROJECT NAME",
    );
    await input.fill(name);
    await input.press("Enter");

    await dialog.getByRole("button", {
      name: "SAVE NOW",
    }).click();

    if (cycle % 2 === 0) {
      await dialog
        .locator(".project-version-create input")
        .fill("Cycle " + cycle);
      await dialog.getByRole("button", {
        name: "SNAPSHOT",
      }).click();
    }

    await page.keyboard.press("Escape");

    await page.getByRole("button", {
      name: "Mode 02: SEQUENCE",
    }).click();
    await page.getByRole("button", {
      name: "Mode 03: SOUND",
    }).click();
    await page.getByRole("button", {
      name: "Mode 01: CREATE",
    }).click();

    await page.reload();
    await waitForProjectReady(page);
    await expect(
      page.locator(
        ".project-readout--interactive strong",
      ),
    ).toHaveText(name);
  }

  expect(errors).toEqual([]);
});

test("@soak transport recovers after Chromium lifecycle freeze and repeated mode changes", async ({
  page,
  context,
}) => {
  const errors = watchRuntimeErrors(page);
  await page.goto("/");
  await waitForProjectReady(page);

  await page.getByRole("button", {
    name: "Start transport",
  }).click();

  const cdp =
    await context.newCDPSession(page);
  await cdp.send(
    "Page.setWebLifecycleState",
    { state: "frozen" },
  );
  await page.waitForTimeout(300);
  await cdp.send(
    "Page.setWebLifecycleState",
    { state: "active" },
  );
  await page.waitForTimeout(250);

  for (let cycle = 0; cycle < 8; cycle += 1) {
    await page.getByRole("button", {
      name: "Mode 02: SEQUENCE",
    }).click();
    await page.getByRole("button", {
      name: "Mode 05: LIVE",
    }).click();
    await page.getByRole("button", {
      name: "Mode 01: CREATE",
    }).click();
  }

  await page.getByRole("button", {
    name: "Stop and return to loop start",
  }).click();
  await page.getByRole("button", {
    name: "Start transport",
  }).click();
  await expect(
    page.getByRole("button", {
      name: "Pause transport",
    }),
  ).toBeVisible();
  await page.getByRole("button", {
    name: "Stop and return to loop start",
  }).click();

  expect(errors).toEqual([]);
});

test("@soak sample churn and project GC converge to live dependencies only", async ({
  page,
}) => {
  await page.goto("/");
  await waitForProjectReady(page);

  await page.getByRole("button", {
    name: "Mode 03: SOUND",
  }).click();

  const panel =
    page.locator(".sample-source-panel");
  const input =
    panel.locator("input.sample-file-input");
  const names = Array.from(
    { length: 6 },
    (_, index) => "rc-" + (index + 1) + ".wav",
  );

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    await input.setInputFiles({
      name,
      mimeType: "audio/wav",
      buffer: tinyWavBuffer(
        110 + index * 73,
      ),
    });

    const row = panel
      .locator(".sample-library__row")
      .filter({ hasText: name });
    await row
      .locator(".sample-library__select")
      .click();
    await expect(row).toContainText("USE");
  }

  let dialog = await openProjectDialog(page);
  await dialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();
  await page.keyboard.press("Escape");

  expect(
    await indexedDbCount(page, "assets"),
  ).toBe(6);

  for (const name of names.slice(0, 3)) {
    await panel.getByRole("button", {
      name: "Remove sample " + name,
    }).click();
  }

  dialog = await openProjectDialog(page);
  await dialog.getByRole("button", {
    name: "SAVE NOW",
  }).click();

  const activeRow =
    dialog.locator(
      ".project-library-row.is-active",
    );
  const activeName = (
    await activeRow
      .locator(
        ".project-library-row__open span",
      )
      .innerText()
  ).trim();

  await activeRow
    .locator(".project-library-row__actions")
    .getByRole("button", {
      name: "COPY",
    })
    .click();

  const copyRow = dialog
    .locator(".project-library-row")
    .filter({
      hasText: activeName + " Copy",
    });
  await expect(copyRow).toBeVisible();

  await copyRow
    .locator(".project-library-row__actions")
    .getByRole("button", {
      name: "DELETE",
    })
    .click();
  await copyRow.getByRole("button", {
    name: "CONFIRM DELETE",
  }).click();

  await expect(copyRow).toHaveCount(0);
  expect(
    await indexedDbCount(page, "assets"),
  ).toBe(3);
  await expect(
    dialog.locator(".project-error"),
  ).toHaveCount(0);
});
