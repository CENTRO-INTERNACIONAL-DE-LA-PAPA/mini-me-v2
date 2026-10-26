import React from "react";
import ReactDOM from "react-dom/client";
import { api } from "./api";
import App from "./App";
import "@xyflow/react/dist/base.css";
import "./index.css";

// Subscriptions still held for this window's previous view, before a reload, end before
// this view opens any Conversation.
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
