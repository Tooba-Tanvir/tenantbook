import { createServer, type Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import type { Server } from "socket.io";
import { io as ioc, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRealtime, type Note, type NoteStore } from "./createRealtime";

class MemoryStore implements NoteStore {
  notes = new Map<string, Note>();
  bookings = new Set(["t1:b1", "t2:b9"]); // t1 owns b1, t2 owns b9
  async canAccess(t: string, b: string) { return this.bookings.has(`${t}:${b}`); }
  async get(t: string, b: string) { return this.notes.get(`${t}:${b}`) ?? { content: "", version: 0 }; }
  async save(t: string, b: string, content: string, base: number) {
    const cur = await this.get(t, b);
    if (cur.version !== base) return { ok: false as const, current: cur };
    const next = { content, version: cur.version + 1 };
    this.notes.set(`${t}:${b}`, next);
    return { ok: true as const, version: next.version };
  }
}

type Users = { userId: string; name: string }[];
type JoinRes = { ok: boolean; code?: string; note: Note; users: Users };
type SaveRes = { ok: boolean; code?: string; version?: number; current?: Note };

let http: HttpServer;
let io: Server;
let url: string;
const store = new MemoryStore();
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  io = createRealtime(http, {
    origin: "*",
    store,
    // token format "tenantId|userId|name"
    auth: async ({ token }) => {
      if (!token) return null;
      const [tenantId, userId, name] = token.split("|");
      return { tenantId, userId, name };
    },
  });
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(() => {
  clients.splice(0).forEach((c) => c.close());
  store.notes.clear();
});

afterAll(async () => {
  await io.close();
});

const connect = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = ioc(url, { auth: { token }, transports: ["websocket"], reconnectionDelay: 20, reconnectionDelayMax: 50 });
    clients.push(s);
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });

const emitAck = <T>(s: Socket, ev: string, payload: object) => new Promise<T>((r) => s.emit(ev, payload, r));
const join = (s: Socket, bookingId = "b1") => emitAck<JoinRes>(s, "note:join", { bookingId });
const save = (s: Socket, content: string, baseVersion: number, bookingId = "b1") =>
  emitAck<SaveRes>(s, "note:save", { bookingId, content, baseVersion });
const waitFor = <T>(s: Socket, ev: string, pred: (d: T) => boolean = () => true) =>
  new Promise<T>((resolve) => {
    const h = (d: T) => { if (pred(d)) { s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALI = "t1|u1|Ali";
const SARA = "t1|u2|Sara";
const OTHER_ORG = "t2|u9|Zed";

describe("authentication", () => {
  it("rejects connections without a valid session", async () => {
    await expect(connect()).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("broadcasting and state sync", () => {
  it("broadcasts a saved note to other viewers but not back to the sender", async () => {
    const a = await connect(ALI);
    const b = await connect(SARA);
    await join(a);
    await join(b);

    let senderGotEcho = false;
    a.on("note:updated", () => { senderGotEcho = true; });
    const received = waitFor<{ content: string; version: number; by: { name: string } }>(b, "note:updated");

    expect((await save(a, "hello", 0)).ok).toBe(true);
    expect(await received).toMatchObject({ content: "hello", version: 1, by: { name: "Ali" } });
    await sleep(50);
    expect(senderGotEcho).toBe(false);
  });

  it("gives a late joiner the current note", async () => {
    const a = await connect(ALI);
    await join(a);
    await save(a, "already here", 0);

    const b = await connect(SARA);
    expect((await join(b)).note).toEqual({ content: "already here", version: 1 });
  });

  it("broadcasts typing indicators to others only", async () => {
    const a = await connect(ALI);
    const b = await connect(SARA);
    await join(a);
    await join(b);

    let selfTyping = false;
    a.on("note:typing", () => { selfTyping = true; });
    const seen = waitFor<{ name: string; typing: boolean }>(b, "note:typing");
    a.emit("note:typing", { bookingId: "b1", typing: true });

    expect(await seen).toMatchObject({ name: "Ali", typing: true });
    await sleep(50);
    expect(selfTyping).toBe(false);
  });
});

describe("presence", () => {
  it("tracks viewers joining and leaving, one avatar per user", async () => {
    const a1 = await connect(ALI);
    const a2 = await connect(ALI); // same user, second tab
    const b = await connect(SARA);

    expect((await join(a1)).users).toHaveLength(1);
    expect((await join(a2)).users).toHaveLength(1); // deduplicated

    const twoUsers = waitFor<{ users: Users }>(a1, "presence:update", (p) => p.users.length === 2);
    await join(b);
    expect((await twoUsers).users.map((u) => u.name).sort()).toEqual(["Ali", "Sara"]);

    const backToOne = waitFor<{ users: Users }>(a1, "presence:update", (p) => p.users.length === 1);
    b.close();
    expect((await backToOne).users[0].name).toBe("Ali");
  });
});

describe("tenant isolation", () => {
  it("blocks other organizations from joining or receiving events", async () => {
    const a = await connect(ALI);
    const z = await connect(OTHER_ORG);
    await join(a);

    expect(await join(z, "b1")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await save(z, "hacked", 0, "b1")).toMatchObject({ ok: false, code: "NOT_JOINED" });

    // Z is legitimately in their own room and must not see tenant 1's events
    await join(z, "b9");
    let leaked = false;
    z.on("note:updated", () => { leaked = true; });
    await save(a, "secret", 0);
    await sleep(50);
    expect(leaked).toBe(false);
  });
});

describe("optimistic concurrency", () => {
  it("rejects a stale save with the latest version, then accepts the rebased save", async () => {
    const a = await connect(ALI);
    const b = await connect(SARA);
    await join(a);
    await join(b);

    expect(await save(a, "from Ali", 0)).toEqual({ ok: true, version: 1 });

    const stale = await save(b, "from Sara", 0);
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT", current: { content: "from Ali", version: 1 } });

    expect(await save(b, "from Sara", 1)).toEqual({ ok: true, version: 2 });
  });

  it("lets only one of two simultaneous saves win", async () => {
    const a = await connect(ALI);
    const b = await connect(SARA);
    await join(a);
    await join(b);

    const [r1, r2] = await Promise.all([save(a, "A", 0), save(b, "B", 0)]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe("reconnection", () => {
  it("rejoins the room and resyncs after a dropped connection", async () => {
    const a = await connect(ALI);
    const b = await connect(SARA);
    await join(a);
    await join(b);

    const gone = waitFor<{ users: Users }>(a, "presence:update", (p) => p.users.length === 1);
    const reconnected = new Promise<void>((r) => b.once("connect", () => r()));
    b.io.engine.close(); // simulate a network drop

    await gone; // server noticed Sara left
    await save(a, "edited while Sara was away", 0);

    await reconnected; // client reconnected automatically
    const res = await join(b); // the hook re-sends note:join on every "connect"
    expect(res.note).toEqual({ content: "edited while Sara was away", version: 1 });
    expect(res.users).toHaveLength(2);
  });
});