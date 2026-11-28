import { build } from 'esbuild';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildClient({ sourceRoot = process.cwd(), packageName, allowedFiles } = {}) {
  const source = await realpath(sourceRoot);
  packageName ??= JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8')).name;
  const stubPath = path.join(source, 'src', 'community-catalog-client-stub.js');
  const hasStub = await access(stubPath).then(() => true, () => false);
  const plugins = [];
  if (hasStub) {
    // Keep the 6.9 MiB offline community catalog exclusively on Host; the browser bundle
    // reads lightweight overview + paginated slices from Host APIs (dist/client.js ~96% smaller).
    plugins.push({
      name: 'slim-client-community-catalog',
      setup(builder) {
        builder.onResolve({ filter: /community-catalog-data\.js$/ }, args => {
          if (args.importer && path.resolve(path.dirname(args.importer), args.path) === path.join(source, 'src', 'community-catalog-data.js')) {
            return { path: stubPath };
          }
          return undefined;
        });
      },
    });
  }
  if (allowedFiles) {
    plugins.push({ name: 'public-source-boundary', setup(builder) {
      builder.onLoad({ filter: /.*/ }, async ({ path: filename }) => {
        const relative = path.relative(source, await realpath(filename)).split(path.sep).join('/');
        if (!allowedFiles.has(relative)) throw new Error('Client import violates the public source allowlist or follows a symlink outside it');
        return undefined;
      });
    } });
  }
  const result = await build({ absWorkingDir: source, entryPoints: ['src/client.js'], plugins, logLevel: allowedFiles ? 'silent' : 'warning', bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'], write: false, legalComments: 'inline', minify: false });
  return `// DSH native client. React is provided by the host ModuleLoader.\nwindow.__ModuleLoader__.load({id:${JSON.stringify(packageName)},factory:require=>{const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildClient();
  await mkdir('dist', { recursive: true }); await writeFile('dist/client.js', output);
  console.log('Built dist/client.js');
}
