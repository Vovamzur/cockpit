import "../lib/patternfly/patternfly-cockpit.scss";
import React from "react";
import {
  Button,
  Bullseye,
  FormSelect,
  FormSelectOption,
  Page,
  PageSection,
  PageSectionVariants,
  TextInput,
  Card,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarGroup,
} from "@patternfly/react-core";
import { SearchIcon, ExclamationCircleIcon } from "@patternfly/react-icons";

import { EmptyStatePanel } from "./cockpit-components-empty-state.jsx";
import { Service } from "./service.jsx";
import { ServiceTabs, service_tabs_suffixes } from "./service-tabs.jsx";
import { ServicesList } from "./service-list.jsx";
import { CreateTimerDialog } from "./timer-dialog.jsx";
import moment from "moment";
import { page_status } from "../utils/notifications";
import cockpit from "cockpit";
import { superuser } from "../utils/superuser";

import "./services.scss";

const _ = cockpit.gettext;

superuser.reload_page_on_change();

export const systemd_client = cockpit.dbus("org.freedesktop.systemd1", {
  superuser: "try",
});
const timedate_client = cockpit.dbus("org.freedesktop.timedate1");
export let clock_realtime_now;
export let clock_monotonic_now;

export const SD_MANAGER = "org.freedesktop.systemd1.Manager";
export const SD_OBJ = "/org/freedesktop/systemd1";

export function updateTime() {
  cockpit.spawn(["cat", "/proc/uptime"]).then(
    function (contents) {
      // first number is time since boot in seconds with two fractional digits
      const uptime = parseFloat(contents.split(" ")[0]);
      clock_monotonic_now = parseInt(uptime * 1000000, 10);
    },
    (ex) => console.log(ex.toString())
  );
  cockpit.spawn(["date", "+%s"]).then(
    function (time) {
      clock_realtime_now = moment.unix(parseInt(time));
    },
    (ex) => console.log(ex.toString())
  );
}

