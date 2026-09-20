'use strict';
const si = require('systeminformation');
(async () => {
  try {
    const procs = await si.processes(undefined, ['name', 'pid', 'parentPid', 'cpu', 'mem', 'command', 'user', 'path']);
    const list = procs.list || [];
    const fort = list.filter(p => /cmd\.exe|powershell\.exe|pwsh\.exe|wt\.exe|wscript|cscript|conhost/i.test(String(p.name)));
    const top = fort[0] || list.find(p => p.pid === process.pid) || list[0];
    console.log('total procs:', list.length);
    console.log('terminal-ish count:', fort.length);
    console.log('sample fields:');
    console.log('  name    :', JSON.stringify(top && top.name));
    console.log('  pid     :', top && top.pid);
    console.log('  parentPid:', top && top.parentPid);
    console.log('  user    :', JSON.stringify(top && top.user));
    console.log('  path    :', JSON.stringify(top && top.path));
    console.log('  command :', JSON.stringify(top && (top.command || '').slice(0, 120)));
    for (const p of fort.slice(0, 3)) {
      console.log('  ->', p.name, 'pid', p.pid, 'user=', JSON.stringify(p.user), 'path=', JSON.stringify(p.path));
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
})();
