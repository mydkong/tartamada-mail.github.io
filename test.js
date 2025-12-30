import express from 'express';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;  // Utilisez le port de l'environnement ou 3000 par défaut

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.get('/test', (req, res) => {
  res.send('test');
});

app.listen(PORT, () => {
  console.log(`Serveur en ligne sur le port ${PORT}`);
});
