const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');
const start = Date.now();
let firstDelta = null;

ws.on('open', () => {
  console.log(`[${Date.now() - start}ms] Connected.`);
  ws.send(JSON.stringify({
    type: 'run_task',
    goal: 'How are you?',
    mode: 'FAST',
    history: []
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'task_event') {
    if (msg.data?.type === 'TASK_STARTED') {
      console.log(`[${Date.now() - start}ms] TASK_STARTED`);
    } else if (msg.data?.type === 'MESSAGE_DELTA' && !firstDelta) {
      firstDelta = Date.now();
      console.log(`[${Date.now() - start}ms] FIRST MESSAGE_DELTA received!`);
    }
  } else if (msg.type === 'task_result') {
    console.log(`[${Date.now() - start}ms] TASK_RESULT (Completed)`);
    process.exit(0);
  }
});
