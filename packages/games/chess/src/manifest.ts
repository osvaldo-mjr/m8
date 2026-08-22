import type { GameManifest } from '@m8/contract'

export const manifest: GameManifest = {
  id: 'chess',
  contractVersion: 1,
  seats: { min: 2, max: 2 },
  name: { 'pt-BR': 'Xadrez', en: 'Chess' },
  tagline: { 'pt-BR': 'Trinta e duas peças, um rei a proteger', en: 'Thirty-two pieces, one king to protect' },
  manual: {
    'pt-BR': [
      { title: 'O tabuleiro', lines: ['Oito por oito casas.', 'Dezesseis peças de cada lado.'] },
      { title: 'A vez', lines: ['Mova uma peça por vez.', 'Cada peça se move à sua maneira.'] },
      { title: 'Xeque-mate', lines: ['Ameace o rei sem escapatória.', 'Quem faz isso vence.'] },
    ],
    en: [
      { title: 'The board', lines: ['Eight by eight cells.', 'Sixteen pieces on each side.'] },
      { title: 'Your turn', lines: ['Move one piece at a time.', 'Each piece moves its own way.'] },
      { title: 'Checkmate', lines: ['Threaten the king with no escape.', 'Whoever does that wins.'] },
    ],
  },
  cover: 'cover.svg',
  status: 'coming-soon',
}