export class ServicesPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      /* State related to the toolbar/tabs components */
      activeTab: "service",
      stateDropdownIsExpanded: false,
      currentTypeFilter: "all",
      currentTextFilter: "",

      unit_by_path: {},
      loadingUnits: false,
      privileged: true,
      path: cockpit.location.path,
      tabErrors: {},
      isFullyLoaded: false,
    };
    /* Functions for controlling the toolbar's components */
    this.onClearAllFilters = this.onClearAllFilters.bind(this);
    this.onTypeDropdownSelect = this.onTypeDropdownSelect.bind(this);
    this.onInputChange = this.onInputChange.bind(this);

    /* Function for manipulating with the API results and store the units in the React state */
    this.processFailedUnits = this.processFailedUnits.bind(this);
    this.listUnits = this.listUnits.bind(this);
    this.getUnitByPath = this.getUnitByPath.bind(this);
    this.updateProperties = this.updateProperties.bind(this);
    this.addTimerProperties = this.addTimerProperties.bind(this);
    this.addSocketProperties = this.addSocketProperties.bind(this);
    this.updateComputedProperties = this.updateComputedProperties.bind(this);
    this.compareUnits = this.compareUnits.bind(this);

    this.onPermissionChanged = this.onPermissionChanged.bind(this);

    this.seenPaths = new Set();
    this.path_by_id = {};
    this.operationInProgress = {};

    this.on_navigate = this.on_navigate.bind(this);
  }

  componentDidMount() {
    /* Listen for permission changes for "Create timer" button */
    superuser.addEventListener("changed", this.onPermissionChanged);
    this.onPermissionChanged();

    cockpit.addEventListener("locationchanged", this.on_navigate);
    this.on_navigate();

    this.systemd_subscription = systemd_client
      .call(SD_OBJ, SD_MANAGER, "Subscribe", null)
      .finally(this.listUnits)
      .catch((error) => {
        if (
          error.name != "org.freedesktop.systemd1.AlreadySubscribed" &&
          error.name != "org.freedesktop.DBus.Error.FileExists"
        )
          console.warn(
            "Subscribing to systemd signals failed",
            error.toString()
          );
      });

    cockpit.addEventListener("visibilitychange", () => {
      if (!cockpit.hidden) {
        /* If the page had only been fetched in the background we need to properly initialize the state now
         * else just trigger an re-render since we are receiving signals while running in the background and
         * we update the state but don't re-render
         */
        if (!this.state.isFullyLoaded) this.listUnits();
        else this.setState({});
      }
    });

    /* Start listening to signals for updates - when in the middle of reload mute all signals
     * - We don't need to listen to 'UnitFilesChanged' signal since every time we
     *   perform some file operation we do call Reload which issues 'Reload' signal
     * - JobNew is also useless, JobRemoved is enough since it comes in pair with JobNew
     *   but we are interested to update the state when the operation finished
     */
    systemd_client.subscribe(
      {
        interface: "org.freedesktop.DBus.Properties",
        member: "PropertiesChanged",
      },
      (path, iface, signal, args) => {
        if (this.state.loadingUnits) return;

        this.updateProperties(args[1], path);
        this.processFailedUnits();
      }
    );

    ["JobNew", "JobRemoved"].forEach((signalName) => {
      systemd_client.subscribe(
        { interface: SD_MANAGER, member: signalName },
        (path, iface, signal, args) => {
          const unit_id = args[2];
          systemd_client
            .call(SD_OBJ, SD_MANAGER, "LoadUnit", [unit_id])
            .then(([path]) => {
              if (!this.seenPaths.has(path)) this.seenPaths.add(path);

              this.getUnitByPath(path).then(this.processFailedUnits);
            });
        }
      );
    });

    systemd_client.subscribe(
      { interface: SD_MANAGER, member: "Reloading" },
      (path, iface, signal, args) => {
        const reloading = args[0];
        if (!reloading && !this.state.loadingUnits) this.listUnits();
      }
    );

    this.timedated_subscription = timedate_client.subscribe(
      {
        interface: "org.freedesktop.DBus.Properties",
        member: "PropertiesChanged",
      },
      updateTime
    );
    updateTime();
  }

  componentWillUnmount() {
    cockpit.removeEventListener("locationchanged", this.on_navigate);
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (cockpit.hidden) return false;

    return true;
  }

  on_navigate() {
    const newState = { path: cockpit.location.path };
    if (cockpit.location.options && cockpit.location.options.type)
      newState.activeTab = cockpit.location.options.type;
    this.setState(newState);
  }

  /**
   * Return a boolean value indicating if the unit specified by name @param is handled
   */
  isUnitHandled(name) {
    const suffix = name.substr(name.lastIndexOf(".") + 1);
    return service_tabs_suffixes.includes(suffix);
  }

  /* When the page is running in the background fetch only information about failed units
   * in order to update the 'Page Status'. The whole listUnits is very expensive.
   * We still need to maintain the 'unit_by_path' state object so that if we receive
   * some signal we can normally parse it and update only the affected unit state
   * instead of calling ListUnitsFiltered API call for every received signal which
   * might have changed the failed units array
   */
  listFailedUnits() {
    return systemd_client
      .call(SD_OBJ, SD_MANAGER, "ListUnitsFiltered", [["failed"]])
      .then(
        ([failed]) => {
          failed.forEach((result) => {
            const path = result[6];
            const unit_id = result[0];

            if (!this.isUnitHandled(unit_id)) return;

            // Ignore units which 'not-found' LoadState
            if (result[2] == "not-found") return;

            if (!this.seenPaths.has(path)) this.seenPaths.add(path);

            this.updateProperties(
              {
                Id: cockpit.variant("s", unit_id),
                Description: cockpit.variant("s", result[1]),
                LoadState: cockpit.variant("s", result[2]),
                ActiveState: cockpit.variant("s", result[3]),
                SubState: cockpit.variant("s", result[4]),
              },
              path
            );
          });
          this.processFailedUnits();
        },
        (ex) => console.warn("ListUnitsFiltered failed: ", ex.toString())
      );
  }

  isTemplate(id) {
    const tp = id.indexOf("@");
    const sp = id.lastIndexOf(".");
    return tp != -1 && (tp + 1 == sp || tp + 1 == id.length);
  }

  listUnits() {
    if (cockpit.hidden) return this.listFailedUnits();

    // Reinitialize the state variables for the units
    this.setState({ loadingUnits: true });

    this.seenPaths = new Set();

    const promisesLoad = [];

    // Run ListUnits before LIstUnitFiles so that we avoid the extra LoadUnit calls
    // Now we call LoadUnit only for those that ListUnits didn't tell us about
    systemd_client.call(SD_OBJ, SD_MANAGER, "ListUnits", null).then(
      ([results]) => {
        results.forEach((result) => {
          const path = result[6];
          const unit_id = result[0];

          if (!this.isUnitHandled(unit_id)) return;

          if (!this.seenPaths.has(path)) this.seenPaths.add(path);

          this.updateProperties(
            {
              Id: cockpit.variant("s", unit_id),
              Description: cockpit.variant("s", result[1]),
              LoadState: cockpit.variant("s", result[2]),
              ActiveState: cockpit.variant("s", result[3]),
              SubState: cockpit.variant("s", result[4]),
            },
            path
          );
        });

        systemd_client.call(SD_OBJ, SD_MANAGER, "ListUnitFiles", null).then(
          ([results]) => {
            results.forEach((result) => {
              const unit_path = result[0];
              const unit_id = unit_path.split("/").pop();
              const unitFileState = result[1];

              if (!this.isUnitHandled(unit_id)) return;

              if (this.isTemplate(unit_id)) return;

              if (this.seenPaths.has(this.path_by_id[unit_id])) {
                this.updateProperties(
                  {
                    Id: cockpit.variant("s", unit_id),
                    UnitFileState: cockpit.variant("s", unitFileState),
                  },
                  this.path_by_id[unit_id],
                  true
                );
                return;
              }

              promisesLoad.push(
                systemd_client
                  .call(SD_OBJ, SD_MANAGER, "LoadUnit", [unit_id])
                  .then(
                    ([unit_path]) => {
                      this.updateProperties(
                        {
                          Id: cockpit.variant("s", unit_id),
                          UnitFileState: cockpit.variant("s", unitFileState),
                        },
                        unit_path,
                        true
                      );

                      this.seenPaths.add(unit_path);

                      return this.getUnitByPath(unit_path);
                    },
                    (ex) => console.warn(ex)
                  )
              );
            });

            Promise.all(promisesLoad).finally(() => {
              // Remove units from state that are not listed from the API in this iteration
              const unit_by_path = Object.assign({}, this.state.unit_by_path);
              let hasExtraEntries = false;
              const newState = {};

              for (const unitPath in this.state.unit_by_path) {
                if (!this.seenPaths.has(unitPath)) {
                  hasExtraEntries = true;
                  delete unit_by_path[unitPath];
                  Object.keys(this.path_by_id).forEach((id) => {
                    if (this.path_by_id[id] == unitPath)
                      delete this.path_by_id[id];
                  });
                }
              }
              if (hasExtraEntries) newState.unit_by_path = unit_by_path;

              newState.loadingUnits = false;
              newState.isFullyLoaded = true;

              this.setState(newState);
              this.processFailedUnits();
            });
          },
          (ex) => console.warn("ListUnitFiles failed: ", ex.toString())
        );
      },
      (ex) => console.warn("ListUnits failed: ", ex.toString())
    );
  }

  onPermissionChanged() {
    this.setState({ privileged: superuser.allowed });
  }

  onClearAllFilters() {
    this.setState({ currentTextFilter: "", currentTypeFilter: "all" });
  }

  onInputChange(newValue) {
    this.setState({ currentTextFilter: newValue });
  }

  onTypeDropdownSelect(currentTypeFilter) {
    this.setState({ currentTypeFilter });
  }

  /**
   * Sort units by alphabetically - failed units go on the top of the list
   */
  compareUnits(unit_a_t, unit_b_t) {
    const unit_a = unit_a_t[1];
    const unit_b = unit_b_t[1];
    const failed_a = unit_a.HasFailed ? 1 : 0;
    const failed_b = unit_b.HasFailed ? 1 : 0;

    if (!unit_a || !unit_b) return false;

    if (failed_a != failed_b) return failed_b - failed_a;
    else return unit_a_t[0].localeCompare(unit_b_t[0]);
  }

  addSocketProperties(socket_unit, path, unit) {
    let needsUpdate = false;

    if (JSON.stringify(socket_unit.Listen) !== JSON.stringify(unit.Listen)) {
      unit.Listen = socket_unit.Listen;
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.setState((prevState) => ({
        unit_by_path: {
          ...prevState.unit_by_path,
          [unit.path]: unit,
        },
      }));
    }
  }

  addTimerProperties(timer_unit, path, unit) {
    let needsUpdate = false;

    const lastTriggerTime = moment(
      timer_unit.LastTriggerUSec / 1000
    ).calendar();
    if (lastTriggerTime !== unit.LastTriggerTime) {
      unit.LastTriggerTime = lastTriggerTime;
      needsUpdate = true;
    }
    const system_boot_time =
      clock_realtime_now.valueOf() * 1000 - clock_monotonic_now;
    if (timer_unit.LastTriggerUSec === -1 || timer_unit.LastTriggerUSec === 0) {
      if (unit.LastTriggerTime !== _("unknown")) {
        unit.LastTriggerTime = _("unknown");
        needsUpdate = true;
      }
    }
    let next_run_time = 0;
    if (timer_unit.NextElapseUSecRealtime === 0)
      next_run_time = timer_unit.NextElapseUSecMonotonic + system_boot_time;
    else if (timer_unit.NextElapseUSecMonotonic === 0)
      next_run_time = timer_unit.NextElapseUSecRealtime;
    else {
      if (
        timer_unit.NextElapseUSecMonotonic + system_boot_time <
        timer_unit.NextElapseUSecRealtime
      )
        next_run_time = timer_unit.NextElapseUSecMonotonic + system_boot_time;
      else next_run_time = timer_unit.NextElapseUSecRealtime;
    }
    const nextRunTime = moment(next_run_time / 1000).calendar();
    if (nextRunTime !== unit.NextRunTime) {
      unit.NextRunTime = nextRunTime;
      needsUpdate = true;
    }

    if (
      timer_unit.NextElapseUSecMonotonic <= 0 &&
      timer_unit.NextElapseUSecRealtime <= 0
    ) {
      if (unit.NextRunTime !== _("unknown")) {
        unit.NextRunTime = _("unknown");
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      this.setState((prevState) => ({
        unit_by_path: {
          ...prevState.unit_by_path,
          [unit.path]: unit,
        },
      }));
    }
  }

  /* Add some computed properties into a unit object - does not call setState */
  updateComputedProperties(unit) {
    let load_state = unit.LoadState;
    const active_state = unit.ActiveState;

    if (load_state == "loaded") load_state = "";

    unit.HasFailed =
      active_state == "failed" || (load_state !== "" && load_state != "masked");

    if (active_state === "active" || active_state === "activating")
      unit.CombinedState = _("Running");
    else if (active_state == "failed")
      unit.CombinedState = _("Failed to start");
    else unit.CombinedState = _("Not running");

    unit.AutomaticStartup = "";
    if (unit.UnitFileState && unit.UnitFileState.indexOf("enabled") == 0) {
      unit.AutomaticStartup = _("Enabled");
      unit.AutomaticStartupKey = "enabled";
    } else if (
      unit.UnitFileState &&
      unit.UnitFileState.indexOf("disabled") == 0
    ) {
      unit.AutomaticStartup = _("Disabled");
      unit.AutomaticStartupKey = "disabled";
    } else if (
      unit.UnitFileState &&
      unit.UnitFileState.indexOf("static") == 0
    ) {
      unit.AutomaticStartup = _("Static");
      unit.AutomaticStartupKey = "static";
    } else if (unit.UnitFileState) {
      unit.AutomaticStartup = unit.UnitFileState;
    }

    if (load_state !== "" && load_state != "masked")
      unit.CombinedState = cockpit.format(
        "$0 ($1)",
        unit.CombinedState,
        _(load_state)
      );
  }

  updateProperties(props, path, updateFileState = false) {
    // We received a request to update properties on a unit we are not yet aware off
    if (!this.state.unit_by_path[path] && !props.Id) return;

    if (props.Id && props.Id.v) this.path_by_id[props.Id.v] = path;

    let shouldUpdate = false;
    const unitNew = Object.assign({}, this.state.unit_by_path[path]);
    const prop = (p) => {
      if (props[p]) {
        if (
          Array.isArray(props[p].v) &&
          Array.isArray(unitNew[p]) &&
          JSON.stringify(props[p].v.sort()) == JSON.stringify(unitNew[p].sort())
        )
          return;
        else if (!Array.isArray(props[p].v) && props[p].v == unitNew[p]) return;
        else if (p == "UnitFileState" && !updateFileState) return;
        shouldUpdate = true;
        unitNew[p] = props[p].v;
      }
    };

    prop("Id");
    prop("Description");
    prop("Names");
    prop("LoadState");
    prop("LoadError");
    prop("ActiveState");
    prop("SubState");
    if (updateFileState) prop("UnitFileState");
    prop("FragmentPath");
    unitNew.path = path;

    prop("Requires");
    prop("Requisite");
    prop("Wants");
    prop("BindsTo");
    prop("PartOf");
    prop("RequiredBy");
    prop("RequisiteOf");
    prop("WantedBy");
    prop("BoundBy");
    prop("ConsistsOf");
    prop("Conflicts");
    prop("ConflictedBy");
    prop("Before");
    prop("After");
    prop("OnFailure");
    prop("Triggers");
    prop("TriggeredBy");
    prop("PropagatesReloadTo");
    prop("PropagatesReloadFrom");
    prop("JoinsNamespaceOf");
    prop("Conditions");
    prop("CanReload");

    prop("ActiveEnterTimestamp");

    this.updateComputedProperties(unitNew);

    if (unitNew.Id.endsWith("socket")) {
      unitNew.is_socket = true;
      if (unitNew.ActiveState == "active") {
        const socket_unit = systemd_client.proxy(
          "org.freedesktop.systemd1.Socket",
          unitNew.path
        );
        socket_unit.wait(() => {
          if (socket_unit.valid)
            this.addSocketProperties(socket_unit, path, unitNew);
        });
      }
    }

    if (unitNew.Id.endsWith("timer")) {
      unitNew.is_timer = true;
      if (unitNew.ActiveState == "active") {
        const timer_unit = systemd_client.proxy(
          "org.freedesktop.systemd1.Timer",
          unitNew.path
        );
        timer_unit.wait(() => {
          if (timer_unit.valid)
            this.addTimerProperties(timer_unit, path, unitNew);
        });
      }
    }

    if (!shouldUpdate) return;

    this.setState((prevState) => ({
      unit_by_path: {
        ...prevState.unit_by_path,
        [path]: unitNew,
      },
    }));
  }

  /**
   * Fetches all Properties for the unit specified by path @param and add the unit to the state
   */
  getUnitByPath(path) {
    return systemd_client
      .call(path, "org.freedesktop.DBus.Properties", "GetAll", [
        "org.freedesktop.systemd1.Unit",
      ])
      .then((result) => this.updateProperties(result[0], path))
      .catch((error) =>
        console.warn("GetAll failed for", path, error.toString())
      );
  }

  processFailedUnits() {
    const failed = new Set();
    const tabErrors = {};

    for (const p in this.state.unit_by_path) {
      const u = this.state.unit_by_path[p];
      if (u.ActiveState == "failed" && u.LoadState != "not-found") {
        const suffix = u.Id.substr(u.Id.lastIndexOf(".") + 1);
        if (service_tabs_suffixes.includes(suffix)) {
          tabErrors[suffix] = true;
          failed.add(u.Id);
        }
      }
    }
    this.setState({ tabErrors });

    if (failed.size > 0) {
      page_status.set_own({
        type: "error",
        title: cockpit.format(
          cockpit.ngettext(
            "$0 service has failed",
            "$0 services have failed",
            failed.size
          ),
          failed.size
        ),
        details: [...failed],
      });
    } else {
      page_status.set_own(null);
    }
  }

  render() {
    const { path, unit_by_path } = this.state;

    if (!this.state.isFullyLoaded)
      return <EmptyStatePanel loading title={_("Loading...")} />;

    /* Perform navigation */
    if (path.length == 1) {
      const unit_id = path[0];
      const get_unit_path = (unit_id) => this.path_by_id[unit_id];
      const unit_path = get_unit_path(unit_id);

      if (unit_path === undefined) {
        return (
          <EmptyStatePanel
            icon={ExclamationCircleIcon}
            title={_("Unit not found")}
          />
        );
      }

      const unit = this.state.unit_by_path[unit_path];
      return (
        <Service
          unitIsValid={(unitId) => {
            const path = get_unit_path(unitId);
            return (
              path !== undefined &&
              this.state.unit_by_path[path].LoadState != "not-found"
            );
          }}
          key={unit_id}
          loadingUnits={this.state.loadingUnits}
          getUnitByPath={this.getUnitByPath}
          unit={unit}
        />
      );
    }

    const typeDropdownOptions = [
      { value: "all", label: _("All") },
      { value: "enabled", label: _("Enabled") },
      { value: "disabled", label: _("Disabled") },
      { value: "static", label: _("Static") },
    ];
    const { currentTextFilter, activeTab } = this.state;
    const currentTypeFilter =
      this.state.currentTypeFilter || typeDropdownOptions[0].value;

    const units = Object.keys(this.path_by_id)
      .filter((unit_id) => {
        const unit = this.path_by_id[unit_id]
          ? unit_by_path[this.path_by_id[unit_id]]
          : undefined;

        if (!unit) return false;

        if (
          !(
            unit.Id &&
            activeTab &&
            unit.Id.match(cockpit.format(".$0$", activeTab))
          )
        )
          return false;

        if (unit.LoadState == "not-found") return false;

        if (
          currentTextFilter &&
          !(
            (unit.Description &&
              unit.Description.toLowerCase().indexOf(
                currentTextFilter.toLowerCase()
              ) != -1) ||
            unit_id.toLowerCase().indexOf(currentTextFilter.toLowerCase()) != -1
          )
        )
          return false;

        if (
          currentTypeFilter != "all" &&
          currentTypeFilter !== unit.AutomaticStartupKey
        )
          return false;

        return true;
      })
      .map((unit_id) => [unit_id, unit_by_path[this.path_by_id[unit_id]]])
      .sort(this.compareUnits);

    const toolbarItems = (
      <>
        <ToolbarGroup>
          <ToolbarItem variant="label" id="services-text-filter-label">
            {_("Filter")}
          </ToolbarItem>
          <ToolbarItem variant="search-filter">
            <TextInput
              name="services-text-filter"
              id="services-text-filter"
              type="search"
              value={currentTextFilter}
              onChange={this.onInputChange}
              aria-labelledby="services-text-filter-label"
              placeholder={_("Filter by name or description")}
            />
          </ToolbarItem>
          <ToolbarItem variant="search-filter">
            <FormSelect
              id="services-dropdown"
              aria-label={_("Select unit state")}
              value={currentTypeFilter}
              onChange={this.onTypeDropdownSelect}
            >
              {typeDropdownOptions.map((option) => (
                <FormSelectOption
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </FormSelect>
          </ToolbarItem>
        </ToolbarGroup>
        {activeTab == "timer" && (
          <>
            <ToolbarItem variant="separator" />
            <ToolbarItem>
              {this.state.privileged && <CreateTimerDialog />}
            </ToolbarItem>
          </>
        )}
      </>
    );

    return (
      <Page>
        <PageSection variant={PageSectionVariants.light} type="nav">
          <ServiceTabs
            activeTab={activeTab}
            tabErrors={this.state.tabErrors}
            onChange={(activeTab) => {
              cockpit.location.go(
                [],
                Object.assign(cockpit.location.options, { type: activeTab })
              );
            }}
          />
        </PageSection>
        <PageSection>
          <Card isCompact>
            <Toolbar
              data-loading={this.state.loadingUnits}
              id="services-toolbar"
            >
              <ToolbarContent>{toolbarItems}</ToolbarContent>
            </Toolbar>
            <ServicesList
              key={cockpit.format("$0-list", activeTab)}
              isTimer={activeTab == "timer"}
              units={units}
            />
            {units.length == 0 && (
              <Bullseye>
                <EmptyStatePanel
                  icon={SearchIcon}
                  paragraph={_(
                    "No results match the filter criteria. Clear all filters to show results."
                  )}
                  action={
                    <Button
                      id="clear-all-filters"
                      onClick={this.onClearAllFilters}
                      isInline
                      variant="link"
                    >
                      {_("Clear all filters")}
                    </Button>
                  }
                  title={_("No matching results")}
                />
              </Bullseye>
            )}
          </Card>
        </PageSection>
      </Page>
    );
  }
}