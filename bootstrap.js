#!/usr/bin/env node

// TODO: The way we just join the arguments with "" isn't great... but it should be fine for now.
require("child_process").execSync("node ./dist/index.js " + process.argv.slice(2).join(" "), { stdio: "inherit", cwd: __dirname });