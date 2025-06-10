const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'boomerang_test.db'); // BD de prueba
const TEMPLATE_PATH = path.join(__dirname, 'PLANTILLA ANALISTA.xlsx');

// Obtener producción por fecha y área
const getProduccion = (fecha, area) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(`
      SELECT p.*, u.nombre 
      FROM produccion p 
      JOIN usuarios u ON p.nomina = u.nomina
      WHERE p.fecha = ? AND p.area = ?
    `, [fecha, area], (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Endpoint: /concentrado
router.get('/concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const rows = await getProduccion(fecha, area);
    const resultado = rows.map(row => {
      const interferencias = JSON.parse(row.interferencias || '[]');
      const resumenInterf = {};
      interferencias.forEach(i => {
        resumenInterf[i.motivo] = (resumenInterf[i.motivo] || 0) + Number(i.tiempo || 0);
      });

      return {
        nomina: row.nomina,
        nombre: row.nombre,
        turno: row.turno,
        maquina: row.maquina,
        piezas_totales: row.piezas_totales,
        eficiencia: row.eficiencia_promedio,
        horas: row.horas_reportadas,
        ...resumenInterf
      };
    });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el concentrado', detalle: err.message });
  }
});

// Endpoint: /exportar-concentrado
router.get('/exportar-concentrado', async (req, res) => {
  const { fecha, area } = req.query;
  if (!fecha || !area) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const rows = await getProduccion(fecha, area);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);
    const worksheet = workbook.getWorksheet(1);

    let startRow = 6;
    rows.forEach((row, i) => {
      const interferencias = JSON.parse(row.interferencias || '[]');
      const resumen = {};
      interferencias.forEach(i => {
        resumen[i.motivo] = (resumen[i.motivo] || 0) + Number(i.tiempo || 0);
      });

      const fila = worksheet.getRow(startRow + i);
      fila.getCell('B').value = row.nomina;
      fila.getCell('C').value = row.nombre;
      fila.getCell('D').value = row.turno;
      fila.getCell('E').value = row.maquina;
      fila.getCell('F').value = row.piezas_totales;
      fila.getCell('G').value = row.eficiencia_promedio;
      fila.getCell('H').value = row.horas_reportadas;

      const columnasInterf = {
        "Cambio de modelo": "I",
        "Limpieza": "J",
        "Habilitado de material": "K",
        "Mantenimiento": "L"
      };

      for (const [motivo, col] of Object.entries(columnasInterf)) {
        fila.getCell(col).value = resumen[motivo] || 0;
      }

      fila.commit();
    });

    const tempPath = path.join(__dirname, `Concentrado_${fecha}_${area}.xlsx`);
    await workbook.xlsx.writeFile(tempPath);

    res.download(tempPath, `Concentrado_${fecha}_${area}.xlsx`, () => {
      fs.unlinkSync(tempPath); // elimina temporal
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al exportar', detalle: err.message });
  }
});

module.exports = router;

