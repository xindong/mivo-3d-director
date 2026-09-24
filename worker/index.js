const MIVO_ORIGIN = "https://aigc.xindong.com";
const PROXY_PREFIX = "/api/mivo";

/**
 * XD Sites worker (worker-with-assets):
 * - everything under /api/mivo/* is proxied to the Mivo API, so the browser only ever
 *   talks to our own origin and never hits CORS.
 * - any other request is served from the static assets bundle.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(`${PROXY_PREFIX}/`)) {
      return proxyToMivo(request, url);
    }

    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function proxyToMivo(request, url) {
  const targetPath = url.pathname.slice(PROXY_PREFIX.length) || "/";
  const target = new URL(`${targetPath}${url.search}`, MIVO_ORIGIN);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");

  const canHaveBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream;

  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: canHaveBody ? await request.arrayBuffer() : undefined,
      redirect: "follow",
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "MIVO_PROXY_FAILED", message: String(error) }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const responseHeaders = new Headers(upstream.headers);

  // The body is re-streamed, so encoding/length headers from upstream no longer apply.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
