import React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  Page,
  PageSection,
  Gallery,
  GalleryItem,
} from "@patternfly/react-core";

import { ServiceDetails } from "./service-details.jsx";
import { LogsPanel } from "./cockpit-components-logs-panel.jsx";
import { superuser } from "../utils/superuser";

import cockpit from "cockpit";

const _ = cockpit.gettext;

export class Service extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      error: undefined,
      shouldFetchProps: props.unit.Names === undefined,
    };
  }

  componentDidMount() {
    if (this.state.shouldFetchProps)
      this.props
        .getUnitByPath(this.props.unit.path)
        .finally(() => this.setState({ shouldFetchProps: false }));
  }

  render() {
    if (this.state.shouldFetchProps || this.props.unit.Names === undefined)
      return null;

    const serviceDetails = (
      <ServiceDetails
        unit={this.props.unit}
        permitted={superuser.allowed}
        loadingUnits={this.props.loadingUnits}
        isValid={this.props.unitIsValid}
      />
    );

    const cur_unit_id = this.props.unit.Id;
    const match = [
      "_SYSTEMD_UNIT=" + cur_unit_id,
      "+",
      "COREDUMP_UNIT=" + cur_unit_id,
      "+",
      "UNIT=" + cur_unit_id,
    ];
    const url = "/system/logs/#/?prio=debug&service=" + cur_unit_id;

    return (
      <Page
        groupProps={{ sticky: "top" }}
        isBreadcrumbGrouped
        id="service-details"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbItem to="#">{_("Services")}</BreadcrumbItem>
            <BreadcrumbItem isActive>{this.props.unit.Id}</BreadcrumbItem>
          </Breadcrumb>
        }
      >
        <PageSection>
          <Gallery hasGutter>
            <GalleryItem>{serviceDetails}</GalleryItem>
            {(this.props.unit.LoadState === "loaded" ||
              this.props.unit.LoadState === "masked") && (
              <GalleryItem>
                <LogsPanel
                  title={_("Service logs")}
                  match={match}
                  emptyMessage={_("No log entries")}
                  max={10}
                  goto_url={url}
                  search_options={{ prio: "debug", service: cur_unit_id }}
                />
              </GalleryItem>
            )}
          </Gallery>
        </PageSection>
      </Page>
    );
  }
}
