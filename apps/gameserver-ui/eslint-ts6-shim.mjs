// typescript-eslint (aktuell 8.x) unterstützt TypeScript 7 noch nicht: Die Peer-
// Range endet bei <6.1.0, und @typescript-eslint/typescript-estree stürzt gegen
// die native TS-7-Distribution mit "Cannot read properties of undefined (reading
// 'Cjs')" ab. Der Build/tsc bleibt auf TypeScript 7; nur ESLint bekommt über den
// Alias `typescript-6` (devDependency) eine TS-6-Instanz für den Parser.
// Wird von eslint.config.mjs als ERSTER Import geladen und kann entfallen, sobald
// typescript-eslint TypeScript 7 unterstützt (dann auch `typescript-6` entfernen).
import Module from "node:module";

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request === "typescript" ? "typescript-6" : request, ...rest);
};
