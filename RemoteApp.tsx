import { CategoryPicker } from "./CategoryPicker";
import { categories, categoryFor } from "./catalog";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, useServiceUrl, useRoom } from "./client";
import type { Mode, Role, RoomCommand, RoomView } from "./protocol";
import { other, type JokerCard, type TeamId } from "./engine";
import { Admin } from "./admin";
import { create as createQR } from "qrcode";
import { roomJoinUrl, readJoinCode } from "./room-links";
const icon = new URL("../icon.png", import.meta.url).href,
  wordmark = new URL("../wordmark.png", import.meta.url).href;
const ReducedMotion = createContext(false);
function initialReducedMotion() {
  try {
    const saved = localStorage.getItem("ain-reduced-motion");
    if (saved !== null) return saved === "true";
  } catch {
    /* Preferences still work when storage is unavailable. */
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function TurnDuration({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="turn-duration">
      <span>
        مدة الدور: <output>{draft.toLocaleString("ar-SA")} ثانية</output>
      </span>
      <input
        type="range"
        min="20"
        max="120"
        step="1"
        value={draft}
        aria-label="مدة الدور بالثواني"
        aria-valuetext={`${draft} ثانية`}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={(e) => onChange(Number(e.currentTarget.value))}
        onKeyUp={(e) => onChange(Number(e.currentTarget.value))}
        onBlur={(e) => {
          if (Number(e.currentTarget.value) !== value)
            onChange(Number(e.currentTarget.value));
        }}
      />
      <small>٢٠ ثانية — ١٢٠ ثانية · تُعتمد قبل بدء المباراة</small>
    </label>
  );
}
const cardNames: Record<JokerCard, string> = {
  FREEZE: "عين حارة",
  SWAP: "تثبيت المخ",
  FIFTY_FIFTY: "شيل خيارين",
};
function Animation({
  kind,
  name,
  color,
  onEnd,
}: {
  kind: string;
  name?: string;
  color?: string;
  onEnd: () => void;
}) {
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ready) return;
    const fallback = setTimeout(() => {
      setFailed(true);
      endRef.current();
    }, 5000);
    return () => clearTimeout(fallback);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => endRef.current(), kind === "turn" ? 3800 : 3200);
    return () => clearTimeout(t);
  }, [kind, ready]);
  return (
    <div
      className={`animation ${kind} ${ready ? "ready" : ""}`}
      style={
        !ready ? { visibility: "hidden", pointerEvents: "none" } : undefined
      }
      aria-label="بداية عين سين"
    >
      {failed ? (
        <span aria-hidden="true" />
      ) : (
        <img
          src={
            kind === "intro"
              ? new URL("../icon-animation.png", import.meta.url).href
              : new URL("../wordmark-animation.png", import.meta.url).href
          }
          alt="عين سين"
          loading="eager"
          onLoad={() => setReady(true)}
          onError={() => {
            setFailed(true);
            endRef.current();
          }}
          style={{ animationPlayState: ready ? "running" : "paused" }}
        />
      )}
      {kind === "turn" && ready && (
        <div className={`turn-title ${color}`}>
          <small>الدور الآن</small>
          <h1>{name}</h1>
        </div>
      )}
    </div>
  );
}
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = roomJoinUrl(location.href, code);
  const qr = useMemo(
    () => createQR(url, { errorCorrectionLevel: "M" }).modules,
    [url],
  );
  const path = useMemo(() => {
    let value = "";
    for (let row = 0; row < qr.size; row++)
      for (let col = 0; col < qr.size; col++)
        if (qr.get(row, col)) value += `M${col + 4},${row + 4}h1v1h-1z`;
    return value;
  }, [qr]);
  return (
    <section className="room-code">
      <span>امسح الرمز للانضمام واكتب اسمك فقط</span>
      <a href={url} className="room-qr" aria-label="رابط الانضمام إلى الغرفة">
        <svg
          role="img"
          aria-label={`QR للانضمام إلى الغرفة ${code}`}
          viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`}
          shapeRendering="crispEdges"
        >
          <rect width="100%" height="100%" fill="white" />
          <path d={path} fill="#102039" />
        </svg>
      </a>
      <span>أو أدخل رمز الغرفة يدويًا</span>
      <strong dir="ltr">{code}</strong>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "تم نسخ الرمز" : "نسخ الرمز"}
      </button>
      <p>يدخل المشاركون بالرمز وأسمائهم، ثم يختار المقدم القائدين.</p>
    </section>
  );
}
function LobbyMembers({
  room,
  host,
  send,
}: {
  room: RoomView;
  host: boolean;
  send: (action: RoomCommand) => void;
}) {
  return (
    <section className="lobby-members">
      <h2>المشاركون ({room.participants.length})</h2>
      {!room.participants.length && <p>بانتظار دخول المشاركين بالرمز…</p>}
      {room.participants.map((p) => (
        <div
          key={p.id}
          className={`member-row ${p.role !== "viewer" ? p.role : ""}`}
        >
          <div>
            <b>{p.name}</b>
            <small>
              {p.connected ? "متصل" : "غير متصل"} ·{" "}
              {p.role === "red"
                ? "قائد الأحمر"
                : p.role === "blue"
                  ? "قائد الأزرق"
                  : "مشارك"}
            </small>
          </div>
          {host && room.mode === "phones" && (
            <div>
              {(["red", "blue"] as const).map((team) => (
                <button
                  key={team}
                  className={team}
                  disabled={p.role === team || room.hostTeam === team}
                  onClick={() =>
                    send({ type: "ASSIGN_CAPTAIN", team, memberId: p.id })
                  }
                >
                  {team === "red" ? "قائد الأحمر" : "قائد الأزرق"}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
export default function RemoteApp() {
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    try {
      localStorage.setItem("ain-reduced-motion", String(reducedMotion));
    } catch {
      /* Optional storage. */
    }
    if (reducedMotion) setIntro(false);
  }, [reducedMotion]);
  const { base, ready: serviceReady } = useServiceUrl();
  const [route, setRoute] = useState(location.hash);
  const [intro, setIntro] = useState(true);
  const [names, setNames] = useState<[string, string]>([
    "الفريق الأحمر",
    "الفريق الأزرق",
  ]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("phones");
  const [join, setJoin] = useState(() => readJoinCode(location.hash));
  const [joinName, setJoinName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const listen = () => setRoute(location.hash);
    window.addEventListener("hashchange", listen);

    return () => window.removeEventListener("hashchange", listen);
  }, []);
  const params = new URLSearchParams(route.slice(1));
  const code = params.get("room") || "";
  const invitedCode = readJoinCode(route);
  useEffect(() => {
    if (invitedCode) setJoin(invitedCode);
  }, [invitedCode]);
  const key =
    params.get("key") || sessionStorage.getItem(`ain-session-${code}`) || "";
  useEffect(() => {
    if (code && params.get("key")) {
      sessionStorage.setItem(`ain-session-${code}`, key);
      history.replaceState(null, "", `${location.pathname}#room=${code}`);
    }
  }, [code, key]);
  const joinRoom = async () => {
    try {
      setCreating(true);
      const data = await api<{ key: string }>(base, `/rooms/${join}/join`, {
        method: "POST",
        body: JSON.stringify({ name: joinName }),
      });
      location.hash = `room=${join}&key=${data.key}`;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };
  const create = async () => {
    try {
      setCreating(true);
      const data = await api<{ code: string; keys: Record<string, string> }>(
        base,
        "/rooms",
        { method: "POST", body: JSON.stringify({ names, mode, categoryIds }) },
      );

      location.hash = `room=${data.code}&key=${data.keys.host}`;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };
  return (
    <ReducedMotion.Provider value={reducedMotion}>
      <header>
        <a href="#">
          <img src={wordmark} alt="عين سين" />
        </a>
        <nav>
          <button
            type="button"
            aria-pressed={reducedMotion}
            onClick={() => setReducedMotion(!reducedMotion)}
          >
            {reducedMotion ? "الحركات: متوقفة" : "إيقاف الحركات والأنيميشن"}
          </button>
          <a href="./admin.html">بوابة الأسئلة</a>
          <span className="pill">مسابقة • تشاور • خطف</span>
        </nav>
      </header>
      {route === "#admin" ? (
        <Admin base={base} />
      ) : invitedCode ? (
        <main className="panel join-panel">
          <h1>انضم للغرفة</h1>
          <p>
            رمز الغرفة: <b dir="ltr">{invitedCode}</b>
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void joinRoom();
            }}
          >
            <label htmlFor="invited-name">اسمك</label>
            <input
              id="invited-name"
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              maxLength={32}
              autoComplete="nickname"
              required
              placeholder="اكتب اسمك"
            />
            <button
              className="primary"
              disabled={!serviceReady || creating || !joinName.trim()}
              type="submit"
            >
              {creating ? "جارٍ الانضمام…" : "انضم للغرفة"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <a href="#">الدخول برمز آخر</a>
        </main>
      ) : code ? (
        <Room base={base} code={code} sessionKey={key} />
      ) : (
        <main className="setup">
          <section className="hero">
            <span className="pill">فريقان، مقدم واحد، والتحدي لكم</span>
            <h1>
              عين على السؤال،
              <br />
              <em>وسين على الفوز.</em>
            </h1>
            <p>
              ١٨ فرصة تقلب النتيجة. تشاوروا، خلّوا القرار للقائد، وخلكم جاهزين
              للخطف.
            </p>
            <img className="hero-icon" src={icon} alt="أيقونة اللعبة" />
          </section>
          <section className="panel">
            <h2>جهّز القيم</h2>
            <label>
              الفريق الأحمر
              <input
                maxLength={32}
                value={names[0]}
                onChange={(e) => setNames([e.target.value, names[1]])}
              />
            </label>
            <label>
              الفريق الأزرق
              <input
                maxLength={32}
                value={names[1]}
                onChange={(e) => setNames([names[0], e.target.value])}
              />
            </label>
            <label>
              طريقة اللعب
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="phones">جوال لكل قائد + مقدم</option>
                <option value="single">شاشة واحدة مع مقدم</option>
              </select>
            </label>
            <p>اختر ٦ فئات من القائمة أدناه ثم أنشئ الجلسة.</p>
            <button
              className="primary"
              disabled={creating || !serviceReady || categoryIds.length !== 6}
              onClick={() => void create()}
            >
              {creating ? "نجهز الغرفة…" : "أنشئ جلسة ←"}
            </button>
            <hr />
            <h3>انضم للجلسة</h3>
            <input
              aria-label="اسم المشارك"
              placeholder="اسمك"
              maxLength={32}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
            />
            <input
              aria-label="رمز الغرفة"
              placeholder="رمز الغرفة"
              value={join}
              onChange={(e) =>
                setJoin(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 8),
                )
              }
            />
            <button
              disabled={
                join.length !== 8 ||
                !joinName.trim() ||
                creating ||
                !serviceReady
              }
              onClick={() => {
                void joinRoom();
              }}
            >
              انضم بالرمز
            </button>
            <button
              disabled={join.length !== 8}
              onClick={() => {
                location.hash = `room=${join}`;
              }}
            >
              فتح شاشة العرض
            </button>
            <button
              className="replay-intro"
              disabled={reducedMotion}
              onClick={() => setIntro(true)}
            >
              إعادة عرض البداية
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
          <CategoryPicker
            value={categoryIds}
            onChange={setCategoryIds}
            disabled={creating}
          >
            <button
              className="primary"
              disabled={creating || !serviceReady || categoryIds.length !== 6}
              onClick={() => void create()}
            >
              {creating ? "نجهز الغرفة…" : "أنشئ الجلسة بالفئات المختارة ←"}
            </button>
          </CategoryPicker>
        </main>
      )}
      <footer>عين سين · القرار للقائد، والمتعة للجميع.</footer>
      {intro && !reducedMotion && (
        <Animation kind="intro" onEnd={() => setIntro(false)} />
      )}
    </ReducedMotion.Provider>
  );
}
function Room({
  base,
  code,
  sessionKey,
}: {
  base: string;
  code: string;
  sessionKey: string;
}) {
  const reducedMotion = useContext(ReducedMotion);
  const {
    room: r,
    connected,
    error,
    send,
    remaining,
  } = useRoom(base, code, sessionKey);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{
    phase: string;
    round: number;
  } | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<string[] | null>(null);
  const [hideHost, setHideHost] = useState(false);
  const s = r?.game;
  const host = r?.role === "host";
  useEffect(() => {
    if (!s) return;
    setSelected(null);
    if (reducedMotion) {
      setAnimation(null);
      setPrevious({ phase: s.phase, round: s.round });
      return;
    }
    if (previous) {
      if (
        s.phase === "BOARD" &&
        (previous.phase !== "BOARD" || previous.round !== s.round)
      )
        setAnimation("turn");
      if (s.phase === "FINISHED" && previous.phase !== "FINISHED")
        setAnimation("end");
    } else if (s.phase === "BOARD") setAnimation("match");
    setPrevious({ phase: s.phase, round: s.round });
  }, [s?.phase, s?.round, reducedMotion]);
  useEffect(() => setSelected(null), [s?.current?.id]);
  if (!r)
    return (
      <main className="panel">
        <h2>نتصل بالغرفة…</h2>
        {error && <p role="alert">{error}</p>}
        <a href="#">الرجوع</a>
      </main>
    );
  const can = (team: TeamId) =>
    connected &&
    !r.paused &&
    (r.mode === "single"
      ? host
      : r.role === team || (host && r.hostTeam === team));
  const command = (a: RoomCommand) => {
    if (connected) void send(a);
  };
  const visibleHost = host && !hideHost;
  const chosen = categoryDraft ?? r.categoryIds;
  const categoriesDirty =
    JSON.stringify(chosen) !== JSON.stringify(r.categoryIds);
  return (
    <main>
      <div className="toolbar">
        <span className={`pill ${connected ? "online" : "offline"}`}>
          {connected ? "متصل" : "إعادة اتصال"} · غرفة {code}
        </span>
        <b>
          {host
            ? "المقدم"
            : r.role === "viewer"
              ? "مشاهدة فقط"
              : `قائد ${r.names[r.role === "red" ? 0 : 1]}`}
        </b>
        {host && (
          <button onClick={() => setHideHost(!hideHost)}>
            {hideHost ? "لوحة المشرف (Admin)" : "إخفاء أدوات المشرف"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(host || r.role === "viewer") && (
        <details className="room-invite" open={!s}>
          <summary>دعوة المشاركين — QR ورمز الغرفة</summary>
          <RoomCode code={code} />
        </details>
      )}
      {!s && host && (
        <>
          <section className="panel">
            <h2>إعدادات المباراة</h2>
            <TurnDuration
              value={r.turnSeconds ?? 20}
              disabled={!connected}
              onChange={(seconds) => {
                if (seconds !== (r.turnSeconds ?? 20))
                  command({ type: "SET_TURN_SECONDS", seconds });
              }}
            />
            <p>مدة الخطف والفاصل تبقى كما هي.</p>
          </section>
          <CategoryPicker
            value={chosen}
            onChange={setCategoryDraft}
            disabled={!connected}
          />
          <div className="toolbar">
            <button
              disabled={!connected || chosen.length !== 6 || !categoriesDirty}
              onClick={() => {
                command({ type: "SET_CATEGORIES", categoryIds: chosen });
              }}
            >
              اعتمد الفئات
            </button>
            {categoriesDirty && <p>اعتمد اختيار الفئات قبل بدء المباراة.</p>}
          </div>
        </>
      )}
      {!s && !host && (
        <section className="panel">
          <h2>فئات المباراة · ١٨ سؤالًا</h2>
          <p>
            مدة الدور: {(r.turnSeconds ?? 20).toLocaleString("ar-SA")} ثانية
          </p>
          <div className="selected-categories">
            {r.categoryIds.map((id) => {
              const c = categories.find((c) => c.id === id)!;
              return (
                <span key={id}>
                  <img src={c.icon} alt="" width="50" height="50" />
                  {c.name}
                </span>
              );
            })}
          </div>
        </section>
      )}
      {!s && host && (
        <section className="panel host-player">
          <h2>مشاركة المقدم</h2>
          <label htmlFor="host-team">هل تشارك كلاعب؟</label>
          <select
            id="host-team"
            value={r.hostTeam ?? ""}
            disabled={!connected}
            onChange={(event) =>
              command({
                type: "SET_HOST_TEAM",
                team: (event.target.value || null) as TeamId | null,
              })
            }
          >
            <option value="">مقدم فقط</option>
            <option value="red">مقدم وقائد {r.names[0]}</option>
            <option value="blue">مقدم وقائد {r.names[1]}</option>
          </select>
          <p>
            تحتفظ بأدوات التقديم. عند المشاركة تُخفى عنك الإجابة الصحيحة حتى
            انتهاء السؤال، ويُثبت اختيارك عند بداية المباراة.
          </p>
        </section>
      )}
      {r.hostTeam && (
        <p className={`pill ${r.hostTeam}`}>
          المقدم مشارك وقائد {r.names[r.hostTeam === "red" ? 0 : 1]}
        </p>
      )}
      {!s ? (
        <section className="panel">
          <h1>التحدي على وشك يبدأ</h1>
          <p>{r.names.join(" × ")}</p>
          <div className="scores">
            {(["red", "blue"] as const).map((team, i) => (
              <div className={`score ${team}`} key={team}>
                <b>{r.names[i]}</b>
                <span>
                  {r.presence[team] ? "القائد متصل" : "بانتظار القائد"}
                </span>
              </div>
            ))}
          </div>
          <LobbyMembers
            room={r}
            host={Boolean(host && connected)}
            send={command}
          />
          {host && (
            <>
              <p>
                المقدم حاضر دائمًا. في وضع الجوالات يلزم اتصال القائدين قبل
                البداية.
              </p>
              <button
                className="primary"
                disabled={
                  !connected ||
                  categoriesDirty ||
                  chosen.length !== 6 ||
                  (r.mode === "phones" && (!r.presence.red || !r.presence.blue))
                }
                onClick={() => command({ type: "START" })}
              >
                ابدأ المباراة
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="scores">
            {(["red", "blue"] as const).map((team) => (
              <section
                className={`score ${team} ${s.turn === team ? "current" : ""}`}
                key={team}
              >
                <span>{s.teams[team].name}</span>
                <strong key={s.teams[team].score}>
                  {s.teams[team].score.toLocaleString("ar-SA")}
                </strong>
                <small>
                  {r.mode === "phones"
                    ? r.presence[team]
                      ? "القائد متصل"
                      : "القائد غير متصل"
                    : "جلسة شاشة واحدة"}
                </small>
              </section>
            ))}
          </div>
          <div className="toolbar">
            <span>
              {s.cells.filter((c) => c.status === "exhausted").length} / ١٨
            </span>
            <b>
              {s.phase === "BOARD"
                ? `الدور على ${s.teams[s.turn].name}`
                : s.result || "عينك على السؤال"}
            </b>
            {visibleHost && (
              <>
                <button
                  disabled={
                    !connected || !["BOARD", "RESOLUTION"].includes(s.phase)
                  }
                  onClick={() => command({ type: "PAUSE", paused: !r.paused })}
                >
                  {r.paused ? "استئناف" : "إيقاف بين الجولات"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("إنهاء المباراة دون إعلان فائز؟"))
                      command({ type: "END_MATCH" });
                  }}
                >
                  إنهاء
                </button>
              </>
            )}
          </div>
          {r.paused && (
            <p className="panel">استراحة قصيرة — المقدم يستأنف القيم.</p>
          )}
          {s.phase === "BOARD" ? (
            <section className="board">
              {[...new Set(s.cells.map((c) => c.category))].map(
                (category, i) => (
                  <article className={`category tint-${i % 4}`} key={category}>
                    <h3>
                      <img
                        src={categoryFor(category)?.icon}
                        alt=""
                        width="90"
                        height="90"
                      />
                      {category}
                    </h3>
                    {s.cells
                      .filter((c) => c.category === category)
                      .map((cell) => (
                        <button
                          key={cell.id}
                          disabled={!can(s.turn) || cell.status !== "available"}
                          onClick={() =>
                            command({
                              type: "SELECT_CELL",
                              team: s.turn,
                              cellId: cell.id,
                            })
                          }
                        >
                          {cell.status === "exhausted"
                            ? "✓"
                            : cell.points.toLocaleString("ar-SA")}
                        </button>
                      ))}
                  </article>
                ),
              )}
            </section>
          ) : s.phase === "FINISHED" ? (
            <section className="panel finish">
              <span className="pill">ختام القيم</span>
              <h1>
                {s.winner
                  ? `الفائز: ${s.teams[s.winner].name}`
                  : "انتهت المباراة"}
              </h1>
              <p>{s.result}</p>
              {(["red", "blue"] as TeamId[])
                .sort((a, b) => s.teams[b].score - s.teams[a].score)
                .map((team) => (
                  <div className={`final-row ${team}`} key={team}>
                    <b>{s.teams[team].name}</b>
                    <strong>
                      {s.teams[team].score.toLocaleString("ar-SA")} نقطة
                    </strong>
                  </div>
                ))}
              <a href="#">جلسة جديدة</a>
            </section>
          ) : (
            <section className="question panel">
              <div className="question-top">
                <span className="pill">
                  {s.current?.category || "سؤال التحدي"}
                </span>
                <span className="pill">
                  {s.double
                    ? "عين التحدي × ٢"
                    : s.current?.points
                      ? `${s.current.points} نقطة`
                      : "قبل الكشف"}
                </span>
              </div>
              {s.phase === "PREPARE" ? (
                <div className="prepare">
                  <h1>جاهزين للتحدي؟</h1>
                  <p>قرار عين التحدي قبل ما ينكشف السؤال.</p>
                  <button
                    disabled={!can(s.turn) || s.teams[s.turn].doubleUsed}
                    onClick={() =>
                      command({ type: "TRIGGER_DOUBLE_DOWN", team: s.turn })
                    }
                  >
                    {s.double
                      ? "عين التحدي مفعّلة"
                      : s.teams[s.turn].doubleUsed
                        ? "عين التحدي مستهلكة"
                        : "فعّل عين التحدي × ٢"}
                  </button>
                  {visibleHost && (
                    <>
                      <p>انتظر قرار القائد ثم اكشف السؤال.</p>
                      <button
                        className="primary"
                        disabled={!connected || r.paused}
                        onClick={() => command({ type: "REVEAL_QUESTION" })}
                      >
                        اكشف السؤال وابدأ الوقت
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <h2>{s.current?.question}</h2>
                  {s.deadline !== null && (
                    <div
                      className={`timer ${remaining < 5000 ? "urgent" : ""}`}
                    >
                      <strong>
                        {Math.ceil(remaining / 1000).toLocaleString("ar-SA")}
                      </strong>
                      <div className="track">
                        <i
                          style={{
                            width: `${Math.min(100, (remaining / (s.phase === "MAIN" ? (s.turnSeconds ?? 20) * 1000 : s.phase === "SUDDEN_ANSWER" ? 5000 : 7000)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {s.phase === "STEAL_BUZZ"
                          ? "انتظار بزر الخطف"
                          : s.answerTeam
                            ? `إجابة ${s.teams[s.answerTeam].name}`
                            : ""}
                      </small>
                    </div>
                  )}
                  <div className="options">
                    {s.current?.options.map((option, index) => (
                      <button
                        key={index}
                        style={{
                          visibility: s.hidden.includes(index)
                            ? "hidden"
                            : "visible",
                        }}
                        className={`${selected === index ? "selected" : ""} ${["RESOLUTION", "FINISHED"].includes(s.phase) && option === s.current?.answer ? "correct" : ""}`}
                        disabled={
                          !s.answerTeam ||
                          !can(s.answerTeam) ||
                          !["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(
                            s.phase,
                          ) ||
                          s.hidden.includes(index)
                        }
                        onClick={() => setSelected(index)}
                      >
                        <span>{["أ", "ب", "ج", "د"][index]}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                  {s.answerTeam &&
                    can(s.answerTeam) &&
                    ["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(
                      s.phase,
                    ) && (
                      <button
                        className="primary answer-submit"
                        disabled={selected === null}
                        onClick={() => {
                          if (selected !== null)
                            command({
                              type: "SUBMIT_ANSWER",
                              team: s.answerTeam!,
                              index: selected,
                            });
                        }}
                      >
                        اعتماد الإجابة
                      </button>
                    )}
                  {visibleHost &&
                    s.current?.hint &&
                    s.phase !== "RESOLUTION" && (
                      <details>
                        <summary>تلميح للمقدم</summary>
                        {s.current.hint}
                      </details>
                    )}
                  {s.phase === "STEAL_BUZZ" && (
                    <div className="steal">
                      <h2>فرصة الخطف!</h2>
                      <button
                        className={`buzzer ${other(s.turn)}`}
                        disabled={!can(other(s.turn))}
                        onClick={() =>
                          command({ type: "BUZZ_STEAL", team: other(s.turn) })
                        }
                      >
                        بزر {s.teams[other(s.turn)].name}
                      </button>
                    </div>
                  )}
                  {s.phase === "SUDDEN_BUZZ" && (
                    <div className="steal">
                      <h2>مخمخ وفاصل</h2>
                      {(["red", "blue"] as const).map((team) => (
                        <button
                          key={team}
                          className={`buzzer ${team}`}
                          disabled={!can(team)}
                          onClick={() => command({ type: "BUZZ_SUDDEN", team })}
                        >
                          {s.teams[team].name}
                        </button>
                      ))}
                    </div>
                  )}
                  {s.phase === "RESOLUTION" && (
                    <div className="resolution">
                      <h2>{s.result}</h2>
                      <b>الإجابة: {s.current?.answer}</b>
                      <p>{s.current?.hint}</p>
                      {visibleHost && (
                        <button
                          className="primary"
                          disabled={!connected || r.paused}
                          onClick={() => command({ type: "RESOLVE_ROUND" })}
                        >
                          التالي ←
                        </button>
                      )}
                    </div>
                  )}
                  {s.phase === "MAIN" && (
                    <div className="trays">
                      {(["red", "blue"] as const).map((team) => (
                        <div className={`tray ${team}`} key={team}>
                          <b>{s.teams[team].name}</b>
                          {(["FREEZE", "SWAP", "FIFTY_FIFTY"] as const).map(
                            (card) => (
                              <button
                                key={card}
                                disabled={
                                  !can(team) ||
                                  !s.teams[team].inventory.includes(card) ||
                                  (card === "FREEZE"
                                    ? team === s.turn
                                    : team !== s.turn)
                                }
                                onClick={() =>
                                  command({ type: "USE_JOKER", team, card })
                                }
                              >
                                {cardNames[card]}
                                {!s.teams[team].inventory.includes(card) &&
                                  " ✓"}
                              </button>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {visibleHost &&
                    s.current?.answer &&
                    s.phase !== "RESOLUTION" && (
                      <details>
                        <summary>للمقدم فقط: الإجابة الصحيحة</summary>
                        {s.current.answer}
                      </details>
                    )}
                </>
              )}
            </section>
          )}
          {visibleHost && (
            <>
              <details className="audit">
                <summary>سجل النقاط</summary>
                {s.audit.map((a, i) => (
                  <p key={i}>
                    الجولة {a.round} · {s.teams[a.team].name} · {a.reason} ·{" "}
                    {a.delta > 0 ? "+" : ""}
                    {a.delta} ← {a.after}
                  </p>
                ))}
              </details>
            </>
          )}
        </>
      )}
      {animation && s && !reducedMotion && (
        <Animation
          kind={animation}
          name={s.teams[s.turn].name}
          color={s.turn}
          onEnd={() => setAnimation(null)}
        />
      )}
    </main>
  );
}
