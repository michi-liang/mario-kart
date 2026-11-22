export const playerColors = ['#67d9ff', '#ff8877', '#a9ed79', '#dcacff'];

// Each driver has its own silhouette, helmet, suit, and kart paint.
export const roster = [
  { name: 'Sol', shape: 'sun', helmet: '#ffc35a', suit: '#7055a0', kart: '#45b7aa', ink: '#784d24' },
  { name: 'Juno', shape: 'fox', helmet: '#f48955', suit: '#f4d2a1', kart: '#e47462', ink: '#80442f' },
  { name: 'Moss', shape: 'sprout', helmet: '#a5db76', suit: '#437b60', kart: '#83a94c', ink: '#396646' },
  { name: 'Bolt', shape: 'robot', helmet: '#9edff5', suit: '#47588e', kart: '#539bd7', ink: '#345378' },
  { name: 'Pip', shape: 'bird', helmet: '#ffd879', suit: '#ed8b65', kart: '#e6a248', ink: '#97592b' },
  { name: 'Nori', shape: 'cat', helmet: '#ababef', suit: '#5b507f', kart: '#947bd9', ink: '#4c4075' },
  { name: 'Pebble', shape: 'geode', helmet: '#deaebf', suit: '#705d91', kart: '#b17faa', ink: '#75516d' },
  { name: 'Fin', shape: 'shark', helmet: '#77aedd', suit: '#375e75', kart: '#437fcb', ink: '#365786' },
  { name: 'Clover', shape: 'hare', helmet: '#efb4ce', suit: '#924a85', kart: '#d569a0', ink: '#824661' },
  { name: 'Ember', shape: 'dragon', helmet: '#ee796c', suit: '#7f445d', kart: '#dd514d', ink: '#87453e' },
  { name: 'Orbit', shape: 'space', helmet: '#b8d0d9', suit: '#557d86', kart: '#72b3c1', ink: '#496479' },
  { name: 'Tuck', shape: 'bear', helmet: '#d5a879', suit: '#71604c', kart: '#b98f55', ink: '#78533c' },
  { name: 'Dart', shape: 'frog', helmet: '#a2db85', suit: '#4d8387', kart: '#81c65f', ink: '#496842' },
  { name: 'Quill', shape: 'crest', helmet: '#f0a777', suit: '#6f5280', kart: '#e07f50', ink: '#814a4f' },
  { name: 'Kite', shape: 'pilot', helmet: '#eee0a2', suit: '#7b6675', kart: '#d3aa59', ink: '#766044' },
  { name: 'Rook', shape: 'horn', helmet: '#bca6d7', suit: '#574770', kart: '#8c6aa8', ink: '#625279' },
];

export function headDetails(shape) {
  const pair = (x, y, radius, height) => [[-x, y, radius, height], [x, y, radius, height]];
  switch (shape) {
    case 'fox': case 'cat': return pair(0.28, 0.31, 0.12, 0.20);
    case 'hare': return pair(0.16, 0.45, 0.095, 0.31);
    case 'bear': case 'frog': return pair(0.30, 0.27, 0.14, 0.14);
    case 'dragon': case 'horn': return pair(0.27, 0.32, 0.095, 0.25);
    case 'robot': case 'space': return [[0, 0.43, 0.075, 0.21]];
    case 'geode': return [[-0.16, 0.36, 0.16, 0.18], [0.13, 0.32, 0.13, 0.16]];
    case 'shark': case 'crest': case 'sprout': return [[0, 0.38, 0.13, 0.23]];
    default: return pair(0.36, 0.03, 0.10, 0.14);
  }
}
