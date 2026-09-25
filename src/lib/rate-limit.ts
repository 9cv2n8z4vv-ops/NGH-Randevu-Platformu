const requests = new Map<string, number[]>();

export function allowRequest(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const recent = (requests.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= maxRequests) {
    requests.set(key, recent);
    return false;
  }
  recent.push(now);
  requests.set(key, recent);
  return true;
}

export function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
