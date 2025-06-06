const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./db.sqlite3");

// Crear tabla de usuarios si no existe
db.run(`CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT UNIQUE,
  password TEXT,
  nombre TEXT,
  rol TEXT DEFAULT 'operador'
)`);

// Crear tabla de producción si no existe
db.run(`CREATE TABLE IF NOT EXISTS produccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT,
  nombre TEXT,
  area TEXT,
  fecha TEXT,
  hora TEXT,
  codigo TEXT,
  estandar REAL,
  piezas INTEGER,
  tiempo REAL,
  interferencias TEXT,
  eficiencia REAL
)`);

// Endpoint para registrar usuarios
app.post("/register", (req, res) => {
  const { nomina, nombre, password } = req.body;
  const rol = "operador";

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: "Error al encriptar" });

    db.run(`INSERT INTO usuarios (nomina, password, nombre, rol)
            VALUES (?, ?, ?, ?)`, [nomina, hash, nombre, rol], function (err) {
      if (err) return res.status(500).json({ error: "Error al registrar" });
      res.json({ ok: true });
    });
  });
});

// Endpoint para login
app.post("/login", (req, res) => {
  const { nomina, password } = req.body;

  db.get("SELECT * FROM usuarios WHERE nomina = ?", [nomina], (err, row) => {
    if (err || !row) return res.status(401).json({ error: "Usuario no encontrado" });

    bcrypt.compare(password, row.password, (err, result) => {
      if (result) {
        res.json({ ok: true, nombre: row.nombre, rol: row.rol });
      } else {
        res.status(401).json({ error: "Contraseña incorrecta" });
      }
    });
  });
});

// Endpoint para guardar producción
app.post("/registro", (req, res) => {
  const { nomina, nombre, area, fecha, registros } = req.body;
  const stmt = db.prepare(`INSERT INTO produccion 
    (nomina, nombre, area, fecha, hora, codigo, estandar, piezas, tiempo, interferencias, eficiencia)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  registros.forEach(r => {
    stmt.run(nomina, nombre, area, fecha, r.hora, r.codigo, r.estandar, r.piezas, r.tiempo, r.interferencias.join(", "), r.eficiencia);
  });

  stmt.finalize();
  res.json({ ok: true });
});

// Endpoint para exportar producción a Excel
app.get("/exportar-produccion", (req, res) => {
  db.all("SELECT * FROM produccion", [], async (err, rows) => {
    if (err) return res.status(500).json({ error: "Error al obtener datos" });

    res.json(rows);
  });
});

// Endpoint para descarga directa de CSV
app.get("/exportar", (req, res) => {
  db.all("SELECT * FROM produccion", [], async (err, rows) => {
    if (err) return res.status(500).send("Error al generar archivo");
    const csv = rows.map(r => Object.values(r).join(",")).join("\n");
    res.header("Content-Type", "text/csv");
    res.attachment("produccion.csv");
    res.send(csv);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});