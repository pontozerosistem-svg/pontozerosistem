const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');
const searchStr = '<div class="modal-visual">';
const idx = content.indexOf(searchStr);
if (idx !== -1) {
    const srcStart = content.indexOf('src="', idx) + 5;
    const srcEnd = content.indexOf('"', srcStart);
    content = content.substring(0, srcStart) + 'popup-visual.png?v=2' + content.substring(srcEnd);
    fs.writeFileSync('index.html', content);
    console.log('Successfully replaced src inside modal-visual!');
} else {
    console.log('modal-visual not found');
}
