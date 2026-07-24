// Registers the content desk as a spawnable integration ("content"), so
// execution agents — and therefore automations — can read the idea bank,
// calendar, and posting state. Same four tools the dispatcher has.
//
// Registered from loadIntegrations() (see CONTENT.md touchpoints) so it
// survives refreshIntegrations(), which clears and rebuilds the registry
// whenever Composio connections change.

import { registerIntegration } from "../integrations/registry.js";
import { createClaudeMcpServer } from "../runtimes/claude.js";
import { createContentTools } from "./tools.js";

export function registerContentIntegration(): void {
  registerIntegration({
    name: "content",
    description:
      "The content desk: idea bank (with cooldown state), calendar slots, posting state. " +
      "Use for reviewing the content week, picking what to post, or marking slots posted.",
    createServer: async () => createClaudeMcpServer("boop-content", createContentTools()),
    createTools: async () => createContentTools(),
  });
}
