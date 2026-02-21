import { toApiUrl } from "@/lib/env";

export function openEventSource(path: string) {
  return new EventSource(toApiUrl(path), {
    withCredentials: true,
  });
}

interface SseBindOptions<TPayload> {
  onData: (payload: TPayload) => void;
  /** Called when the SSE connection encounters an error or is closed by the server. */
  onError?: () => void;
}

/**
 * Bind JSON-based SSE events to a handler.
 * Accepts either a simple callback or an options object with `onData` and `onError`.
 */
export function bindJsonSseEvents<TPayload>(stream: EventSource, onDataOrOpts: ((payload: TPayload) => void) | SseBindOptions<TPayload>) {
  const { onData, onError } = typeof onDataOrOpts === "function" ? { onData: onDataOrOpts, onError: undefined } : onDataOrOpts;

  const handleData = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data) as TPayload;
      onData(payload);
    } catch {
      // ignore malformed payload
    }
  };

  stream.addEventListener("snapshot", handleData as EventListener);
  stream.addEventListener("update", handleData as EventListener);

  stream.onerror = () => {
    // EventSource automatically reconnects (readyState CONNECTING).
    // Only fire onError when the connection is fully closed.
    if (stream.readyState === EventSource.CLOSED) {
      onError?.();
    }
  };

  return () => {
    stream.removeEventListener("snapshot", handleData as EventListener);
    stream.removeEventListener("update", handleData as EventListener);
    stream.close();
  };
}
