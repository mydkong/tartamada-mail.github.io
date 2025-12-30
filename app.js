import express from 'express'
import fs from 'fs'
import path from 'path'

const app = express()
const PORT = 443

app.use(express.static(path.join(process.cwd(), 'src')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
  //res.send(req)
});

app.get('/*', (req, res) => {
  if (fs.existsSync(req.url))
    res.sendFile(path.join(__dirname, 'src', req.url));
  else
    res.status(404).send('Erreur 404 : Page non trouvée')
  //res.send(req)
})

app.listen(PORT, () => {
  console.log(`Serveur en ligne !`);
});
