import './lib/patternfly/patternfly-4-cockpit.scss'

import 'core-js/stable'

import React from 'react'
import ReactDOM from 'react-dom'
import { Application } from './app.jsx'

import './lib/patternfly/patternfly-4-overrides.scss'
import './app.scss'

document.addEventListener('DOMContentLoaded', () => {
  ReactDOM.render(
    React.createElement(Application, {}),
    document.getElementById('app')
  )
})
