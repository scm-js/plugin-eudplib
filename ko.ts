// Korean for every string the plugin shows; English is the key. Build output and Python's errors are shown as produced.
// `tests/ko.test.ts` fails on a `t("…")` in the source with no entry here, and on an entry nothing uses.
export const KO: Record<string, string> = {
  "A plugin needs it to build this map.": "이 맵을 빌드하려면 플러그인에 필요합니다.",
  "Cancel": "취소",
  "Carried by this editor, so nothing is downloaded. Each build starts a fresh Python from it, about two seconds.": "이 편집기에 포함되어 있어 따로 내려받지 않습니다. 빌드할 때마다 여기서 새 Python을 시작하며, 약 2초 걸립니다.",
  "Downloading…": "다운로드 중…",
  "Install": "설치",
  "Install now…": "지금 설치…",
  "Install the local build runtime?": "로컬 빌드 런타임을 설치할까요?",
  "Installed ({size}). Each build starts a fresh Python from it, about two seconds.": "설치됨 ({size}). 빌드할 때마다 여기서 새 Python을 시작하며, 약 2초 걸립니다.",
  "It is a one-time download of about {size} from {host} (Pyodide, a Python for the browser, and eudplib {eudplib}), kept by the browser for the next build. Remove it any time under Edit ▸ Preferences ▸ Plugins ▸ eudplib.": "{host}에서 약 {size}를 한 번만 내려받으며 (브라우저용 Python인 Pyodide와 eudplib {eudplib}), 다음 빌드를 위해 브라우저에 보관됩니다. 편집 ▸ 환경 설정 ▸ 플러그인 ▸ eudplib에서 언제든 제거할 수 있습니다.",
  "Not installed. The first build downloads about {size}.": "설치되지 않았습니다. 처음 빌드할 때 약 {size}를 내려받습니다.",
  "Plugin {plugin}, eudplib {eudplib}, Pyodide {pyodide}, euddraft {euddraft}.": "플러그인 {plugin}, eudplib {eudplib}, Pyodide {pyodide}, euddraft {euddraft}.",
  "Remove the download": "내려받은 파일 제거",
  "The download failed: {why}": "다운로드하지 못했습니다: {why}",
  "The eudplib runtime is not installed, so the map was not built.": "eudplib 런타임이 설치되지 않아 맵을 빌드하지 않았습니다.",
  "The runtime failed to start: {why}": "런타임을 시작하지 못했습니다: {why}",
  "Try again": "다시 시도",
  "Waiting to start": "시작 대기 중",
  "eudplib is the trigger compiler behind euddraft, the tool StarCraft: Remastered EUD maps are built with. This plugin runs it inside the editor, so a map is built here and nothing about it leaves the machine.": "eudplib는 StarCraft: Remastered EUD 맵을 만드는 도구인 euddraft의 트리거 컴파일러입니다. 이 플러그인은 eudplib를 편집기 안에서 실행하므로, 맵이 여기서 빌드되고 맵에 관한 어떤 것도 이 컴퓨터를 벗어나지 않습니다.",
  "{file} — {done} of {total}": "{file} — {total} 중 {done}",
  "{labels} needs it to build this map.": "이 맵을 빌드하려면 {labels}에 필요합니다.",
};
