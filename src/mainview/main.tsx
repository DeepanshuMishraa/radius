import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

document.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<div className="app-frame">
			<App />
		</div>
	</StrictMode>,
);
