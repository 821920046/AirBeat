const fs = require("fs");
const p = "C:\\Users\\qh686\\Desktop\\github\\AirBeat\\app\\context\\ConvertContext.tsx";
let c = fs.readFileSync(p, "utf8");
const old = "new Blob([wavData.buffer.slice(wavData.byteOffset, wavData.byteOffset + wavData.byteLength)], { type: \"audio/wav\" })";
const rep = "new Blob([wavData as unknown as BlobPart], { type: \"audio/wav\" })";
c = c.replace(old, rep);
fs.writeFileSync(p, c, "utf8");
console.log("done");
