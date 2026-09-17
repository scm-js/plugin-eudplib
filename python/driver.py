"""The build, the way euddraft's apply does it without freeze, message boxes and the
auto-updater: LoadMap, the plugins' hooks, CompressPayload, SaveMap. eudplib is untouched;
what it needs from the host is set up in `prepare` before it is imported."""
import importlib
import os
import platform
import sys
import types


def prepare(site_packages: str) -> None:
    """Load the Rust extension before the eudplib package and give it the pure-Python
    archive API (`mpqshim`); the package then imports normally and finds both in sys.modules.
    The wasm wheel is built without StormLib, so `_rust` has no `mpqapi` of its own."""
    import mpqshim
    # epscript/epscompile.py indexes a {"Windows", "Linux", "Darwin"} table by platform.system()
    # at import time; the library it names is only opened when an .eps plugin is compiled.
    platform.system = lambda: "Linux"
    fake = types.ModuleType("eudplib")
    fake.__path__ = [os.path.join(site_packages, "eudplib")]
    sys.modules["eudplib"] = fake
    rust = importlib.import_module("eudplib.bindings._rust")
    rust.mpqapi = mpqshim
    del sys.modules["eudplib"]


def build(ed_dir: str, in_path: str, out_path: str, plugins: dict, *, shuffle: bool = True, sector_size: int = 15) -> None:
    """`plugins` is the .eds as sections: name → {key: value}, every value a string."""
    if ed_dir not in sys.path:
        sys.path.insert(0, ed_dir)
    import eudplib as ep
    from pluginLoader import loadPluginsFromConfig
    ep.ShufflePayload(shuffle)
    config = {"main": {"input": in_path, "output": out_path}, "freeze": {"freeze": "0"}}
    for name, settings in plugins.items():
        config[name] = {str(k): str(v) for k, v in settings.items()}
    ep.LoadMap(in_path)
    hooks = loadPluginsFromConfig(ep, config)

    @ep.EUDFunc
    def payloadMain():
        for f in hooks.get("onPluginStart", []):
            f()
        if ep.EUDInfLoop()():
            for f in hooks.get("beforeTriggerExec", []):
                f()
            ep.RunTrigTrigger()
            for f in reversed(hooks.get("afterTriggerExec", [])):
                f()
            ep.EUDDoEvents()
        ep.EUDEndInfLoop()

    ep.CompressPayload(True)
    ep.SaveMap(out_path, payloadMain, sector_size=sector_size)
