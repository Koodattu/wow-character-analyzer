type Subscriber = () => void;

type SseEventName = "snapshot" | "update" | "error";
type SseSubscribe = (subscriber: Subscriber) => () => void;

const sseEncoder = new TextEncoder();
const SSE_HEARTBEAT_INTERVAL_MS = 15000;

const processingSubscribers = new Set<Subscriber>();
const queuedSubscribersByUser = new Map<string, Set<Subscriber>>();

function runSubscribers(subscribers: Set<Subscriber>) {
  const snapshot = Array.from(subscribers);
  for (const subscriber of snapshot) {
    try {
      subscriber();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeProcessingUpdates(subscriber: Subscriber) {
  processingSubscribers.add(subscriber);

  return () => {
    processingSubscribers.delete(subscriber);
  };
}

export function publishProcessingUpdate() {
  runSubscribers(processingSubscribers);
}

export function subscribeUserQueuedUpdates(userId: string, subscriber: Subscriber) {
  const existing = queuedSubscribersByUser.get(userId);
  if (existing) {
    existing.add(subscriber);
  } else {
    queuedSubscribersByUser.set(userId, new Set([subscriber]));
  }

  return () => {
    const userSubscribers = queuedSubscribersByUser.get(userId);
    if (!userSubscribers) return;

    userSubscribers.delete(subscriber);
    if (userSubscribers.size === 0) {
      queuedSubscribersByUser.delete(userId);
    }
  };
}

export function publishUserQueuedUpdate(userId?: string) {
  if (userId) {
    const subscribers = queuedSubscribersByUser.get(userId);
    if (subscribers) {
      runSubscribers(subscribers);
    }
    return;
  }

  for (const subscribers of queuedSubscribersByUser.values()) {
    runSubscribers(subscribers);
  }
}

interface CreateSseResponseOptions<TPayload> {
  request: Request;
  subscribe: SseSubscribe;
  loadSnapshot: () => Promise<TPayload>;
  snapshotErrorMessage: string;
}

export function createSseResponse<TPayload>({ request, subscribe, loadSnapshot, snapshotErrorMessage }: CreateSseResponseOptions<TPayload>) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let sendingSnapshot = false;
      let queuedUpdate = false;

      const sendEvent = (event: SseEventName, payload: unknown) => {
        if (closed) return;
        controller.enqueue(sseEncoder.encode(`event: ${event}\n`));
        controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const sendSnapshot = async (event: "snapshot" | "update") => {
        try {
          const payload = await loadSnapshot();
          sendEvent(event, payload);
        } catch {
          sendEvent("error", { error: snapshotErrorMessage });
        }
      };

      const scheduleSnapshot = (event: "snapshot" | "update") => {
        if (sendingSnapshot) {
          queuedUpdate = true;
          return;
        }

        sendingSnapshot = true;
        void sendSnapshot(event).finally(() => {
          sendingSnapshot = false;
          if (queuedUpdate) {
            queuedUpdate = false;
            scheduleSnapshot("update");
          }
        });
      };

      const unsubscribe = subscribe(() => {
        scheduleSnapshot("update");
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(sseEncoder.encode(": ping\n\n"));
      }, SSE_HEARTBEAT_INTERVAL_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      request.signal.addEventListener("abort", close, { once: true });
      scheduleSnapshot("snapshot");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
