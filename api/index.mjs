import { handleRequest } from "../src/server.mjs";

export async function handleWebRequest(request) {
  const requestUrl = new URL(request.url);
  const rewrittenApiPath = requestUrl.searchParams.get("__silpo_api_path");
  if (rewrittenApiPath !== null) requestUrl.searchParams.delete("__silpo_api_path");
  const pathname = rewrittenApiPath === null
    ? requestUrl.pathname
    : `/api/${rewrittenApiPath.replace(/^\/+/, "")}`;
  const search = requestUrl.searchParams.toString();
  const nodeRequest = {
    method: request.method,
    url: `${pathname}${search ? `?${search}` : ""}`,
    headers: Object.fromEntries(request.headers.entries())
  };

  return new Promise((resolve, reject) => {
    let status = 200;
    const headers = new Headers();
    const nodeResponse = {
      setHeader(name, value) {
        headers.set(name, String(value));
      },
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        for (const [name, value] of Object.entries(nextHeaders)) {
          headers.set(name, String(value));
        }
        return this;
      },
      end(body) {
        resolve(new Response(body ?? null, { status, headers }));
      }
    };

    Promise.resolve(handleRequest(nodeRequest, nodeResponse)).catch(reject);
  });
}

export default { fetch: handleWebRequest };
