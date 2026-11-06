import React from "react";
import { createRoot } from "react-dom/client";
import CustomerApp from "./App.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));
const isAdminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);

if (isAdminRoute) {
  Promise.all([import("./AdminApp.jsx"), import("./admin.css")])
    .then(([module]) => {
      root.render(
        <React.StrictMode>
          <module.default />
        </React.StrictMode>,
      );
    })
    .catch((error) => {
      console.error("Could not load the administrator workspace:", error);
      root.render(
        <div className="loading-screen">
          <b>Administrator workspace could not be loaded.</b>
        </div>,
      );
    });
} else {
  root.render(
    <React.StrictMode>
      <CustomerApp />
    </React.StrictMode>,
  );
}
