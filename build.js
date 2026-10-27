// Build step (runs on Vercel): src/ → public/index.html (one file, minified).
// Concatenates src/css/*.css and src/lib + src/js/*.js into src/index.html.
// Names are NOT renamed, only whitespace is stripped. If minifying fails the
// readable bundle is shipped instead, so a deploy can never break because of it.
const fs = require('fs'), path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
const list = (dir, ext) => fs.readdirSync(path.join(__dirname, dir)).filter((f) => f.endsWith(ext)).sort();

let css = list('src/css', '.css').map((f) => read('src/css', f)).join('\n');
const lib = read('src/lib', 'excel-import.js');
let js = list('src/js', '.js').map((f) => '/* ' + f + ' */\n' + read('src/js', f)).join('\n');

try {
  const esbuild = require('esbuild');
  css = esbuild.transformSync(css, { loader: 'css', minify: true }).code;
  js = esbuild.transformSync(lib + '\n(function(){"use strict";\n' + js + '\n})();', { loader: 'js', minifyWhitespace: true, minifySyntax: false, minifyIdentifiers: false, target: 'es2019', legalComments: 'none' }).code;
  console.log('[build] minified');
} catch (e) {
  console.warn('[build] minify skipped:', e.message);
  js = lib + '\n(function(){"use strict";\n' + js + '\n})();';
}
let html = read('src', 'index.html');
// function replacers: the code contains "$&"-style sequences that String.replace would otherwise expand
html = html.replace('/*@css*/', () => css).replace('/*@js*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), html);
console.log('[build] public/index.html', (html.length / 1024) | 0, 'KB');
