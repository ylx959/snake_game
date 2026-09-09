import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `next dev` blocks dev-only endpoints (including the HMR WebSocket) for any
  // request carrying an Origin it was not started with. Browsers always send
  // Origin, so without this the HMR socket is refused with a 400, the dev
  // client never finishes booting, and the page renders but never hydrates.
  // The server is reachable as both 127.0.0.1 and localhost, so allow both.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
