import express from 'express'

const app = express()
const PORT = 443

app.use(express.static(path.join(process.cwd(), 'src')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
  console.log(req)
});

app.get('*' (req, res) => {
  //res.sendFile(path.join(__dirname, 'src', ''));
  console.log(req)
})

app.listen(PORT, () => {
  console.log(`Serveur en ligne !`);
});
