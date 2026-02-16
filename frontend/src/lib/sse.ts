import { toApiUrl } from "@/lib/env";

export function openEventSource(path: string) {
  return new EventSource(toApiUrl(path), {
    withCredentials: true,
  });
}

export function bindJsonSseEvents<TPayload>(stream: EventSource, onData: (payload: TPayload) => void) {
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
    // EventSource automatically retries
  };

  return () => {
    stream.removeEventListener("snapshot", handleData as EventListener);
    stream.removeEventListener("update", handleData as EventListener);
    stream.close();
  };
}
