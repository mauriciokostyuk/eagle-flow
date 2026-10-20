const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("electron-builder branding", () => {
  const eb = JSON.parse(read("electron-builder.json"));
  assert.strictEqual(eb.productName, "Eagle Flow");
  assert.strictEqual(eb.appId, "com.eaglemidiadigital.eagleflow");
  assert.strictEqual(eb.publish.owner, "mauriciokostyuk");
  assert.strictEqual(eb.publish.repo, "eagle-flow");
  assert.strictEqual(eb.publish.releaseType, "release");
  assert.deepStrictEqual(eb.protocols.schemes, ["eagleflow"]);
  assert.strictEqual(eb.mac.identity, "-");
  assert.strictEqual(eb.mac.notarize, false);
});

test("package.json branding", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.strictEqual(pkg.name, "eagle-flow");
  assert.strictEqual(pkg.version, "1.0.0");
});

test("css primary color and html title", () => {
  assert.match(read("src/index.css"), /--color-primary: #2b62d6/);
  assert.match(read("src/index.html"), /<title>Eagle Flow<\/title>/);
});
