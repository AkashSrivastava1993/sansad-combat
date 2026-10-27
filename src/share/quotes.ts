const WINNER_QUOTES = [
  "I'd say good game, but I'd be lying. Good for me, anyway.",
  'That was less of a fight and more of a very aggressive nap for you.',
  'I blinked and you lost. Wild.',
  'Please keep your arms inside the ring during future defeats.',
  'I won with 50% skill and 50% pure confidence.',
  'Plot twist: the placeholder rectangle wins.',
  'Somewhere, a health bar is crying.',
  "I didn't hit you. The floor did.",
  'Tell them I was humble. Then tell them I was lying.',
  'Stay down. It is cozy down there.',
];

const DRAW_QUOTES = [
  'Nobody wins. Everybody sulks.',
  'A draw. The universe refuses to pick a favourite.',
  'Two rectangles entered. Two rectangles left, equally disappointed.',
  'Tie game. Call it mutual respect and mutual denial.',
];

const pick = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)]!;

export const randomWinnerQuote = (): string => pick(WINNER_QUOTES);
export const randomDrawQuote = (): string => pick(DRAW_QUOTES);
