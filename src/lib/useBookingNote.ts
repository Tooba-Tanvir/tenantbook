"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

export type Viewer = { userId: string; name: string; color: string };
export type SaveStatus = "loading" | "saved" | "saving" | "unsaved" | "conflict" | "error";
export type Conn = "connected" | "reconnecting" | "offline";
type Note = { content: string; version: number };
type Conflict = Note & { by?: string };
type Timer = ReturnType<typeof setTimeout> | undefined;

const without = (o: Record<string, string>, k: string) => {
  const c = { ...o };
  delete c[k];
  return c;
};

export function useBookingNote(bookingId: string) {
  const [content, setContentState] = useState("");
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [conn, setConn] = useState<Conn>("reconnecting");
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const version = useRef(0);
  const contentRef = useRef("");
  const dirty = useRef(false);
  const joined = useRef(false);
  const saving = useRef(false);
  const conflictRef = useRef<Conflict | null>(null);
  const lastTypingEmit = useRef(0);
  const saveTimer = useRef<Timer>(undefined);
  const typingStop = useRef<Timer>(undefined);
  const typingTimers = useRef<Record<string, Timer>>({});
  const saveRef = useRef<() => void>(() => {});

  const applyServer = useCallback((note: Note) => {
    version.current = note.version;
    contentRef.current = note.content;
    dirty.current = false;
    conflictRef.current = null;
    setContentState(note.content);
    setConflict(null);
    setStatus("saved");
  }, []);

  const raiseConflict = useCallback((c: Conflict) => {
    clearTimeout(saveTimer.current);
    conflictRef.current = c;
    setConflict(c);
    setStatus("conflict");
  }, []);

  const save = useCallback(() => {
    const s = getSocket();
    if (!s.connected || !joined.current || saving.current || !dirty.current || conflictRef.current) return;
    saving.current = true;
    setStatus("saving");
    const sent = contentRef.current;
    s.timeout(8000).emit(
      "note:save",
      { bookingId, content: sent, baseVersion: version.current },
      (err: Error | null, res: { ok: boolean; version?: number; code?: string; current?: Note }) => {
        saving.current = false;
        if (err) return setStatus("unsaved");
        if (res.ok) {
          version.current = res.version!;
          if (contentRef.current === sent) {
            dirty.current = false;
            setStatus("saved");
          } else {
            setStatus("unsaved");
            setTimeout(() => saveRef.current(), 0);
          }
        } else if (res.code === "CONFLICT" && res.current) {
          raiseConflict(res.current);
        } else {
          setStatus("error");
        }
      }
    );
  }, [bookingId, raiseConflict]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    const s = getSocket();

    const join = () => {
      s.timeout(8000).emit(
        "note:join",
        { bookingId },
        (err: Error | null, res: { ok: boolean; note: Note; users: Viewer[]; me: { userId: string } }) => {
          if (err || !res?.ok) return setStatus("error");
          joined.current = true;
          setMe(res.me.userId);
          setViewers(res.users);
          if (!dirty.current) applyServer(res.note);
          else if (res.note.version !== version.current) raiseConflict(res.note);
          else saveRef.current();
        }
      );
    };

    const onConnect = () => { setConn("connected"); join(); };
    const onDisconnect = (reason: string) => {
      joined.current = false;
      saving.current = false;
      setViewers([]);
      setTyping({});
      if (reason !== "io client disconnect") setConn(navigator.onLine ? "reconnecting" : "offline");
    };
    const onConnectError = (e: Error) => {
      if (e.message === "UNAUTHORIZED") window.location.href = "/login";
      else setConn(navigator.onLine ? "reconnecting" : "offline");
    };
    const onPresence = (m: { bookingId: string; users: Viewer[] }) => {
      if (m.bookingId === bookingId) setViewers(m.users);
    };
    const onTyping = (m: { bookingId: string; userId: string; name: string; typing: boolean }) => {
      if (m.bookingId !== bookingId) return;
      clearTimeout(typingTimers.current[m.userId]);
      if (m.typing) {
        setTyping((t) => ({ ...t, [m.userId]: m.name }));
        typingTimers.current[m.userId] = setTimeout(() => setTyping((t) => without(t, m.userId)), 3500);
      } else {
        setTyping((t) => without(t, m.userId));
      }
    };
    const onUpdated = (m: { bookingId: string; content: string; version: number; by: { name: string } }) => {
      if (m.bookingId !== bookingId) return;
      if (!dirty.current) applyServer({ content: m.content, version: m.version });
      else raiseConflict({ content: m.content, version: m.version, by: m.by.name });
    };
    const goOffline = () => setConn("offline");
    const goOnline = () => {
      setConn(s.connected ? "connected" : "reconnecting");
      if (!s.connected) s.connect();
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("presence:update", onPresence);
    s.on("note:typing", onTyping);
    s.on("note:updated", onUpdated);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (s.connected) onConnect();
    else setConn(navigator.onLine ? "reconnecting" : "offline");

    const timers = typingTimers.current;
    return () => {
      s.emit("note:leave", { bookingId });
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.off("presence:update", onPresence);
      s.off("note:typing", onTyping);
      s.off("note:updated", onUpdated);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearTimeout(saveTimer.current);
      clearTimeout(typingStop.current);
      Object.values(timers).forEach(clearTimeout);
      joined.current = false;
    };
  }, [bookingId, applyServer, raiseConflict]);

  const setContent = (value: string) => {
    contentRef.current = value;
    dirty.current = true;
    setContentState(value);

    const s = getSocket();
    if (Date.now() - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = Date.now();
      s.volatile.emit("note:typing", { bookingId, typing: true });
    }
    clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => {
      lastTypingEmit.current = 0;
      s.volatile.emit("note:typing", { bookingId, typing: false });
    }, 2000);

    if (conflictRef.current) return;
    setStatus("unsaved");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), 800);
  };

  const loadTheirs = () => { if (conflictRef.current) applyServer(conflictRef.current); };
  const keepMine = () => {
    const c = conflictRef.current;
    if (!c) return;
    version.current = c.version;
    conflictRef.current = null;
    setConflict(null);
    setStatus("unsaved");
    saveRef.current();
  };

  return { content, setContent, status, conn, viewers, typing, conflict, me, loadTheirs, keepMine };
}