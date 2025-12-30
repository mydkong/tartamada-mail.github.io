import express from 'express'
import fs from 'fs'
import path from 'path'

const app = express()
const PORT = 443
console.log('test')

//app.use(express.static(path.join(process.cwd(), 'src')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
  //res.send(req)
});

app.get('/script.js', (req, res) => {
  const filePath = path.join(__dirname, 'src', req.url.substr(1))
  console.log(filePath)
  //if (fs.existsSync(filePath))
    //res.sendFile(filePath)
  /*else
    res.status(404).send('Erreur 404 : Page non trouvée')*/
  res.send('test')
})

app.listen(PORT, () => {
  console.log(`Serveur en ligne !`);
});
