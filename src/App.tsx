바로 오류 수정하겠습니다. 1447번 줄 확인합니다.`b.home`이 `Bet` 타입에 없어서 오류가 납니다. `b.homeTeam`으로 수정합니다.혹시 다른 곳에도 같은 패턴이 있는지 확인합니다.문제없는 것들만 나왔습니다. 이제 파일 업데이트하고 GitHub에 올리겠습니다.이제 Chrome으로 GitHub에 직접 올려보겠습니다.Chrome 확장이 연결되지 않아 직접 올리긴 어렵네요. 대신 **수정된 파일 다운로드 후 GitHub 웹**에서 빠르게 올리시면 됩니다.

---

**수정 내용:** `b.home` → `b.homeTeam` (Bet 타입에 없는 필드 참조 오류)

**GitHub 웹에서 업로드 방법 (1분):**

1. 위 다운로드한 `App.tsx` 파일 열기
2. [github.com/swkins/songbet](https://github.com/swkins/songbet) 접속
3. `src/App.tsx` 클릭 → ✏️ 연필 아이콘 클릭
4. **Ctrl+A** → **Ctrl+V** (붙여넣기)
5. **Commit changes** 클릭

---

Chrome 확장 프로그램이 켜져 있으면 제가 직접 올려드릴 수 있어요. **Chrome에서 Claude 확장 프로그램이 실행 중인지** 확인해 주세요!
