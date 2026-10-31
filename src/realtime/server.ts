import { createServer } from "http";
import { env } from "@/env";
import { createRealtime } from "./createRealtime";
import { prismaStore } from "./prismaStore";
import { cookieAuth } from "./cookieAuth";

const http = createServer((req, res) => {
  if (req.url === "/health") { res.end("ok"); return; }
  res.statusCode = 404;
  res.end();
});

createRealtime(http, { auth: cookieAuth, store: prismaStore, origin: env.APP_URL });

http.listen(env.REALTIME_PORT, () => console.log(`[realtime] listening on :${env.REALTIME_PORT}`));