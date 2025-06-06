
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const SECRET_KEY = 'boomerang_secret';
const db = new sqlite3.Database('./boomerang.db');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware para verificar token
function autenticarToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

// Endpoint de login
app.post('/login', (req, res) => {
  const { nomina, password } = req.body;
  db.get('SELECT * FROM usuarios WHERE nomina = ? AND password = ?', [nomina, password], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error de servidor' });
    if (!row) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ nomina: row.nomina, rol: row.rol }, SECRET_KEY);
    res.json({ token, rol: row.rol });
  });
});

// Endpoint para registrar nuevo usuario
app.post('/register', (req, res) => {
  const { nomina, nombre, password, rol } = req.body;
  db.run('INSERT INTO usuarios (nomina, nombre, password, rol) VALUES (?, ?, ?, ?)',
    [nomina, nombre, password, rol],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error al registrar usuario' });
      res.json({ success: true });
    }
  );
});

// Endpoint para guardar registros de producción
app.post('/registro', autenticarToken, (req, res) => {
  const data = req.body;
  const stmt = db.prepare(`INSERT INTO produccion 
    (nomina, nombre, area, fecha, hora, proyecto, codigo, cantidad, tiempo_interferencia, motivo_interferencia, promedio_eficiencia, total_piezas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  data.forEach(row => {
    stmt.run([
      row.nomina,
      row.nombre,
      row.area,
      row.fecha,
      row.hora,
      row.proyecto,
      row.codigo,
      row.cantidad,
      row.tiempo_interferencia,
      row.motivo_interferencia,
      row.promedio_eficiencia,
      row.total_piezas
    ]);
  });

  stmt.finalize(err => {
    if (err) return res.status(500).json({ error: 'Error al guardar producción' });
    res.json({ success: true });
  });
});

// Endpoint para obtener nombre por nómina
app.get('/nombre/:nomina', autenticarToken, (req, res) => {
  const { nomina } = req.params;
  db.get('SELECT nombre FROM usuarios WHERE nomina = ?', [nomina], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al buscar nombre' });
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json({ nombre: row.nombre });
  });
});

// Nuevo endpoint para resumen del supervisor o analista
app.get('/resumen-supervisor', autenticarToken, async (req, res) => {
  const rol = req.user.rol;
  if (rol !== 'supervisor' && rol !== 'analista') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM produccion WHERE fecha = ? AND area = ?`,
        [fecha, area],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Agrupar por nómina y calcular totales
    const resumen = {};
    for (const row of rows) {
      if (!resumen[row.nomina]) {
        resumen[row.nomina] = {
          nomina: row.nomina,
          nombre: row.nombre,
          totalPiezas: 0,
          eficienciaTotal: 0,
          registros: 0,
          tiempoInterferenciaTotal: 0
        };
      }
      resumen[row.nomina].totalPiezas += parseInt(row.total_piezas || 0);
      resumen[row.nomina].eficienciaTotal += parseFloat(row.promedio_eficiencia || 0);
      resumen[row.nomina].tiempoInterferenciaTotal += parseInt(row.tiempo_interferencia || 0);
      resumen[row.nomina].registros += 1;
    }

    const resultado = Object.values(resumen).map(op => ({
      nomina: op.nomina,
      nombre: op.nombre,
      totalPiezas: op.totalPiezas,
      promedioEficiencia: (op.eficienciaTotal / op.registros).toFixed(1),
      tiempoInterferenciaTotal: op.tiempoInterferenciaTotal
    }));

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

app.listen(3000, () => {
  console.log('Servidor iniciado en http://localhost:3000');
});
