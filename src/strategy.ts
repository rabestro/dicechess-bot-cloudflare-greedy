// The move-choosing brain: the engine's unmodified built-in `greedy` search — no opening book, no
// tuning, no swapping. This bot exists to BE a fixed rating anchor, not to win: `greedy` is
// deterministic, versioned engine code (not a trained weights file that can be silently
// retrained or lost), so its strength is as close to a permanent zero-point on the ladder as this
// ecosystem can produce. Do not change ALGORITHM or add a book here — an "improved" anchor is not
// an anchor. If you want a stronger showcase bot, build a new one; leave this alone.
import * as engine from '@rabestro/dicechess-engine';

const ALGORITHM = 'greedy';

/** DFEN in, the turn's UCI micro-moves out. `[]` = pass (no legal move; the server auto-passes). */
export function chooseMoves(dfen: string): string[] {
  const result = engine.getBestMove(dfen, { algorithm: ALGORITHM });
  const moves = result?.moves ?? [];
  return moves.map((m) => m.from + m.to + (m.promotion ?? ''));
}
