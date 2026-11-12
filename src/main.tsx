import React from "react";
import ReactDOM from "react-dom/client";
import { api } from "./api";
import App from "./App";
import "@xyflow/react/dist/base.css";
import "./index.css";

// End the subscriptions this window's view held before a reload, before any Conversation opens.
api
  .resetSubscriptions()
  .catch(() => {})
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
