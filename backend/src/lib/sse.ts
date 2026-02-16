type Subscriber = () => void;

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
