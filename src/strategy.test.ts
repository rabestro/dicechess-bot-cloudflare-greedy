import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseMoves } from './strategy.ts';
import * as engine from '@rabestro/dicechess-engine';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

test('greedy returns a well-formed, engine-legal turn from a bare DFEN', () => {
  const dfen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 NBK';
  const moves = chooseMoves(dfen);

  assert.ok(moves.length > 0, 'the opening roll NBK must have at least one legal micro-move');
  for (const m of moves) assert.match(m, UCI, `"${m}" must be a UCI micro-move`);

  // Cross-check against the engine's own legal-move enumeration for this roll.
  const legal = new Set(engine.getLegalUciMoves(dfen));
  for (const m of moves) assert.ok(legal.has(m), `"${m}" must be one of the engine's legal micro-moves`);
});

test('a rolled position with no legal move yields an empty pass', () => {
  // Bare kings, a rook roll for White: no legal rook move exists → the engine passes.
  const moves = chooseMoves('4k3/8/8/8/8/8/8/4K3 w - - 0 1 R');
  assert.deepEqual(moves, []);
});

test('greedy grabs undefended material — the exact opposite of the arena-declined hang', () => {
  // White: Ra1, Kg1, pawns f2/g2/h2. Black: Rb8, Kg8, pawns f7/g7/h7, and a loose pawn on a7.
  // Only the rook die is usable, so a1a7 is the sole candidate to compare against staying home.
  const dfen = '1r4k1/p4ppp/8/8/8/8/5PPP/R5K1 w - - 0 1 R';
  const moves = chooseMoves(dfen);
  assert.deepEqual(moves, ['a1a7'], 'a fixed rating anchor must keep its known, unimproved behaviour');
});
