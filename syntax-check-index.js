const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);

if (!match) {
  throw new Error("module script not found");
}

const body = match[1]
  .replace(/\s*import\s+{[\s\S]*?}\s+from\s+"https:\/\/www\.gstatic\.com[^"]+";/g, "");

new Function(body);
console.log("inline script syntax ok");
