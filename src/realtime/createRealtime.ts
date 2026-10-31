import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";

export type RtUser = { userId: string; tenantId: string; name: string };
export type Note = { content: string; version: number };
export type SaveResult = { ok: true; version: number } | { ok: false; current: Note };

export interface NoteStore {
  canAccess(tenantId: string, bookingId: string): Promise<boolean>;
  get(tenantId: string, bookingId: string): Promise<Note>;
  save(tenantId: string, bookingId: string, content: string, baseVersion: number, userId: string): Promise<SaveResult>;
}

export type Handshake = { cookie?: string; token?: string };
export type Deps = {
  auth: (h: Handshake) => Promise<RtUser | null>;
  store: NoteStore;
  origin: string | string[];
};

type Member = { userId: string; name: string; color: string };
type SocketData = { user: RtUser; rooms: Map<string, string> }; // room -> bookingId

const joinSchema = z.object({ bookingId: z.string().min(1).max(64) });
const typingSchema = joinSchema.extend({ typing: z.boolean() });
const saveSchema = joinSchema.extend({
  content: z.string().max(20000),
  baseVersion: z.number().int().min(0),
});

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#dc2626"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const roomOf = (u: RtUser, bookingId: string) => `t:${u.tenantId}:b:${bookingId}`;

export function createRealtime(httpServer: HttpServer, deps: Deps) {
  const io = new Server(httpServer, { cors: { origin: deps.origin, credentials: true } });
  const presence = new Map<string, Map<string, Member>>(); // room -> socketId -> member

  // One avatar per user, even if they have several tabs open
  const viewers = (room: string): Member[] => {
    const byUser = new Map<string, Member>();
    presence.get(room)?.forEach((m) => byUser.set(m.userId, m));
    return [...byUser.values()];
  };

  io.use(async (socket, next) => {
    const user = await deps
      .auth({ cookie: socket.handshake.headers.cookie, token: socket.handshake.auth?.token })
      .catch(() => null);
    if (!user) return next(new Error("UNAUTHORIZED"));
    (socket.data as SocketData) = { user, rooms: new Map() };
    next();
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;
    const { user } = data;
    const reply = (ack: unknown, res: object) => {
      if (typeof ack === "function") (ack as (r: object) => void)(res);
    };

    const leave = (room: string, bookingId: string) => {
      const members = presence.get(room);
      members?.delete(socket.id);
      if (members && members.size === 0) presence.delete(room);
      data.rooms.delete(room);
      socket.to(room).emit("note:typing", { bookingId, userId: user.userId, name: user.name, typing: false });
      socket.to(room).emit("presence:update", { bookingId, users: viewers(room) });
      void socket.leave(room);
    };

    socket.on("note:join", async (raw, ack) => {
      const p = joinSchema.safeParse(raw);
      if (!p.success) return reply(ack, { ok: false, code: "VALIDATION_ERROR" });
      const { bookingId } = p.data;
      try {
        if (!(await deps.store.canAccess(user.tenantId, bookingId))) {
          return reply(ack, { ok: false, code: "NOT_FOUND" });
        }
        const room = roomOf(user, bookingId);
        await socket.join(room);
        data.rooms.set(room, bookingId);
        if (!presence.has(room)) presence.set(room, new Map());
        presence.get(room)!.set(socket.id, { userId: user.userId, name: user.name, color: colorFor(user.userId) });
        const note = await deps.store.get(user.tenantId, bookingId);
        io.to(room).emit("presence:update", { bookingId, users: viewers(room) });
        reply(ack, { ok: true, note, users: viewers(room), me: { userId: user.userId, name: user.name } });
      } catch {
        reply(ack, { ok: false, code: "INTERNAL_ERROR" });
      }
    });

    socket.on("note:leave", (raw) => {
      const p = joinSchema.safeParse(raw);
      if (!p.success) return;
      const room = roomOf(user, p.data.bookingId);
      if (data.rooms.has(room)) leave(room, p.data.bookingId);
    });

    socket.on("note:typing", (raw) => {
      const p = typingSchema.safeParse(raw);
      if (!p.success) return;
      const room = roomOf(user, p.data.bookingId);
      if (!data.rooms.has(room)) return;
      socket.to(room).emit("note:typing", {
        bookingId: p.data.bookingId, userId: user.userId, name: user.name, typing: p.data.typing,
      });
    });

    socket.on("note:save", async (raw, ack) => {
      const p = saveSchema.safeParse(raw);
      if (!p.success) return reply(ack, { ok: false, code: "VALIDATION_ERROR" });
      const { bookingId, content, baseVersion } = p.data;
      const room = roomOf(user, bookingId);
      if (!data.rooms.has(room)) return reply(ack, { ok: false, code: "NOT_JOINED" });
      try {
        const result = await deps.store.save(user.tenantId, bookingId, content, baseVersion, user.userId);
        if (!result.ok) return reply(ack, { ok: false, code: "CONFLICT", current: result.current });
        socket.to(room).emit("note:updated", {
          bookingId, content, version: result.version, by: { userId: user.userId, name: user.name },
        });
        reply(ack, { ok: true, version: result.version });
      } catch {
        reply(ack, { ok: false, code: "INTERNAL_ERROR" });
      }
    });

    socket.on("disconnecting", () => {
      for (const [room, bookingId] of [...data.rooms]) leave(room, bookingId);
    });
  });

  return io;
}