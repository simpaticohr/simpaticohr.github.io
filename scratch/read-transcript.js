import fs from 'fs';

const lines = fs.readFileSync('C:/Users/user/.gemini/antigravity-ide/brain/7ddac6aa-d603-4bb5-a4a1-b8b4e4a4f4cd/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');

const lineNumbers = [11, 71, 88, 106, 129, 130, 135, 136, 144, 188, 382];

for (let n of lineNumbers) {
  if (lines[n-1]) {
    console.log(`Line ${n}:`, lines[n-1].substring(0, 300));
  }
}
