import cockpit from 'cockpit'
import React from 'react'
import { Card } from '@patternfly/react-core'

import { ServicesPage } from './components/services.jsx'

const _ = cockpit.gettext

export function Application () {
  return (
    <Card>
      <ServicesPage />
    </Card>
  )
}
