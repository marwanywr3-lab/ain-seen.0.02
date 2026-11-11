import { useCallback, useEffect, useRef, useState } from "react";
import { transition, type GameAction, type GameState } from "./engine";
export function useAinSeenEngine() {
  const [state, setState] = useState<GameState | null>(null);
  const ref = useRef(state);
  const [now, setNow] = useState(performance.now());
  const dispatch = useCallback((action: GameAction) => {
    const current = ref.current;
    if (!current) return;
    const next = transition(current, action, performance.now());
    ref.current = next;
    setState(next);
  }, []);
  const start = useCallback((game: GameState) => {
    ref.current = game;
    setState(game);
  }, []);
  const reset = useCallback(() => {
    ref.current = null;
    setState(null);
  }, []);
  useEffect(() => {
    const tick = () => {
      const time = performance.now();
      setNow(time);
      const current = ref.current;
      if (
        current?.deadline !== null &&
        current?.deadline !== undefined &&
        time >= current.deadline
      )
        dispatch({ type: "EXPIRE_TIMER", timerId: current.timerId });
    };
    const timer = window.setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [dispatch]);
  return {
    state,
    start,
    reset,
    dispatch,
    remaining:
      state?.deadline === null
        ? 0
        : Math.max(0, (state?.deadline ?? now) - now),
  };
}
