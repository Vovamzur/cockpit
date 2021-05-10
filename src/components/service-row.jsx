import React from 'react'

import {
  DataListItem,
  DataListCell,
  DataListItemRow,
  DataListItemCells,
  DataListAction,
  Tooltip,
  TooltipPosition,
  Badge
} from '@patternfly/react-core'

import cockpit from 'cockpit'

const _ = cockpit.gettext

export class ServiceRow extends React.PureComponent {
  render () {
    const {
      Id,
      shortId,
      AutomaticStartup,
      UnitFileState,
      LoadState,
      HasFailed,
      CombinedState,
      LastTriggerTime,
      NextRunTime,
      Description,
      isTimer
    } = this.props
    let displayName = shortId
    if (shortId.endsWith('.service')) { displayName = shortId.substring(0, shortId.length - 8) }
    const props = { displayName, Description }

    const columnsMap = {
      displayName: { value: _('Name'), className: 'service-unit-id', width: 2 },
      Description: {
        value: _('Description'),
        className: 'service-unit-description',
        width: 4
      },
      Triggers: {
        value: _('Triggers'),
        timerOnly: true,
        className: 'service-unit-triggers',
        width: 3
      }
    }

    const enabled = UnitFileState && UnitFileState.includes('enabled')
    const disabled = UnitFileState && UnitFileState.includes('disabled')
    const isStatic = UnitFileState && UnitFileState == 'static'
    const masked = LoadState && LoadState.includes('masked')
    let unitFileState
    if (enabled || disabled) {
      unitFileState = (
        <Badge className='service-unit-file-state' isRead={!enabled}>
          {AutomaticStartup}
        </Badge>
      )
    } else {
      unitFileState = (
        <span className='service-unit-file-state service-unit-file-state-non-badge'>
          {AutomaticStartup}
        </span>
      )
    }
    let tooltipMessage = ''
    if (enabled) tooltipMessage = _('Automatically starts')
    else if (disabled) tooltipMessage = _('Does not automatically start')
    else if (masked) tooltipMessage = _('Forbidden from running')
    else if (isStatic) tooltipMessage = _('Cannot be enabled')

    return (
      <DataListItem
        data-goto-unit={shortId}
        aria-labelledby={shortId}
        id={shortId}
      >
        <DataListItemRow className={HasFailed ? 'service-unit-failed' : ''}>
          <DataListItemCells
            dataListCells={[
              Object.keys(columnsMap)
                .filter((key) => isTimer || !columnsMap[key].timerOnly)
                .map((key) => {
                  return (
                    <DataListCell
                      width={columnsMap[key].width}
                      className={columnsMap[key].className}
                      key={cockpit.format('$0-$1', shortId, key)}
                    >
                      {columnsMap[key].timerOnly
                        ? (
                          <>
                            {NextRunTime && (
                              <div className='service-unit-next-trigger'>
                                {cockpit.format('Next run: $0', NextRunTime)}
                              </div>
                            )}
                            {LastTriggerTime && (
                              <div className='service-unit-last-trigger'>
                                {cockpit.format(
                                  'Last trigger: $0',
                                  LastTriggerTime
                                )}
                              </div>
                            )}
                          </>
                          )
                        : (
                            props[key]
                          )}
                    </DataListCell>
                  )
                })
            ]}
          />
          <DataListAction
            id={cockpit.format('$0-service-unit-state', Id)}
            aria-labelledby={cockpit.format('$0-service-unit-state', Id)}
            aria-label={_('State')}
          >
            {CombinedState && (
              <span
                className={
                  'service-unit-status' +
                  (HasFailed ? ' service-unit-status-failed' : '')
                }
              >
                {HasFailed && <span className='fa fa-exclamation-circle' />}
                {CombinedState}
              </span>
            )}
            {tooltipMessage
              ? (
                <Tooltip
                  id='switch-unit-state'
                  content={tooltipMessage}
                  position={TooltipPosition.left}
                >
                  {unitFileState}
                </Tooltip>
                )
              : (
                  unitFileState
                )}
          </DataListAction>
        </DataListItemRow>
      </DataListItem>
    )
  }
}
