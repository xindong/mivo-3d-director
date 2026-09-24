/**
 * All Mivo traffic goes through our own origin (`/api/mivo/*`), which the XD Sites worker
 * (and the Vite dev proxy) forwards to the Mivo API. That keeps the browser same-origin,
 * so no CORS negotiation is needed.
 */
const MIVO_ENDPOINT = "/api/mivo";
const CREDENTIALS_STORAGE_KEY = "mivo-3d-director:mivo-credentials";

export type MivoAssetKind = "model" | "image";
export type MivoAssetProvider = "generate" | "upload";

export interface MivoCredentials {
  apiKey: string;
  session: string;
  expiresAt: number | null;
}

export interface MivoAsset {
  fileId: string;
  name: string;
  thumbnail: string;
  url: string;
  contentType: string;
  fileType: string;
  createTime: string;
  size: number;
}

type JsonRecord = Record<string, unknown>;

function getEndpoint() {
  return MIVO_ENDPOINT;
}

function unwrap(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;

  const record = json as JsonRecord;
  const response = record.response as JsonRecord | undefined;
  const nested = response && typeof response === "object" ? response.data ?? response : undefined;

  return record.data ?? nested ?? json;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

/**
 * The asset API answers either with a flat array or with day buckets:
 * `[{ date: "2026-09-24", images: [...] }, ...]`. Collect real assets from both shapes.
 */
function pickItemArray(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      if (!item || typeof item !== "object") return [];

      const record = item as JsonRecord;

      for (const key of ["images", "items", "list", "results", "data", "files"]) {
        const nested = record[key];
        if (Array.isArray(nested)) return pickItemArray(nested);
      }

      // A day bucket without a recognised list is not an asset itself.
      return record.fileId || record.file_id || record._id ? [record] : [];
    });
  }

  if (payload && typeof payload === "object") {
    const record = payload as JsonRecord;

    for (const key of ["items", "list", "results", "data", "images", "files"]) {
      const value = record[key];
      if (Array.isArray(value)) return pickItemArray(value);
    }
  }

  return [];
}

function mapAsset(item: JsonRecord, session?: string): MivoAsset {
  const fileId = toStringValue(item.fileId ?? item.file_id ?? item._id ?? item.id);
  const thumbnail = toStringValue(item.thumbnail ?? item.thumb ?? item.image);
  const url = toStringValue(item.url ?? item.image ?? item.fullUrl ?? item.thumbnail);

  return {
    fileId,
    name: toStringValue(item.name ?? item.title ?? item.fileName) || fileId,
    thumbnail: (() => {
      if (!thumbnail) return "";

      const proxied = withEndpoint(normalizeMivoFileApiPath(thumbnail));

      return session ? `${proxied}${proxied.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(session)}` : proxied;
    })(),
    url: withEndpoint(normalizeMivoFileApiPath(url)),
    contentType: toStringValue(item.contentType ?? item.content_type),
    fileType: toStringValue(item.fileType ?? item.file_type),
    createTime: toStringValue(item.createTime ?? item.create_time ?? item.createdAt),
    size: toNumber(item.size),
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isSameOriginAssetUrl(url: string) {
  return url.startsWith("/");
}

/**
 * The asset list returns "/file/thumbnail/<id>", but the API only answers under
 * "/api/v1/file/...". Normalise every file path we receive.
 */
function normalizeMivoFileApiPath(value: string): string {
  const match = value.match(/^\/?(?:api\/v1\/)?file\/(thumbnail|image|download)\/([A-Za-z0-9_-]+)$/);

  return match ? `/api/v1/file/${match[1]}/${match[2]}` : value;
}

function withEndpoint(path: string) {
  return isSameOriginAssetUrl(path) ? `${getEndpoint()}${path}` : path;
}

export function readStoredMivoCredentials(): MivoCredentials | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MivoCredentials>;
    if (typeof parsed.apiKey !== "string" || typeof parsed.session !== "string") return null;

    return {
      apiKey: parsed.apiKey,
      session: parsed.session,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredMivoCredentials(credentials: MivoCredentials | null) {
  if (typeof localStorage === "undefined") return;

  try {
    if (!credentials) {
      localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
      return;
    }

    localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage may be unavailable; the in-memory session still works.
  }
}

/** Exchanges a Mivo API key for a session token (same contract as the Mivo MCP client). */
export async function exchangeMivoToken(apiKey: string): Promise<{ session: string; expiresAt: number | null }> {
  const response = await fetch(`${getEndpoint()}/api/v1/state/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "", sub: apiKey, name: "" }),
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "API Key 无效或已失效" : `认证失败（HTTP ${response.status}）`);
  }

  const payload = unwrap(await readJson(response)) as JsonRecord | null;
  const session = toStringValue(payload?.session ?? payload?.token);

  if (!session) {
    throw new Error("认证响应缺少 session，请确认 API Key 是否正确");
  }

  const expiresAtRaw = payload?.expiresAt ?? payload?.expireAt ?? payload?.expires_at;

  return {
    session,
    expiresAt: typeof expiresAtRaw === "string" ? Date.parse(expiresAtRaw) || null : null,
  };
}

export async function fetchMivoAssets(
  session: string,
  options: { fileType: MivoAssetKind; provider: MivoAssetProvider; limit?: number; offset?: number; keyword?: string }
): Promise<MivoAsset[]> {
  const params = new URLSearchParams({
    fileType: options.fileType,
    provider: options.provider,
    limit: String(options.limit ?? 40),
    offset: String(options.offset ?? 0),
  });

  if (options.keyword) {
    params.set("keyword", options.keyword);
  }

  const response = await fetch(`${getEndpoint()}/api/v1/ress/refer?${params.toString()}`, {
    headers: { Authorization: `Bearer ${session}` },
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "登录已过期，请重新连接 Mivo" : `获取资源失败（HTTP ${response.status}）`);
  }

  return pickItemArray(unwrap(await readJson(response)))
    .map((item) => mapAsset(item, session))
    .filter((asset) => asset.fileId);
}

export async function downloadMivoAsset(session: string, asset: MivoAsset): Promise<File> {
  const response = await fetch(`${getEndpoint()}/api/v1/file/download/${asset.fileId}`, {
    headers: { Authorization: `Bearer ${session}` },
  });

  if (!response.ok) {
    throw new Error(`下载资源失败（HTTP ${response.status}）`);
  }

  const blob = await response.blob();

  return new File([blob], asset.name, { type: blob.type || asset.contentType || "application/octet-stream" });
}

/** Cheap reachability probe used to turn a proxy/network failure into a readable message. */
export async function probeMivoEndpoint(): Promise<boolean> {
  try {
    const response = await fetch(`${MIVO_ENDPOINT}/api/v1/state/token`, { method: "HEAD" });
    return response.status < 500;
  } catch {
    return false;
  }
}
