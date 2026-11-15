import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

// Current sessions may not hot-load newly registered MCP tools. Exercise the
// actual server over stdio so registration and browser connectivity are distinct.
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const entry = fs.readdirSync(cache).map(dir => path.join(cache, dir, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js')).find(file => fs.existsSync(file));
if (!entry) throw new Error('Chrome DevTools MCP npm cache not found');
const server = spawn(process.execPath, [entry, '--headless', '--isolated', '--no-usage-statistics', '--no-performance-crux'], {
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
let sequence = 0;
const pending = new Map();
const lines = createInterface({ input: server.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
server.stderr.on('data', data => process.stderr.write(data));
server.on('exit', code => {
  for (const request of pending.values()) request.reject(new Error(`MCP exited: ${code}`));
  pending.clear();
});
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const deadline = setTimeout(() => { server.kill(); process.exitCode = 1; }, 55000);
try {
  console.log('initialize', JSON.stringify(await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'eth-browser-check', version: '1.0' } })));
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tools = await call('tools/list', {});
  console.log('tools', JSON.stringify(tools.tools.map(tool => tool.name)));
  for (const url of process.argv.slice(2)) {
    const page = await call('tools/call', { name: 'new_page', arguments: { url, timeout: 20000 } });
    console.log('page', url, JSON.stringify(page));
    if (page.isError) continue;
    const selected = page.content.filter(item => item.type === 'text').map(item => item.text).join('\n').match(/(\d+):[^\n]*\[selected\]/);
    if (!selected) throw new Error('Selected MCP page not found');
    console.log('content', JSON.stringify(await call('tools/call', { name: 'evaluate_script', arguments: {
      pageId: Number(selected[1]),
      function: '() => ({url:location.href,title:document.title,text:document.body.innerText.slice(0,1800)})',
    } })));
    if (url === 'http://127.0.0.1:5173/') {
      console.log('browser-engine', JSON.stringify(await call('tools/call', { name: 'evaluate_script', arguments: {
        pageId: Number(selected[1]),
        function: `async () => {
          const [{ createPractice, advancePractice }, { startEconomyRound }, { PRACTICE_MAPS }] = await Promise.all([
            import('/src/simulation/practice.js'), import('/src/simulation/economy.js'), import('/src/data/maps/index.js')]);
          const clubs = ['home','away'].map(team => ({ name: team, players: Array.from({length:5}, (_,i) => ({
            id: team+i, name: team, nickname: team, aim:45, intelligence:45, stamina:45 })) }));
          const state = createPractice(PRACTICE_MAPS[0], ...clubs, { economy:true, seed:42,
            attackPlans:{home:'execute',away:'execute'}, defensePlans:{home:'standard',away:'standard'} });
          startEconomyRound(state,{autoHome:true});
          advancePractice(state,PRACTICE_MAPS[0],160000);
          return { complete:state.complete, winner:state.round.winner, reason:state.endReason,
            smokeRisksInitialized:!!state.round.smokeRisks, storageTouched:false };
        }`,
      } })));
      if (process.env.ETH_MCP_UI_CHECK === '1') console.log('browser-ui', JSON.stringify(await call('tools/call', {
        name: 'evaluate_script', arguments: { pageId: Number(selected[1]), function: `async () => {
          const [{practiceScreen,mountPractice},{createWorld},{createClub}] = await Promise.all([
            import('/src/ui/practice-screen.js'),import('/src/game/create-world.js'),import('/src/game/create-club.js')]);
          const screen=practiceScreen();document.body.append(screen);
          const originalRaf=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame;
          const frames=new Map();let sequence=0,now=performance.now(),dispose;
          window.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};
          window.cancelAnimationFrame=id=>frames.delete(id);
          const results=[];
          try {
            dispose=mountPractice(screen,createWorld(createClub('MCP UI CHECK').club,42));
            for(let round=0;round<3;round++) {
              screen.querySelector('[data-practice="toggle"]').click();
              screen.querySelector('[data-practice="skip"]').click();
              let processed=0,lastEvents='';
              for(let frame=0;frames.size&&frame<200;frame++) {
                const [id,callback]=frames.entries().next().value;frames.delete(id);now+=2000;callback(now);
                processed++;
                const events=screen.querySelector('.combat-events').textContent;
                if(!events.includes('시작 후 실제 교전'))lastEvents=events;
              }
              if(frames.size)throw new Error('UI round failed to stop');
              if(!processed||!lastEvents)throw new Error('UI round did not simulate combat');
              results.push({status:screen.querySelector('.practice-state').textContent,processedFrames:processed,
                events:lastEvents.slice(0,400)});
            }
            return {renderedRounds:results.length,results,storageTouched:false};
          } finally {dispose?.();screen.remove();window.requestAnimationFrame=originalRaf;window.cancelAnimationFrame=originalCancel;}
        }` }
      })));
      console.log('console', JSON.stringify(await call('tools/call', { name: 'list_console_messages', arguments: {
        pageId: Number(selected[1]), types: ['error'],
      } })));
      console.log('network', JSON.stringify(await call('tools/call', { name: 'list_network_requests', arguments: {
        pageId: Number(selected[1]),
      } })));
    }
  }
} finally {
  clearTimeout(deadline);
  server.stdin.end();
  server.kill();
  lines.close();
}
