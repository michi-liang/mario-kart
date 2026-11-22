export const playerColors = ['#67d9ff', '#ff8877', '#a9ed79', '#dcacff'];

// Sixteen drivers with distinct silhouettes, paint and rear wings.
export const roster = [
  { name: 'Claude Opus 5.5', short: 'Claude', company: 'Anthropic', shape: 'beret', wing: 'slim',
    helmet: '#f1e6d6', suit: '#b5583a', kart: '#d97757', ink: '#5e2f1f', accent: '#f6dcc0', visor: '#2b1d17' },
  { name: 'GPT-6.2 Sol', short: 'GPT', company: 'OpenAI', shape: 'halo', wing: 'twin',
    helmet: '#eef2f0', suit: '#1d2422', kart: '#10a37f', ink: '#0b4a3a', accent: '#d8fff2', visor: '#13211d' },
  { name: 'Gemini 4 Argon', short: 'Gemini', company: 'Google DeepMind', shape: 'stalks', wing: 'wide',
    helmet: '#c9d4ff', suit: '#3a3f9e', kart: '#6f63ff', ink: '#25216b', accent: '#ffd25a', visor: '#1a1c55' },
  { name: 'Muse Spark', short: 'Muse', company: 'Meta', shape: 'trident', wing: 'tall',
    helmet: '#e1efff', suit: '#17409f', kart: '#1d8bff', ink: '#0e2a73', accent: '#9be7ff', visor: '#102357' },
  { name: 'Grok 4.7', short: 'Grok', company: 'xAI', shape: 'fins', wing: 'none',
    helmet: '#2a2c32', suit: '#9aa2ad', kart: '#33363d', ink: '#0d0e10', accent: '#e8ebef', visor: '#b9c4d0' },
  { name: 'Mistral Large 4', short: 'Mistral', company: 'Mistral AI', shape: 'dome', wing: 'tall',
    helmet: '#ffd34d', suit: '#c2410c', kart: '#ff5b1f', ink: '#6b2308', accent: '#ffe27a', visor: '#3a1b0c' },
  { name: 'DeepSeek V4-Pro', short: 'DeepSeek', company: 'DeepSeek', shape: 'crest', wing: 'slim',
    helmet: '#cdd8ff', suit: '#2b3fb0', kart: '#4d6bfe', ink: '#18246f', accent: '#8fa6ff', visor: '#0f1950' },
  { name: 'Qwen3.8-Max', short: 'Qwen', company: 'Alibaba Cloud', shape: 'crown', wing: 'wide',
    helmet: '#e2d9ff', suit: '#4b2a94', kart: '#8a4ee0', ink: '#2f1a63', accent: '#ff9a47', visor: '#231245' },
  { name: 'Kimi K3', short: 'Kimi', company: 'Moonshot AI', shape: 'moon', wing: 'twin',
    helmet: '#e6ecf7', suit: '#1e2f55', kart: '#2a4f9e', ink: '#0f1b38', accent: '#ffd86b', visor: '#0c1430' },
  { name: 'GLM-5.2', short: 'GLM', company: 'Z.ai (Zhipu)', shape: 'tower', wing: 'slim',
    helmet: '#e6f3ff', suit: '#3d5f86', kart: '#8fb3da', ink: '#223a58', accent: '#ffffff', visor: '#17304d' },
  { name: 'MAI-Thinking-1', short: 'MAI', company: 'Microsoft AI', shape: 'bulb', wing: 'wide',
    helmet: '#ffd9e9', suit: '#8f2a5a', kart: '#ee4f8c', ink: '#541533', accent: '#ffd25a', visor: '#3b0f26' },
  { name: 'Nova 2 Pro', short: 'Nova', company: 'Amazon', shape: 'pillbox', wing: 'tall',
    helmet: '#ffe0a3', suit: '#232f3e', kart: '#ffb020', ink: '#6a4300', accent: '#37c9ff', visor: '#1a222c' },
  { name: 'Nemotron 3 Ultra', short: 'Nemotron', company: 'NVIDIA', shape: 'comb', wing: 'twin',
    helmet: '#242a1b', suit: '#2e3b17', kart: '#76b900', ink: '#0a0d05', accent: '#c8ff4d', visor: '#9cff2e' },
  { name: 'Command A+', short: 'Command', company: 'Cohere', shape: 'horns', wing: 'none',
    helmet: '#e3f1ea', suit: '#245247', kart: '#2f7a66', ink: '#0f2a23', accent: '#ff8a6b', visor: '#0e2a24' },
  { name: 'MiniMax M3', short: 'MiniMax', company: 'MiniMax', shape: 'spires', wing: 'tall',
    helmet: '#ffd0d4', suit: '#8a1a2d', kart: '#f23d4f', ink: '#4c0b16', accent: '#ffd2a0', visor: '#32060e' },
  { name: 'Seed 2.1', short: 'Seed', company: 'ByteDance', shape: 'sprout', wing: 'wide',
    helmet: '#c9fff4', suit: '#0f5f5b', kart: '#16c6b4', ink: '#083533', accent: '#ffffff', visor: '#06302e' },
];

export function mix(from, to, amount) {
  const read = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const a = read(from);
  const b = read(to);
  return '#' + a.map((value, i) => Math.round(value + (b[i] - value) * amount)
    .toString(16).padStart(2, '0')).join('');
}

export function headDetails(shape) {
  const pair = (x, y, radius, height) => [[-x, y, radius, height], [x, y, radius, height]];
  switch (shape) {
    case 'beret': return [[0.05, 0.41, 0.31, 0.075]];
    case 'halo': return [[0, 0.58, 0.27, 0.04], [0, 0.47, 0.05, 0.12]];
    case 'stalks': return pair(0.20, 0.47, 0.06, 0.20);
    case 'trident': return [[0, 0.45, 0.07, 0.24], [-0.19, 0.39, 0.06, 0.17], [0.19, 0.39, 0.06, 0.17]];
    case 'fins': return pair(0.32, 0.14, 0.09, 0.27);
    case 'dome': return [[0, 0.42, 0.22, 0.17]];
    case 'crest': return [[0, 0.38, 0.13, 0.23]];
    case 'crown': return [[-0.17, 0.36, 0.13, 0.15], [0.17, 0.36, 0.13, 0.15], [0, 0.44, 0.14, 0.20]];
    case 'moon': return [[-0.10, 0.45, 0.18, 0.14], [0.13, 0.50, 0.10, 0.09]];
    case 'tower': return [[0, 0.46, 0.17, 0.26]];
    case 'bulb': return [[0, 0.53, 0.16, 0.16], [0, 0.36, 0.07, 0.07]];
    case 'pillbox': return [[0, 0.40, 0.20, 0.14], [0, 0.29, 0.34, 0.04]];
    case 'comb': return [[-0.12, 0.38, 0.06, 0.22], [0, 0.40, 0.06, 0.26], [0.12, 0.38, 0.06, 0.22]];
    case 'horns': return pair(0.27, 0.32, 0.095, 0.25);
    case 'spires': return pair(0.16, 0.45, 0.095, 0.31);
    case 'sprout': return [[0, 0.40, 0.07, 0.20], [0.13, 0.47, 0.14, 0.07], [-0.12, 0.45, 0.13, 0.07]];
    default: return pair(0.36, 0.03, 0.10, 0.14);
  }
}
