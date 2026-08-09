import type { ServerOptions } from "node:http";
import type { Socket } from "node:net";

const WEB_UPLOAD_DEADLINE_MILLISECONDS = 1_000;

export const WEB_INGRESS_SERVER_OPTIONS = Object.freeze({
  connectionsCheckingInterval: 50,
  requestTimeout: WEB_UPLOAD_DEADLINE_MILLISECONDS,
}) satisfies ServerOptions;

export const handleWebIngressClientError = (
  error: Error & Readonly<{ code?: string }>,
  socket: Socket,
): void => {
  if (error.code !== "ERR_HTTP_REQUEST_TIMEOUT" || !socket.writable) {
    socket.destroy();
    return;
  }

  socket.end(
    "HTTP/1.1 401 Unauthorized\r\n" +
      "Cache-Control: no-store\r\n" +
      "Connection: close\r\n" +
      "Content-Length: 12\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      "X-Content-Type-Options: nosniff\r\n" +
      "\r\n" +
      "Unauthorized",
  );
};
