const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'boomerang.db');
const TEMPLATE_PATH = path.join(__dirname, 'PLANTILLA_ANALISTA_LIMPIA.xlsx');

const getConcentrado = (fecha, area) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(`
      SELECT p.nomina, u.nombre AS operador, p.area, p.fecha, p.maquina, p.turno,
             e.proyecto, e.codigo, e.descripcion, e.estandar,
             p.eficiencia_global AS promedio,
             p.horas_efectivas AS tiempo_real,
             p.horas_jornada AS tiempo_programado,
             p.interferencias,
             p.total_piezas AS reporte_prod
      FROM produccion p
      LEFT JOIN estandares e ON p.codigo = e.codigo
      LEFT JOIN usuarios u ON p.nomina = u.nomina
      WHERE p.fecha = ? AND p.area = ?
    `, [fecha, area], (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

router.get('/concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const registros = await getConcentrado(fecha, area);

    const agrupado = {};
    registros.forEach(r => {
      const key = `${r.nomina}_${r.codigo || ''}`;
      if (!agrupado[key]) agrupado[key] = { ...r, piezas: 0, total_eficiencia: 0, count: 0 };
      agrupado[key].piezas += Number(r.reporte_prod || 0);
      agrupado[key].total_eficiencia += Number(r.promedio || 0);
      agrupado[key].count++;
    });

    const resultado = Object.values(agrupado).map(r => ({
      "Area": r.area,
      "Dia": r.fecha,
      "PROYECTO": r.proyecto || '',
      "CODIGO": r.codigo || '',
      "DESCRIPCION": r.descripcion || '',
      "MAQUINA": r.maquina || '',
      "N. PERSONAS REQUERIDAS": 1,
      "T/C": '',
      "ESTANDAR": r.estandar || '',
      "NOMINA": r.nomina,
      "OPERADOR": r.operador,
      "NOMINA AUX 1": '',
      "AUX 1": '',
      "NOMINA AUX 2": '',
      "AUX 2": '',
      "Promedio Alcanzado": (r.total_eficiencia / r.count).toFixed(2),
      "Total Tiempo Programado": r.tiempo_programado || 0,
      "Tiempo Real Utilizado": r.tiempo_real || 0,
      "Tiempo Promedio Utilizado": ((r.tiempo_real || 0) / (r.count || 1)).toFixed(2),
      "Objetivo Planeado": '',
      "Objetivo con Int": '',
      "Reporte Prod.": r.piezas,
      "Saldo": '',
      "Eficiencia Reportada  c/ Int": '',
      "Eficiencia Efectiva": r.promedio || '',
      "No. de Personas": 1,
      "Total Hrs Reportadas": r.tiempo_real || 0
    }));

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar concentrado', detalle: err.message });
  }
});

module.exports = router;