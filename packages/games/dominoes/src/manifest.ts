import type { GameManifest } from '@m8/contract'

export const manifest: GameManifest = {
  id: 'dominoes',
  contractVersion: 1,
  seats: { min: 2, max: 4 },
  name: { 'pt-BR': 'Dominó', en: 'Dominoes' },
  tagline: { 'pt-BR': 'Encaixe as pontas até esvaziar a mão', en: 'Match the ends until your hand is empty' },
  manual: {
    'pt-BR': [
      { title: 'As peças', lines: ['Pedras com dois números, de zero a seis.', 'Cada jogador compra sete pedras.'] },
      { title: 'A vez', lines: ['Encaixe um número igual na ponta da mesa.', 'Sem jogada, compre ou passe.'] },
      { title: 'Vitória', lines: ['Quem fica sem pedras primeiro vence.', 'Mesa travada, menor soma vence.'] },
    ],
    en: [
      { title: 'The tiles', lines: ['Tiles carry two numbers, zero to six.', 'Each player draws seven tiles.'] },
      { title: 'Your turn', lines: ['Match a number at either end of the line.', 'No move, draw or pass.'] },
      { title: 'Winning', lines: ['Whoever empties their hand first wins.', 'A locked table goes to the lowest total.'] },
    ],
  },
  cover: 'cover.svg',
  status: 'coming-soon',
}
