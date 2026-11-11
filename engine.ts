import {
  categories as catalogCategories,
  POINTS,
  defaultCategories,
  selection,
} from "./catalog.ts";
export type TeamId = "red" | "blue";
export type JokerCard = "FREEZE" | "SWAP" | "FIFTY_FIFTY";
export type Phase =
  | "BOARD"
  | "PREPARE"
  | "MAIN"
  | "STEAL_BUZZ"
  | "STEAL_ANSWER"
  | "RESOLUTION"
  | "SUDDEN_BUZZ"
  | "SUDDEN_ANSWER"
  | "FINISHED";
export interface Question {
  id: number;
  category: string;
  categoryId: string;
  points: 200 | 400 | 600;
  difficulty: string;
  question: string;
  options: string[];
  answer: string;
  hint: string;
  sourcePoints?: number;
  sourceIndex?: number;
  hintSource?: string;
}
export interface Team {
  id: TeamId;
  name: string;
  score: number;
  inventory: JokerCard[];
  doubleUsed: boolean;
}
export interface ScoreAuditLog {
  round: number;
  team: TeamId;
  delta: number;
  before: number;
  after: number;
  reason: string;
}
export interface Cell {
  id: string;
  category: string;
  categoryId: string;
  points: 200 | 400 | 600;
  status: "available" | "active" | "exhausted";
  question: Question;
  fallback: Question;
}
export interface GameState {
  turnSeconds?: number;
  phase: Phase;
  teams: Record<TeamId, Team>;
  turn: TeamId;
  cells: Cell[];
  activeId: string | null;
  current: Question | null;
  sudden: Question;
  deadline: number | null;
  timerId: number;
  round: number;
  double: boolean;
  hidden: number[];
  audit: ScoreAuditLog[];
  winner: TeamId | null;
  result: string;
  seed: number;
  answerTeam: TeamId | null;
}
export type GameAction =
  | { type: "SELECT_CELL"; cellId: string; team: TeamId }
  | { type: "TRIGGER_DOUBLE_DOWN"; team: TeamId }
  | { type: "REVEAL_QUESTION" }
  | { type: "USE_JOKER"; team: TeamId; card: JokerCard }
  | { type: "SUBMIT_ANSWER"; team: TeamId; index: number }
  | { type: "EXPIRE_TIMER"; timerId: number }
  | { type: "BUZZ_STEAL"; team: TeamId }
  | { type: "BUZZ_SUDDEN"; team: TeamId }
  | { type: "RESOLVE_ROUND" }
  | { type: "END_MATCH" };
export const other = (team: TeamId): TeamId =>
  team === "red" ? "blue" : "red";
