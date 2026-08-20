import './styles.css'
import { connectScreen } from './client.js'
import { renderError, renderTable, renderWaiting } from './render.js'

const root = document.getElementById('app')
if (root === null) throw new Error('Missing #app element')

let code = ''

// The screen must never be blank: this is the state shown from the moment
// the page loads until the first tableState arrives.
renderWaiting(root)

connectScreen((message) => {
  if (message.type === 'tableReady') {
    code = message.code
    return
  }
  if (message.type === 'tableState') {
    renderTable(root, { code, participants: message.table.participants })
    return
  }
  if (message.type === 'error') {
    renderError(root, message.code)
  }
})
