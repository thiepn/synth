type Listener = () => void;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export interface PwaSnapshot {
  supported: boolean;
  initialized: boolean;
  registered: boolean;
  online: boolean;
  installed: boolean;
  installAvailable: boolean;
  updateAvailable: boolean;
  applyingUpdate: boolean;
  buildId: string;
  lastError?: string;
  revision: number;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

function canUseServiceWorker(): boolean {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return false;
  }

  if (location.protocol === "https:") return true;
  return (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

export class PwaStore {
  private listeners = new Set<Listener>();
  private supported = canUseServiceWorker();
  private initialized = false;
  private initializing: Promise<void> | undefined;
  private registered = false;
  private online =
    typeof navigator === "undefined" ? true : navigator.onLine;
  private installed = isInstalled();
  private promptEvent: BeforeInstallPromptEvent | undefined;
  private registration: ServiceWorkerRegistration | undefined;
  private updateAvailable = false;
  private applyingUpdate = false;
  private lastError: string | undefined;
  private revision = 0;
  private snapshot = this.buildSnapshot();
  private lifecycleInstalled = false;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): PwaSnapshot => this.snapshot;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  private async initializeInternal(): Promise<void> {
    this.installLifecycle();

    if (!this.supported) {
      this.initialized = true;
      this.publish();
      return;
    }

    try {
      const workerUrl = new URL(
        "./sw.js",
        document.baseURI,
      );
      workerUrl.searchParams.set(
        "v",
        __SYNTH_BUILD_ID__,
      );
      const scope = new URL(
        "./",
        document.baseURI,
      ).pathname;

      const registration =
        await navigator.serviceWorker.register(
          workerUrl,
          {
            scope,
            updateViaCache: "none",
          },
        );

      this.registration = registration;
      this.registered = true;
      this.updateAvailable = Boolean(
        registration.waiting &&
        navigator.serviceWorker.controller,
      );
      this.observeRegistration(registration);

      try {
        await registration.update();
      } catch {
        // Registration itself succeeded; a manual update check is best effort.
      }

      this.lastError = undefined;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : String(error);
    }

    this.initialized = true;
    this.publish();
  }

  async install(): Promise<boolean> {
    const prompt = this.promptEvent;
    if (!prompt) return false;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      this.promptEvent = undefined;
      this.installed =
        choice.outcome === "accepted" || isInstalled();
      this.publish();
      return choice.outcome === "accepted";
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : String(error);
      this.publish();
      return false;
    }
  }

  async checkForUpdate(): Promise<void> {
    try {
      await this.registration?.update();
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : String(error);
      this.publish();
    }
  }

  applyUpdate(): void {
    const waiting = this.registration?.waiting;
    if (!waiting) return;

    this.applyingUpdate = true;
    this.publish();
    waiting.postMessage({
      type: "SKIP_WAITING",
    });
  }

  private installLifecycle(): void {
    if (this.lifecycleInstalled || typeof window === "undefined") return;
    this.lifecycleInstalled = true;

    window.addEventListener(
      "beforeinstallprompt",
      (event) => {
        event.preventDefault();
        this.promptEvent =
          event as BeforeInstallPromptEvent;
        this.publish();
      },
    );

    window.addEventListener("appinstalled", () => {
      this.promptEvent = undefined;
      this.installed = true;
      this.publish();
    });

    window.addEventListener("online", () => {
      this.online = true;
      this.publish();
    });
    window.addEventListener("offline", () => {
      this.online = false;
      this.publish();
    });

    window
      .matchMedia("(display-mode: standalone)")
      .addEventListener("change", () => {
        this.installed = isInstalled();
        this.publish();
      });

    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      () => {
        if (this.applyingUpdate) {
          window.location.reload();
        }
      },
    );
  }

  private observeRegistration(
    registration: ServiceWorkerRegistration,
  ): void {
    registration.addEventListener(
      "updatefound",
      () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            this.updateAvailable = true;
            this.publish();
          }
        });
      },
    );
  }

  private publish(): void {
    this.installed = this.installed || isInstalled();
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): PwaSnapshot {
    return {
      supported: this.supported,
      initialized: this.initialized,
      registered: this.registered,
      online: this.online,
      installed: this.installed,
      installAvailable: Boolean(
        this.promptEvent && !this.installed,
      ),
      updateAvailable: this.updateAvailable,
      applyingUpdate: this.applyingUpdate,
      buildId: __SYNTH_BUILD_ID__,
      lastError: this.lastError,
      revision: this.revision,
    };
  }
}

export const pwaStore = new PwaStore();
