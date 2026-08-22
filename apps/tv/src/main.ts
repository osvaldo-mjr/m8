import './styles.css'
import { connectScreen } from './client.js'
import { renderError, renderScreen, renderWaiting } from './render.js'

const root = document.getElementById('app')
if (root === null) throw new Error('Missing #app element')

// The screen must never be blank: this is the state shown from the moment
// the page loads until the first tableState arrives.
renderWaiting(root)

connectScreen((message) => {
  if (message.type === 'tableState') {
    // The address is read from the page's own location for the same reason
    // the QR is built from the request's host: it is the address this screen
    // was actually reached at, so it can never tell the room to type
    // `localhost` into a phone. `renderScreen` picks which screen the
    // table's own phase calls for; the table already carries its own code,
    // so nothing here needs to remember one from `tableReady` any more.
    renderScreen(root, message.table, window.location.host)
    return
  }
  if (message.type === 'error') {
    renderError(root, message.code)
  }
})
