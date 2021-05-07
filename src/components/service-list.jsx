import cockpit from 'cockpit'
import React from 'react'
import {
  DataList
} from '@patternfly/react-core'
import PropTypes from 'prop-types'

import { ServiceRow } from './service-row.jsx'

const _ = cockpit.gettext

export const ServicesList = ({ units, isTimer }) => {
  return (
    <DataList
      aria-label={_('Systemd units')}
      id='services-list'
      onSelectDataListItem={(id) => cockpit.location.go([id])}
      className='services-list'
    >
      {units.map((unit) => (
        <ServiceRow
          key={unit[0]}
          isTimer={isTimer}
          shortId={unit[0]}
          {...unit[1]}
        />
      ))}
    </DataList>
  )
}

ServicesList.propTypes = {
  units: PropTypes.array,
  isTimer: PropTypes.bool
}
