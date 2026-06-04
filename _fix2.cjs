const fs = require('fs');
const p = 'C:\\Users\\qh686\\Desktop\\github\\AirBeat\\app\\context\\ConvertContext.tsx';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  'new Blob([wavData.buffer], { type: "audio/wav" })',
  'new Blob([wavData.buffer.slice(wavData.byteOffset, wavData.byteOffset + wavData.byteLength)], { type: "audio/wav" })'
);
fs.writeFileSync(p, c, 'utf8');
console.log('done');
