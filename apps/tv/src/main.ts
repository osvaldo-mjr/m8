import './styles.css'
import { connectScreen } from './client.js'
import { renderTable } from './render.js'

const root = document.getElementById('app')
if (root === null) throw new Error('Missing #app element')

let code = ''

connectScreen((message) => {
  if (message.type === 'tableReady') {
    code = message.code
    return
  }
  if (message.type === 'tableState') {
    renderTable(root, { code, participants: message.table.participants })
  }
})
