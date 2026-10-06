import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { initializeAnalytics } from "./app/analytics";

initializeAnalytics();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
