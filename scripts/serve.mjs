import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../docs/',import.meta.url));
const port=Number(process.env.PORT||8766);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const requested=decodeURIComponent(url.pathname);const target=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));const relative=path.relative(root,target);if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end('Forbidden');return;}const data=await fs.readFile(target);res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
