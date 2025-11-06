const express = require('express');
const mysql = require('mysql2/promise'); // Usamos la versión con promesas de mysql2
const { body, validationResult } = require('express-validator');
const os = require('os');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// --- Configuración de la Conexión a MariaDB/MySQL ---
let db;

/**
 * Función para establecer la conexión a la base de datos MariaDB.
 * Usamos un pool de conexiones para una mejor gestión de recursos.
 */
async function connectDB() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // Forzamos una conexión de prueba al pool para verificar que las credenciales son correctas.
    const connection = await db.getConnection();
    connection.release(); // Liberar la conexión inmediatamente después de la prueba.

    console.log('Conexión a MariaDB exitosa. Pool creado y probado.');
  } catch (err) {
    // Si la conexión de prueba falla, atrapamos el error aquí.
    console.error('Error crítico: No se pudo conectar a MariaDB. Verifique sus credenciales y el estado del servidor.', err.message);
    // Terminar la aplicación si no se puede conectar
    process.exit(1);
  }
}

connectDB();

// Función para encontrar la IP local no-loopback
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignora direcciones que no sean IPv4 y las direcciones internas (loopback)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'N/A';
};

// --- Validadores ---

// Validador para POST y PUT (requiere título y valida unicidad)
const validateMovie = [
  body('title')
    .notEmpty()
    .withMessage('El título es requerido')
    .custom(async (value, { req }) => {
      let id = req.params.id || 0;
      // Usamos db.execute para prepared statements, reemplazando $1, $2 por ?
      const [rows] = await db.execute(
        'SELECT id FROM movies WHERE title = ? AND id != ?',
        [value, id]
      );
      if (rows.length > 0) {
        throw new Error('El título ya existe para otra película');
      }
      return true;
    }),
  // Aseguramos que 'year' es un entero, si está presente
  body('year')
    .optional()
    .isInt()
    .withMessage('El año debe ser un número entero válido')
];

// Validador para PATCH (no requiere título, pero valida unicidad si se proporciona)
const validateMoviePatch = [
  body('title')
    .optional() // El título no es obligatorio para PATCH
    .custom(async (value, { req }) => {
      let id = req.params.id || 0;
      if (!value) return true; // Si el título no se proporciona, pasamos la validación
      
      // Validamos unicidad si se proporciona el título
      const [rows] = await db.execute(
        'SELECT id FROM movies WHERE title = ? AND id != ?',
        [value, id]
      );
      if (rows.length > 0) {
        throw new Error('El título ya existe para otra película');
      }
      return true;
    }),
  body('year')
    .optional()
    .isInt()
    .withMessage('El año debe ser un número entero válido')
];


// --- Rutas ---

app.get('/', (req, res) => {
  res.send(`¡Servidor Express con MariaDB funcionando! (Hostname: ${os.hostname()}, IP: ${getLocalIp()}:${port})`);
});

// GET /movies - Obtener todas las películas
app.get('/movies', async (req, res) => {
  try {
    // db.execute devuelve [rows, fields]
    const [rows] = await db.execute("SELECT * FROM movies");
    res.json(rows);
  } catch (err) {
    res.status(500).json({
      code: 1001,
      message: 'Error al obtener las películas',
      error_message: err.message
    });
  }
});

// GET /movies/:id - Obtener una película por ID
app.get('/movies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'ID inválido' });
    }
    
    // ATENCIÓN: Corregida vulnerabilidad SQLi del código original.
    const [rows] = await db.execute("SELECT * FROM movies WHERE id = ?", [id]);
    
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: 'Película no encontrada' });
    }
  } catch (err) {
    res.status(500).json({
      code: 1002,
      message: 'Error al obtener la película',
      error_message: err.message
    });
  }
});

// POST /movies - Crear una nueva película
app.post('/movies', validateMovie, async (req, res) => {
  const errors = validationResult(req); // No necesitas pasar 'res'
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { title, year } = req.body;
    // Uso de ? para los parámetros y AUTO_INCREMENT de MariaDB/MySQL
    const [result] = await db.execute(
      'INSERT INTO movies (title, year) VALUES (?, ?)', 
      [title, year]
    );

    // En MySQL, el ID insertado se obtiene de `insertId`
    const [rows] = await db.execute('SELECT * FROM movies WHERE id = ?', [result.insertId]);

    if (rows.length > 0) {
      res.status(201).json(rows[0]);
    } else {
      // Caso de fallo inesperado
      res.status(500).json({ message: 'Película creada, pero no se pudo recuperar el registro.' });
    }

  } catch (err) {
    res.status(500).json({
      code: 1003,
      message: 'Error al crear la película',
      error_message: err.message
    });
  }
});

