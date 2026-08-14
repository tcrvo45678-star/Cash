const path = require('path');
const express = require('express');
const apiRouter = require('./src/routes');
const { ensureFile } = require('./src/excelStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, async () => {
  await ensureFile();
  console.log(`מעקב הכספים שלי רץ בכתובת: http://localhost:${PORT}`);
});
