import React from "react";
import PropTypes from "prop-types";
import cockpit from "cockpit";

import { Alert, AlertActionCloseButton, Button } from "@patternfly/react-core";
import "./cockpit-components-inline-notification.css";

const _ = cockpit.gettext;

function mouseClick(fun) {
  return function (event) {
    if (!event || event.button !== 0) return;
    event.preventDefault();
    return fun(event);
  };
}

export class InlineNotification extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isDetail: false,
    };

    this.toggleDetail = this.toggleDetail.bind(this);
  }

  toggleDetail() {
    this.setState({
      isDetail: !this.state.isDetail,
    });
  }

  render() {
    const { text, detail, type, onDismiss } = this.props;

    let detailButton = null;
    if (detail) {
      let detailButtonText = _("show more");
      if (this.state.isDetail) {
        detailButtonText = _("show less");
      }

      detailButton = (
        <Button
          variant="link"
          isInline
          className="alert-link more-button"
          onClick={mouseClick(this.toggleDetail)}
        >
          {detailButtonText}
        </Button>
      );
    }
    const extraProps = {};
    if (onDismiss)
      extraProps.actionClose = <AlertActionCloseButton onClose={onDismiss} />;

    return (
      <Alert
        variant={type || "danger"}
        isLiveRegion={this.props.isLiveRegion}
        isInline={this.props.isInline != undefined ? this.props.isInline : true}
        title={
          <>
            {" "}
            {text} {detailButton}{" "}
          </>
        }
        {...extraProps}
      >
        {this.state.isDetail && <p>{detail}</p>}
      </Alert>
    );
  }
}

InlineNotification.propTypes = {
  onDismiss: PropTypes.func,
  isInline: PropTypes.bool,
  text: PropTypes.string.isRequired, // main information to render
  detail: PropTypes.string, // optional, more detailed information. If empty, the more/less button is not rendered.
  type: PropTypes.string,
};

export const ModalError = ({ dialogError, dialogErrorDetail }) => {
  return (
    <Alert variant="danger" isInline title={dialogError}>
      {dialogErrorDetail && <p> {dialogErrorDetail} </p>}
    </Alert>
  );
};
