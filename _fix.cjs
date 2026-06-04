const fs = require("fs");
const base = "C:\\Users\\qh686\\Desktop\\github\\AirBeat";

// Fix ChatMessage.tsx
const chatPath = base + "\\app\\components\\molecules\\ChatMessage.tsx";
let chat = fs.readFileSync(chatPath, "utf8");
chat = chat.replace(
  /stage === \.decoding\. \? \.DECODING\. : stage === \.encoding\. \? \.ENCODING\./,
  'stage === "decoding" ? "DECODING" : stage === "encoding" ? "ENCODING"'
);
fs.writeFileSync(chatPath, chat, "utf8");
console.log("ChatMessage.tsx fixed");

// Fix ConvertContext.tsx - Uint8Array to BlobPart
const convPath = base + "\\app\\context\\ConvertContext.tsx";
let conv = fs.readFileSync(convPath, "utf8");
// The wavData is already a Uint8Array from encodeWav, just wrap in new Uint8Array() to satisfy BlobPart
conv = conv.replace(
  "new Blob([wavData], { type: \"audio/wav\" })",
  "new Blob([wavData.buffer], { type: \"audio/wav\" })"
);
fs.writeFileSync(convPath, conv, "utf8");
console.log("ConvertContext.tsx fixed");