const cards: JokerCard[] = ["FREEZE", "SWAP", "FIFTY_FIFTY"];
export function parseQuestions(input: unknown): Question[] {
  if (!Array.isArray(input) || !input.length)
    throw Error("ملف الأسئلة يجب أن يحتوي مصفوفة غير فارغة");
  const ids = new Set<number>();
  return input.map((v: unknown) => {
    if (typeof v !== "object" || v === null) throw Error("سؤال غير صالح");
    const q = v as Record<string, unknown>;
    if (!Number.isInteger(q.id) || ids.has(q.id as number))
      throw Error("معرّف مكرر أو غير صالح");
    ids.add(q.id as number);
    for (const k of [
      "category",
      "categoryId",
      "difficulty",
      "question",
      "answer",
      "hint",
    ])
      if (typeof q[k] !== "string" || !(q[k] as string).trim())
        throw Error(`الحقل ${k} ناقص في السؤال ${q.id}`);
    if (
      ![200, 400, 600].includes(q.points as number) ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      q.options.some((x) => typeof x !== "string" || !x.trim()) ||
      new Set(q.options).size !== 4 ||
      q.options.filter((x) => x === q.answer).length !== 1
    )
      throw Error(`خيارات أو نقاط غير صالحة للسؤال ${q.id}`);
    if (
      !catalogCategories.some(
        (c) => c.id === q.categoryId && c.name === q.category,
      )
    )
      throw Error(`فئة غير معتمدة للسؤال ${q.id}`);
    return { ...q, options: [...q.options] } as unknown as Question;
  });
}
function random(seed: number) {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return next;
}
export function createGame(
  questions: Question[],
  names: [string, string],
  seed: number,
  categoryIds: string[] = defaultCategories,
  turnSeconds = 20,
): GameState {
  if (!Number.isInteger(turnSeconds) || turnSeconds < 20 || turnSeconds > 120)
    throw Error("مدة الدور يجب أن تكون من ٢٠ إلى ١٢٠ ثانية");
  const selected = selection(categoryIds);
  const categories = selected.map((id) =>
    catalogCategories.find((c) => c.id === id)!,
  );
  let cursor = seed >>> 0;
  const pick = (pool: Question[]) => {
    cursor = random(cursor);
    return pool[cursor % pool.length]!;
  };
  const riddles = questions.filter(
    (q) =>
      q.category.includes("ألغاز") &&
      questions.filter(
        (x) => x.category === q.category && x.points === q.points,
      ).length >= 3,
  );
  if (!riddles.length) throw Error("أسئلة مخمخ غير متوفرة");
  const sudden = pick(riddles);
  const cells: Cell[] = [];
  for (const category of categories)
    for (const points of POINTS) {
      const pool = questions.filter(
        (q) =>
          q.categoryId === category.id &&
          q.points === points &&
          q.id !== sudden.id,
      );
      if (pool.length < 2)
        throw Error(
          `نحتاج سؤالين على الأقل: ${category.name} / ${points} بعد حجز الفاصل`,
        );
      const question = pick(pool);
      const fallback = pick(pool.filter((q) => q.id !== question.id));
      cells.push({
        id: `${category.id}:${points}`,
        category: category.name,
        categoryId: category.id,
        points,
        status: "available",
        question,
        fallback,
      });
    }
  cursor = random(cursor);
  const team = (id: TeamId, name: string): Team => ({
    id,
    name: name.trim() || (id === "red" ? "الأحمر" : "الأزرق"),
    score: 0,
    inventory: [...cards],
    doubleUsed: false,
  });
  return {
    turnSeconds,
    phase: "BOARD",
    teams: { red: team("red", names[0]), blue: team("blue", names[1]) },
    turn: cursor % 2 ? "red" : "blue",
    cells,
    activeId: null,
    current: null,
    sudden,
    deadline: null,
    timerId: 0,
    round: 0,
    double: false,
    hidden: [],
    audit: [],
    winner: null,
    result: "",
    seed: cursor,
    answerTeam: null,
  };
}
export function transition(
  state: GameState,
  action: GameAction,
  now: number,
): GameState {
  if (!Number.isFinite(now)) return state;
  // Expiration wins at the deadline, including when a timer callback is delayed.
  if (
    state.deadline !== null &&
    now >= state.deadline &&
    action.type !== "EXPIRE_TIMER" &&
    action.type !== "END_MATCH"
  )
    return transition(
      state,
      { type: "EXPIRE_TIMER", timerId: state.timerId },
      now,
    );
  if (state.phase === "FINISHED") return state;
  let s = structuredClone(state);
  const timed = (phase: Phase, ms: number) => {
    s.phase = phase;
    s.deadline = now + ms;
    s.timerId++;
  };
  const stop = (phase: Phase) => {
    s.phase = phase;
    s.deadline = null;
    s.timerId++;
  };
  const score = (team: TeamId, delta: number, reason: string) => {
    const before = s.teams[team].score;
    s.teams[team].score += delta;
    s.audit.push({
      round: s.round,
      team,
      delta,
      before,
      after: s.teams[team].score,
      reason,
    });
  };
  const resolve = (text: string) => {
    stop("RESOLUTION");
    s.result = text;
  };
  const mainFailed = () => {
    if (s.double) score(s.turn, -2 * s.current!.points, "عقوبة عين التحدي");
    s.answerTeam = other(s.turn);
    timed("STEAL_BUZZ", 7000);
    s.result = "فرصة الخطف";
  };
  switch (action.type) {
    case "SELECT_CELL": {
      if (s.phase !== "BOARD" || action.team !== s.turn) return state;
      const cell = s.cells.find(
        (c) => c.id === action.cellId && c.status === "available",
      );
      if (!cell) return state;
      cell.status = "active";
      s.activeId = cell.id;
      s.current = cell.question;
      s.round++;
      s.double = false;
      s.hidden = [];
      s.result = "";
      s.answerTeam = s.turn;
      stop("PREPARE");
      break;
    }
    case "TRIGGER_DOUBLE_DOWN":
      if (
        s.phase !== "PREPARE" ||
        action.team !== s.turn ||
        s.teams[action.team].doubleUsed
      )
        return state;
      s.double = true;
      s.teams[action.team].doubleUsed = true;
      break;
    case "REVEAL_QUESTION":
      if (s.phase !== "PREPARE") return state;
      timed("MAIN", (s.turnSeconds ?? 20) * 1000);
      break;
    case "USE_JOKER": {
      if (
        s.phase !== "MAIN" ||
        !s.teams[action.team].inventory.includes(action.card)
      )
        return state;
      if (action.card === "FREEZE") {
        if (action.team === s.turn) return state;
        s.deadline = now + (s.deadline! - now) / 2;
        s.timerId++;
      } else {
        if (action.team !== s.turn) return state;
        if (action.card === "SWAP") {
          const cell = s.cells.find((c) => c.id === s.activeId)!;
          s.current = cell.fallback;
          s.hidden = [];
        } else {
          let pool = s
            .current!.options.map((_, i) => i)
            .filter((i) => s.current!.options[i] !== s.current!.answer);
          s.seed = random(s.seed);
          const first = pool.splice(s.seed % pool.length, 1)[0]!;
          s.seed = random(s.seed);
          s.hidden = [first, pool[s.seed % pool.length]!];
        }
      }
      s.teams[action.team].inventory = s.teams[action.team].inventory.filter(
        (c) => c !== action.card,
      );
      break;
    }
    case "SUBMIT_ANSWER": {
      if (
        !["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(s.phase) ||
        action.team !== s.answerTeam ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index > 3 ||
        s.hidden.includes(action.index)
      )
        return state;
      const correct = s.current!.options[action.index] === s.current!.answer;
      if (s.phase === "SUDDEN_ANSWER") {
        s.winner = correct ? action.team : other(action.team);
        stop("FINISHED");
        s.result = correct ? "إجابة الفاصل صحيحة" : "حُسم الفاصل للمنافس";
      } else if (s.phase === "MAIN") {
        if (correct) {
          score(s.turn, s.current!.points * (s.double ? 2 : 1), "إجابة صحيحة");
          resolve("إجابة صحيحة");
        } else mainFailed();
      } else {
        score(
          action.team,
          correct ? s.current!.points : -s.current!.points / 2,
          correct ? "خطف صحيح" : "عقوبة الخطف",
        );
        resolve(correct ? "خطف ناجح" : "إجابة الخطف خاطئة");
      }
      break;
    }
    case "BUZZ_STEAL":
      if (s.phase !== "STEAL_BUZZ" || action.team !== other(s.turn))
        return state;
      s.answerTeam = action.team;
      timed("STEAL_ANSWER", 7000);
      break;
    case "BUZZ_SUDDEN":
      if (s.phase !== "SUDDEN_BUZZ") return state;
      s.answerTeam = action.team;
      timed("SUDDEN_ANSWER", 5000);
      break;
    case "EXPIRE_TIMER":
      if (
        s.deadline === null ||
        now < s.deadline ||
        action.timerId !== s.timerId
      )
        return state;
      if (s.phase === "MAIN") mainFailed();
      else if (s.phase === "STEAL_BUZZ") resolve("انتهت فرصة الخطف");
      else if (s.phase === "STEAL_ANSWER") {
        score(s.answerTeam!, -s.current!.points / 2, "انتهاء وقت الخطف");
        resolve("انتهى وقت إجابة الخطف");
      } else if (s.phase === "SUDDEN_ANSWER") {
        s.winner = other(s.answerTeam!);
        stop("FINISHED");
        s.result = "انتهى وقت الفاصل";
      } else return state;
      break;
    case "RESOLVE_ROUND":
      if (s.phase !== "RESOLUTION") return state;
      s.cells.find((c) => c.id === s.activeId)!.status = "exhausted";
      s.hidden = [];
      s.current = null;
      s.activeId = null;
      s.answerTeam = null;
      if (s.cells.some((c) => c.status === "available")) {
        s.turn = other(s.turn);
        stop("BOARD");
      } else if (s.teams.red.score === s.teams.blue.score) {
        s.current = s.sudden;
        stop("SUDDEN_BUZZ");
      } else {
        s.winner = s.teams.red.score > s.teams.blue.score ? "red" : "blue";
        stop("FINISHED");
      }
      break;
    case "END_MATCH":
      stop("FINISHED");
      s.result = "أنهى المقدم المباراة";
      s.winner = null;
      break;
  }
  return s;
}
