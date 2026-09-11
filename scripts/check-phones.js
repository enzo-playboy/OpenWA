const fs = require('fs');
const path = require('path');
const DIR = 'e:/prosp/OpenWA/clientes';

let mobiles = 0;
let landlines = 0;
let others = 0;

fs.readdirSync(DIR).forEach(f => {
  if (!f.endsWith('.md')) return;
  const content = fs.readFileSync(path.join(DIR, f), 'utf8');
  const match = content.match(/telefone:\s*"([^"]+)"/);
  if (match) {
    const phone = match[1].replace(/\D/g, '');
    if (phone.length === 12 && phone.startsWith('55') && ['2','3','4','5'].includes(phone[4])) {
      landlines++;
    } else if (phone.length === 13) {
      mobiles++;
    } else {
      others++;
      console.log('Other length:', phone);
    }
  }
});

console.log(`Total Leads: ${mobiles + landlines + others}`);
console.log(`Mobiles (13 digits): ${mobiles}`);
console.log(`Landlines (12 digits): ${landlines}`);
console.log(`Others: ${others}`);
