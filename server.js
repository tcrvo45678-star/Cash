const path = require('path');
require('dotenv').config();
const express = require('express');
const apiRouter = require('./src/routes');
const { configError } = require('./src/sheetsStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`מעקב הכספים שלי רץ בכתובת: http://localhost:${PORT}`);
  const err = configError();
  if (err) {
    console.warn(`אזהרה: ${err}`);
  }
});
