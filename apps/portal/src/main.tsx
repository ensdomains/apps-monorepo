import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// biome-ignore lint/style/noNonNullAssertion: root is always available
createRoot(document.getElementById("root")!).render(
    <StrictMode>TODO</StrictMode>
);
