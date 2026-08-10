const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

export const GET = (): Response =>
  new Response("ok\n", { headers: responseHeaders, status: 200 });

export const HEAD = (): Response =>
  new Response(null, { headers: responseHeaders, status: 200 });
