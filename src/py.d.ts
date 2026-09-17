/** esbuild bundles `.py` files as strings (`--loader:.py=text`); the Python side rides inside the worker bundle. */
declare module "*.py" { const source: string; export default source; }
declare module "*.txt" { const source: string; export default source; }
