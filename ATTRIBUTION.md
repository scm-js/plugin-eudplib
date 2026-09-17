# Attribution

**eudplib** (https://github.com/armoha/eudplib) by trgk and Armoha, MIT License. `dist/` holds
its wheel built for Pyodide from the release `src/version.ts` names, with the build-configuration
patch in `wheel/eudplib-wasm.patch`; nothing in its Python is changed.

**euddraft** (https://github.com/armoha/euddraft) by trgk and Armoha, MIT License.
`python/euddraft/` is its `pluginLoader.py` and the eight bundled plugins at the commit
`src/version.ts` names, unchanged, with its licence beside them; `python/driver.py` does what
its `applyeuddraft.py` does without the freeze, the message boxes and the auto-updater.

**Pyodide** (https://pyodide.org), Mozilla Public License 2.0. Fetched at run time from
jsDelivr at the version `src/version.ts` names; nothing of it is in this repository.

**mopaq** (https://github.com/jeany55/mopaq), MIT License, bundled into `dist/plugin.js`
for the archive.

The scmJS plugin API typings (`@scm-js/plugin-api`) are MIT, from https://github.com/scm-js/scm-js.
