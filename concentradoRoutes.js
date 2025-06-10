const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'boomerang_test.db');
const TEMPLATE_PATH = path.join(__dirname, 'PLANTILLA_ANALISTA_LIMPIA.xlsx');

const getProduccion = (fecha, area) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(`SELECT * FROM produccion WHERE fecha = ? AND area = ?`, [fecha, area], (err, rows) => {
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
    const datos = await getProduccion(fecha, area);
    const resultado = datos.map(row => ({
      "Area": row.area,
      "Dia": row.fecha,
      "PROYECTO": row.proyecto || "",
      "CODIGO": row.codigo || "",
      "DESCRIPCION": row.descripcion || "",
      "MAQUINA": row.maquina || "",
      "N. PERSONAS REQUERIDAS": row.personas || 1,
      "T/C": row.tc || "",
      "ESTANDAR": row.estandar || "",
      "NOMINA": row.nomina,
      "OPERADOR": row.nombre,
      "NOMINA AUX 1": row.nomina_aux1 || "0",
      "AUX 1": row.aux1 || "#N/D",
      "NOMINA AUX 2": row.nomina_aux2 || "0",
      "AUX 2": row.aux2 || "#N/D",
      "Promedio Alcanzado": row.promedio || 0,
      "Total Tiempo Programado": row.tiempo_programado || 4.5,
      "Tiempo Real Utilizado": row.tiempo_real || 4.3,
      "Tiempo Promedio Utilizado": row.tiempo_promedio || "96.30%",
      "Objetivo Planeado": row.objetivo_planeado || 437,
      "Objetivo con Int": row.objetivo_int || 420,
      "Reporte Prod.": row.reporte_prod || 392,
      "Saldo": row.saldo || -45,
      "Eficiencia Reportada  c/ Int": row.efic_con_int || "93.26%",
      "Eficiencia Efectiva": row.efic_efectiva || "89.81%",
      "No. de Personas": row.no_personas || 1,
      "Total Hrs Reportadas": row.horas_reportadas || 4.5
    }));
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar concentrado', detalle: err.message });
  }
});

router.get('/exportar-concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const rows = await getProduccion(fecha, area);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const worksheet = workbook.getWorksheet(1);

    let startRow = 7;
    rows.forEach((row, i) => {
      const fila = worksheet.getRow(startRow + i);
      const datos = [
        row.area, row.fecha, row.proyecto, row.codigo, row.descripcion, row.maquina,
        row.personas, row.tc, row.estandar, row.nomina, row.nombre, row.nomina_aux1, row.aux1,
        row.nomina_aux2, row.aux2, row.promedio, row.tiempo_programado, row.tiempo_real,
        row.tiempo_promedio, row.objetivo_planeado, row.objetivo_int, row.reporte_prod, row.saldo,
        row.efic_con_int, row.efic_efectiva, row.no_personas, row.horas_reportadas
      ];
      datos.forEach((val, j) => fila.getCell(j + 2).value = val);
      fila.commit();
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