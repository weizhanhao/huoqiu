import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

const HEALTH_CHALLENGE_PATTERN = /^[0-9a-f]{64}$/u;
const MINIMUM_SECRET_BYTES = 32;

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "text/plain; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

const attestationHeader = (request: Request | undefined) => {
  const challenge = request?.headers.get("x-huoqiu-preview-health-challenge");
  const secret = process.env.ZERO_TRUST_HMAC_SECRET;
  if (
    challenge === null ||
    challenge === undefined ||
    !HEALTH_CHALLENGE_PATTERN.test(challenge) ||
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_BYTES
  ) {
    return {};
  }

  const proof = createHmac("sha256", secret)
    .update(`v1\npreview-health\n${challenge}`)
    .digest("hex");
  return { "x-huoqiu-preview-health-proof": `v1=${proof}` };
};

export const GET = (request: Request): Response =>
  new Response("ok\n", {
    headers: { ...responseHeaders, ...attestationHeader(request) },
    status: 200,
  });

export const HEAD = (): Response =>
  new Response(null, { headers: responseHeaders, status: 200 });
