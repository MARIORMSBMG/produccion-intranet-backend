// concentradoRoutes.js completo con exportar-concentrado usando plantilla
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

function estructurarDatos(registros) {
  const agrupado = {};
  registros.forEach(r => {
    const key = `${r.nomina}_${r.codigo || ''}`;
    if (!agrupado[key]) agrupado[key] = { ...r, piezas: 0, total_eficiencia: 0, count: 0 };
    agrupado[key].piezas += Number(r.reporte_prod || 0);
    agrupado[key].total_eficiencia += Number(r.promedio || 0);
    agrupado[key].count++;
  });

  return Object.values(agrupado).map(r => ([
    r.area,
    r.fecha,
    r.proyecto || '',
    r.codigo || '',
    r.descripcion || '',
    r.maquina || '',
    1, // personas requeridas
    '', // T/C
    r.estandar || '',
    r.nomina,
    r.operador,
    '', '', '', '',
    (r.total_eficiencia / r.count).toFixed(2),
    r.tiempo_programado || 0,
    r.tiempo_real || 0,
    ((r.tiempo_real || 0) / (r.count || 1)).toFixed(2),
    '', '',
    r.piezas,
    '', '',
    r.promedio || '',
    1,
    r.tiempo_real || 0
  ]));
}

router.get('/concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });
  try {
    const registros = await getConcentrado(fecha, area);
    const resultado = estructurarDatos(registros).map(arr => Object.fromEntries([
      ["Area", arr[0]], ["Dia", arr[1]], ["PROYECTO", arr[2]], ["CODIGO", arr[3]], ["DESCRIPCION", arr[4]],
      ["MAQUINA", arr[5]], ["N. PERSONAS REQUERIDAS", arr[6]], ["T/C", arr[7]], ["ESTANDAR", arr[8]],
      ["NOMINA", arr[9]], ["OPERADOR", arr[10]], ["NOMINA AUX 1", arr[11]], ["AUX 1", arr[12]],
      ["NOMINA AUX 2", arr[13]], ["AUX 2", arr[14]], ["Promedio Alcanzado", arr[15]],
      ["Total Tiempo Programado", arr[16]], ["Tiempo Real Utilizado", arr[17]],
      ["Tiempo Promedio Utilizado", arr[18]], ["Objetivo Planeado", arr[19]], ["Objetivo con Int", arr[20]],
      ["Reporte Prod.", arr[21]], ["Saldo", arr[22]], ["Eficiencia Reportada  c/ Int", arr[23]],
      ["Eficiencia Efectiva", arr[24]], ["No. de Personas", arr[25]], ["Total Hrs Reportadas", arr[26]]
    ]));
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar concentrado', detalle: err.message });
  }
});

router.get('/exportar-concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });
  try {
    const registros = await getConcentrado(fecha, area);
    const datos = estructurarDatos(registros);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const ws = workbook.getWorksheet(1);

    datos.forEach((fila, i) => {
      const row = ws.getRow(7 + i);
      fila.forEach((val, j) => row.getCell(j + 2).value = val);
      row.commit();
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Concentrado_${area}_${fecha}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Error al exportar', detalle: err.message });
  }
});

module.exports = router;
