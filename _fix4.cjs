const fs = require("fs");
const p = "C:\\Users\\qh686\\Desktop\\github\\AirBeat\\functions\\api\\upload.ts";
let c = fs.readFileSync(p, "utf8");
// Fix the extra indentation on contentType line
c = c.replace(
  "        const contentType = file.type || (ext === \"wav\" ? \"audio/wav\" : \"audio/mpeg\");",
  "    const contentType = file.type || (ext === \"wav\" ? \"audio/wav\" : \"audio/mpeg\");"
);
fs.writeFileSync(p, c, "utf8");
console.log("done");
