// Lance cargo dans sim/ avec la chaîne Rust installée par apt.
import { spawnSync } from "node:child_process";
const env = { ...process.env, PATH: `/usr/lib/rust-1.97/bin:${process.env.PATH}` };
const r = spawnSync("cargo", process.argv.slice(2), { cwd: new URL("../sim", import.meta.url).pathname, stdio: "inherit", env });
process.exit(r.status ?? 1);
