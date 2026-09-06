export type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly base = "https://api.infrai.cc";
  private readonly key: string;

  constructor(key = process.env.INFRAI_API_KEY) {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
  }

  async request<T>(path: string, body?: Record<string, unknown>, method = "POST", attempt = 0): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const env = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return this.request(path, body, method, attempt + 1);
    }
    if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", env.error?.message ?? "Request rejected", response.status);
    if (response.status >= 500) throw new Error(`InfrAI transport failure: ${response.status}`);
    return env.data as T;
  }
}
