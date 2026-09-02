const transitions: Record<string, readonly string[]> = {
  RECEIVED: ["PROCESSING", "IGNORED", "FAILED"],
  PROCESSING: ["PROCESSED", "FAILED"],
  PENDING: ["PROCESSING", "BLOCKED", "FAILED"],
  BLOCKED: ["PENDING"],
  ACCEPTED: ["SENT", "FAILED"],
  SENT: ["DELIVERED", "FAILED"],
  DELIVERED: ["READ"],
};

export function canTransition(from: string, to: string) {
  return from === to || Boolean(transitions[from]?.includes(to));
}

export function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) throw new Error(`INVALID_STATE_TRANSITION:${from}:${to}`);
}
