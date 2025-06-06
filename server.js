
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const ExcelJS = require('exceljs');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const db = new sqlite3.Database('produccion.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomina TEXT,
    nombre TEXT,
    area TEXT,
    fecha TEXT,
    hora TEXT,
    codigo TEXT,
    estandar INTEGER,
    piezas INTEGER,
    interferencias TEXT,
    tiempo INTEGER,
    eficiencia REAL
  )`);
});

app.post('/registro', (req, res) => {
  const { nomina, nombre, area, fecha, registros } = req.body;
  const stmt = db.prepare(`INSERT INTO produccion
    (nomina, nombre, area, fecha, hora, codigo, estandar, piezas, interferencias, tiempo, eficiencia)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  registros.forEach(r => {
    stmt.run(nomina, nombre, area, fecha, r.hora, r.codigo, r.estandar, r.piezas, r.interferencias.join(', '), r.tiempo, r.eficiencia);
  });

  stmt.finalize();
  res.sendStatus(200);
});

app.get('/exportar-produccion', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Producción');
  sheet.columns = [
    { header: 'Nómina', key: 'nomina' },
    { header: 'Nombre', key: 'nombre' },
    { header: 'Área', key: 'area' },
    { header: 'Fecha', key: 'fecha' },
    { header: 'Hora', key: 'hora' },
    { header: 'Código', key: 'codigo' },
    { header: 'Estándar', key: 'estandar' },
    { header: 'Piezas', key: 'piezas' },
    { header: 'Interferencias', key: 'interferencias' },
    { header: 'Tiempo (min)', key: 'tiempo' },
    { header: 'Eficiencia (%)', key: 'eficiencia' }
  ];

  db.all("SELECT * FROM produccion", [], async (err, rows) => {
    if (err) return res.sendStatus(500);
    sheet.addRows(rows);
    sheet.autoFilter = 'A1:K1';
    const filePath = './produccion_export.xlsx';
    await workbook.xlsx.writeFile(filePath);
    res.download(filePath, 'produccion.xlsx');
  });
});

app.listen(3000, () => console.log("Servidor corriendo en https://produccion-intranet-backend.onrender.com"));
