// .claude/hooks/format.mjs
// PostToolUse hook: format edited .ts/.tsx files with Prettier.
import { execSync } from "node:child_process";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const file = JSON.parse(raw || "{}")?.tool_input?.file_path || "";
    if (/\.(ts|tsx)$/.test(file)) {
      execSync(`npx prettier --write "${file}"`, { stdio: "ignore" });
    }
  } catch {
    // Never block the tool call on a formatting failure.
  }
});
