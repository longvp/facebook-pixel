// .claude/hooks/guard-git.mjs
// PreToolUse(Bash) guard: never let Claude `git commit` / `git push` silently.
// For any commit/push (on ANY branch) it returns permissionDecision "ask",
// forcing a user confirmation prompt. Other commands pass through untouched.
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = (JSON.parse(raw || "{}").tool_input || {}).command || "";
  } catch {
    process.exit(0);
  }

  // Match a real `git commit` / `git push` (allow leading flags like
  // `git -c key=val commit`). Ignore the words inside other subcommands.
  const m = /\bgit\s+(?:-\S+\s+|--\S+(?:=\S+)?\s+)*(commit|push)\b/.exec(cmd);
  if (!m) process.exit(0);

  const verb = m[1] === "push" ? "git push" : "git commit";
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason:
          `Project rule: confirm before '${verb}'. Claude must not commit or push ` +
          `without your explicit go-ahead. Approve to proceed.`,
      },
    }),
  );
  process.exit(0);
});
