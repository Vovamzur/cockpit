import cockpit from "cockpit";

function Superuser() {
  const proxy = cockpit
    .dbus(null, { bus: "internal" })
    .proxy("cockpit.Superuser", "/superuser");
  let reload_on_change = false;

  const compute_allowed = () => {
    if (!proxy.valid || proxy.Current == "init") return null;
    return proxy.Current != "none";
  };

  const self = {
    allowed: compute_allowed(),
    reload_page_on_change: reload_page_on_change,
  };

  cockpit.event_target(self);

  function changed(allowed) {
    if (self.allowed != allowed) {
      if (self.allowed != null && reload_on_change) {
        window.location.reload(true);
      } else {
        const prev = self.allowed;
        self.allowed = allowed;
        self.dispatchEvent("changed");
        if (prev != null) self.dispatchEvent("reconnect");
      }
    }
  }

  proxy.wait(() => {
    if (!proxy.valid) {
      // Fall back to cockpit.permissions
      const permission = cockpit.permission({ admin: true });
      const update = () => {
        changed(permission.allowed);
      };
      permission.addEventListener("changed", update);
      update();
    }
  });

  proxy.addEventListener("changed", () => {
    changed(compute_allowed());
  });

  function reload_page_on_change() {
    reload_on_change = true;
  }

  return self;
}

export const superuser = Superuser();
