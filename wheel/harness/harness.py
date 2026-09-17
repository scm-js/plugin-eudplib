"""The build driver shared by the native reference and the wasm run: deterministic patches,
then LoadMap → plugin hooks → CompressPayload → SaveMap, the way euddraft's apply does it
without freeze, message boxes and the auto-updater."""
import importlib, os, random, sys, types


def make_deterministic() -> None:
    """Both sides consume the same random sequence, so their outputs can be compared byte for byte."""
    random.seed(20260917)
    os.urandom = lambda n: random.getrandbits(8 * n).to_bytes(n, "little")


def install_shim(site_packages: str) -> None:
    """Load the Rust module before the eudplib package, give it the pure-Python mpqapi, then let
    the package import normally and find both already in sys.modules."""
    import mpqshim, platform
    # epscript/epscompile.py indexes {"Windows", "Linux", "Darwin"} by platform.system() at import;
    # the library it names is only dlopen'd when an .eps plugin is compiled, so Linux is a safe answer.
    platform.system = lambda: "Linux"
    fake = types.ModuleType("eudplib"); fake.__path__ = [os.path.join(site_packages, "eudplib")]
    sys.modules["eudplib"] = fake
    rust = importlib.import_module("eudplib.bindings._rust")
    rust.mpqapi = mpqshim
    del sys.modules["eudplib"]


def build(ed_dir: str, in_path: str, out_path: str, plugins: dict, *, shuffle: bool = False) -> None:
    sys.path.insert(0, ed_dir)
    import eudplib as ep
    from pluginLoader import loadPluginsFromConfig
    ep.ShufflePayload(shuffle)
    config = {"main": {"input": in_path, "output": out_path}, "freeze": {"freeze": "0"}}
    for name, settings in plugins.items():
        config[name] = {k: (str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v) for k, v in settings.items()}
    ep.LoadMap(in_path)
    hooks = loadPluginsFromConfig(ep, config)
    sector_size = 15

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
