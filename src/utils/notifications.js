import cockpit from "cockpit";
import deep_equal from "deep-equal";

class PageStatus {
  constructor() {
    cockpit.event_target(this);
    window.addEventListener("storage", (event) => {
      if (event.key == "cockpit:page_status") {
        this.dispatchEvent("changed");
      }
    });

    this.cur_own = null;

    this.valid = false;
    cockpit.transport.wait(() => {
      this.valid = true;
      this.dispatchEvent("changed");
    });
  }

  get(page, host) {
    let page_status;

    if (!this.valid) return undefined;

    if (host === undefined) host = cockpit.transport.host;

    try {
      page_status = JSON.parse(sessionStorage.getItem("cockpit:page_status"));
    } catch {
      return null;
    }

    if (page_status && page_status[host])
      return page_status[host][page] || null;
    return null;
  }

  set_own(status) {
    if (!deep_equal(status, this.cur_own)) {
      this.cur_own = status;
      cockpit.transport.control("notify", { page_status: status });
    }
  }
}

export const page_status = new PageStatus();
