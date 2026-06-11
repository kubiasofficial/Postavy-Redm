const fs = require("fs");

const file = process.argv[2] || "index.html";
const html = fs.readFileSync(file, "utf8");
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/)
  || html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

if (!match) {
  throw new Error("script not found");
}

const body = match[1]
  .replace(/\s*import\s+{[\s\S]*?}\s+from\s+"https:\/\/www\.gstatic\.com[^"]+";/g, "");

new Function(body);
console.log(`${file} inline script syntax ok`);
