import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomView, RoomCommand } from "./protocol";
import { readServiceUrl } from "./service-config";
export const apiDefault =
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "");
export function useServiceUrl() {
  const [base, setBase] = useState(apiDefault);
  const [ready, setReady] = useState(Boolean(apiDefault));
  useEffect(() => {
    if (apiDefault) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch(new URL("./config.json", document.baseURI), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("No configuration");
        return readServiceUrl(await r.json());
      })
      .then(setBase)
      .catch(() => setBase(""))
      .finally(() => {
        clearTimeout(timeout);
        setReady(true);
      });
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);
  return { base, ready };
}
export async function api<T>(
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!base) throw Error("خادم الغرف لم يُنشر أو لم يُربط بالموقع بعد.");
  const response = await fetch(base.replace(/\/$/, "") + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("الخدمة لم ترجع استجابة صالحة");
  }
  if (!response.ok) throw Error(data.error || "تعذر الاتصال");
  return data as T;
}
export function useRoom(base: string, code: string, key: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);
  const anchor = useRef({ server: 0, local: performance.now() });
  const current = useRef(room);
  const busy = useRef(false);
  const accept = useCallback((data: RoomView) => {
    if (current.current && data.revision < current.current.revision) return;
    anchor.current = { server: data.serverTime, local: performance.now() };
    current.current = data;
    setRoom(data);
    setClock(data.serverTime);
  }, []);
  useEffect(() => {
    if (!code || !base) return;
    let cancelled = false;
    let ws: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let attempt = 0;
    const connect = () => {
      if (cancelled) return;
      const url = new URL(
        `${base.replace(/\/$/, "")}/rooms/${code}/ws`,
        location.origin,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(url);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "HELLO", key }));
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "STATE") {
            accept(data);
            setConnected(true);
            setError("");
            attempt = 0;
          } else if (data.type === "PONG") {
            anchor.current = {
              server: data.serverTime,
              local: performance.now(),
            };
          }
        } catch {
          setError("استجابة غير صالحة");
        }
      };
      ws.onclose = (e) => {
        setConnected(false);
        if (cancelled) return;
        if (e.code === 1008) {
          setError("الغرفة انتهت أو رابط الدخول غير صالح");
          return;
        }
        if (e.reason === "session replaced") {
          setError("تم فتح حساب القائد على جهاز آخر");
          return;
        }
        setError("انقطع الاتصال؛ نحاول استعادته…");
        retry = setTimeout(connect, Math.min(10000, 1000 * 2 ** attempt++));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    const timer = setInterval(() => {
      setClock(
        anchor.current.server + performance.now() - anchor.current.local,
      );
    }, 50);
    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "PING" }));
    }, 20000);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      clearInterval(timer);
      clearInterval(ping);
      ws?.close();
    };
  }, [base, code, key, accept]);
  const send = useCallback(
    async (action: RoomCommand) => {
      const state = current.current;
      if (!state || busy.current) return;
      busy.current = true;
      try {
        const next = await api<RoomView>(base, `/rooms/${code}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            action,
            revision: state.revision,
            id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
              n.toString(16).padStart(2, "0"),
            ).join(""),
          }),
        });
        accept(next);
        setError("");
      } catch (e) {
        setError((e as Error).message);
        try {
          accept(
            await api<RoomView>(base, `/rooms/${code}`, {
              headers: { Authorization: `Bearer ${key}` },
            }),
          );
        } catch {}
      } finally {
        busy.current = false;
      }
    },
    [base, code, key, accept],
  );
  return {
    room,
    connected,
    error,
    send,
    remaining: Math.max(0, (room?.game?.deadline ?? clock) - clock),
  };
}
