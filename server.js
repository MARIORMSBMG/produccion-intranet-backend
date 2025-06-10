
const express = require('express');
const app = express();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const ExcelJS = require('exceljs');

app.use(cors());
app.use(express.json());

const SECRET = 'boomerang-secret';
const db = new sqlite3.Database('./boomerang.db');

// Login
app.post('/login', (req, res) => {
  const { nomina, password } = req.body;
  db.get('SELECT * FROM usuarios WHERE nomina = ?', [nomina], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Usuario no encontrado' });
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        const token = jwt.sign({ nomina: user.nomina, rol: user.rol }, SECRET, { expiresIn: '8h' });
        res.json({ token, rol: user.rol });
      } else {
        res.status(403).json({ error: 'Contraseña incorrecta' });
      }
    });
  });
});

// Registro
app.post('/register', (req, res) => {
  const { nomina, nombre, password, rol } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO usuarios (nomina, nombre, password, rol) VALUES (?, ?, ?, ?)', [nomina, nombre, hash, rol], function(err) {
    if (err) return res.status(500).json({ error: 'Error al registrar usuario' });
    res.json({ success: true });
  });
});

// Obtener nombre
app.get('/nombre/:nomina', (req, res) => {
  const nomina = req.params.nomina;
  db.get('SELECT nombre FROM usuarios WHERE nomina = ?', [nomina], (err, row) => {
    if (err || !row) return res.json({ nombre: '' });
    res.json({ nombre: row.nombre });
  });
});

// Middleware
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(403);
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);
    req.user = decoded;
    next();
  });
}

// Registro de producción compatible con formulario.html
app.post('/registro', auth, (req, res) => {
  const { nomina, nombre, turno, maquina, produccion } = req.body;
  const fecha = new Date().toISOString().split('T')[0];
  const area = 'Producción';

  const stmt = db.prepare(\`INSERT INTO produccion (
    nomina, nombre, area, fecha, hora, proyecto, codigo, estandar,
    cantidad, tiempo_interferencia, motivo_interferencia,
    promedio_eficiencia, total_piezas, eficiencia_ajustada, turno, maquina, tipo_interferencia
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`);

  try {
    for (const fila of produccion) {
      const total_piezas = (fila.piezas1 || 0) + (fila.piezas2 || 0);
      const tiempo_efectivo = 60 - (fila.interferencia || 0);
      const tiempo_estandar = (fila.estandar1 || 0) * (fila.piezas1 || 0) + (fila.estandar2 || 0) * (fila.piezas2 || 0);
      const eficiencia = tiempo_efectivo > 0 ? ((tiempo_estandar / tiempo_efectivo) * 100).toFixed(2) : 0;

      if (fila.codigo1) {
        stmt.run([
          nomina, nombre, area, fecha, fila.hora, fila.proyecto1, fila.codigo1, fila.estandar1 || 0,
          fila.piezas1 || 0, fila.interferencia || 0, fila.motivo, eficiencia, total_piezas, eficiencia, turno, maquina, fila.tipo
        ]);
      }
      if (fila.codigo2) {
        stmt.run([
          nomina, nombre, area, fecha, fila.hora, fila.proyecto2, fila.codigo2, fila.estandar2 || 0,
          fila.piezas2 || 0, fila.interferencia || 0, fila.motivo, eficiencia, total_piezas, eficiencia, turno, maquina, fila.tipo
        ]);
      }
    }

    stmt.finalize();
    res.json({ success: true });
  } catch (error) {
    console.error('Error al guardar producción:', error.message);
    res.status(500).json({ error: 'Error al guardar producción' });
  }
});

// Estándares con proyecto
app.get('/api/estandares', async (req, res) => {
  const area = req.query.area;
  const archivo = path.join(__dirname, 'estandares', \`Estandares_\${area.toLowerCase()}.xlsx\`);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(archivo);
    const hoja = workbook.worksheets[0];

    const estandares = hoja.getColumn(1).values
      .map((codigo, i) => {
        const estandar = hoja.getCell(\`L\${i}\`).value;
        const proyecto = hoja.getCell(\`N\${i}\`).value;
        return i > 1 && codigo && estandar ? {
          codigo: codigo.toString().trim(),
          estandar: parseFloat(estandar),
          proyecto: proyecto?.toString().trim() || ''
        } : null;
      })
      .filter(e => e !== null);

    res.json(estandares);
  } catch (err) {
    console.error("Error al leer estándares:", err.message);
    res.status(500).json({ error: "No se pudieron cargar los estándares" });
  }
});

// Resumen diario
app.get('/resumen', auth, (req, res) => {
  const fecha = req.query.fecha;
  db.all(\`
    SELECT nomina, nombre, SUM(cantidad) AS total_piezas,
    ROUND(AVG(promedio_eficiencia), 1) AS eficiencia_prom,
    ROUND(AVG(eficiencia_ajustada), 1) AS eficiencia_ajustada,
    SUM(tiempo_interferencia) AS total_interferencia
    FROM produccion WHERE fecha = ?
    GROUP BY nomina
  \`, [fecha], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error en resumen' });
    res.json(rows);
  });
});

const concentradoRoutes = require('./concentradoRoutes');
app.use('/', concentradoRoutes);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Servidor iniciado en http://localhost:\${PORT}\`);
});
