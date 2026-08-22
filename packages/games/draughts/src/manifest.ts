import type { GameManifest } from '@m8/contract'

export const manifest: GameManifest = {
  id: 'draughts',
  contractVersion: 1,
  seats: { min: 2, max: 2 },
  name: { 'pt-BR': 'Damas', en: 'Draughts' },
  tagline: { 'pt-BR': 'Avance na diagonal, capture saltando', en: 'Advance diagonally, capture by jumping' },
  manual: {
    'pt-BR': [
      { title: 'O tabuleiro', lines: ['Casas escuras, doze peças de cada lado.', 'Peças avançam na diagonal.'] },
      { title: 'A vez', lines: ['Mova uma casa, ou capture saltando.', 'Capturar é obrigatório quando possível.'] },
      { title: 'Vitória', lines: ['Quem não tem mais peças ou jogadas perde.', 'O outro vence.'] },
    ],
    en: [
      { title: 'The board', lines: ['Dark cells, twelve pieces on each side.', 'Pieces move diagonally.'] },
      { title: 'Your turn', lines: ['Move one cell, or jump to capture.', 'Capturing is mandatory when possible.'] },
      { title: 'Winning', lines: ['Whoever runs out of pieces or moves loses.', 'The other player wins.'] },
    ],
  },
  cover: 'cover.svg',
  status: 'coming-soon',
}
