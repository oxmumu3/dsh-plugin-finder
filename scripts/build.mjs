import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['src/client.js'],bundle:true,format:'cjs',platform:'browser',target:'chrome120',external:['react','@deepseek-ai/dsh-client-ui-primitives'],write:false,legalComments:'inline',minify:false});
const output=`// DSH native client. React is provided by the host ModuleLoader.\nwindow.__ModuleLoader__.load({id:'dsh-plugin-finder',factory:require=>{const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
await mkdir('dist',{recursive:true});await writeFile('dist/client.js',output);console.log('Built dist/client.js');
