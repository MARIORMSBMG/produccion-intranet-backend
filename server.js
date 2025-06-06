const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { Parser } = require('json2csv');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite3');

app.post('/login', (req, res) => {
  const { nomina, password } = req.body;
  db.get("SELECT * FROM usuarios WHERE nomina = ?", [nomina], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error interno' });
    if (!row) return res.status(401).json({ error: 'Usuario no encontrado' });
    bcrypt.compare(password, row.password, (err, result) => {
      if (result) {
        res.json({ ok: true, nombre: row.nombre_completo, rol: row.rol });
      } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
      }
    });
  });
});

app.post('/register', (req, res) => {
  const { nomina, nombre, password, rol = 'operador' } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Error al encriptar' });
    db.run("INSERT INTO usuarios (nomina, nombre_completo, password, rol) VALUES (?, ?, ?, ?)",
      [nomina, nombre, hash, rol],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al registrar usuario' });
        res.json({ ok: true });
      });
  });
});

app.post('/registro', (req, res) => {
  const { nomina, nombre, area, fecha, registros } = req.body;
  const stmt = db.prepare(`INSERT INTO produccion 
    (nomina, nombre, area, fecha, hora, codigo, estandar, piezas, tiempo, interferencias, eficiencia)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of registros) {
    stmt.run(nomina, nombre, area, fecha, r.hora, r.codigo, r.estandar, r.piezas, r.tiempo, r.interferencias.join(", "), r.eficiencia);
  }
  stmt.finalize();
  res.json({ ok: true });
});

app.get('/exportar', (req, res) => {
  db.all("SELECT * FROM produccion", [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al exportar' });
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment('produccion.csv');
    res.send(csv);
  });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
