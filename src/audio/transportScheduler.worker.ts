/// <reference lib="webworker" />

let timer: number | undefined;

function stop(): void {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
}

self.onmessage = (
  event: MessageEvent<{
    type: "start" | "stop";
    intervalMs?: number;
  }>,
) => {
  if (event.data.type === "stop") {
    stop();
    return;
  }

  stop();
  const intervalMs = Math.max(
    10,
    Math.min(250, event.data.intervalMs ?? 25),
  );
  timer = self.setInterval(() => {
    self.postMessage({ type: "tick" });
  }, intervalMs);
};
