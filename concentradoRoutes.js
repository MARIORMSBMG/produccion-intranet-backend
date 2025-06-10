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
      let c = 2;
      for (const value of Object.values(row)) {
        fila.getCell(c++).value = value;
      }
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
