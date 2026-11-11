import { selection } from "./catalog.ts";
import type { GameState, Question, TeamId, GameAction } from "./engine.ts";
export type Role = "host" | "red" | "blue" | "viewer";
export type Mode = "single" | "phones";
export type PublicQuestion = Omit<Question, "answer" | "hint"> &
  Partial<Pick<Question, "answer" | "hint">>;
export type PublicGame = Omit<
  GameState,
  "cells" | "current" | "sudden" | "seed"
> & {
  cells: {
    id: string;
    category: string;
    points: 200 | 400 | 600;
    status: "available" | "active" | "exhausted";
  }[];
  current: PublicQuestion | null;
};
export interface ParticipantView {
  id: string;
  name: string;
  role: "red" | "blue" | "viewer";
  connected: boolean;
}
export interface RoomView {
  turnSeconds?: number;
  categoryIds: string[];
  hostTeam: TeamId | null;
  participants: ParticipantView[];
  code: string;
  revision: number;
  mode: Mode;
  role: Role;
  names: [string, string];
  game: PublicGame | null;
  paused: boolean;
  serverTime: number;
  presence: Record<Role, number>;
}
export type RoomCommand =
  | { type: "SET_TURN_SECONDS"; seconds: number }
  | { type: "START" }
  | { type: "SET_CATEGORIES"; categoryIds: string[] }
  | { type: "SET_HOST_TEAM"; team: TeamId | null }
  | { type: "ASSIGN_CAPTAIN"; team: TeamId; memberId: string }
  | { type: "PAUSE"; paused: boolean }
  | GameAction;
export function allowed(
  role: Role,
  mode: Mode,
  command: RoomCommand,
  hostTeam: TeamId | null = null,
): boolean {
  if (role === "viewer") return false;
  if (
    [
      "START",
      "SET_TURN_SECONDS",
      "SET_CATEGORIES",
      "SET_HOST_TEAM",
      "ASSIGN_CAPTAIN",
      "PAUSE",
      "REVEAL_QUESTION",
      "RESOLVE_ROUND",
      "END_MATCH",
    ].includes(command.type)
  )
    return role === "host";
  if (command.type === "EXPIRE_TIMER") return false;
  if ("team" in command)
    return mode === "single"
      ? role === "host"
      : role === command.team || (role === "host" && hostTeam === command.team);
  return false;
}
export function project(
  game: GameState | null,
  role: Role,
  hostTeam: TeamId | null = null,
): PublicGame | null {
  if (!game) return null;
  const { cells, current, sudden: _sudden, seed: _seed, ...rest } = game;
  const reveal =
    (role === "host" && !hostTeam) ||
    game.phase === "RESOLUTION" ||
    game.phase === "FINISHED";
  let question: PublicQuestion | null = null;
  if (current && (game.phase !== "PREPARE" || (role === "host" && !hostTeam))) {
    const { answer, hint, ...safe } = current;
    question = reveal ? { ...safe, answer, hint } : safe;
  }
  return {
    ...rest,
    cells: cells.map(({ id, category, points, status }) => ({
      id,
      category,
      points,
      status,
    })),
    current: question,
  };
}
export function validCommand(v: unknown): v is RoomCommand {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  const team = a.team === "red" || a.team === "blue";
  switch (a.type) {
    case "SET_TURN_SECONDS":
      return (
        Number.isInteger(a.seconds) &&
        Number(a.seconds) >= 20 &&
        Number(a.seconds) <= 120
      );
    case "SET_CATEGORIES":
      try {
        selection(a.categoryIds);
        return true;
      } catch {
        return false;
      }
    case "START":
    case "REVEAL_QUESTION":
    case "RESOLVE_ROUND":
    case "END_MATCH":
      return true;
    case "SET_HOST_TEAM":
      return team || a.team === null;
    case "ASSIGN_CAPTAIN":
      return team && typeof a.memberId === "string" && a.memberId.length <= 80;
    case "PAUSE":
      return typeof a.paused === "boolean";
    case "SELECT_CELL":
      return team && typeof a.cellId === "string" && a.cellId.length < 200;
    case "TRIGGER_DOUBLE_DOWN":
    case "BUZZ_STEAL":
    case "BUZZ_SUDDEN":
      return team;
    case "SUBMIT_ANSWER":
      return (
        team &&
        Number.isInteger(a.index) &&
        Number(a.index) >= 0 &&
        Number(a.index) <= 3
      );
    case "USE_JOKER":
      return team && ["FREEZE", "SWAP", "FIFTY_FIFTY"].includes(String(a.card));
    default:
      return false;
  }
}
export const teamIds: TeamId[] = ["red", "blue"];
