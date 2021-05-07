import React, { useState } from "react";
import PropTypes from "prop-types";
import { Nav, NavList, NavItem } from "@patternfly/react-core";

import cockpit from "cockpit";

const _ = cockpit.gettext;

export const service_tabs_suffixes = [
  "service",
  "target",
  "socket",
  "timer",
  "path",
];

export function ServiceTabs({ onChange, activeTab, tabErrors }) {
  const service_tabs = {
    service: _("System services"),
    target: _("Targets"),
    socket: _("Sockets"),
    timer: _("Timers"),
    path: _("Paths"),
  };

  const [activeItem, setActiveItem] = useState(activeTab);

  return (
    <Nav
      variant="tertiary"
      id="services-filter"
      onSelect={(result) => {
        setActiveItem(result.itemId);
        onChange(result.itemId);
      }}
    >
      <NavList>
        {Object.keys(service_tabs).map((key) => {
          return (
            <NavItem
              itemId={key}
              key={key}
              preventDefault
              isActive={activeItem == key}
            >
              <a href="#">
                {service_tabs[key]}
                {tabErrors[key] ? (
                  <span className="fa fa-exclamation-circle" />
                ) : null}
              </a>
            </NavItem>
          );
        })}
      </NavList>
    </Nav>
  );
}
ServiceTabs.propTypes = {
  onChange: PropTypes.func.isRequired,
};
