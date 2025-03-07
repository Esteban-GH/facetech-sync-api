const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

const pool = mysql.createPool({
    host: 'nozomi.proxy.rlwy.net',
    port: 14759,
    user: 'root',
    password: 'nUyVieIUvDBKsKxKGJNxCYkKtNukdJBa',
    database: 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000,
    acquireTimeout: 30000
});

pool.getConnection()
    .then(connection => {
        console.log('Conexión exitosa a MySQL desde Railway');
        connection.release();
    })
    .catch(err => {
        console.error('Error conectando a MySQL desde Railway:', err.message);
    });

app.get('/api/test', (req, res) => {
    res.send('Servidor funcionando correctamente');
});

app.post('/api/sync-persons', async (req, res) => {
    const person = req.body;
    if (!person || typeof person.personID !== 'number') {
        return res.status(400).json({ message: 'Datos de persona no válidos', status: 'error' });
    }
    const { personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced } = person;
    const query = `
        INSERT INTO persons (personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        personName = VALUES(personName),
        rut = VALUES(rut),
        apellidos = VALUES(apellidos),
        cargo = VALUES(cargo),
        empresa = VALUES(empresa),
        numImages = VALUES(numImages),
        addTime = VALUES(addTime),
        isSynced = VALUES(isSynced)
    `;
    try {
        const start = Date.now();
        const [results] = await pool.query(query, [personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced]);
        console.log(`Tiempo de consulta MySQL (Persona): ${Date.now() - start} ms`);
        const assignedPersonID = results.insertId > 0 ? results.insertId : personID;
        res.status(200).json({ message: 'Persona sincronizada', status: 'success', personID: assignedPersonID });
    } catch (err) {
        console.error('Error insertando persona:', err.message);
        res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
    }
});

app.post('/api/sync-face-images', async (req, res) => {
    const faceImage = req.body;
    if (!faceImage || typeof faceImage.recordID !== 'number') {
        return res.status(400).json({ message: 'Datos de imagen facial no válidos', status: 'error' });
    }
    const { recordID, personID, personName, faceEmbedding, isSynced } = faceImage;
    const query = `
        INSERT INTO face_images (recordID, personID, personName, faceEmbedding, isSynced)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        personName = VALUES(personName),
        faceEmbedding = VALUES(faceEmbedding),
        isSynced = VALUES(isSynced)
    `;
    try {
        const start = Date.now();
        const [results] = await pool.query(query, [recordID, personID, personName, JSON.stringify(faceEmbedding), isSynced]);
        console.log(`Tiempo de consulta MySQL (Imagen Facial): ${Date.now() - start} ms`);
        res.status(200).json({ message: 'Imagen sincronizada', status: 'success' });
    } catch (err) {
        console.error('Error insertando imagen facial:', err.message);
        res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
    }
});

app.post('/api/delete-person', async (req, res) => {
    const { personID } = req.body;
    if (!personID || typeof personID !== 'number') {
        return res.status(400).json({ message: 'ID no proporcionado o inválido', status: 'error' });
    }
    try {
        const start = Date.now();
        const query = 'DELETE FROM persons WHERE personID = ?';
        const [results] = await pool.query(query, [personID]);
        console.log(`Tiempo de consulta MySQL (Eliminación): ${Date.now() - start} ms`);
        if (results.affectedRows > 0) {
            const [faceImagesCount] = await pool.query('SELECT COUNT(*) as count FROM face_images WHERE personID = ?', [personID]);
            const [accessLogsCount] = await pool.query('SELECT COUNT(*) as count FROM access_logs WHERE person_id = ?', [personID]);
            if (faceImagesCount[0].count > 0 || accessLogsCount[0].count > 0) {
                console.warn('Advertencia: Algunos registros relacionados no se eliminaron correctamente');
            }
            res.status(200).json({ message: 'Eliminación exitosa', status: 'success' });
        } else {
            res.status(404).json({ message: 'Registro no encontrado', status: 'error' });
        }
    } catch (err) {
        console.error('Error eliminando persona:', err.message);
        res.status(500).json({ message: 'Error al eliminar el registro', status: 'error' });
    }
});

app.post('/api/sync-access-logs', async (req, res) => {
    const accessLog = req.body;
    if (!accessLog || typeof accessLog.person_id !== 'number' || !accessLog.name || !accessLog.last_name || !accessLog.rut || !accessLog.event_type || !accessLog.event_timestamp) {
        return res.status(400).json({ message: 'Datos de registro no válidos', status: 'error' });
    }
    const { person_id, name, last_name, rut, event_type, event_timestamp, latitude, longitude } = accessLog;
    const query = `
        INSERT INTO access_logs (person_id, name, last_name, rut, event_type, event_timestamp, latitude, longitude, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        last_name = VALUES(last_name),
        rut = VALUES(rut),
        event_type = VALUES(event_type),
        event_timestamp = VALUES(event_timestamp),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        is_synced = 1
    `;
    try {
        const start = Date.now();
        const [results] = await pool.query(query, [
            person_id, name, last_name, rut, event_type, event_timestamp, latitude !== undefined ? latitude : null, longitude !== undefined ? longitude : null
        ]);
        console.log(`Tiempo de consulta MySQL (Registro de entrada/salida): ${Date.now() - start} ms`);
        res.status(200).json({ message: 'Registro sincronizado', status: 'success', log_id: results.insertId });
    } catch (err) {
        console.error('Error insertando registro de entrada/salida:', err.message);
        res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
    }
});

// Nuevo endpoint para obtener los registros de access_logs
app.get('/api/get-access-logs', async (req, res) => {
    try {
        const start = Date.now();
        const [rows] = await pool.query('SELECT * FROM access_logs');
        console.log(`Tiempo de consulta MySQL (Obtener access_logs): ${Date.now() - start} ms`);
        res.status(200).json({ message: 'Registros obtenidos', status: 'success', data: rows });
    } catch (err) {
        console.error('Error obteniendo registros de access_logs:', err.message);
        res.status(500).json({ message: 'Error al obtener los registros', status: 'error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});