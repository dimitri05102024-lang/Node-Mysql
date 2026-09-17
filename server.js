const express = require('express');
const mysql = require('mysql2');  // <-- CAMBIO: era 'mysql', ahora 'mysql2' para coincidir con package.json
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json());

// Asegurar existencia de carpetas públicas para imágenes y códigos QR
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./qrs')) fs.mkdirSync('./qrs');

// Servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/qrs', express.static(path.join(__dirname, 'qrs')));

// Configuración del almacenamiento para Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Conexión a MySQL (Railway provee las variables de entorno automáticamente)
const conexion = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

conexion.connect((err) => {
  if (err) {
    console.error('Error al conectar a MySQL:', err);
  } else {
    console.log('Conectado exitosamente a la base de datos MySQL en Railway.');
  }
});

// ==========================================
// ENDPOINTS DE AUTENTICACIÓN Y USUARIOS
// ==========================================

app.post('/login', (req, res) => {
  const { usuario, clave } = req.body;
  const sql = 'SELECT * FROM usuarios WHERE usuario = ? AND clave = ?';
  conexion.query(sql, [usuario, clave], (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: 'Error en servidor' });
    if (results.length > 0) {
      res.json({ status: 'ok', rol: results[0].rol, mensaje: 'Bienvenido' });
    } else {
      res.json({ status: 'error', mensaje: 'Credenciales incorrectas' });
    }
  });
});

app.get('/maestros', (req, res) => {
  const sql = 'SELECT id, nombre, usuario FROM usuarios WHERE LOWER(rol) NOT LIKE "%admin%"';
  conexion.query(sql, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

// ==========================================
// ENDPOINTS DE MATERIALES
// ==========================================

app.get('/materiales', (req, res) => {
  const sql = `
    SELECT m.*, 
    (m.cantidad - IFNULL((SELECT COUNT(*) FROM prestamos p WHERE p.material_id = m.id AND p.estado = 'Pendiente'), 0)) AS disponibles 
    FROM materiales m`;
  conexion.query(sql, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

app.post('/materiales', upload.single('foto'), (req, res) => {
  const { nombre, cantidad, categoria } = req.body;
  const foto = req.file ? `uploads/${req.file.filename}` : null;
  const sql = 'INSERT INTO materiales (nombre, cantidad, categoria, foto) VALUES (?, ?, ?, ?)';
  conexion.query(sql, [nombre, cantidad, categoria, foto], (err, result) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Material registrado con éxito', id: result.insertId });
  });
});

app.put('/materiales/:id', (req, res) => {
  const { nombre, cantidad, categoria } = req.body;
  const sql = 'UPDATE materiales SET nombre = ?, cantidad = ?, categoria = ? WHERE id = ?';
  conexion.query(sql, [nombre, cantidad, categoria, req.params.id], (err) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Material actualizado exitosamente' });
  });
});

app.delete('/materiales/:id', (req, res) => {
  const sql = 'DELETE FROM materiales WHERE id = ?';
  conexion.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Material eliminado exitosamente' });
  });
});

// ==========================================
// ENDPOINTS DE PERMISOS
// ==========================================

app.get('/permisos', (req, res) => {
  const sql = `
    SELECT p.*, u.nombre AS docente, m.nombre AS material 
    FROM permisos p 
    LEFT JOIN usuarios u ON p.maestro = u.usuario OR p.maestro = u.nombre 
    LEFT JOIN materiales m ON p.material_id = m.id`;
  conexion.query(sql, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

app.get('/permisos/maestro/:nombre', (req, res) => {
  const sql = 'SELECT * FROM permisos WHERE maestro = ?';
  conexion.query(sql, [req.params.nombre], (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

app.post('/permisos', (req, res) => {
  const { maestro, material_id, puede_ver, puede_prestar, puede_devolver } = req.body;
  const sql = 'INSERT INTO permisos (maestro, material_id, puede_ver, puede_prestar, puede_devolver) VALUES (?, ?, ?, ?, ?)';
  conexion.query(sql, [maestro, material_id, puede_ver, puede_prestar, puede_devolver], (err) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Permiso asignado correctamente' });
  });
});

app.delete('/permisos/:id', (req, res) => {
  const sql = 'DELETE FROM permisos WHERE id = ?';
  conexion.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Permiso eliminado' });
  });
});

// ==========================================
// ENDPOINTS DE PRÉSTAMOS
// ==========================================

app.get('/prestamos', (req, res) => {
  const { maestro, estado } = req.query;
  let sql = `
    SELECT p.*, m.nombre AS material, p.maestro AS docente 
    FROM prestamos p 
    LEFT JOIN materiales m ON p.material_id = m.id 
    WHERE 1=1`;
  const params = [];

  if (maestro) {
    sql += ' AND p.maestro = ?';
    params.push(maestro);
  }
  if (estado) {
    sql += ' AND p.estado = ?';
    params.push(estado);
  }

  conexion.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

app.post('/prestamos', (req, res) => {
  const { material_id, fecha_prestamo, hora_prestamo, maestro } = req.body;
  const sql = 'INSERT INTO prestamos (material_id, fecha_prestamo, hora_prestamo, maestro, estado) VALUES (?, ?, ?, ?, "Pendiente")';
  conexion.query(sql, [material_id, fecha_prestamo, hora_prestamo, maestro], (err, result) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ status: 'ok', mensaje: 'Préstamo registrado exitosamente', id: result.insertId });
  });
});

app.put('/prestamos/devolver/:material_id', (req, res) => {
  const { fecha_devolucion, hora_devolucion } = req.body;
  const sql = `
    UPDATE prestamos 
    SET estado = "Devuelto", fecha_devolucion = ?, hora_devolucion = ? 
    WHERE material_id = ? AND estado = "Pendiente" 
    ORDER BY id DESC LIMIT 1`;
  conexion.query(sql, [fecha_devolucion, hora_devolucion, req.params.material_id], (err, result) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    if (result.affectedRows === 0) {
      return res.json({ status: 'error', mensaje: 'No hay préstamo pendiente para este material' });
    }
    res.json({ status: 'ok', mensaje: 'Material devuelto exitosamente' });
  });
});

app.get('/notificaciones/:maestro', (req, res) => {
  const sql = `
    SELECT p.*, m.nombre AS material 
    FROM prestamos p 
    LEFT JOIN materiales m ON p.material_id = m.id 
    WHERE p.maestro = ? AND p.estado = "Pendiente"`;
  conexion.query(sql, [req.params.maestro], (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json(results);
  });
});

// ==========================================
// DASHBOARD Y REPORTES
// ==========================================

app.get('/dashboard', (req, res) => {
  const sqlTotalMat = 'SELECT SUM(cantidad) AS total FROM materiales';
  const sqlPrestados = 'SELECT COUNT(*) AS total FROM prestamos WHERE estado = "Pendiente"';
  const sqlDevueltos = 'SELECT COUNT(*) AS total FROM prestamos WHERE estado = "Devuelto"';

  conexion.query(sqlTotalMat, (err, res1) => {
    conexion.query(sqlPrestados, (err, res2) => {
      conexion.query(sqlDevueltos, (err, res3) => {
        res.json({
          "total materiales": res1[0].total || 0,
          "prestados": res2[0].total || 0,
          "devueltos": res3[0].total || 0,
          "danados": 0
        });
      });
    });
  });
});

function obtenerFiltroReporte(req) {
  const { maestro, fecha_inicio, fecha_fin } = req.query;
  let sqlWhere = ' WHERE 1=1';
  const params = [];

  if (maestro && maestro.trim() !== '') {
    sqlWhere += ' AND maestro = ?';
    params.push(maestro);
  }
  if (fecha_inicio && fecha_inicio.trim() !== '') {
    sqlWhere += ' AND fecha_prestamo >= ?';
    params.push(fecha_inicio);
  }
  if (fecha_fin && fecha_fin.trim() !== '') {
    sqlWhere += ' AND fecha_prestamo <= ?';
    params.push(fecha_fin);
  }
  return { sqlWhere, params };
}

app.get('/reportes/total', (req, res) => {
  const { sqlWhere, params } = obtenerFiltroReporte(req);
  conexion.query(`SELECT COUNT(*) AS total FROM prestamos ${sqlWhere}`, params, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ total: results[0].total || 0 });
  });
});

app.get('/reportes/pendientes', (req, res) => {
  const { sqlWhere, params } = obtenerFiltroReporte(req);
  conexion.query(`SELECT COUNT(*) AS pendientes FROM prestamos ${sqlWhere} AND estado = 'Pendiente'`, params, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ pendientes: results[0].pendientes || 0 });
  });
});

