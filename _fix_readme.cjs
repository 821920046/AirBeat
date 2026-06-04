const fs = require("fs");
const p = "C:\\Users\\qh686\\Desktop\\github\\AirBeat\\README.md";
let c = fs.readFileSync(p, "utf8");

// Fix 1: Feature description - ffmpeg.wasm → Web Audio API
c = c.replace(
  "- **浏览器端转换** — 基于 ffmpeg.wasm，无需服务器，浏览器内完成 AAC→MP3 转换",
  "- **浏览器端转换** — 基于 Web Audio API，无需服务器，浏览器内完成 AAC→WAV 转换"
);

// Fix 2: Tech stack table - 转换 row
c = c.replace(
  "| 转换 | ffmpeg.wasm (浏览器端 AAC→MP3) |",
  "| 转换 | Web Audio API (浏览器端 AAC→WAV) |"
);

// Fix 3: Project Structure - ConvertContext comment
c = c.replace(
  "│   │   ├── ConvertContext   # ffmpeg.wasm 转换状态",
  "│   │   ├── ConvertContext   # Web Audio API 转换状态"
);

fs.writeFileSync(p, c, "utf8");
console.log("README.md updated");
