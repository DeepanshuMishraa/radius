import { Electroview } from "electrobun/view";
import type { RadiusRPC } from "../../shared/types";

// Create the typed Electroview instance
const rpc = Electroview.defineRPC<RadiusRPC>({
  handlers: {
    requests: {
      // Renderer exposes ping handler
      ping() {
        return "pong";
      },
    },
    messages: {},
  },
});

const electroview = new Electroview({ rpc });

// Export the typed RPC client for hooks
export const radiusRpc = electroview.rpc!;
