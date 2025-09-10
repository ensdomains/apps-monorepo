import { StartClient } from '@tanstack/react-start'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import reportWebVitals from './reportWebVitals'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient router={router} />
  </StrictMode>,
)

// @ts-expect-error
BigInt.prototype.toJSON = function () {
  // @ts-expect-error
  return JSON.rawJSON(this.toString())
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
