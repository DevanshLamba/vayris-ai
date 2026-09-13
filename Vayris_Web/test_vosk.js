const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('=== VAYRIS WAKE WORD E2E TEST ===\n');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',       // auto-grant mic permission
      '--use-fake-device-for-media-stream',   // use fake device
      `--use-file-for-fake-audio-capture=${path.resolve('e:/Jarvis/ui/hey_buddy.wav')}`  // feed "Hey Buddy" audio
    ]
  });
  
  const context = await browser.newContext();
  
  // Pre-set localStorage: enable wake word
  await context.addInitScript(() => {
    localStorage.setItem('vayris_voice_config', JSON.stringify({
      voiceEnabled: true,
      rate: 1.0,
      voiceURI: null,
      wakeWordEnabled: true,
      wakeWord: 'hey buddy'
    }));
  });

  const page = await context.newPage();
  
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    // Only print VOSK and VAYRIS related logs
    if (text.includes('[VOSK]') || text.includes('[VAYRIS]') || text.includes('AUDIO') || text.includes('Command') || text.includes('LOG (Vosk')) {
      console.log('BROWSER:', text);
    }
  });
  
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  
  // Wait for model to load (can take 5-10s for 40MB model)
  console.log('\nWaiting for Vosk model to load...');
  await new Promise(r => setTimeout(r, 15000));
  
  console.log('\n=== CHECKING LOGS ===\n');
  
  // Check key milestones
  const hasModelLoaded = logs.some(l => l.includes('MODEL_LOADED'));
  const hasRecognizer = logs.some(l => l.includes('Recognizer created'));
  const hasMicOpen = logs.some(l => l.includes('WAKE_LISTENING started'));
  const hasAudioFrames = logs.some(l => l.includes('Audio frames'));
  const hasPartial = logs.some(l => l.includes('PARTIAL:'));
  const hasFinal = logs.some(l => l.includes('FINAL:'));
  const hasWakeMatch = logs.some(l => l.includes('WAKE WORD MATCHED'));
  const hasTransfer = logs.some(l => l.includes('Wake word detected'));
  const hasCommandSTT = logs.some(l => l.includes('Command STT started'));
  
  console.log(`Model Loaded:       ${hasModelLoaded ? 'PASS' : 'FAIL'}`);
  console.log(`Recognizer Created: ${hasRecognizer ? 'PASS' : 'FAIL'}`);
  console.log(`Mic Opened:         ${hasMicOpen ? 'PASS' : 'FAIL'}`);
  console.log(`Audio Frames:       ${hasAudioFrames ? 'PASS' : 'FAIL'}`);
  console.log(`Partial Result:     ${hasPartial ? 'PASS' : 'FAIL'}`);
  console.log(`Final Result:       ${hasFinal ? 'PASS' : 'FAIL'}`);
  console.log(`Wake Word Matched:  ${hasWakeMatch ? 'PASS' : 'FAIL'}`);
  console.log(`Transfer Callback:  ${hasTransfer ? 'PASS' : 'FAIL'}`);
  console.log(`Command STT Start:  ${hasCommandSTT ? 'PASS' : 'FAIL'}`);
  
  // Check for errors
  const errors = logs.filter(l => l.includes('error') || l.includes('Error') || l.includes('failed') || l.includes('Failed'));
  if (errors.length > 0) {
    console.log('\n=== ERRORS FOUND ===');
    errors.forEach(e => console.log('  ERROR:', e));
  }
  
  // Count wake word detections (should be exactly 1)
  const wakeDetections = logs.filter(l => l.includes('WAKE WORD MATCHED'));
  console.log(`\nWake detections count: ${wakeDetections.length} (expected: 1)`);
  
  // Print all VOSK-related logs in order
  console.log('\n=== ALL VOSK/VAYRIS LOGS (chronological) ===');
  logs.filter(l => l.includes('[VOSK]') || l.includes('[VAYRIS]')).forEach(l => console.log('  ', l));
  
  await browser.close();
  console.log('\n=== TEST COMPLETE ===');
})();
