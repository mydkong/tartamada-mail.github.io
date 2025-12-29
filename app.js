import express from 'express'

const app = express()
const PORT = 443

app.use(express.static(path.join(process.cwd(), 'src')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
  console.info(req)
});

app.get('*' (req, res) => {
  //res.sendFile(path.join(__dirname, 'src', ''));
  console.info(req)
})

app.listen(PORT, () => {
  console.log(`Serveur en ligne !`);
});
