// PreToolUse(Bash) hook: chặn mọi lệnh `git commit` và `git push`.
// Đọc JSON từ stdin, nếu command có chứa git commit/push thì trả về deny.
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = JSON.parse(input)?.tool_input?.command ?? "";
  } catch {
    process.exit(0); // không parse được -> không chặn
  }

  // Tách theo các toán tử nối lệnh để bắt cả `x && git push`, `a; git commit`, ...
  const segments = cmd.split(/&&|\|\||\||;|\n/);
  const blocked = segments.some((seg) => {
    const s = seg.trim().replace(/^['"(]+/, "");
    return /^git\s+(?:-[^\s]+\s+|--[^\s]+(?:=\S+)?\s+)*(commit|push)\b/.test(s);
  });

  if (blocked) {
    const reason =
      "git commit và git push bị chặn bởi hook (.claude/hooks/block-git.mjs). " +
      "Hãy tự chạy lệnh git trong terminal nếu thực sự muốn commit/push.";
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
    );
  }
  process.exit(0);
});
