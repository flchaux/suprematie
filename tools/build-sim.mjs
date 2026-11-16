// Compile sim/ en WebAssembly et copie sim.wasm là où le client et le serveur le chargent.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, PATH: `/usr/lib/rust-1.97/bin:${process.env.PATH}` };
const r = spawnSync("cargo", ["build", "--release", "--target", "wasm32-unknown-unknown", "--lib"], { cwd: root + "sim", stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);
const src = root + "sim/target/wasm32-unknown-unknown/release/sim.wasm";
mkdirSync(root + "packages/client/public", { recursive: true });
const out = root + "packages/client/public/sim.wasm";
const opt = spawnSync("wasm-opt", ["-O3", "--enable-bulk-memory", "--enable-nontrapping-float-to-int", "--enable-sign-ext", "--enable-mutable-globals", src, "-o", out], { stdio: "inherit" });
if (opt.status !== 0) copyFileSync(src, out);
console.log("sim.wasm ->", out);
