import type { GameManifest } from '@m8/contract'

export const manifest: GameManifest = {
  id: 'tic-tac-toe',
  contractVersion: 1,
  seats: { min: 2, max: 2 },
  name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
  tagline: { 'pt-BR': 'Três em linha, e a linha decide', en: 'Three in a row decides it' },
  manual: {
    'pt-BR': [
      { title: 'A mesa', lines: ['Nove casas.', 'Dois jogadores, um X e um O.'] },
      { title: 'A vez', lines: ['Marque uma casa vazia.', 'Depois é a vez do outro.'] },
      { title: 'Vitória', lines: ['Três iguais em linha, coluna ou diagonal.', 'Sem casas livres, empate.'] },
    ],
    en: [
      { title: 'The table', lines: ['Nine cells.', 'Two players, one X and one O.'] },
      { title: 'Your turn', lines: ['Mark an empty cell.', 'Then it is the other player.'] },
      { title: 'Winning', lines: ['Three alike in a row, column or diagonal.', 'No cells left is a draw.'] },
    ],
  },
  cover: 'cover.svg',
  status: 'playable',
}
