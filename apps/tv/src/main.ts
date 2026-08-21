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
    // The address is read from the page's own location for the same reason
    // the QR is built from the request's host: it is the address this screen
    // was actually reached at, so it can never tell the room to type
    // `localhost` into a phone.
    renderTable(root, {
      code,
      address: window.location.host,
      participants: message.table.participants,
    })
    return
  }
  if (message.type === 'error') {
    renderError(root, message.code)
  }
})
