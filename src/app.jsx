import cockpit from 'cockpit'
import React, { useEffect, useState } from 'react'
import { Alert, Card, CardTitle, CardBody } from '@patternfly/react-core'

import { ServicesPage } from './components/services.jsx'

const _ = cockpit.gettext

export function Application () {
  const [hostname, setHostname] = useState(_('Unknown'))

  useEffect(() => {
    cockpit.file('/etc/hostname').watch((content) => {
      setHostname(content.trim())
    })
  }, [])

  return (
    <Card>
      <CardTitle>Starter Kit By Vova</CardTitle>
      <CardBody>
        <Alert
          variant='info'
          title={cockpit.format(_('Running on $0'), hostname)}
        />
      </CardBody>
      <ServicesPage />
    </Card>
  )
}
