#!/usr/bin/env python3
"""OpenGEO 编辑门禁（PreToolUse hook）— ai-native-sdlc §控制面 hook ①③。

规则（命中即转为 ask，由人确认）：
  1. stable 事实保护：facts/ 下 status: stable 的 OKF 文件被编辑（RFC-0001：stable 变更是 L2，须 Owner 确认）
  2. 测试文件保护：tests/ 或 test_* / *.test.* / *.spec.* 被编辑（禁止改断言迁就实现）

零依赖；读 stdin 的 hook JSON，允许时静默 exit 0。
"""
import json
import os
import re
import sys


def ask(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False))
    sys.exit(0)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    tool_input = payload.get("tool_input") or {}
    path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    if not path:
        sys.exit(0)
    norm = path.replace(os.sep, "/")
    name = os.path.basename(norm)

    parts = norm.split("/")
    if "facts" in parts and name.endswith(".md") and os.path.isfile(path):
        try:
            head = open(path, encoding="utf-8").read(2000)
        except OSError:
            head = ""
        if re.search(r"^status:\s*stable\b", head, re.M):
            ask("stable 事实文件变更（L2）：该 OKF 文件 status: stable，须 Owner 确认后才能改（RFC-0001 / ai-native-sdlc hook①）。")

    if ("tests" in parts or "test" in parts
            or name.startswith("test_")
            or re.search(r"\.(test|spec)\.[jt]sx?$", name)):
        ask("测试文件保护（hook③）：确认这不是在修改断言迁就实现——修 bug 应先写会失败的测试，实现不迁就测试。")

    sys.exit(0)


if __name__ == "__main__":
    main()