app.get('/reportes/devueltos', (req, res) => {
  const { sqlWhere, params } = obtenerFiltroReporte(req);
  conexion.query(`SELECT COUNT(*) AS devueltos FROM prestamos ${sqlWhere} AND estado = 'Devuelto'`, params, (err, results) => {
    if (err) return res.status(500).json({ status: 'error', mensaje: err.message });
    res.json({ devueltos: results[0].devueltos || 0 });
  });
});

app.get('/reportes/pdf', (req, res) => {
  const { sqlWhere, params } = obtenerFiltroReporte(req);
  const sql = `SELECT p.*, m.nombre AS material FROM prestamos p LEFT JOIN materiales m ON p.material_id = m.id ${sqlWhere}`;

  conexion.query(sql, params, (err, results) => {
    if (err) return res.status(500).send(err.message);

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte.pdf');
    doc.pipe(res);

    doc.fontSize(18).text('Reporte de Préstamos', { align: 'center' });
    doc.moveDown();

    results.forEach((row, i) => {
      doc.fontSize(12).text(`${i + 1}. Material: ${row.material || row.material_id} | Maestro: ${row.maestro} | Estado: ${row.estado} | Fecha: ${row.fecha_prestamo}`);
    });

    doc.end();
  });
});

app.get('/reportes/excel', (req, res) => {
  const { sqlWhere, params } = obtenerFiltroReporte(req);
  const sql = `SELECT p.id, m.nombre AS material, p.maestro, p.fecha_prestamo, p.hora_prestamo, p.estado FROM prestamos p LEFT JOIN materiales m ON p.material_id = m.id ${sqlWhere}`;

  conexion.query(sql, params, (err, results) => {
    if (err) return res.status(500).send(err.message);

    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Préstamos");

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte.xlsx');
    res.send(buffer);
  });
});

// Servidor escuchando en el puerto asignado por Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo corriendo en el puerto ${PORT}`);
});