// PUT /movies/:id - Reemplazar o crear una película (upsert)
app.put('/movies/:id', validateMovie, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'ID inválido' });
    }
    const { title, year } = req.body;

    // 1. Verificar existencia
    const [checkRows] = await db.execute('SELECT id FROM movies WHERE id = ?', [id]);
    
    if (checkRows.length > 0) {
      // Película existe: UPDATE
      // ATENCIÓN: Corregida vulnerabilidad SQLi del código original.
      await db.execute(
        'UPDATE movies SET title = ?, year = ? WHERE id = ?',
        [title, year, id]
      );
      
      const [updatedRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [id]);
      res.json(updatedRows[0]);
    } else {
      // Película NO existe: INSERT
      // NOTA: MariaDB/MySQL solo permite insertar con un ID explícito si el campo no es AUTO_INCREMENT
      // o si es AUTO_INCREMENT y la columna no tiene un valor ya.
      const [insertResult] = await db.execute(
        'INSERT INTO movies (id, title, year) VALUES (?, ?, ?)', 
        [id, title, year]
      );

      const [newRows] = await db.execute('SELECT * FROM movies WHERE id = ?', [id]);
      res.status(201).json(newRows[0]);
    }
  } catch (err) {
    res.status(500).json({
      code: 1004,
      message: 'Error al actualizar/crear la película',
      error_message: err.message
    });
  }
});

// PATCH /movies/:id - Actualización parcial
app.patch('/movies/:id', validateMoviePatch, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }
  
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'ID inválido' });
    }

    const [checkRows] = await db.execute('SELECT id FROM movies WHERE id = ?', [id]);
    if (checkRows.length == 0) {
      return res.status(404).json({ message: 'Película no encontrada' });
    }

    const { title, year } = req.body;
    let updateQuery = 'UPDATE movies SET ';
    let updateValues = [];

    if (title) {
      updateQuery += 'title = ?, ';
      updateValues.push(title);
    }

    if (year) {
      updateQuery += 'year = ?, ';
      updateValues.push(year);
    }

    // Si no hay campos para actualizar, retornar 400
    if (updateValues.length === 0) {
        return res.status(400).json({ message: 'No hay campos válidos para actualizar.' });
    }

    updateQuery = updateQuery.slice(0, -2); // Quitar la coma final
    updateQuery += ' WHERE id = ?';
    updateValues.push(id); 

    // Ejecutar la actualización con prepared statements
    await db.execute(updateQuery, updateValues);

    const [rows] = await db.execute('SELECT * FROM movies WHERE id = ?', [id]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      // Esto solo debería ocurrir si el registro fue borrado inmediatamente después de la actualización.
      res.status(404).json({ message: 'No se pudo recuperar la película actualizada' });
    }
  } catch (err) {
    res.status(500).json({
      code: 1005,
      message: 'Error al actualizar la película',
      error_message: err.message
    });
  }
});

// DELETE /movies/:id - Eliminar una película
app.delete('/movies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'ID inválido' });
    }

    // 1. Verificar existencia
    const [checkRows] = await db.execute('SELECT id FROM movies WHERE id = ?', [id]);
    if (checkRows.length === 0) {
      return res.status(404).json({ message: 'Película no encontrada' });
    }
    
    // 2. Eliminar
    const [result] = await db.execute('DELETE FROM movies WHERE id = ?', [id]);
    
    // rowCount es la propiedad en mysql2 que indica las filas afectadas
    if (result.affectedRows > 0) {
        res.sendStatus(204);
    } else {
        res.status(500).json({ message: 'No se pudo eliminar la película' });
    }

  } catch (err) {
    res.status(500).json({
      code: 1006,
      message: 'Error al eliminar la película',
      error_message: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor ejecutándose en el puerto ${port}`)
});
